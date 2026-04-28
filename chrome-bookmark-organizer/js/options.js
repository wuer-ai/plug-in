import { DEFAULT_SETTINGS } from "./modules/constants.js";
import { getSettings, saveSettings } from "./modules/storage.js";

const fields = {
  aiEnabled: document.querySelector("#aiEnabled"),
  provider: document.querySelector("#provider"),
  model: document.querySelector("#model"),
  apiBaseUrl: document.querySelector("#apiBaseUrl"),
  apiKey: document.querySelector("#apiKey"),
  sendTitlesOnly: document.querySelector("#sendTitlesOnly"),
  remoteNamingOnly: document.querySelector("#remoteNamingOnly"),
  lowConfidenceThreshold: document.querySelector("#lowConfidenceThreshold"),
  maxAiGroupCount: document.querySelector("#maxAiGroupCount"),
  saveButton: document.querySelector("#saveButton"),
  resetButton: document.querySelector("#resetButton"),
  settingsStatus: document.querySelector("#settingsStatus"),
};

bootstrap().catch((error) => {
  renderStatus(error.message, "error");
});

async function bootstrap() {
  bindEvents();
  renderForm(await getSettings());
}

function bindEvents() {
  fields.saveButton.addEventListener("click", async () => {
    try {
      const settings = readForm();
      await saveSettings(settings);
      renderStatus("设置已保存。下次扫描时会按新的 AI 策略执行。", "success");
    } catch (error) {
      renderStatus(error.message, "error");
    }
  });

  fields.resetButton.addEventListener("click", async () => {
    await saveSettings(DEFAULT_SETTINGS);
    renderForm(DEFAULT_SETTINGS);
    renderStatus("已恢复默认设置。", "success");
  });
}

function renderForm(settings) {
  fields.aiEnabled.checked = Boolean(settings.aiEnabled);
  fields.provider.value = settings.provider;
  fields.model.value = settings.model;
  fields.apiBaseUrl.value = settings.apiBaseUrl;
  fields.apiKey.value = settings.apiKey;
  fields.sendTitlesOnly.checked = Boolean(settings.sendTitlesOnly);
  fields.remoteNamingOnly.checked = Boolean(settings.remoteNamingOnly);
  fields.lowConfidenceThreshold.value = String(settings.lowConfidenceThreshold);
  fields.maxAiGroupCount.value = String(settings.maxAiGroupCount);
}

function readForm() {
  const threshold = Number(fields.lowConfidenceThreshold.value);
  const maxAiGroupCount = Number(fields.maxAiGroupCount.value);

  if (!Number.isFinite(threshold) || threshold < 0.4 || threshold > 0.95) {
    throw new Error("低置信度阈值需要在 0.4 到 0.95 之间。");
  }

  if (!Number.isFinite(maxAiGroupCount) || maxAiGroupCount < 1 || maxAiGroupCount > 20) {
    throw new Error("单次 AI 分组数需要在 1 到 20 之间。");
  }

  return {
    aiEnabled: fields.aiEnabled.checked,
    provider: fields.provider.value,
    model: fields.model.value.trim(),
    apiBaseUrl: fields.apiBaseUrl.value.trim(),
    apiKey: fields.apiKey.value.trim(),
    sendTitlesOnly: fields.sendTitlesOnly.checked,
    remoteNamingOnly: fields.remoteNamingOnly.checked,
    lowConfidenceThreshold: threshold,
    maxAiGroupCount,
  };
}

function renderStatus(message, tone) {
  fields.settingsStatus.textContent = message;
  fields.settingsStatus.dataset.tone = tone;
}
