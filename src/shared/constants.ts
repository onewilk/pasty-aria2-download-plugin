export const PLUGIN_ID = "plugin.pasty.aria2";
export const ATTACHMENT_TYPE = "plugin.pasty.aria2.download";
export const DETECTOR_ID = "aira2-link-detector";
export const RENDERER_ID = "aira2-download-renderer";
export const HELP_ACTION_ID = "open-help";
export const HELP_URL = "https://github.com/onewilk/pasty-aria2-download-plugin";

export const SETTINGS_PREFIX = `${PLUGIN_ID}.`;

export const MESSAGE_KEYS = {
  readConfig: "aria2.readConfig",
  submitDownloads: "aria2.submitDownloads"
} as const;
