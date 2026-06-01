export type DownloadResourceType =
  | "http"
  | "ftp"
  | "magnet"
  | "thunder"
  | "torrent_url"
  | "torrent_file"
  | "metalink_url"
  | "metalink_file"
  | "aria2_uri"
  | "uri";

export interface RpcConfig {
  rpcProtocol: "http" | "https";
  rpcHost: string;
  rpcPort: number | "";
  rpcSecret: string;
  dir: string;
  configReady: boolean;
}

export interface DownloadResource {
  id: string;
  type: DownloadResourceType;
  sourceKind: string;
  uri: string;
  original: string;
  displayName: string;
  isLocalFile: boolean;
}

export interface DownloadAttachmentPayload {
  kind: "aria2_download_task";
  version: 1;
  sourceKind: string;
  defaults: RpcConfig;
  resources: DownloadResource[];
  display: {
    headline: string;
    subheadline: string;
    count: number;
  };
}

export interface PublicRpcConfig {
  rpcProtocol: "http" | "https";
  rpcHost: string;
  rpcPort: number | "";
  dir: string;
  configReady: boolean;
}

export interface SubmitDownloadsRequest {
  payloadJson: string;
  config?: Partial<Omit<RpcConfig, "configReady" | "rpcSecret">>;
}

export interface SubmitDownloadsResponse {
  gids: string[];
}
