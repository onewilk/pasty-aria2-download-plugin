# Aria2 Downloader

中文 | [English](README.md)

Aria2 Downloader 是一个 Pasty 插件，用于从剪贴板条目中识别可下载链接，并将用户选中的资源通过 aria2 JSON-RPC 提交为下载任务。

## ✨ 功能

- 🔎 识别 `text` 剪贴板条目中的下载链接。
- 📎 识别 `path_reference` 剪贴板条目中的本地 torrent 和 metalink 文件。
- 🧩 在 Pasty 中显示紧凑的 attachment renderer。
- ✅ 支持多个识别结果，并允许提交前逐项选择或排除。
- 🚀 通过 aria2 JSON-RPC 提交选中的下载资源。
- 🎨 使用 Pasty 主题色渲染插件界面，并使用蓝色 attachment 强调色。
- 🆘 提供原生 `Help` action，用于打开项目页面。
- ⚙️ 从 Pasty external settings 读取 aria2 RPC 配置；缺少必要配置时禁用提交。

## 🔗 支持的输入

文本输入按行匹配。每个非空行都必须是一个受支持的下载值：

- `http://` 和 `https://` URL
- `ftp://` URL
- `magnet:` 磁力链接
- `thunder://` 迅雷链接，提交前会尽量解码
- BitTorrent v1 裸 info hash，会自动转换为 magnet 链接
- `sftp://`、`ftps://` 和 `http+ftp://` 等 aria2 风格 URL
- 远程 `.torrent`、`.metalink` 和 `.meta4` URL

路径引用会匹配以下后缀的本地文件：

- `.torrent`
- `.metalink`
- `.meta4`

插件会刻意忽略正文中的内嵌链接。请复制 URL 本身，或每行放一个 URL。重复行会保留为独立下载任务。

文件名会优先从 URL 路径中推断。如果 URL 包含 `attname` 查询参数，则使用该参数值作为展示文件名。

## ⚙️ External Settings

Pasty 可以向插件 runtime 和 UI 提供本机只读 external settings。本插件会读取以下 key：

- `plugin.pasty.aria2.rpcProtocol`：`http` 或 `https`
- `plugin.pasty.aria2.rpcHost`：aria2 RPC 地址
- `plugin.pasty.aria2.rpcPort`：aria2 RPC 端口
- `plugin.pasty.aria2.rpcSecret`：aria2 RPC 密钥
- `plugin.pasty.aria2.dir`：可选下载目录

这些配置由 Pasty 本机设置维护，插件只读取，不写入。当前 Pasty plugin SDK 提供 settings 读取 API，没有 settings 写入 API。插件不提供内置 RPC 默认值。

当配置完整可用时，界面会显示紧凑的 RPC 摘要。RPC 字段不能在插件界面内直接编辑。提交时 runtime 会重新读取 settings 再发送 aria2 请求，RPC 密钥不会返回给 UI。

如果无法读取必要配置，renderer 会显示配置读取失败状态，并禁用提交按钮。

## 🛰️ aria2 启动方式

需要启动已开启 JSON-RPC 的 aria2，并使用匹配的密钥。例如：

```bash
aria2c --enable-rpc --rpc-listen-all=false --rpc-listen-port=16800 --rpc-secret=your-secret
```

然后在 Pasty external settings 中配置对应值。

## 🧭 界面行为

- 顶部区域显示 RPC endpoint 和下载目录摘要。
- 下载列表中每个识别到的资源都会显示为一张卡片。
- 多个资源时，每张卡片都有独立选中按钮。
- 提交按钮只会提交被选中的资源。
- 原生 `Help` action 会打开 GitHub 项目页面。
- 提交结果会在 renderer 底部以悬浮提示条展示。
- 详细提交失败原因也会通过 Pasty plugin console 记录。

## 🗂️ 工程结构

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

插件 runtime 会构建到 `dist/plugin.cjs`。Renderer UI 产物会构建到 `dist/ui`。

## 🧑‍💻 开发

安装依赖：

```bash
npm install
```

运行验证：

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

本地迭代 renderer UI：

```bash
npm run dev
```

dev 页面只用于本地 UI 迭代。最终展示效果仍需在 Pasty 中重新构建并 Reload 插件后验证。

## 📦 Pasty 安装

本地开发时，将插件根目录添加到 Pasty Developer Plugins。

Pasty 会加载 `manifest.json` 中声明的构建产物：

- Runtime：`dist/plugin.cjs`
- UI 根目录：`dist/ui`

修改 `manifest.json`、detector ID、attachment type、runtime 代码或 UI 入口后，需要重新构建并在 Pasty 中 Reload 插件。

## 🏷️ 插件标识

- 插件 ID：`plugin.pasty.aria2`
- Detector ID：`aira2-link-detector`
- Detector 显示名：`Aria2 Link Detector`
- Attachment renderer ID：`aira2-download-renderer`
- Attachment type：`plugin.pasty.aria2.download`
- Attachment 显示名：`Aria2 Download`
- Attachment 强调色：`#3B82F6`
