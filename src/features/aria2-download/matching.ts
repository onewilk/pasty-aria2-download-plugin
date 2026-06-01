import path from "node:path";
import type { PluginContentEnvelope, PluginPathEntry } from "@pasty/plugin-sdk/runtime";
import type { DownloadResource, DownloadResourceType } from "./types";

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

export function extractDownloadResources(content: PluginContentEnvelope): DownloadResource[] {
  let candidates: string[] = [];

  if (content.kind === "text") {
    candidates = extractTextCandidates(content.text || "");
  } else if (content.kind === "path_reference") {
    candidates = extractPathCandidates(content.entries);
  } else {
    return [];
  }

  return normalizeCandidates(candidates, content.kind);
}

function extractTextCandidates(text: string): string[] {
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

function extractPathCandidates(entries: PluginPathEntry[]): string[] {
  return entries
    .map((entry) => String(entry.path || "").trim())
    .filter(Boolean)
    .filter((candidate) => LOCAL_FILE_EXTENSIONS.some((ext) => candidate.toLowerCase().endsWith(ext)));
}

export function normalizeCandidates(candidates: string[], sourceKind: string): DownloadResource[] {
  const resources: DownloadResource[] = [];

  for (const rawCandidate of candidates) {
    const normalizedCandidate = normalizeInfoHash(rawCandidate);
    const isLocalFile = sourceKind === "path_reference";
    if (!isLocalFile && !isSupportedUri(normalizedCandidate)) {
      continue;
    }

    const decodedUri = decodeThunderLink(normalizedCandidate);
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

export function decodeThunderLink(value = ""): string {
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

function normalizeInfoHash(line: string): string {
  return BARE_INFO_HASH_RE.test(line) ? `magnet:?xt=urn:btih:${line}` : line;
}

function isSupportedUri(value: string): boolean {
  const lower = value.toLowerCase();
  return URI_PREFIXES.some((prefix) => lower.startsWith(prefix) && value.length > prefix.length);
}

function classifySource(source: string, sourceKind: string): DownloadResourceType {
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

function getUrlPathname(value: string): string {
  try {
    return new URL(value).pathname.toLowerCase();
  } catch {
    return "";
  }
}

function buildDisplayName(value: string, type: DownloadResourceType): string {
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

function getQueryParam(searchParams: URLSearchParams, name: string): string {
  const wanted = name.toLowerCase();
  for (const [key, value] of searchParams.entries()) {
    const trimmed = String(value || "").trim();
    if (key.toLowerCase() === wanted && trimmed) {
      return trimmed;
    }
  }
  return "";
}

function extractRawQueryParam(value: string, name: string): string {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = String(value).match(new RegExp(`[?&]${escapedName}=([^&#]*)`, "i"));
  if (!match) {
    return "";
  }
  return safeDecodeURIComponent(match[1].replace(/\+/g, " ")).trim();
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
