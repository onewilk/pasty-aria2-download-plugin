import { defineMessage } from "@pasty/plugin-sdk/ui";
import { MESSAGE_KEYS } from "../../shared/constants";
import type { PublicRpcConfig, SubmitDownloadsRequest, SubmitDownloadsResponse } from "./types";

export const readConfigMessage = defineMessage<Record<string, never>, PublicRpcConfig>(MESSAGE_KEYS.readConfig);
export const submitDownloadsMessage = defineMessage<SubmitDownloadsRequest, SubmitDownloadsResponse>(MESSAGE_KEYS.submitDownloads);
