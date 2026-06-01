import type { PluginAttachmentRendererHandler } from "@pasty/plugin-sdk/runtime";
import { HELP_ACTION_ID } from "../../shared/constants";
import { decodeDownloadAttachmentPayload } from "./payload";

export const downloadRenderer: PluginAttachmentRendererHandler = {
  async resolveAttachment(input) {
    const payload = decodeDownloadAttachmentPayload(input.attachment.payloadJson);
    if (!payload) {
      return { shouldDisplay: false };
    }

    return {
      shouldDisplay: true,
      displayName: "Aria2 Download",
      tintHex: "#3B82F6",
      buttons: [
        { id: HELP_ACTION_ID, title: "Help", isEnabled: true }
      ]
    };
  }
};
