const path = require("node:path");
const os = require("node:os");

const ATTACHMENT_TYPE = "plugin.pasty.aria2.download";
const SETTINGS_PREFIX = "plugin.pasty.aria2.";
const DEFAULT_RPC_CONFIG = {
  rpcProtocol: "http",
  rpcHost: "127.0.0.1",
  rpcPort: 16800,
  rpcSecret: "diOzvyOnub7g5yjo",
  dir: path.join(os.homedir(), "Downloads")
};
const MAX_INPUT_CHARS = 100_000;
const MAX_LINES = 200;
const BARE_INFO_HASH_RE = /^[0-9a-fA-F]{40}$|^[A-Z2-7]{32}$/;
const URI_PREFIXES = [
  "http://",
  "https://",
  "ftp://",
  "magnet:",
  "thunder://",
  "sftp://",
  "ftps://",
  "http+ftp://"
];
const LOCAL_FILE_EXTENSIONS = [".torrent", ".metalink", ".meta4"];

function normalizeRpcConfig(config = {}) {
  const rpcProtocol = String(config.rpcProtocol || DEFAULT_RPC_CONFIG.rpcProtocol).toLowerCase() === "https"
    ? "https"
    : "http";
  const rpcHost = String(config.rpcHost || DEFAULT_RPC_CONFIG.rpcHost).trim() || DEFAULT_RPC_CONFIG.rpcHost;
  const rpcPort = Number(config.rpcPort) || DEFAULT_RPC_CONFIG.rpcPort;
  const rpcSecret = String(config.rpcSecret ?? DEFAULT_RPC_CONFIG.rpcSecret);
  const dir = String(config.dir || DEFAULT_RPC_CONFIG.dir).trim() || DEFAULT_RPC_CONFIG.dir;

  return {
    rpcProtocol,
    rpcHost,
    rpcPort,
    rpcSecret,
    dir
  };
}

function settingValue(settings, key) {
  return settings?.[`${SETTINGS_PREFIX}${key}`];
}

async function readExternalRpcConfig(ctx) {
  const getAll = ctx?.host?.settings?.getAll;
  if (typeof getAll !== "function") {
    return {};
  }

  try {
    const settings = await getAll();
    if (!settings || typeof settings !== "object") {
      return {};
    }

    return {
      rpcProtocol: settingValue(settings, "rpcProtocol"),
      rpcHost: settingValue(settings, "rpcHost"),
      rpcPort: settingValue(settings, "rpcPort"),
      rpcSecret: settingValue(settings, "rpcSecret"),
      dir: settingValue(settings, "dir")
    };
  } catch {
    return {};
  }
}

function decodeThunderLink(value = "") {
  if (!value.toLowerCase().startsWith("thunder://")) {
    return value;
  }

  const payload = value.trim().slice("thunder://".length);
  if (!payload) {
    return value;
  }

  try {
    const decoded = Buffer.from(payload, "base64").toString("utf8");
    if (!decoded.startsWith("AA") || !decoded.endsWith("ZZ")) {
      return value;
    }
    return decoded.slice(2, -2) || value;
  } catch {
    return value;
  }
}

function normalizeInfoHash(line) {
  return BARE_INFO_HASH_RE.test(line) ? `magnet:?xt=urn:btih:${line}` : line;
}

function getUrlPathname(value) {
  try {
    return new URL(value).pathname.toLowerCase();
  } catch {
    return "";
  }
}

function classifySource(source, sourceKind) {
  const lower = source.toLowerCase();

  if (sourceKind === "path_reference") {
    if (lower.endsWith(".torrent")) return "torrent_file";
    if (lower.endsWith(".metalink") || lower.endsWith(".meta4")) return "metalink_file";
  }

  if (lower.startsWith("magnet:")) return "magnet";
  if (lower.startsWith("thunder://")) return "thunder";

  if (/^(?:https?|ftp):\/\//i.test(source)) {
    const pathname = getUrlPathname(source);
    if (pathname.endsWith(".torrent")) return "torrent_url";
    if (pathname.endsWith(".metalink") || pathname.endsWith(".meta4")) return "metalink_url";
    return lower.startsWith("ftp://") ? "ftp" : "http";
  }

  if (lower.startsWith("sftp://") || lower.startsWith("ftps://") || lower.startsWith("http+ftp://")) {
    return "aria2_uri";
  }

  return "uri";
}

function isSupportedUri(value) {
  const lower = value.toLowerCase();
  return URI_PREFIXES.some((prefix) => lower.startsWith(prefix) && value.length > prefix.length);
}

function extractTextCandidates(text) {
  if (!text || text.length > MAX_INPUT_CHARS) {
    return [];
  }

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0 || lines.length > MAX_LINES) {
    return [];
  }

  return lines;
}

function extractPathCandidates(entries) {
  if (!Array.isArray(entries)) {
    return [];
  }

  return entries
    .map((entry) => String(entry?.path || entry?.url || "").trim())
    .filter(Boolean)
    .filter((candidate) => LOCAL_FILE_EXTENSIONS.some((ext) => candidate.toLowerCase().endsWith(ext)));
}

function normalizeCandidates(candidates, sourceKind) {
  const seen = new Set();
  const resources = [];

  for (const rawCandidate of candidates) {
    const normalizedCandidate = normalizeInfoHash(rawCandidate);
    const isLocalFile = sourceKind === "path_reference";
    if (!isLocalFile && !isSupportedUri(normalizedCandidate)) {
      continue;
    }

    const decodedUri = decodeThunderLink(normalizedCandidate);
    const key = `${sourceKind}:${normalizedCandidate}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);

    const type = classifySource(normalizedCandidate, sourceKind);
    resources.push({
      id: `resource-${resources.length + 1}`,
      type,
      sourceKind,
      uri: decodedUri,
      original: normalizedCandidate,
      displayName: buildDisplayName(normalizedCandidate, type),
      isLocalFile
    });
  }

  return resources;
}

function buildDisplayName(value, type) {
  if (type === "magnet") {
    try {
      const queryStart = value.indexOf("?");
      if (queryStart >= 0) {
        const name = new URLSearchParams(value.slice(queryStart + 1)).get("dn");
        if (name) return name;
      }
    } catch {
      // Fall through to compact URI.
    }
  }

  if (type.endsWith("_file")) {
    return path.basename(value);
  }

  try {
    const parsed = new URL(value);
    const attname = getQueryParam(parsed.searchParams, "attname") || extractRawQueryParam(value, "attname");
    if (attname) {
      return attname;
    }
    const basename = parsed.pathname.split("/").filter(Boolean).pop();
    return basename ? safeDecodeURIComponent(basename) : parsed.host;
  } catch {
    const attname = extractRawQueryParam(value, "attname");
    if (attname) {
      return attname;
    }
    return value.length > 96 ? `${value.slice(0, 93)}...` : value;
  }
}

function getQueryParam(searchParams, name) {
  const wanted = name.toLowerCase();
  for (const [key, value] of searchParams.entries()) {
    const trimmed = String(value || "").trim();
    if (key.toLowerCase() === wanted && trimmed) {
      return trimmed;
    }
  }
  return "";
}

function extractRawQueryParam(value, name) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = String(value).match(new RegExp(`[?&]${escapedName}=([^&#]*)`, "i"));
  if (!match) {
    return "";
  }
  return safeDecodeURIComponent(match[1].replace(/\+/g, " ")).trim();
}

function safeDecodeURIComponent(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function createDownloadAttachmentPayload(input, defaults = DEFAULT_RPC_CONFIG) {
  const contentKind = input?.content?.kind;
  const contentPayload = input?.content?.payload ?? {};
  let candidates = [];

  if (contentKind === "text") {
    candidates = extractTextCandidates(String(contentPayload.text || ""));
  } else if (contentKind === "path_reference") {
    candidates = extractPathCandidates(contentPayload.entries);
  } else {
    return null;
  }

  const resources = normalizeCandidates(candidates, contentKind);
  if (resources.length === 0) {
    return null;
  }

  return {
    kind: "aria2_download_task",
    version: 1,
    sourceKind: contentKind,
    defaults: normalizeRpcConfig(defaults),
    resources,
    display: {
      headline: resources.length === 1 ? resources[0].displayName : `${resources.length} download links`,
      subheadline: resources.map((resource) => resource.type).join(", "),
      count: resources.length
    }
  };
}

function decodeDownloadAttachmentPayload(payloadJson) {
  try {
    const parsed = JSON.parse(payloadJson || "{}");
    if (parsed.kind !== "aria2_download_task" || !Array.isArray(parsed.resources)) {
      return null;
    }

    const resources = parsed.resources
      .map((resource, index) => ({
        id: String(resource?.id || `resource-${index + 1}`),
        type: String(resource?.type || "uri"),
        sourceKind: String(resource?.sourceKind || parsed.sourceKind || ""),
        uri: String(resource?.uri || ""),
        original: String(resource?.original || resource?.uri || ""),
        displayName: String(resource?.displayName || resource?.uri || ""),
        isLocalFile: Boolean(resource?.isLocalFile)
      }))
      .filter((resource) => resource.uri);

    if (resources.length === 0) {
      return null;
    }

    return {
      kind: "aria2_download_task",
      version: Number(parsed.version) || 1,
      sourceKind: String(parsed.sourceKind || ""),
      defaults: normalizeRpcConfig(parsed.defaults),
      resources,
      display: {
        headline: String(parsed.display?.headline || `${resources.length} download links`),
        subheadline: String(parsed.display?.subheadline || ""),
        count: Number(parsed.display?.count) || resources.length
      }
    };
  } catch {
    return null;
  }
}

function buildDownloadAttachmentKey(payload) {
  const first = String(payload?.resources?.[0]?.original || "download")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `download-${first || "task"}`;
}

function buildDownloadSearchProjection(payload) {
  const searchText = payload?.resources
    ?.map((resource) => `${resource.type} ${resource.original} ${resource.displayName}`)
    .join("\n")
    .trim();

  if (!searchText) {
    return null;
  }

  return {
    scope: "download",
    searchText,
    label: "Download"
  };
}

module.exports = {
  ATTACHMENT_TYPE,
  BARE_INFO_HASH_RE,
  DEFAULT_RPC_CONFIG,
  SETTINGS_PREFIX,
  buildDownloadAttachmentKey,
  buildDownloadSearchProjection,
  createDownloadAttachmentPayload,
  decodeDownloadAttachmentPayload,
  decodeThunderLink,
  normalizeCandidates,
  normalizeRpcConfig,
  readExternalRpcConfig
};
