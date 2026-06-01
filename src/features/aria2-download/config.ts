import type { PluginDetectorHandler } from "@pasty/plugin-sdk/runtime";
import { SETTINGS_PREFIX } from "../../shared/constants";
import type { PublicRpcConfig, RpcConfig } from "./types";

type DetectorContext = NonNullable<Parameters<PluginDetectorHandler["detect"]>[1]>;
type HostClient = NonNullable<DetectorContext["host"]>;

export const DEFAULT_RPC_CONFIG: RpcConfig = {
  rpcProtocol: "http",
  rpcHost: "",
  rpcPort: "",
  rpcSecret: "",
  dir: "",
  configReady: false
};

export function hasCompleteRpcConfig(config: Pick<RpcConfig, "rpcHost" | "rpcPort">): boolean {
  const port = Number(config.rpcPort);
  return Boolean(String(config.rpcHost || "").trim()) &&
    Number.isInteger(port) &&
    port >= 1 &&
    port <= 65535;
}

export function normalizeRpcConfig(config: Partial<RpcConfig> = {}): RpcConfig {
  const rpcProtocol = String(config.rpcProtocol || "").toLowerCase() === "https" ? "https" : "http";
  const rpcHost = String(config.rpcHost || "").trim();
  const rpcPort = Number(config.rpcPort) || "";
  const rpcSecret = String(config.rpcSecret ?? "");
  const dir = String(config.dir || "").trim();

  return {
    rpcProtocol,
    rpcHost,
    rpcPort,
    rpcSecret,
    dir,
    configReady: hasCompleteRpcConfig({ rpcHost, rpcPort })
  };
}

export function toPublicRpcConfig(config: RpcConfig): PublicRpcConfig {
  return {
    rpcProtocol: config.rpcProtocol,
    rpcHost: config.rpcHost,
    rpcPort: config.rpcPort,
    dir: config.dir,
    configReady: config.configReady
  };
}

function settingValue(settings: Record<string, unknown>, key: string): unknown {
  const fullKey = `${SETTINGS_PREFIX}${key}`;
  return settings[fullKey];
}

function unwrapSettingResponse(response: unknown): unknown {
  if (response && typeof response === "object" && "value" in response) {
    return (response as { value: unknown }).value;
  }
  return response;
}

async function readSettingValue(host: HostClient | undefined, key: string): Promise<unknown> {
  const fullKey = `${SETTINGS_PREFIX}${key}`;

  try {
    return unwrapSettingResponse(await host?.settings?.get({ key: fullKey })) ?? null;
  } catch {
    return null;
  }
}

async function readConfigViaGet(host: HostClient): Promise<RpcConfig> {
  const [rpcProtocol, rpcHost, rpcPort, rpcSecret, dir] = await Promise.all([
    readSettingValue(host, "rpcProtocol"),
    readSettingValue(host, "rpcHost"),
    readSettingValue(host, "rpcPort"),
    readSettingValue(host, "rpcSecret"),
    readSettingValue(host, "dir")
  ]);

  return normalizeRpcConfig({ rpcProtocol, rpcHost, rpcPort, rpcSecret, dir } as Partial<RpcConfig>);
}

async function readConfigViaGetAll(host: HostClient): Promise<RpcConfig> {
  const response = await host.settings.getAll();
  const settings = response.settings || {};
  return normalizeRpcConfig({
    rpcProtocol: settingValue(settings, "rpcProtocol"),
    rpcHost: settingValue(settings, "rpcHost"),
    rpcPort: settingValue(settings, "rpcPort"),
    rpcSecret: settingValue(settings, "rpcSecret"),
    dir: settingValue(settings, "dir")
  } as Partial<RpcConfig>);
}

export async function readExternalRpcConfig(host: HostClient | undefined): Promise<RpcConfig> {
  if (!host?.settings) {
    return normalizeRpcConfig(DEFAULT_RPC_CONFIG);
  }

  try {
    const config = await readConfigViaGet(host);
    if (config.configReady) {
      return config;
    }
  } catch {
    // Fall back to getAll when single setting reads are unavailable or incomplete.
  }

  try {
    return await readConfigViaGetAll(host);
  } catch {
    return normalizeRpcConfig(DEFAULT_RPC_CONFIG);
  }
}
