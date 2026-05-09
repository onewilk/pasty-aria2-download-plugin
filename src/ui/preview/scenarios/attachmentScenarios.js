function createDownloadScenario({ id, label, resources, text }) {
  return {
    id,
    label,
    searchTerms: ["download", "aria2"],
    accentHex: "#2563eb",
    bootstrap: {
      pluginID: "plugin.pasty.aria2",
      rendererID: "download-renderer",
      item: {
        id: `item-${id}`,
        type: "text",
        text,
        tags: [],
        sourceAppID: "com.preview.editor"
      },
      attachment: {
        owner: "plugin.pasty.aria2",
        attachmentType: "plugin.pasty.aria2.download",
        attachmentKey: `download-${id}`,
        payloadJson: JSON.stringify({
          kind: "aria2_download_task",
          version: 1,
          sourceKind: "text",
          resources,
          display: {
            headline: resources.length === 1 ? resources[0].displayName : `${resources.length} download links`,
            subheadline: resources.map((resource) => resource.type).join(", "),
            count: resources.length
          }
        })
      },
      buttons: []
    }
  };
}

export const attachmentScenarios = [
  createDownloadScenario({
    id: "http",
    label: "HTTP URL",
    text: "https://example.com/releases/app.zip",
    resources: [
      {
        id: "resource-1",
        type: "http",
        sourceKind: "text",
        uri: "https://example.com/releases/app.zip",
        original: "https://example.com/releases/app.zip",
        displayName: "app.zip",
        isLocalFile: false
      }
    ]
  }),
  createDownloadScenario({
    id: "attname",
    label: "URL attname",
    text: "https://file.example.com/upload/raw.bin?attname=base_05-09%2012.apk",
    resources: [
      {
        id: "resource-1",
        type: "http",
        sourceKind: "text",
        uri: "https://file.example.com/upload/raw.bin?attname=base_05-09%2012.apk",
        original: "https://file.example.com/upload/raw.bin?attname=base_05-09%2012.apk",
        displayName: "base_05-09 12.apk",
        isLocalFile: false
      }
    ]
  }),
  createDownloadScenario({
    id: "batch",
    label: "Batch Links",
    text: "magnet:?xt=urn:btih:d8988e034cb5de79d319242e3365bf30a7741a6e\nftp://mirror.example.com/pub/file.iso",
    resources: [
      {
        id: "resource-1",
        type: "magnet",
        sourceKind: "text",
        uri: "magnet:?xt=urn:btih:d8988e034cb5de79d319242e3365bf30a7741a6e",
        original: "magnet:?xt=urn:btih:d8988e034cb5de79d319242e3365bf30a7741a6e",
        displayName: "magnet:?xt=urn:btih:d8988e034cb5de79d319242e3365bf30a7741a6e",
        isLocalFile: false
      },
      {
        id: "resource-2",
        type: "ftp",
        sourceKind: "text",
        uri: "ftp://mirror.example.com/pub/file.iso",
        original: "ftp://mirror.example.com/pub/file.iso",
        displayName: "file.iso",
        isLocalFile: false
      }
    ]
  })
];
