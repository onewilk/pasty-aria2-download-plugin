<template>
  <main class="download-shell" :style="themeStyle">
    <template v-if="payload">
      <section
        v-if="isConfigReady"
        class="config-card"
        aria-label="aria2 RPC settings"
      >
        <div class="config-card__content">
          <p class="eyebrow">aria2 RPC</p>
          <strong>{{ rpcSummary }}</strong>
          <div class="config-card__extra">
            <span>{{ directorySummary }}</span>
          </div>
        </div>
        <div class="config-actions">
          <button class="submit-button" type="button" :disabled="isSubmitDisabled" @click="submit">
            <span class="submit-button__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" focusable="false">
                <path d="M12 3v11m0 0 4-4m-4 4-4-4M5 17v3h14v-3" />
              </svg>
            </span>
            <span>{{ isSubmitting ? "Submitting..." : "Submit to aria2" }}</span>
          </button>
        </div>

        <div
          v-if="notice"
          class="submit-notice"
          :class="`submit-notice--${notice.kind}`"
          role="status"
          aria-live="polite"
        >
          {{ notice.message }}
        </div>
      </section>

      <section v-else class="config-card" aria-label="aria2 RPC settings missing">
        <div class="config-card__content">
          <p class="eyebrow">aria2 RPC</p>
          <strong>Failed to read aria2 RPC settings.</strong>
          <span>Please configure them in Pasty external settings first.</span>
        </div>
        <div class="config-actions">
          <button class="submit-button" type="button" disabled>
            <span class="submit-button__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" focusable="false">
                <path d="M12 3v11m0 0 4-4m-4 4-4-4M5 17v3h14v-3" />
              </svg>
            </span>
            <span>Submit to aria2</span>
          </button>
        </div>
      </section>

      <div class="resource-list-shell">
        <div class="resource-list" aria-label="Detected download links">
          <article
            v-for="(resource, index) in payload.resources"
            :key="resource.id || `${resource.type}-${index}`"
            class="resource-card"
            :class="{
              'resource-card--selectable': hasMultipleResources,
              'resource-card--unselected': hasMultipleResources && !isResourceSelected(resource.id)
            }"
          >
            <span class="resource-index">{{ index + 1 }}</span>
            <div class="resource-main">
              <strong>{{ resource.displayName || resource.uri }}</strong>
              <span>{{ resource.original || resource.uri }}</span>
            </div>
            <button
              v-if="hasMultipleResources"
              class="resource-toggle"
              type="button"
              :aria-pressed="isResourceSelected(resource.id)"
              :aria-label="`${isResourceSelected(resource.id) ? 'Exclude' : 'Include'} ${resource.displayName || resource.uri}`"
              @click="toggleResource(resource.id)"
            >
              <span class="resource-toggle__mark" />
            </button>
          </article>
        </div>
      </div>
    </template>

    <div v-else class="empty-state">
      <p class="empty-state__title">No download link detected</p>
      <p class="empty-state__body">Copy a supported download URL or torrent file reference.</p>
    </div>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import { pasty } from "@pasty/plugin-sdk/ui";
import { HELP_ACTION_ID, HELP_URL } from "../../shared/constants";
import { decodeDownloadAttachmentPayload } from "./payloadDecode";
import { readConfigMessage, submitDownloadsMessage } from "./messages";
import type { DownloadAttachmentPayload, DownloadResource, PublicRpcConfig } from "./types";

const attachment = ref(pasty.item.attachment.current());
const theme = ref(pasty.theme.current());
const payload = computed<DownloadAttachmentPayload | null>(() => {
  return decodeDownloadAttachmentPayload(attachment.value?.attachment.payloadJson);
});

const form = reactive<PublicRpcConfig>({
  rpcProtocol: "http",
  rpcHost: "",
  rpcPort: "",
  dir: "",
  configReady: false
});
const notice = ref<{ kind: "success" | "error"; message: string } | null>(null);
const isSubmitting = ref(false);
const selectedResourceIDs = ref<Set<string>>(new Set());

const rpcSummary = computed(() => `${form.rpcProtocol}://${form.rpcHost}:${form.rpcPort}`);
const directorySummary = computed(() => form.dir ? `Save to ${form.dir}` : "Use aria2 default directory");
const isConfigReady = computed(() => form.configReady && hasCompleteConfig());
const resourceCount = computed(() => payload.value?.resources.length || 0);
const hasMultipleResources = computed(() => resourceCount.value > 1);
const selectedResources = computed<DownloadResource[]>(() => {
  const currentPayload = payload.value;
  if (!currentPayload) {
    return [];
  }
  return currentPayload.resources.filter((resource) => selectedResourceIDs.value.has(resource.id));
});
const selectedCount = computed(() => selectedResources.value.length);
const isSubmitDisabled = computed(() => isSubmitting.value || !isConfigReady.value || selectedCount.value === 0);
const themeStyle = computed(() => {
  const tokens = theme.value?.tokens;
  if (!tokens) {
    return {};
  }

  return {
    "--panel-bg-top": tokens.surfaceElevated,
    "--panel-bg-bottom": tokens.surface,
    "--surface-bg": tokens.surfaceElevated,
    "--surface-bg-strong": tokens.surface,
    "--surface-border": tokens.border,
    "--shell-text": tokens.textPrimary,
    "--shell-text-muted": tokens.textSecondary,
    "--shell-text-soft": tokens.textTertiary,
    "--accent": tokens.accent,
    "--accent-contrast": tokens.accentContrast,
    "--selection-check-color": tokens.accentContrast,
    "--success": tokens.success,
    "--danger": tokens.danger
  };
});

let disposeAttachment: (() => void) | undefined;
let disposeTheme: (() => void) | undefined;
let disposeHostInvoke: (() => void) | undefined;
let submitTimeoutID: number | null = null;
let noticeTimeoutID: number | null = null;

onMounted(() => {
  disposeAttachment = pasty.item.attachment.on((next) => {
    attachment.value = next;
  });
  disposeTheme = pasty.theme.on((next) => {
    theme.value = next;
  });
  disposeHostInvoke = pasty.attachmentRenderer.onHostInvoke.on(({ buttonID }) => {
    if (buttonID === HELP_ACTION_ID) {
      void openHelp();
    }
  });
  void readConfig();
});

onUnmounted(() => {
  disposeAttachment?.();
  disposeTheme?.();
  disposeHostInvoke?.();
  clearSubmitTimeout();
  clearNoticeTimeout();
});

watch(payload, (nextPayload) => {
  selectedResourceIDs.value = new Set(nextPayload?.resources.map((resource) => resource.id) || []);
}, { immediate: true });

function hasCompleteConfig(): boolean {
  const port = Number(form.rpcPort);
  return Boolean(form.rpcHost) && Number.isInteger(port) && port >= 1 && port <= 65535;
}

async function readConfig(): Promise<void> {
  try {
    applyConfig(await readConfigMessage.invoke({}));
  } catch (error) {
    form.configReady = false;
    await pasty.console.log({
      level: "error",
      message: `Failed to read aria2 RPC settings: ${error instanceof Error ? error.message : String(error)}`
    });
  }
}

function applyConfig(config: PublicRpcConfig): void {
  form.rpcProtocol = config.rpcProtocol || form.rpcProtocol;
  form.rpcHost = config.rpcHost || form.rpcHost;
  form.rpcPort = Number(config.rpcPort) || form.rpcPort;
  form.dir = config.dir || form.dir;
  form.configReady = Boolean(config.configReady) && hasCompleteConfig();
}

async function submit(): Promise<void> {
  const selectedPayload = buildSelectedPayload();
  if (!selectedPayload || !isConfigReady.value) {
    return;
  }

  isSubmitting.value = true;
  clearSubmitTimeout();
  clearNotice();
  submitTimeoutID = window.setTimeout(() => {
    isSubmitting.value = false;
  }, 12000);

  try {
    const result = await submitDownloadsMessage.invoke({
      payloadJson: JSON.stringify(selectedPayload),
      config: {
        rpcProtocol: form.rpcProtocol,
        rpcHost: form.rpcHost,
        rpcPort: form.rpcPort,
        dir: form.dir
      }
    }, { timeoutMs: 30000 });
    await pasty.console.log({
      level: "info",
      message: `Submitted ${result.gids.length} aria2 download${result.gids.length === 1 ? "" : "s"}`
    });
    showNotice("success", "Check the aria2 app for download tasks.");
  } catch (error) {
    await pasty.console.log({
      level: "error",
      message: error instanceof Error ? error.message : String(error)
    });
    showNotice("error", "Check configuration and aria2 app status.");
  } finally {
    isSubmitting.value = false;
    clearSubmitTimeout();
  }
}

function buildSelectedPayload(): DownloadAttachmentPayload | null {
  const currentPayload = payload.value;
  const resources = selectedResources.value;
  if (!currentPayload || resources.length === 0) {
    return null;
  }

  return {
    ...currentPayload,
    resources,
    display: {
      ...currentPayload.display,
      count: resources.length,
      headline: resources.length === 1
        ? resources[0].displayName || resources[0].uri
        : `${resources.length} download links`
    }
  };
}

function isResourceSelected(resourceID: string): boolean {
  return selectedResourceIDs.value.has(resourceID);
}

function toggleResource(resourceID: string): void {
  const next = new Set(selectedResourceIDs.value);
  if (next.has(resourceID)) {
    next.delete(resourceID);
  } else {
    next.add(resourceID);
  }
  selectedResourceIDs.value = next;
}

function showNotice(kind: "success" | "error", message: string): void {
  clearNoticeTimeout();
  notice.value = { kind, message };
  noticeTimeoutID = window.setTimeout(() => {
    notice.value = null;
    noticeTimeoutID = null;
  }, 3600);
}

function clearNotice(): void {
  clearNoticeTimeout();
  notice.value = null;
}

async function openHelp(): Promise<void> {
  await pasty.navigation.openUrl({ url: HELP_URL });
}

function clearSubmitTimeout(): void {
  if (submitTimeoutID !== null) {
    window.clearTimeout(submitTimeoutID);
    submitTimeoutID = null;
  }
}

function clearNoticeTimeout(): void {
  if (noticeTimeoutID !== null) {
    window.clearTimeout(noticeTimeoutID);
    noticeTimeoutID = null;
  }
}
</script>

<style scoped>
.download-shell {
  --panel-bg-top: rgba(248, 250, 252, 0.96);
  --panel-bg-bottom: rgba(241, 245, 249, 0.92);
  --surface-bg: rgba(248, 250, 252, 0.78);
  --surface-bg-strong: rgba(255, 255, 255, 0.82);
  --surface-border: rgba(148, 163, 184, 0.22);
  --shell-text: #0f172a;
  --shell-text-muted: #64748b;
  --shell-text-soft: #475569;
  --accent: #e2e8f0;
  --accent-contrast: #334155;
  --selection-check-color: #334155;
  --success: #16a34a;
  --danger: #dc2626;

  background: transparent;
  color: var(--shell-text);
  display: grid;
  gap: 4px;
  padding: 0;
  position: relative;
}

.config-card {
  position: sticky;
  top: 0;
  z-index: 2;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  min-width: 0;
  padding: 2px 0 8px;
  border-bottom: 1px solid var(--surface-border);
  background: transparent;
}

.config-card__extra {
  display: grid;
  gap: 2px;
  overflow: hidden;
}

.config-card__content {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.eyebrow {
  margin: 0;
  color: var(--shell-text-muted);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.config-card__content strong,
.config-card__content span {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.config-card__content strong {
  color: var(--shell-text);
  font-size: 12px;
}

.config-card__content span {
  color: var(--shell-text-muted);
  font-size: 11px;
}

.config-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.submit-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 30px;
  min-width: 108px;
  border: 0;
  border-radius: 10px;
  padding: 0 10px;
  background: var(--accent);
  color: var(--selection-check-color);
  cursor: pointer;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0;
}

.submit-button__icon {
  display: grid;
  place-items: center;
  width: 14px;
  height: 14px;
  flex: 0 0 auto;
}

.submit-button__icon svg {
  width: 14px;
  height: 14px;
  fill: none;
  stroke: var(--selection-check-color);
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 2;
}

.submit-button:hover:not(:disabled) {
  filter: brightness(1.04);
}

.submit-button:disabled {
  cursor: default;
  opacity: 0.58;
}

.resource-list-shell {
  position: relative;
  min-width: 0;
}

.resource-list {
  scrollbar-width: none;
  display: grid;
  align-content: start;
  gap: 8px;
  max-height: 196px;
  -webkit-mask-image: linear-gradient(to bottom, transparent 0, #000 18px, #000 calc(100% - 18px), transparent 100%);
  mask-image: linear-gradient(to bottom, transparent 0, #000 18px, #000 calc(100% - 18px), transparent 100%);
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 8px 2px 8px;
}

.resource-list::-webkit-scrollbar {
  display: none;
}

.resource-card {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  height: 58px;
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid var(--surface-border);
  border-radius: 12px;
  background: var(--surface-bg-strong);
}

.resource-card--selectable {
  grid-template-columns: 24px minmax(0, 1fr) 28px;
}

.resource-card--unselected {
  opacity: 0.64;
}

.resource-index {
  align-self: center;
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: 999px;
  background: var(--panel-bg-top);
  color: var(--shell-text);
  font-size: 11px;
  font-weight: 700;
}

.resource-main {
  display: grid;
  gap: 4px;
  align-content: center;
  min-width: 0;
  min-height: 38px;
}

.resource-main strong,
.resource-main span {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.resource-main strong {
  color: var(--shell-text);
  font-size: 12px;
  font-weight: 700;
}

.resource-main span {
  color: var(--shell-text-soft);
  direction: ltr;
  font-size: 11px;
}

.resource-toggle {
  align-self: center;
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  cursor: pointer;
}

.resource-toggle__mark {
  display: grid;
  place-items: center;
  width: 16px;
  height: 16px;
  box-shadow: inset 0 0 0 1.5px var(--surface-border);
  border-radius: 999px;
  background: transparent;
  color: var(--selection-check-color);
  font-size: 10px;
  font-weight: 800;
  line-height: 1;
}

.resource-toggle[aria-pressed="true"] .resource-toggle__mark {
  background: var(--accent);
  box-shadow: none;
}

.resource-toggle[aria-pressed="true"] .resource-toggle__mark::after {
  content: "\2713";
}

.submit-notice {
  position: absolute;
  left: 50%;
  bottom: 6px;
  z-index: 4;
  width: max-content;
  max-width: min(320px, 100%);
  transform: translateX(-50%);
  border: 1px solid color-mix(in srgb, currentColor 28%, transparent);
  border-radius: 999px;
  padding: 7px 11px;
  box-shadow: 0 10px 28px rgba(15, 23, 42, 0.22);
  font-size: 12px;
  font-weight: 700;
  line-height: 1.35;
  text-align: center;
  white-space: normal;
}

.submit-notice--success {
  background: color-mix(in srgb, var(--success) 18%, var(--surface-bg-strong));
  color: var(--success);
}

.submit-notice--error {
  background: color-mix(in srgb, var(--danger) 16%, var(--surface-bg-strong));
  color: var(--danger);
}

.empty-state {
  display: grid;
  min-height: 140px;
  place-items: center;
  padding: 16px;
  text-align: center;
}

.empty-state__title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
}

.empty-state__body {
  margin: 8px 0 0;
  color: var(--shell-text-muted);
  font-size: 13px;
  line-height: 1.45;
}
</style>
