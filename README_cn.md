# ⚡ Aria2 Downloader

中文 | [English](README.md)

Aria2 Downloader 是一个 Pasty 插件，用于从剪贴板条目中识别可下载链接，并通过 aria2 JSON-RPC 提交下载任务。

## ✨ 功能

- 🔎 识别包含下载链接的 `text` 剪贴板条目。
- 📎 识别 `path_reference` 剪贴板条目中的本地 torrent 和 metalink 文件。
- 🧩 在 Pasty 中显示紧凑的下载提交表单。
- 🚀 通过 aria2 JSON-RPC 提交匹配到的下载资源。
- 🛠️ 提交失败时保留表单，方便修改 RPC 配置后重试。
- ⚙️ 当默认配置或 external settings 完整可用时，隐藏 RPC 表单，仅保留配置摘要和编辑入口。

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

插件会刻意忽略正文中的内嵌链接。请复制 URL 本身，或每行放一个 URL。

## ⚙️ 默认 aria2 RPC 配置

下载界面默认使用以下配置：

- 地址：`127.0.0.1`
- 端口：`16800`
- RPC 密钥：`diOzvyOnub7g5yjo`
- 下载目录：当前系统用户的 `~/Downloads`

提交前可以在界面中修改这些值。

## 🧭 External Settings

Pasty 可以向插件 runtime 提供本机只读 external settings。本插件会读取以下 key：

- `plugin.pasty.aria2.rpcProtocol`：`http` 或 `https`
- `plugin.pasty.aria2.rpcHost`：aria2 RPC 地址
- `plugin.pasty.aria2.rpcPort`：aria2 RPC 端口
- `plugin.pasty.aria2.rpcSecret`：aria2 RPC 密钥
- `plugin.pasty.aria2.dir`：默认下载目录

这些配置由 Pasty 本机设置维护，插件只读取，不写入。界面中手动填写的值会优先生效；external settings 会作为默认值和 runtime 兜底配置。

当配置完整可用时，界面默认只显示紧凑摘要，不展开完整配置表单。缺少必要配置或校验失败时，表单会自动显示。

Renderer 使用 Pasty attachment 的固定高度。当前布局会让收起态尽量紧凑，同时保证展开配置表单后仍能在同一个面板内正常操作。

## 🛰️ aria2 启动方式

需要启动已开启 JSON-RPC 的 aria2，并使用匹配的密钥。例如：

```bash
aria2c --enable-rpc --rpc-listen-all=false --rpc-listen-port=16800 --rpc-secret=diOzvyOnub7g5yjo
```

如果你的 aria2 使用了不同的地址、端口或密钥，请在插件界面中修改后再提交。

## 🧑‍💻 开发

安装依赖：

```bash
npm install
```

运行测试：

```bash
npm test
```

构建 runtime 和 UI 产物：

```bash
npm run build
```

预览 renderer UI：

```bash
npm run dev
```

## 📦 Pasty 安装

本地开发时，将插件根目录添加到 Pasty Developer Plugins：

```text
path/to/aira2-plugin
```

Pasty 会加载 `manifest.json` 中声明的构建产物：

- Runtime：`dist/runtime/index.cjs`
- UI 根目录：`dist/ui`

修改 `manifest.json`、detector ID、attachment type 或 UI 入口后，需要重新构建并在 Pasty 中 Reload 插件。

## 🏷️ 插件标识

- 插件 ID：`plugin.pasty.aria2`
- Detector ID：`link-detector`
- Detector 显示名：`Aria2 Link Detector`
- Attachment renderer ID：`download-renderer`
- Attachment type：`plugin.pasty.aria2.download`
- Attachment 显示名：`Aria2 Download`

## ✅ 提交前验证

提交代码前运行：

```bash
npm test
npm run build
```

两个命令都应通过。
