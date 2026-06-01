import type { PluginDetectorArtifact, PluginDetectorHandler } from "@pasty/plugin-sdk/runtime";
import { ATTACHMENT_TYPE } from "../../shared/constants";
import { readExternalRpcConfig } from "./config";
import {
  buildDownloadAttachmentKey,
  buildDownloadSearchProjection,
  createDownloadAttachmentPayload,
  encodeDownloadAttachmentPayload
} from "./payload";

export const downloadDetector: PluginDetectorHandler = {
  async detect(input, ctx): Promise<PluginDetectorArtifact[]> {
    const externalConfig = await readExternalRpcConfig(ctx?.host);
    const payload = createDownloadAttachmentPayload(input, externalConfig);
    if (!payload) {
      return [];
    }

    return [
      {
        attachmentType: ATTACHMENT_TYPE,
        attachmentKey: buildDownloadAttachmentKey(payload),
        payloadJson: encodeDownloadAttachmentPayload(payload),
        searchProjection: buildDownloadSearchProjection(payload),
        attachmentSyncScope: "local_only"
      }
    ];
  }
};
