# Aria2 Downloader

[中文](README_cn.md) | English

Aria2 Downloader is a Pasty plugin that detects downloadable links from clipboard items and submits selected resources to an aria2 JSON-RPC server.

## ✨ Features

- 🔎 Detects download links from `text` clipboard items.
- 📎 Detects local torrent and metalink files from `path_reference` clipboard items.
- 🧩 Shows a compact attachment renderer inside Pasty.
- ✅ Supports multiple detected links and lets each link be selected or excluded before submission.
- 🚀 Submits selected resources through aria2 JSON-RPC.
- 🎨 Uses Pasty theme tokens for the renderer UI and a blue attachment accent.
- 🆘 Provides a native `Help` action that opens the project page.
- ⚙️ Reads aria2 RPC settings from Pasty external settings and disables submission when required settings are missing.

## 🔗 Supported Inputs

Text input is matched line by line. Each non-empty line must be a supported download value:

- `http://` and `https://` URLs
- `ftp://` URLs
- `magnet:` links
- `thunder://` links, decoded before submission when possible
- Bare BitTorrent v1 info hashes, converted to magnet links
- `sftp://`, `ftps://`, and `http+ftp://` aria2-style URLs
- Remote `.torrent`, `.metalink`, and `.meta4` URLs

Path references are matched when the copied file path ends with:

- `.torrent`
- `.metalink`
- `.meta4`

Embedded links inside prose are intentionally ignored. Copy the URL itself, or use one URL per line. Repeated lines are preserved as separate download tasks.

File names are inferred from the URL path when possible. If a URL contains an `attname` query parameter, that value is used as the displayed file name.

## ⚙️ External Settings

Pasty provides local, read-only external settings to plugin runtime and UI code. This plugin reads these keys:

- `plugin.pasty.aria2.rpcProtocol`: `http` or `https`
- `plugin.pasty.aria2.rpcHost`: aria2 RPC host
- `plugin.pasty.aria2.rpcPort`: aria2 RPC port
- `plugin.pasty.aria2.rpcSecret`: aria2 RPC secret
- `plugin.pasty.aria2.dir`: optional download directory

These settings are local to Pasty and are not written by the plugin. The current Pasty plugin SDK exposes settings read APIs, but no settings write API. The plugin does not provide built-in RPC defaults.

When a complete config is available, the UI shows a compact RPC summary. RPC fields are not editable inside the plugin UI. Submission re-reads settings in the runtime before sending the aria2 request, and the secret is never returned to the UI.

If required settings cannot be read, the renderer shows a configuration failure state and the submit button is disabled.

## 🛰️ aria2 Setup

Start aria2 with JSON-RPC enabled and a matching secret. Example:

```bash
aria2c --enable-rpc --rpc-listen-all=false --rpc-listen-port=16800 --rpc-secret=your-secret
```

Then configure matching values in Pasty external settings.

## 🧭 UI Behavior

- The top area shows the RPC endpoint and download directory summary.
- The download list shows one card per detected resource.
- For multiple resources, each card has an independent selection button.
- The submit button sends only selected resources.
- The native `Help` action opens the GitHub project page.
- Submit results are shown as a floating notice at the bottom of the renderer.
- Detailed submit failures are also logged through the Pasty plugin console.

## 🗂️ Project Structure

```text
src/
  plugin.ts
  features/
    aria2-download/
      aria2.ts
      app.vue
      config.ts
      detector.ts
      feature.ts
      matching.ts
      messages.ts
      payload.ts
      payloadDecode.ts
      renderer.ts
      types.ts
  shared/
    constants.ts
```

The plugin runtime is built to `dist/plugin.cjs`. Renderer UI assets are built under `dist/ui`.

## 🧑‍💻 Development

Install dependencies:

```bash
npm install
```

Run validation:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

Preview the renderer UI during local iteration:

```bash
npm run dev
```

The dev page is only a browser entry for local UI iteration. Validate final rendering inside Pasty after rebuilding and reloading the plugin.

## 📦 Pasty Installation

For local development, add this plugin root directory to Pasty Developer Plugins.

Pasty loads the built files declared in `manifest.json`:

- Runtime: `dist/plugin.cjs`
- UI root: `dist/ui`

After changing `manifest.json`, detector IDs, attachment types, runtime code, or UI entries, rebuild and reload the plugin in Pasty.

## 🏷️ Plugin IDs

- Plugin ID: `plugin.pasty.aria2`
- Detector ID: `link-detector`
- Detector display name: `Aria2 Link Detector`
- Attachment renderer ID: `download-renderer`
- Attachment type: `plugin.pasty.aria2.download`
- Attachment display name: `Aria2 Download`
- Attachment accent color: `#3B82F6`
