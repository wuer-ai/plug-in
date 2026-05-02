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
      renderStatus("设置已保存。下次扫描会直接请求 AI 汇总生成整理建议。", "success");
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
  fields.provider.value =
    settings.provider === "gemini" || settings.provider === "openai-compatible"
      ? settings.provider
      : DEFAULT_SETTINGS.provider;
  fields.model.value = settings.model;
  fields.apiBaseUrl.value = settings.apiBaseUrl;
  fields.apiKey.value = settings.apiKey;
  fields.sendTitlesOnly.checked = Boolean(settings.sendTitlesOnly);
  fields.remoteNamingOnly.checked = true;
  fields.lowConfidenceThreshold.value = String(settings.lowConfidenceThreshold);
  fields.maxAiGroupCount.value = String(settings.maxAiGroupCount);
}

function readForm() {
  const threshold = Number(fields.lowConfidenceThreshold.value);
  const maxAiGroupCount = Number(fields.maxAiGroupCount.value);

  if (!Number.isFinite(threshold) || threshold < 0.4 || threshold > 0.95) {
    throw new Error("低置信度阈值需要在 0.4 到 0.95 之间。");
  }

  if (!Number.isFinite(maxAiGroupCount) || maxAiGroupCount < 20 || maxAiGroupCount > 1000) {
    throw new Error("单次 AI 收藏数需要在 20 到 1000 之间。");
  }

  return {
    aiEnabled: fields.aiEnabled.checked,
    provider: fields.provider.value,
    model: fields.model.value.trim(),
    apiBaseUrl: fields.apiBaseUrl.value.trim(),
    apiKey: fields.apiKey.value.trim(),
    sendTitlesOnly: fields.sendTitlesOnly.checked,
    remoteNamingOnly: false,
    lowConfidenceThreshold: threshold,
    maxAiGroupCount,
  };
}

function renderStatus(message, tone) {
  fields.settingsStatus.textContent = message;
  fields.settingsStatus.dataset.tone = tone;
}
