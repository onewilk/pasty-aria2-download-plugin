const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..", "..");
const manifestPath = path.resolve(projectRoot, "manifest.json");

function loadManifest() {
  return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
}

test("manifest registers download detector and renderer", () => {
  const manifest = loadManifest();

  assert.equal(manifest.plugin.id, "plugin.pasty.aria2");
  assert.equal(manifest.detectors.length, 1);
  assert.equal(manifest.attachmentRenderers.length, 1);
  assert.equal(manifest.actions.length, 0);

  const detector = manifest.detectors.find((entry) => entry.id === "link-detector");
  assert.ok(detector);
  assert.deepEqual(detector.supportedInputKinds, ["text", "path_reference"]);
  assert.deepEqual(detector.attachmentTypes, ["plugin.pasty.aria2.download"]);

  const renderer = manifest.attachmentRenderers.find((entry) => entry.id === "download-renderer");
  assert.ok(renderer);
  assert.equal(renderer.attachmentType, "plugin.pasty.aria2.download");
  assert.equal(renderer.uiEntry, "renderers/download-renderer/index.html");
});

test("runtime setup registers download handlers", () => {
  const pluginDefinition = require(path.resolve(projectRoot, "src/runtime/index.js"));
  const runtime = pluginDefinition.setup({});

  assert.ok(runtime.detectors["link-detector"]);
  assert.ok(runtime.attachmentRenderers["download-renderer"]);
  assert.deepEqual(runtime.actions, {});
});

test("download detector emits artifact for supported text links", async () => {
  const { detectDownloadAttachment } = require(path.resolve(
    projectRoot,
    "src/runtime/detectors/downloadDetector.js"
  ));

  const artifacts = await detectDownloadAttachment({
    content: {
      kind: "text",
      payload: {
        text: [
          "https://example.com/file.zip",
          "ftp://mirror.example.com/image.iso",
          "d8988e034cb5de79d319242e3365bf30a7741a6e"
        ].join("\n")
      }
    }
  });

  assert.equal(artifacts.length, 1);
  assert.equal(artifacts[0].attachmentType, "plugin.pasty.aria2.download");
  assert.equal(artifacts[0].searchProjection.scope, "download");

  const payload = JSON.parse(artifacts[0].payloadJson);
  assert.equal(payload.kind, "aria2_download_task");
  assert.deepEqual(payload.defaults, {
    rpcProtocol: "http",
    rpcHost: "127.0.0.1",
    rpcPort: 16800,
    rpcSecret: "diOzvyOnub7g5yjo",
    dir: path.join(os.homedir(), "Downloads")
  });
  assert.equal(payload.resources.length, 3);
  assert.equal(payload.resources[0].type, "http");
  assert.equal(payload.resources[1].type, "ftp");
  assert.equal(
    payload.resources[2].uri,
    "magnet:?xt=urn:btih:d8988e034cb5de79d319242e3365bf30a7741a6e"
  );
});

test("download detector reads aria2 defaults from external settings", async () => {
  const { detectDownloadAttachment } = require(path.resolve(
    projectRoot,
    "src/runtime/detectors/downloadDetector.js"
  ));

  const artifacts = await detectDownloadAttachment(
    {
      content: {
        kind: "text",
        payload: {
          text: "https://example.com/file.zip"
        }
      }
    },
    {
      host: {
        settings: {
          async getAll() {
            return {
              "plugin.pasty.aria2.rpcProtocol": "https",
              "plugin.pasty.aria2.rpcHost": "aria2.local",
              "plugin.pasty.aria2.rpcPort": 9443,
              "plugin.pasty.aria2.rpcSecret": "configured-secret",
              "plugin.pasty.aria2.dir": "/downloads",
              "plugin.other.rpcSecret": "must-not-be-read"
            };
          }
        }
      }
    }
  );

  const payload = JSON.parse(artifacts[0].payloadJson);
  assert.deepEqual(payload.defaults, {
    rpcProtocol: "https",
    rpcHost: "aria2.local",
    rpcPort: 9443,
    rpcSecret: "configured-secret",
    dir: "/downloads"
  });
});

test("download detector decodes thunder links", async () => {
  const { detectDownloadAttachment } = require(path.resolve(
    projectRoot,
    "src/runtime/detectors/downloadDetector.js"
  ));
  const thunder = `thunder://${Buffer.from("AAhttp://example.com/file.zipZZ").toString("base64")}`;

  const artifacts = await detectDownloadAttachment({
    content: {
      kind: "text",
      payload: {
        text: thunder
      }
    }
  });

  const payload = JSON.parse(artifacts[0].payloadJson);
  assert.equal(payload.resources[0].type, "thunder");
  assert.equal(payload.resources[0].uri, "http://example.com/file.zip");
  assert.equal(payload.resources[0].original, thunder);
});

test("download detector matches GitHub release asset URLs", async () => {
  const { detectDownloadAttachment } = require(path.resolve(
    projectRoot,
    "src/runtime/detectors/downloadDetector.js"
  ));

  const url = "https://github.com/AnInsomniacy/motrix-next/releases/download/v3.8.7/MotrixNext_3.8.7_aarch64.dmg";
  const artifacts = await detectDownloadAttachment({
    content: {
      kind: "text",
      payload: {
        text: url
      }
    }
  });

  assert.equal(artifacts.length, 1);
  assert.equal(artifacts[0].attachmentType, "plugin.pasty.aria2.download");
  const payload = JSON.parse(artifacts[0].payloadJson);
  assert.equal(payload.resources[0].uri, url);
  assert.equal(payload.resources[0].displayName, "MotrixNext_3.8.7_aarch64.dmg");
});

test("download detector uses attname query parameter as display name", async () => {
  const { detectDownloadAttachment } = require(path.resolve(
    projectRoot,
    "src/runtime/detectors/downloadDetector.js"
  ));

  const url = "https://file.example.com/upload_files/2026/05/09/raw.bin?AttName=base_05-09%2012.apk";
  const artifacts = await detectDownloadAttachment({
    content: {
      kind: "text",
      payload: {
        text: url
      }
    }
  });

  const payload = JSON.parse(artifacts[0].payloadJson);
  assert.equal(payload.resources[0].displayName, "base_05-09 12.apk");
  assert.equal(payload.display.headline, "base_05-09 12.apk");
});


test("download detector emits local torrent and metalink files from path references", async () => {
  const { detectDownloadAttachment } = require(path.resolve(
    projectRoot,
    "src/runtime/detectors/downloadDetector.js"
  ));

  const artifacts = await detectDownloadAttachment({
    content: {
      kind: "path_reference",
      payload: {
        entries: [
          { kind: "file", path: "/tmp/ubuntu.torrent", displayName: "ubuntu.torrent" },
          { kind: "file", path: "/tmp/list.meta4", displayName: "list.meta4" },
          { kind: "file", path: "/tmp/readme.txt", displayName: "readme.txt" }
        ]
      }
    }
  });

  const payload = JSON.parse(artifacts[0].payloadJson);
  assert.equal(payload.resources.length, 2);
  assert.equal(payload.resources[0].type, "torrent_file");
  assert.equal(payload.resources[1].type, "metalink_file");
});

test("download detector rejects prose with embedded URLs", async () => {
  const { detectDownloadAttachment } = require(path.resolve(
    projectRoot,
    "src/runtime/detectors/downloadDetector.js"
  ));

  const artifacts = await detectDownloadAttachment({
    content: {
      kind: "text",
      payload: {
        text: "Visit https://example.com/file.zip for details"
      }
    }
  });

  assert.equal(artifacts.length, 0);
});

test("download renderer resolves without host action buttons", () => {
  const { resolveAttachment } = require(path.resolve(
    projectRoot,
    "src/runtime/renderers/downloadRenderer.js"
  ));

  const payloadJson = JSON.stringify({
    kind: "aria2_download_task",
    version: 1,
    sourceKind: "text",
    resources: [
      {
        id: "resource-1",
        type: "http",
        uri: "https://example.com/file.zip",
        original: "https://example.com/file.zip",
        displayName: "file.zip"
      }
    ],
    display: {
      headline: "file.zip",
      subheadline: "http",
      count: 1
    }
  });

  const resolved = resolveAttachment({ attachment: { payloadJson } });
  assert.equal(resolved.displayName, "Aria2 Download");
  assert.deepEqual(resolved.buttons, []);
});

test("download renderer opens help URL", async () => {
  const { HELP_URL, invokeOperation } = require(path.resolve(
    projectRoot,
    "src/runtime/renderers/downloadRenderer.js"
  ));
  let openedUrl = "";

  const result = await invokeOperation(
    {
      buttonID: "open-help"
    },
    {
      host: {
        navigation: {
          async openUrl(url) {
            openedUrl = url;
            return true;
          }
        }
      }
    }
  );

  assert.equal(result.success, true);
  assert.equal(openedUrl, HELP_URL);
});

test("download renderer submits aria2 addUri through JSON-RPC", async () => {
  const { submitDownloads } = require(path.resolve(
    projectRoot,
    "src/runtime/renderers/downloadRenderer.js"
  ));
  const requests = [];
  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    requests.push({ url, body: JSON.parse(options.body) });
    return {
      ok: true,
      async json() {
        return { result: "gid-1" };
      }
    };
  };

  try {
    const gids = await submitDownloads(
      [
        {
          type: "http",
          uri: "https://example.com/file.zip"
        }
      ],
      {
        rpcHost: "127.0.0.1",
        rpcPort: 6800,
        rpcSecret: "secret",
        dir: "/tmp/downloads"
      }
    );

    assert.deepEqual(gids, ["gid-1"]);
    assert.equal(requests[0].url, "http://127.0.0.1:6800/jsonrpc");
    assert.equal(requests[0].body.method, "aria2.addUri");
    assert.deepEqual(requests[0].body.params, [
      "token:secret",
      ["https://example.com/file.zip"],
      { dir: "/tmp/downloads" }
    ]);
  } finally {
    global.fetch = originalFetch;
  }
});

test("download renderer uses default aria2 RPC config and Downloads directory", async () => {
  const { submitDownloads } = require(path.resolve(
    projectRoot,
    "src/runtime/renderers/downloadRenderer.js"
  ));
  const requests = [];
  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    requests.push({ url, body: JSON.parse(options.body) });
    return {
      ok: true,
      async json() {
        return { result: "gid-default" };
      }
    };
  };

  try {
    const gids = await submitDownloads(
      [
        {
          type: "http",
          uri: "https://example.com/file.zip"
        }
      ],
      {}
    );

    assert.deepEqual(gids, ["gid-default"]);
    assert.equal(requests[0].url, "http://127.0.0.1:16800/jsonrpc");
    assert.deepEqual(requests[0].body.params, [
      "token:diOzvyOnub7g5yjo",
      ["https://example.com/file.zip"],
      { dir: path.join(os.homedir(), "Downloads") }
    ]);
  } finally {
    global.fetch = originalFetch;
  }
});

test("download renderer uses external settings as submit fallback", async () => {
  const { submitDownloads } = require(path.resolve(
    projectRoot,
    "src/runtime/renderers/downloadRenderer.js"
  ));
  const requests = [];
  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    requests.push({ url, body: JSON.parse(options.body) });
    return {
      ok: true,
      async json() {
        return { result: "gid-settings" };
      }
    };
  };

  try {
    const gids = await submitDownloads(
      [
        {
          type: "http",
          uri: "https://example.com/file.zip"
        }
      ],
      {},
      {
        rpcProtocol: "https",
        rpcHost: "aria2.local",
        rpcPort: 9443,
        rpcSecret: "configured-secret",
        dir: "/downloads"
      }
    );

    assert.deepEqual(gids, ["gid-settings"]);
    assert.equal(requests[0].url, "https://aria2.local:9443/jsonrpc");
    assert.deepEqual(requests[0].body.params, [
      "token:configured-secret",
      ["https://example.com/file.zip"],
      { dir: "/downloads" }
    ]);
  } finally {
    global.fetch = originalFetch;
  }
});
