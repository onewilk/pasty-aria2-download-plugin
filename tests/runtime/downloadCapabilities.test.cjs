const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const projectRoot = path.resolve(__dirname, "..", "..");
const manifestPath = path.resolve(projectRoot, "manifest.json");
const pluginPath = path.resolve(projectRoot, "dist/plugin.cjs");
let runtimeBuilt = false;

function loadManifest() {
  return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
}

function loadRuntime() {
  if (!runtimeBuilt || !fs.existsSync(pluginPath)) {
    execFileSync("npm", ["run", "build:runtime"], {
      cwd: projectRoot,
      stdio: "inherit"
    });
    runtimeBuilt = true;
  }
  delete require.cache[pluginPath];
  const pluginModule = require(pluginPath);
  const plugin = pluginModule.default || pluginModule;
  return plugin.setup();
}

function textInput(text) {
  return {
    item: { id: "item-1", type: "text", tags: [], sourceAppID: "" },
    content: { kind: "text", text },
    attachments: []
  };
}

function pathInput(entries) {
  return {
    item: { id: "item-1", type: "path_reference", tags: [], sourceAppID: "" },
    content: { kind: "path_reference", entries },
    attachments: []
  };
}

function settingsContext(settings) {
  return {
    host: {
      settings: {
        async get({ key }) {
          return { value: settings[key] ?? null };
        },
        async getAll() {
          return { settings };
        }
      }
    }
  };
}

function payloadFromArtifact(artifact) {
  return JSON.parse(artifact.payloadJson);
}

test("manifest registers new SDK runtime, download detector, and bounded renderer height", () => {
  const manifest = loadManifest();

  assert.equal(manifest.plugin.id, "plugin.pasty.aria2");
  assert.equal(manifest.runtime.nodeEntry, "dist/plugin.cjs");
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
  assert.deepEqual(renderer.height, { min: 140, max: 480 });
  assert.equal(renderer.uiEntry, "renderers/download-renderer/index.html");
});

test("runtime setup registers download handlers and message handlers", () => {
  const runtime = loadRuntime();

  assert.ok(runtime.detectors["link-detector"]);
  assert.ok(runtime.attachmentRenderers["download-renderer"]);
  assert.ok(runtime.messageHandlers["aria2.readConfig"]);
  assert.ok(runtime.messageHandlers["aria2.submitDownloads"]);
  assert.deepEqual(runtime.actions, {});
});

test("download detector emits artifact for supported text links", async () => {
  const runtime = loadRuntime();
  const artifacts = await runtime.detectors["link-detector"].detect(textInput([
    "https://example.com/file.zip",
    "ftp://mirror.example.com/image.iso",
    "d8988e034cb5de79d319242e3365bf30a7741a6e"
  ].join("\n")));

  assert.equal(artifacts.length, 1);
  assert.equal(artifacts[0].attachmentType, "plugin.pasty.aria2.download");
  assert.equal(artifacts[0].searchProjection.scope, "download");

  const payload = payloadFromArtifact(artifacts[0]);
  assert.equal(payload.kind, "aria2_download_task");
  assert.deepEqual(payload.defaults, {
    rpcProtocol: "http",
    rpcHost: "",
    rpcPort: "",
    rpcSecret: "",
    dir: "",
    configReady: false
  });
  assert.equal(payload.resources.length, 3);
  assert.equal(payload.resources[0].type, "http");
  assert.equal(payload.resources[1].type, "ftp");
  assert.equal(payload.resources[2].uri, "magnet:?xt=urn:btih:d8988e034cb5de79d319242e3365bf30a7741a6e");
});

test("download detector reads aria2 defaults from external settings", async () => {
  const runtime = loadRuntime();
  const artifacts = await runtime.detectors["link-detector"].detect(
    textInput("https://example.com/file.zip"),
    settingsContext({
      "plugin.pasty.aria2.rpcProtocol": "https",
      "plugin.pasty.aria2.rpcHost": "aria2.local",
      "plugin.pasty.aria2.rpcPort": 9443,
      "plugin.pasty.aria2.rpcSecret": "configured-secret",
      "plugin.pasty.aria2.dir": "/downloads",
      "plugin.other.rpcSecret": "must-not-be-read"
    })
  );

  const payload = payloadFromArtifact(artifacts[0]);
  assert.deepEqual(payload.defaults, {
    rpcProtocol: "https",
    rpcHost: "aria2.local",
    rpcPort: 9443,
    rpcSecret: "configured-secret",
    dir: "/downloads",
    configReady: true
  });
});

test("download detector falls back to getAll when single setting reads are empty", async () => {
  const runtime = loadRuntime();
  const settings = {
    "plugin.pasty.aria2.rpcProtocol": "http",
    "plugin.pasty.aria2.rpcHost": "127.0.0.1",
    "plugin.pasty.aria2.rpcPort": "16800",
    "plugin.pasty.aria2.rpcSecret": "configured-secret",
    "plugin.pasty.aria2.dir": "~/Downloads"
  };
  const artifacts = await runtime.detectors["link-detector"].detect(
    textInput("https://example.com/file.zip"),
    {
      host: {
        settings: {
          async get() {
            return { value: null };
          },
          async getAll() {
            return { settings };
          }
        }
      }
    }
  );

  const payload = payloadFromArtifact(artifacts[0]);
  assert.deepEqual(payload.defaults, {
    rpcProtocol: "http",
    rpcHost: "127.0.0.1",
    rpcPort: 16800,
    rpcSecret: "configured-secret",
    dir: "~/Downloads",
    configReady: true
  });
});

test("download detector decodes thunder links", async () => {
  const runtime = loadRuntime();
  const thunder = `thunder://${Buffer.from("AAhttp://example.com/file.zipZZ").toString("base64")}`;
  const artifacts = await runtime.detectors["link-detector"].detect(textInput(thunder));

  const payload = payloadFromArtifact(artifacts[0]);
  assert.equal(payload.resources[0].type, "thunder");
  assert.equal(payload.resources[0].uri, "http://example.com/file.zip");
  assert.equal(payload.resources[0].original, thunder);
});

test("download detector matches GitHub release asset URLs", async () => {
  const runtime = loadRuntime();
  const url = "https://github.com/AnInsomniacy/motrix-next/releases/download/v3.8.7/MotrixNext_3.8.7_aarch64.dmg";
  const artifacts = await runtime.detectors["link-detector"].detect(textInput(url));

  assert.equal(artifacts.length, 1);
  const payload = payloadFromArtifact(artifacts[0]);
  assert.equal(payload.resources[0].uri, url);
  assert.equal(payload.resources[0].displayName, "MotrixNext_3.8.7_aarch64.dmg");
});

test("download detector preserves repeated download links as separate resources", async () => {
  const runtime = loadRuntime();
  const url = "https://file.yzcdn.cn/upload_files/yz-file/2026/05/09/lo7nMoWFGsWMLhoRTyBvtZl1FLAY.apk?attname=base_05-09-15-15.apk";
  const artifacts = await runtime.detectors["link-detector"].detect(textInput([url, url, url].join("\n")));

  const payload = payloadFromArtifact(artifacts[0]);
  assert.equal(payload.resources.length, 3);
  assert.equal(payload.resources[0].id, "resource-1");
  assert.equal(payload.resources[1].id, "resource-2");
  assert.equal(payload.resources[2].id, "resource-3");
  assert.equal(payload.resources[0].displayName, "base_05-09-15-15.apk");
  assert.equal(payload.resources[1].displayName, "base_05-09-15-15.apk");
  assert.equal(payload.resources[2].displayName, "base_05-09-15-15.apk");
});

test("download detector uses attname query parameter as display name", async () => {
  const runtime = loadRuntime();
  const url = "https://file.example.com/upload_files/2026/05/09/raw.bin?AttName=base_05-09%2012.apk";
  const artifacts = await runtime.detectors["link-detector"].detect(textInput(url));

  const payload = payloadFromArtifact(artifacts[0]);
  assert.equal(payload.resources[0].displayName, "base_05-09 12.apk");
  assert.equal(payload.display.headline, "base_05-09 12.apk");
});

test("download detector emits local torrent and metalink files from path references", async () => {
  const runtime = loadRuntime();
  const artifacts = await runtime.detectors["link-detector"].detect(pathInput([
    { kind: "file", path: "/tmp/ubuntu.torrent", displayName: "ubuntu.torrent" },
    { kind: "file", path: "/tmp/list.meta4", displayName: "list.meta4" },
    { kind: "file", path: "/tmp/readme.txt", displayName: "readme.txt" }
  ]));

  const payload = payloadFromArtifact(artifacts[0]);
  assert.equal(payload.resources.length, 2);
  assert.equal(payload.resources[0].type, "torrent_file");
  assert.equal(payload.resources[1].type, "metalink_file");
});

test("download detector rejects prose with embedded URLs", async () => {
  const runtime = loadRuntime();
  const artifacts = await runtime.detectors["link-detector"].detect(textInput("Visit https://example.com/file.zip for details"));
  assert.equal(artifacts.length, 0);
});

test("download renderer resolves valid payload and hides invalid payload", async () => {
  const runtime = loadRuntime();
  const payloadJson = JSON.stringify({
    kind: "aria2_download_task",
    version: 1,
    sourceKind: "text",
    defaults: {},
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

  const resolved = await runtime.attachmentRenderers["download-renderer"].resolveAttachment({
    item: { id: "item-1", type: "text", tags: [], sourceAppID: "" },
    content: { kind: "text", text: "https://example.com/file.zip" },
    attachments: [],
    attachment: {
      historyID: "item-1",
      owner: "plugin.pasty.aria2",
      attachmentType: "plugin.pasty.aria2.download",
      attachmentKey: "download-file",
      payloadJson
    }
  });
  assert.equal(resolved.shouldDisplay, true);
  assert.equal(resolved.displayName, "Aria2 Download");
  assert.deepEqual(resolved.buttons, [
    { id: "open-help", title: "Help", isEnabled: true }
  ]);

  const hidden = await runtime.attachmentRenderers["download-renderer"].resolveAttachment({
    item: { id: "item-1", type: "text", tags: [], sourceAppID: "" },
    content: { kind: "text", text: "" },
    attachments: [],
    attachment: {
      historyID: "item-1",
      owner: "plugin.pasty.aria2",
      attachmentType: "plugin.pasty.aria2.download",
      attachmentKey: "broken",
      payloadJson: "{}"
    }
  });
  assert.equal(hidden.shouldDisplay, false);
});

test("readConfig message returns public config without RPC secret", async () => {
  const runtime = loadRuntime();
  const result = await runtime.messageHandlers["aria2.readConfig"](
    undefined,
    settingsContext({
      "plugin.pasty.aria2.rpcProtocol": "http",
      "plugin.pasty.aria2.rpcHost": "127.0.0.1",
      "plugin.pasty.aria2.rpcPort": "16800",
      "plugin.pasty.aria2.rpcSecret": "configured-secret",
      "plugin.pasty.aria2.dir": "~/Downloads"
    })
  );

  assert.deepEqual(result, {
    rpcProtocol: "http",
    rpcHost: "127.0.0.1",
    rpcPort: 16800,
    dir: "~/Downloads",
    configReady: true
  });
  assert.equal(Object.hasOwn(result, "rpcSecret"), false);
});

test("submitDownloads message submits aria2 addUri through JSON-RPC", async () => {
  const runtime = loadRuntime();
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

  const payloadJson = JSON.stringify({
    kind: "aria2_download_task",
    version: 1,
    sourceKind: "text",
    defaults: {},
    resources: [
      {
        id: "resource-1",
        type: "http",
        uri: "https://example.com/file.zip",
        original: "https://example.com/file.zip",
        displayName: "file.zip"
      }
    ],
    display: { headline: "file.zip", subheadline: "http", count: 1 }
  });

  try {
    const result = await runtime.messageHandlers["aria2.submitDownloads"](
      {
        payloadJson,
        config: {
          rpcHost: "127.0.0.1",
          rpcPort: 6800,
          dir: "/tmp/downloads"
        }
      },
      settingsContext({
        "plugin.pasty.aria2.rpcProtocol": "http",
        "plugin.pasty.aria2.rpcHost": "settings-host",
        "plugin.pasty.aria2.rpcPort": "16800",
        "plugin.pasty.aria2.rpcSecret": "secret",
        "plugin.pasty.aria2.dir": "/settings/downloads"
      })
    );

    assert.deepEqual(result, { gids: ["gid-1"] });
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

test("submitDownloads message rejects submit without aria2 RPC config", async () => {
  const runtime = loadRuntime();

  await assert.rejects(
    () => runtime.messageHandlers["aria2.submitDownloads"](
      {
        payloadJson: JSON.stringify({
          kind: "aria2_download_task",
          version: 1,
          sourceKind: "text",
          defaults: {},
          resources: [
            {
              id: "resource-1",
              type: "http",
              uri: "https://example.com/file.zip",
              original: "https://example.com/file.zip",
              displayName: "file.zip"
            }
          ],
          display: { headline: "file.zip", subheadline: "http", count: 1 }
        })
      },
      settingsContext({})
    ),
    /Missing aria2 RPC configuration/
  );
});
