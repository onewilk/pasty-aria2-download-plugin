const fs = require("node:fs/promises");
const { rendererResult } = require("../sdk/results/rendererResult");
const {
  DEFAULT_RPC_CONFIG,
  decodeDownloadAttachmentPayload
} = require("../shared/downloadAttachmentPayload");

function resolveAttachment(input) {
  const payload = decodeDownloadAttachmentPayload(input?.attachment?.payloadJson);
  if (!payload) {
    return {
      displayName: "Aria2 Download",
      tintHex: "#6B7280",
      buttons: [
        { id: "submit-download", title: "Submit Download", isEnabled: false }
      ]
    };
  }

  return {
    displayName: "Aria2 Download",
    tintHex: "#2563EB",
    buttons: [
      { id: "submit-download", title: "Submit Download", isEnabled: true }
    ]
  };
}

async function invokeOperation(input, ctx) {
  const payload = decodeDownloadAttachmentPayload(input?.attachment?.payloadJson);
  if (!payload) {
    return rendererResult.failure("Invalid download payload");
  }

  if (input.buttonID === "submit-download") {
    try {
      const gids = await submitDownloads(payload.resources, input?.params ?? {});
      return rendererResult.success({
        userMessage: `Submitted ${gids.length} download${gids.length === 1 ? "" : "s"}`
      });
    } catch (error) {
      return rendererResult.failure(formatSubmitError(error));
    }
  }

  return rendererResult.success();
}

function normalizeRpcConfig(params) {
  const host = String(params.rpcHost || params.host || DEFAULT_RPC_CONFIG.rpcHost).trim() || DEFAULT_RPC_CONFIG.rpcHost;
  const port = Number(params.rpcPort || params.port || DEFAULT_RPC_CONFIG.rpcPort);
  const secret = String(params.rpcSecret || params.secret || DEFAULT_RPC_CONFIG.rpcSecret);
  const protocol = String(params.rpcProtocol || params.protocol || "http").toLowerCase() === "https"
    ? "https"
    : "http";

  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error("Invalid aria2 RPC port");
  }

  return {
    endpoint: `${protocol}://${host}:${port}/jsonrpc`,
    secret
  };
}

async function callAria2(config, method, methodParams) {
  const params = config.secret
    ? [`token:${config.secret}`, ...methodParams]
    : methodParams;
  const response = await fetch(config.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now().toString(36),
      method,
      params
    })
  });

  if (!response.ok) {
    throw new Error(`aria2 RPC HTTP ${response.status}`);
  }

  const data = await response.json();
  if (data.error) {
    throw new Error(data.error.message || `aria2 error ${data.error.code}`);
  }
  return data.result;
}

async function readBase64File(filePath) {
  const buffer = await fs.readFile(filePath);
  return buffer.toString("base64");
}

async function submitResource(config, resource, options) {
  if (resource.type === "torrent_file") {
    const torrent = await readBase64File(resource.uri);
    return callAria2(config, "aria2.addTorrent", [torrent, [], options]);
  }

  if (resource.type === "metalink_file") {
    const metalink = await readBase64File(resource.uri);
    return callAria2(config, "aria2.addMetalink", [metalink, options]);
  }

  return callAria2(config, "aria2.addUri", [[resource.uri], options]);
}

async function submitDownloads(resources, params) {
  const config = normalizeRpcConfig(params);
  const dir = String(params.dir || DEFAULT_RPC_CONFIG.dir).trim();
  const options = {};
  if (dir) {
    options.dir = dir;
  }

  const gids = [];
  for (const resource of resources) {
    gids.push(await submitResource(config, resource, options));
  }
  return gids;
}

function formatSubmitError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return `${message}. Check aria2 RPC configuration and retry.`;
}

function createDownloadRenderer() {
  return {
    async resolveAttachment(input, ctx) {
      return resolveAttachment(input, ctx);
    },
    async invokeOperation(input, ctx) {
      return invokeOperation(input, ctx);
    }
  };
}

module.exports = {
  createDownloadRenderer,
  invokeOperation,
  resolveAttachment,
  submitDownloads
};
