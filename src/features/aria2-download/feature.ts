import { DETECTOR_ID, MESSAGE_KEYS, RENDERER_ID } from "../../shared/constants";
import { submitDownloads } from "./aria2";
import { downloadDetector } from "./detector";
import { readExternalRpcConfig, toPublicRpcConfig } from "./config";
import { downloadRenderer } from "./renderer";
import type { SubmitDownloadsRequest } from "./types";

interface RuntimeMessageContext {
  host: Parameters<typeof readExternalRpcConfig>[0];
}

export const aria2DownloadFeature = {
  detectors: {
    [DETECTOR_ID]: downloadDetector
  },
  attachmentRenderers: {
    [RENDERER_ID]: downloadRenderer
  },
  messageHandlers: {
    [MESSAGE_KEYS.readConfig]: async (_request: unknown, ctx: RuntimeMessageContext) => {
      const config = await readExternalRpcConfig(ctx.host);
      return toPublicRpcConfig(config);
    },
    [MESSAGE_KEYS.submitDownloads]: async (request: unknown, ctx: RuntimeMessageContext) => {
      const config = await readExternalRpcConfig(ctx.host);
      return submitDownloads(request as SubmitDownloadsRequest, config);
    }
  }
};
