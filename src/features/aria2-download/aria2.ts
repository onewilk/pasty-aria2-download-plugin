import { readFile } from "node:fs/promises";
import { hasCompleteRpcConfig, normalizeRpcConfig } from "./config";
import { decodeDownloadAttachmentPayload } from "./payload";
import type { DownloadResource, RpcConfig, SubmitDownloadsRequest, SubmitDownloadsResponse } from "./types";

function mergeRpcConfig(params: SubmitDownloadsRequest["config"] = {}, externalConfig: RpcConfig): RpcConfig {
  const normalizedExternal = normalizeRpcConfig(externalConfig);
  const mergedConfig = normalizeRpcConfig({
    rpcProtocol: params.rpcProtocol || normalizedExternal.rpcProtocol,
    rpcHost: params.rpcHost || normalizedExternal.rpcHost,
    rpcPort: params.rpcPort || normalizedExternal.rpcPort,
    rpcSecret: normalizedExternal.rpcSecret,
    dir: params.dir || normalizedExternal.dir
  });

  if (!hasCompleteRpcConfig(mergedConfig)) {
    throw new Error("Missing aria2 RPC configuration");
  }
  return mergedConfig;
}

function buildRpcEndpoint(config: RpcConfig): { endpoint: string; secret: string } {
  const port = Number(config.rpcPort);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error("Invalid aria2 RPC port");
  }

  return {
    endpoint: `${config.rpcProtocol}://${config.rpcHost}:${port}/jsonrpc`,
    secret: config.rpcSecret
  };
}

async function callAria2(config: ReturnType<typeof buildRpcEndpoint>, method: string, methodParams: unknown[]): Promise<string> {
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

  const data = await response.json() as { result?: string; error?: { code?: number; message?: string } };
  if (data.error) {
    throw new Error(data.error.message || `aria2 error ${data.error.code}`);
  }
  return String(data.result || "");
}

async function readBase64File(filePath: string): Promise<string> {
  const buffer = await readFile(filePath);
  return buffer.toString("base64");
}

async function submitResource(
  config: ReturnType<typeof buildRpcEndpoint>,
  resource: DownloadResource,
  options: Record<string, string>
): Promise<string> {
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

export async function submitDownloads(
  request: SubmitDownloadsRequest,
  externalConfig: RpcConfig
): Promise<SubmitDownloadsResponse> {
  const payload = decodeDownloadAttachmentPayload(request.payloadJson);
  if (!payload) {
    throw new Error("Invalid download payload");
  }

  const mergedConfig = mergeRpcConfig(request.config, externalConfig);
  const rpc = buildRpcEndpoint(mergedConfig);
  const dir = String(mergedConfig.dir || "").trim();
  const options: Record<string, string> = {};
  if (dir) {
    options.dir = dir;
  }

  const gids: string[] = [];
  for (const resource of payload.resources) {
    gids.push(await submitResource(rpc, resource, options));
  }
  return { gids };
}

export function formatSubmitError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return `${message}. Check aria2 RPC configuration and retry.`;
}
