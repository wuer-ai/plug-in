import { DEFAULT_SETTINGS } from "./modules/constants.js";
import { testModelConnection } from "./modules/ai-providers.js";
import { getSettings, saveSettings } from "./modules/storage.js";

const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta";

const fields = {
  aiEnabled: document.querySelector("#aiEnabled"),
  modelList: document.querySelector("#modelList"),
  modelFormTitle: document.querySelector("#modelFormTitle"),
  modelLabel: document.querySelector("#modelLabel"),
  provider: document.querySelector("#provider"),
  model: document.querySelector("#model"),
  apiBaseUrl: document.querySelector("#apiBaseUrl"),
  apiKey: document.querySelector("#apiKey"),
  testModelButton: document.querySelector("#testModelButton"),
  saveModelButton: document.querySelector("#saveModelButton"),
  cancelEditButton: document.querySelector("#cancelEditButton"),
  modelTestStatus: document.querySelector("#modelTestStatus"),
  customInstructions: document.querySelector("#customInstructions"),
  sendTitlesOnly: document.querySelector("#sendTitlesOnly"),
  remoteNamingOnly: document.querySelector("#remoteNamingOnly"),
  lowConfidenceThreshold: document.querySelector("#lowConfidenceThreshold"),
  maxAiGroupCount: document.querySelector("#maxAiGroupCount"),
  saveButton: document.querySelector("#saveButton"),
  resetButton: document.querySelector("#resetButton"),
  settingsStatus: document.querySelector("#settingsStatus"),
};

let models = [];
let activeModelId = "";
let editingId = null;

bootstrap().catch((error) => {
  renderStatus(error.message, "error");
});

async function bootstrap() {
  bindEvents();
  const settings = await getSettings();
  // Settings saved before multi-model support only have the flat fields.
  if (!settings.models?.length && (settings.model || settings.apiKey)) {
    const legacy = createModelEntry({
      label: settings.model || "默认模型",
      provider: settings.provider,
      model: settings.model,
      apiBaseUrl: settings.apiBaseUrl,
      apiKey: settings.apiKey,
    });
    settings.models = [legacy];
    settings.activeModelId = legacy.id;
    await saveSettings(settings);
  }
  renderForm(settings);
}

function bindEvents() {
  fields.provider.addEventListener("change", () => {
    const defaults = [DEFAULT_SETTINGS.apiBaseUrl, GEMINI_URL];
    if (!fields.apiBaseUrl.value.trim() || defaults.includes(fields.apiBaseUrl.value.trim())) {
      fields.apiBaseUrl.value = fields.provider.value === "gemini" ? GEMINI_URL : DEFAULT_SETTINGS.apiBaseUrl;
    }
  });

  fields.testModelButton.addEventListener("click", async () => {
    let config;
    try {
      config = readModelForm();
    } catch (error) {
      renderModelTest(error.message, "error");
      return;
    }
    fields.testModelButton.disabled = true;
    renderModelTest("正在测试连接，最长等待 60 秒…", "info");
    try {
      const result = await testModelConnection(config);
      renderModelTest(result.message, result.ok ? "success" : "error");
    } finally {
      fields.testModelButton.disabled = false;
    }
  });

  fields.saveModelButton.addEventListener("click", async () => {
    try {
      const config = readModelForm();
      if (editingId) {
        models = models.map((item) => (item.id === editingId ? { ...item, ...config } : item));
      } else {
        const entry = createModelEntry(config);
        models = [...models, entry];
        activeModelId = activeModelId || entry.id;
      }
      await persistModels();
      resetModelForm();
      renderModelList();
      renderModelTest("模型已保存。", "success");
    } catch (error) {
      renderModelTest(error.message, "error");
    }
  });

  fields.cancelEditButton.addEventListener("click", () => {
    resetModelForm();
    renderModelTest("已取消编辑。", "info");
  });

  fields.modelList.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) {
      return;
    }
    const id = button.dataset.id;
    try {
      if (button.dataset.action === "activate") {
        activeModelId = id;
      } else if (button.dataset.action === "delete") {
        models = models.filter((item) => item.id !== id);
        if (activeModelId === id) {
          activeModelId = models[0]?.id || "";
        }
        if (editingId === id) {
          resetModelForm();
        }
      } else if (button.dataset.action === "edit") {
        startEdit(models.find((item) => item.id === id));
        return;
      }
      await persistModels();
      renderModelList();
    } catch (error) {
      renderStatus(error.message, "error");
    }
  });

  fields.saveButton.addEventListener("click", async () => {
    try {
      const form = readForm();
      const stored = await getSettings();
      await saveSettings({ ...stored, ...form, models, activeModelId });
      renderStatus("设置已保存。下次扫描会直接请求 AI 汇总生成整理建议。", "success");
    } catch (error) {
      renderStatus(error.message, "error");
    }
  });

  fields.resetButton.addEventListener("click", async () => {
    await saveSettings(DEFAULT_SETTINGS);
    renderForm(DEFAULT_SETTINGS);
    renderStatus("已恢复默认设置，模型列表已清空。", "success");
  });
}

function createModelEntry(config) {
  return { ...config, id: `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}` };
}

// Model list changes are saved immediately so they survive without pressing 保存设置.
async function persistModels() {
  const stored = await getSettings();
  await saveSettings({ ...stored, models, activeModelId });
}

function readModelForm() {
  const config = {
    label: fields.modelLabel.value.trim(),
    provider: fields.provider.value,
    model: fields.model.value.trim(),
    apiBaseUrl: fields.apiBaseUrl.value.trim(),
    apiKey: fields.apiKey.value.trim(),
  };
  if (!config.model) {
    throw new Error("请填写模型名。");
  }
  if (!config.apiKey) {
    throw new Error("请填写 API Key。");
  }
  config.label = config.label || config.model;
  return config;
}

function startEdit(entry) {
  if (!entry) {
    return;
  }
  editingId = entry.id;
  fields.modelFormTitle.textContent = "编辑模型";
  fields.saveModelButton.textContent = "保存修改";
  fields.cancelEditButton.hidden = false;
  fields.modelLabel.value = entry.label;
  fields.provider.value = entry.provider;
  fields.model.value = entry.model;
  fields.apiBaseUrl.value = entry.apiBaseUrl;
  fields.apiKey.value = entry.apiKey;
  renderModelTest("修改后可重新测试连接。", "info");
}

function resetModelForm() {
  editingId = null;
  fields.modelFormTitle.textContent = "添加模型";
  fields.saveModelButton.textContent = "添加模型";
  fields.cancelEditButton.hidden = true;
  fields.modelLabel.value = "";
  fields.provider.value = DEFAULT_SETTINGS.provider;
  fields.model.value = "";
  fields.apiBaseUrl.value = DEFAULT_SETTINGS.apiBaseUrl;
  fields.apiKey.value = "";
}

function renderModelList() {
  fields.modelList.replaceChildren();
  if (!models.length) {
    const empty = document.createElement("li");
    empty.className = "model-item";
    empty.textContent = "还没有模型，请在下方添加。";
    fields.modelList.append(empty);
    return;
  }
  for (const entry of models) {
    const isActive = entry.id === activeModelId;
    const item = document.createElement("li");
    item.className = "model-item";
    item.dataset.active = String(isActive);

    const info = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = entry.label;
    if (isActive) {
      const badge = document.createElement("span");
      badge.className = "model-badge";
      badge.textContent = "当前";
      title.append(badge);
    }
    const detail = document.createElement("small");
    detail.textContent = `${entry.provider} · ${entry.model} · ${entry.apiBaseUrl}`;
    info.append(title, detail);

    const actions = document.createElement("div");
    actions.className = "model-actions";
    const buttons = [["edit", "编辑"], ["delete", "删除"]];
    if (!isActive) {
      buttons.unshift(["activate", "设为当前"]);
    }
    for (const [action, text] of buttons) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "button button-subtle";
      button.dataset.action = action;
      button.dataset.id = entry.id;
      button.textContent = text;
      actions.append(button);
    }
    item.append(info, actions);
    fields.modelList.append(item);
  }
}

function renderForm(settings) {
  models = Array.isArray(settings.models) ? settings.models : [];
  activeModelId = settings.activeModelId || "";
  fields.aiEnabled.checked = Boolean(settings.aiEnabled);
  fields.customInstructions.value = settings.customInstructions || "";
  fields.sendTitlesOnly.checked = Boolean(settings.sendTitlesOnly);
  fields.remoteNamingOnly.checked = true;
  fields.lowConfidenceThreshold.value = String(settings.lowConfidenceThreshold);
  fields.maxAiGroupCount.value = String(settings.maxAiGroupCount);
  resetModelForm();
  renderModelList();
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
    customInstructions: fields.customInstructions.value.trim(),
    sendTitlesOnly: fields.sendTitlesOnly.checked,
    remoteNamingOnly: false,
    lowConfidenceThreshold: threshold,
    maxAiGroupCount,
  };
}

function renderModelTest(message, tone) {
  fields.modelTestStatus.textContent = message;
  fields.modelTestStatus.dataset.tone = tone;
}

function renderStatus(message, tone) {
  fields.settingsStatus.textContent = message;
  fields.settingsStatus.dataset.tone = tone;
}
