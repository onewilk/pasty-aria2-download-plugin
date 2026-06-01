import { normalizeRpcConfig } from "./config";
import type { DownloadAttachmentPayload } from "./types";

export function decodeDownloadAttachmentPayload(payloadJson: string | undefined): DownloadAttachmentPayload | null {
  try {
    const parsed = JSON.parse(payloadJson || "{}") as Partial<DownloadAttachmentPayload>;
    if (parsed.kind !== "aria2_download_task" || !Array.isArray(parsed.resources)) {
      return null;
    }

    const resources = parsed.resources
      .map((resource, index) => ({
        id: String(resource?.id || `resource-${index + 1}`),
        type: resource?.type || "uri",
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
      version: 1,
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
