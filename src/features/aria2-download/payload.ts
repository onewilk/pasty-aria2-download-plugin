import type { PluginDetectorInput } from "@pasty/plugin-sdk/runtime";
import { ATTACHMENT_TYPE } from "../../shared/constants";
import { normalizeRpcConfig } from "./config";
import { extractDownloadResources } from "./matching";
import type { DownloadAttachmentPayload, RpcConfig } from "./types";
export { decodeDownloadAttachmentPayload } from "./payloadDecode";

export function createDownloadAttachmentPayload(
  input: PluginDetectorInput,
  defaults: Partial<RpcConfig> = {}
): DownloadAttachmentPayload | null {
  const resources = extractDownloadResources(input.content);
  if (resources.length === 0) {
    return null;
  }

  return {
    kind: "aria2_download_task",
    version: 1,
    sourceKind: input.content.kind,
    defaults: normalizeRpcConfig(defaults),
    resources,
    display: {
      headline: resources.length === 1 ? resources[0].displayName : `${resources.length} download links`,
      subheadline: resources.map((resource) => resource.type).join(", "),
      count: resources.length
    }
  };
}

export function buildDownloadAttachmentKey(payload: DownloadAttachmentPayload): string {
  const first = String(payload.resources[0]?.original || "download")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `download-${first || "task"}`;
}

export function buildDownloadSearchProjection(payload: DownloadAttachmentPayload) {
  const searchText = payload.resources
    .map((resource) => `${resource.type} ${resource.original} ${resource.displayName}`)
    .join("\n")
    .trim();

  if (!searchText) {
    return undefined;
  }

  return {
    scope: "download",
    searchText,
    label: "Download"
  };
}

export function encodeDownloadAttachmentPayload(payload: DownloadAttachmentPayload): string {
  return JSON.stringify(payload);
}

export { ATTACHMENT_TYPE };
