<template>
  <main class="download-shell">
    <section v-if="payload" class="download-panel">
      <header class="download-header">
        <div class="download-heading">
          <p class="download-eyebrow">aria2 RPC</p>
          <h1 class="download-title">{{ title }}</h1>
        </div>
        <span class="download-count">{{ linkCountLabel }}</span>
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

          <div class="resource-panel" aria-label="Matched download links">
            <header class="resource-panel__header">
              <strong>{{ resourcePanelTitle }}</strong>
              <span>These addresses will be submitted to aria2.</span>
            </header>
            <div class="resource-list">
              <article v-for="resource in resources" :key="resource.id" class="resource-row">
                <div class="resource-main">
                  <strong>{{ resource.displayName }}</strong>
                  <span>{{ resource.original }}</span>
                </div>
                <small>{{ resource.type }}</small>
              </article>
            </div>
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

const { payload, invokeAction } = usePluginAttachmentSession();

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
const linkCountLabel = computed(() => `${resources.value.length} ${resources.value.length === 1 ? "link" : "links"}`);
const resourcePanelTitle = computed(() => resources.value.length === 1 ? "Matched Link" : "Matched Links");
const rpcSummary = computed(() => `${form.rpcProtocol}://${form.rpcHost}:${form.rpcPort}`);
const directorySummary = computed(() => form.dir ? `Save to ${form.dir}` : "Use aria2 default directory");

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
  background: #f8fafc;
  color: #111827;
}

.download-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
  padding: 14px;
  overflow: hidden;
}

.download-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.download-heading {
  min-width: 0;
}

.download-eyebrow {
  margin: 0;
  color: #64748b;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
}

.download-title {
  margin: 3px 0 0;
  font-size: 18px;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.download-count {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 44px;
  height: 30px;
  border-radius: 8px;
  padding: 0 9px;
  background: #dbeafe;
  color: #1d4ed8;
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
}

.download-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex: 1 1 auto;
  min-height: 0;
}

.download-form__scroll {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
  overflow: auto;
  padding-right: 2px;
}

.download-form__footer {
  display: grid;
  flex: 0 0 auto;
  gap: 7px;
}

.config-summary {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 9px 10px;
  border: 1px solid #dbeafe;
  border-radius: 8px;
  background: #eff6ff;
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
  color: #1e3a8a;
  font-size: 12px;
}

.config-summary__text span {
  color: #475569;
  font-size: 11px;
}

.config-summary__button {
  height: 28px;
  border: 1px solid #bfdbfe;
  border-radius: 7px;
  padding: 0 10px;
  background: #ffffff;
  color: #1d4ed8;
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
  color: #475569;
  font-size: 11px;
  font-weight: 700;
}

.field input {
  min-width: 0;
  height: 30px;
  border: 1px solid #cbd5e1;
  border-radius: 7px;
  padding: 0 9px;
  background: #ffffff;
  color: #0f172a;
  font: inherit;
  font-size: 12px;
}

.field input:focus {
  outline: 2px solid rgba(37, 99, 235, 0.22);
  border-color: #2563eb;
}

.resource-panel {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 6px;
  flex: 1 1 auto;
  min-height: 62px;
  padding: 8px 9px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #ffffff;
}

.resource-panel__header {
  display: grid;
  gap: 2px;
}

.resource-panel__header strong {
  color: #0f172a;
  font-size: 12px;
}

.resource-panel__header span {
  color: #64748b;
  font-size: 11px;
}

.resource-list {
  display: grid;
  align-content: start;
  gap: 6px;
  min-height: 0;
  overflow: auto;
}

.resource-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 6px 0 0;
  border-top: 1px solid #f1f5f9;
}

.resource-row:first-child {
  border-top: 0;
  padding-top: 2px;
}

.resource-main {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.resource-main strong,
.resource-main span {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.resource-main strong {
  font-size: 12px;
}

.resource-main span,
.resource-row small {
  color: #64748b;
  font-size: 11px;
}

.status-message {
  margin: 0;
  min-height: 16px;
  color: #2563eb;
  font-size: 11px;
  line-height: 1.35;
}

.status-message--error {
  color: #b91c1c;
}

.submit-button {
  height: 42px;
  border: 0;
  border-radius: 10px;
  background: linear-gradient(180deg, #16a34a, #15803d);
  color: #ffffff;
  font-size: 14px;
  font-weight: 800;
  letter-spacing: 0;
  box-shadow: 0 10px 20px rgba(21, 128, 61, 0.22);
  cursor: pointer;
}

.submit-button:hover:not(:disabled) {
  background: linear-gradient(180deg, #22c55e, #15803d);
  box-shadow: 0 12px 24px rgba(21, 128, 61, 0.3);
}

.submit-button:active:not(:disabled) {
  transform: translateY(1px);
  box-shadow: 0 6px 14px rgba(21, 128, 61, 0.24);
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
  color: #64748b;
  font-size: 13px;
  line-height: 1.45;
}
</style>
