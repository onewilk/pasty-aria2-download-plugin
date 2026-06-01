import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const rendererUIPath = path.resolve(projectRoot, "dist/ui/renderers/aira2-download-renderer/index.html");
const rendererJSPath = path.resolve(projectRoot, "dist/ui/renderers/aira2-download-renderer/index.js");
const rendererCSSPath = path.resolve(projectRoot, "dist/ui/renderers/aira2-download-renderer/index.css");
const runtimeEntryPath = path.resolve(projectRoot, "dist/plugin.cjs");

const rendererUI = await readFile(rendererUIPath, "utf8");
await readFile(rendererJSPath, "utf8");
await readFile(rendererCSSPath, "utf8");
const runtimeEntry = await readFile(runtimeEntryPath, "utf8");

if (!rendererUI.includes("./index.js") || !rendererUI.includes("./index.css")) {
  throw new Error("renderer HTML must reference page-local built assets.");
}

if (rendererUI.includes('src="/') || rendererUI.includes('href="/')) {
  throw new Error("renderer HTML must not contain absolute local asset references.");
}

if (
  !runtimeEntry.includes("definePlugin") ||
  !runtimeEntry.includes("aira2-link-detector") ||
  !runtimeEntry.includes("aira2-download-renderer") ||
  !runtimeEntry.includes("aria2.submitDownloads")
) {
  throw new Error("dist/plugin.cjs does not contain the required download runtime bundles.");
}

console.log("Build verification passed.");
