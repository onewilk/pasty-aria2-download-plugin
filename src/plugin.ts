import { definePlugin } from "@pasty/plugin-sdk/runtime";
import { aria2DownloadFeature } from "./features/aria2-download/feature";

export default definePlugin({
  setup() {
    return {
      detectors: aria2DownloadFeature.detectors,
      attachmentRenderers: aria2DownloadFeature.attachmentRenderers,
      actions: {},
      messageHandlers: aria2DownloadFeature.messageHandlers
    };
  }
});
