<template>
  <main class="download-shell" :style="themeStyle">
    <section v-if="payload" class="download-panel">
      <header class="download-header">
        <div class="download-heading">
          <p class="download-eyebrow">aria2 RPC</p>
          <h1 class="download-title">{{ title }}</h1>
        </div>
        <button class="help-button" type="button" title="Open help" aria-label="Open help" @click="openHelp">
          ?
        </button>
      </header>

      <form class="download-form" @submit.prevent="submit">
        <div class="download-form__scroll">
          <div v-if="!showConfig" class="config-summary">
            <div class="config-summary__text">
              <strong>{{ rpcSummary }}</strong>
              <span>{{ directorySummary }}</span>
            </div>
            <button class="config-summary__button" type="button" @click="showConfig = true">
              Edit
            </button>
          </div>

          <div v-else class="config-fields">
            <div class="form-grid">
              <label class="field">
                <span>Address</span>
                <input v-model.trim="form.rpcHost" autocomplete="off" spellcheck="false" />
              </label>
              <label class="field field--port">
                <span>Port</span>
                <input v-model.number="form.rpcPort" type="number" min="1" max="65535" />
              </label>
              <label class="field field--secret">
                <span>RPC Secret</span>
                <input v-model="form.rpcSecret" type="password" autocomplete="off" />
              </label>
            </div>

            <label class="field">
              <span>Download Directory</span>
              <input v-model.trim="form.dir" autocomplete="off" spellcheck="false" placeholder="Optional" />
            </label>
          </div>

        </div>

        <div class="download-form__footer">
          <p v-if="message" class="status-message" :class="{ 'status-message--error': hasError }">
            {{ message }}
          </p>

          <button class="submit-button" type="submit" :disabled="isSubmitting">
            {{ isSubmitting ? "Submitting..." : "Submit to aria2" }}
          </button>
        </div>
      </form>
    </section>

    <div v-else class="empty-state">
      <p class="empty-state__title">No download link detected</p>
      <p class="empty-state__body">Copy a supported download URL or torrent file reference.</p>
    </div>
  </main>
</template>

<script setup>
import { computed, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import { usePluginAttachmentSession } from "./composables/usePluginAttachmentSession";

const { payload, session, invokeAction } = usePluginAttachmentSession();

const form = reactive({
  rpcProtocol: "http",
  rpcHost: "127.0.0.1",
  rpcPort: 16800,
  rpcSecret: "diOzvyOnub7g5yjo",
  dir: ""
});
const isSubmitting = ref(false);
const message = ref("");
const hasError = ref(false);
const showConfig = ref(false);
let submitTimeoutID = null;

const resources = computed(() => Array.isArray(payload.value?.resources)
  ? payload.value.resources
  : []);

const title = computed(() => payload.value?.display?.headline || "Download task");
const rpcSummary = computed(() => `${form.rpcProtocol}://${form.rpcHost}:${form.rpcPort}`);
const directorySummary = computed(() => form.dir ? `Save to ${form.dir}` : "Use aria2 default directory");
const themeStyle = computed(() => {
  const accent = normalizeHexColor(session.accentHex) || "#2563eb";
  return {
    "--accent": accent,
    "--accent-soft": hexToRgba(accent, 0.1),
    "--accent-border": hexToRgba(accent, 0.26),
    "--accent-strong": shadeHex(accent, -18),
    "--accent-shadow": hexToRgba(accent, 0.22)
  };
});

watch(
  () => payload.value?.defaults,
  (defaults) => {
    if (!defaults) {
      return;
    }
    form.rpcProtocol = defaults.rpcProtocol || form.rpcProtocol;
    form.rpcHost = defaults.rpcHost || form.rpcHost;
    form.rpcPort = Number(defaults.rpcPort) || form.rpcPort;
    form.rpcSecret = defaults.rpcSecret || form.rpcSecret;
    form.dir = defaults.dir || form.dir;
    showConfig.value = !hasCompleteConfig();
  },
  { immediate: true }
);

function hasCompleteConfig() {
  return Boolean(form.rpcHost) &&
    Number.isInteger(Number(form.rpcPort)) &&
    Number(form.rpcPort) >= 1 &&
    Number(form.rpcPort) <= 65535;
}

function validateForm() {
  if (!form.rpcHost) {
    return "Enter the aria2 RPC address.";
  }
  if (!Number.isInteger(Number(form.rpcPort)) || Number(form.rpcPort) < 1 || Number(form.rpcPort) > 65535) {
    return "Enter a valid aria2 RPC port.";
  }
  if (resources.value.length === 0) {
    return "No downloadable resource is available.";
  }
  return "";
}

function submit() {
  const validationError = validateForm();
  if (validationError) {
    hasError.value = true;
    message.value = validationError;
    showConfig.value = true;
    return;
  }

  isSubmitting.value = true;
  hasError.value = false;
  message.value = "Submitting to aria2...";
  clearSubmitTimeout();
  submitTimeoutID = window.setTimeout(() => {
    if (!isSubmitting.value) {
      return;
    }
    isSubmitting.value = false;
    hasError.value = true;
    message.value = "No result was returned. Check the aria2 RPC configuration and Pasty operation result, then retry.";
    showConfig.value = true;
  }, 8000);
  invokeAction("submit-download", {
    rpcProtocol: form.rpcProtocol,
    rpcHost: form.rpcHost,
    rpcPort: Number(form.rpcPort),
    rpcSecret: form.rpcSecret,
    dir: form.dir
  });
}

function openHelp() {
  invokeAction("open-help", {});
}

function handleOperationResult(event) {
  const detail = event.detail ?? {};
  if (detail.actionID && detail.actionID !== "submit-download") {
    return;
  }

  isSubmitting.value = false;
  clearSubmitTimeout();
  hasError.value = detail.success === false;
  message.value = detail.userMessage || (detail.success === false
    ? "Submit failed. Check the aria2 RPC configuration and retry."
    : "Download submitted.");
  if (hasError.value) {
    showConfig.value = true;
  }
}

function clearSubmitTimeout() {
  if (submitTimeoutID !== null) {
    window.clearTimeout(submitTimeoutID);
    submitTimeoutID = null;
  }
}

function normalizeHexColor(value) {
  const text = String(value || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(text)) {
    return text;
  }
  if (/^#[0-9a-fA-F]{3}$/.test(text)) {
    return `#${text[1]}${text[1]}${text[2]}${text[2]}${text[3]}${text[3]}`;
  }
  return "";
}

function hexToRgba(hex, alpha) {
  const normalized = normalizeHexColor(hex) || "#2563eb";
  const value = Number.parseInt(normalized.slice(1), 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function shadeHex(hex, percent) {
  const normalized = normalizeHexColor(hex) || "#2563eb";
  const value = Number.parseInt(normalized.slice(1), 16);
  const amount = Math.round(2.55 * percent);
  const red = Math.max(0, Math.min(255, ((value >> 16) & 255) + amount));
  const green = Math.max(0, Math.min(255, ((value >> 8) & 255) + amount));
  const blue = Math.max(0, Math.min(255, (value & 255) + amount));
  return `#${((1 << 24) + (red << 16) + (green << 8) + blue).toString(16).slice(1)}`;
}

onMounted(() => {
  window.addEventListener("pasty-plugin-operation-result", handleOperationResult);
});

onUnmounted(() => {
  clearSubmitTimeout();
  window.removeEventListener("pasty-plugin-operation-result", handleOperationResult);
});
</script>

<style scoped>
.download-shell {
  height: 100%;
  background: transparent;
  color: inherit;
  --text-primary: currentColor;
  --text-muted: color-mix(in srgb, currentColor 68%, transparent);
  --field-surface: color-mix(in srgb, currentColor 8%, transparent);
  --field-surface-strong: color-mix(in srgb, currentColor 12%, transparent);
  --button-surface: rgba(255, 255, 255, 0.92);
  --button-text: #111827;
}

.download-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  height: 100%;
  padding: 10px 12px 12px;
  overflow: hidden;
}

.download-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.download-heading {
  flex: 1 1 auto;
  min-width: 0;
}

.help-button {
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border: 1px solid var(--accent-border);
  border-radius: 999px;
  background: var(--accent-soft);
  color: var(--text-primary);
  font-size: 14px;
  font-weight: 800;
  cursor: pointer;
}

.help-button:hover {
  background: var(--accent);
  color: #ffffff;
}

.download-eyebrow {
  margin: 0;
  color: var(--text-muted);
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
}

.download-title {
  margin: 3px 0 0;
  font-size: 17px;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--text-primary);
}

.download-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 0 1 auto;
  min-height: 0;
}

.download-form__scroll {
  display: flex;
  flex: 0 1 auto;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
  overflow: auto;
  padding-right: 2px;
}

.download-form__footer {
  display: grid;
  flex: 0 0 auto;
  gap: 6px;
}

.config-summary {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 8px 9px;
  border: 1px solid var(--accent-border);
  border-radius: 8px;
  background: var(--accent-soft);
}

.config-summary__text {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.config-summary__text strong,
.config-summary__text span {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.config-summary__text strong {
  color: var(--text-primary);
  font-size: 12px;
}

.config-summary__text span {
  color: var(--text-muted);
  font-size: 11px;
}

.config-summary__button {
  height: 28px;
  border: 1px solid var(--accent-border);
  border-radius: 7px;
  padding: 0 10px;
  background: var(--button-surface);
  color: var(--button-text);
  font-size: 12px;
  font-weight: 700;
}

.config-fields {
  display: grid;
  gap: 8px;
}

.form-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 82px;
  gap: 8px;
}

.field {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.field--secret {
  grid-column: 1 / -1;
}

.field span {
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 700;
}

.field input {
  min-width: 0;
  height: 30px;
  border: 1px solid var(--accent-border);
  border-radius: 7px;
  padding: 0 9px;
  background: var(--field-surface);
  color: var(--text-primary);
  font: inherit;
  font-size: 12px;
}

.field input:focus {
  outline: 2px solid var(--accent-border);
  border-color: var(--accent);
  background: var(--field-surface-strong);
}

.status-message {
  margin: 0;
  min-height: 16px;
  color: var(--text-primary);
  font-size: 11px;
  line-height: 1.35;
}

.status-message--error {
  color: #b91c1c;
}

.submit-button {
  height: 38px;
  border: 0;
  border-radius: 10px;
  background: linear-gradient(180deg, var(--accent), var(--accent-strong));
  color: #ffffff;
  font-size: 14px;
  font-weight: 800;
  letter-spacing: 0;
  box-shadow: 0 10px 20px var(--accent-shadow);
  cursor: pointer;
}

.submit-button:hover:not(:disabled) {
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--accent) 84%, #ffffff),
    var(--accent-strong)
  );
  box-shadow: 0 12px 24px var(--accent-shadow);
}

.submit-button:active:not(:disabled) {
  transform: translateY(1px);
  box-shadow: 0 6px 14px var(--accent-shadow);
}

.submit-button:disabled {
  opacity: 0.68;
}

.empty-state {
  height: 100%;
  display: grid;
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
  color: var(--text-muted);
  font-size: 13px;
  line-height: 1.45;
}
</style>
