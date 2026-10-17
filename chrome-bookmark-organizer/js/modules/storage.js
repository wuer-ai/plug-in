import { DEFAULT_SETTINGS, STORAGE_KEYS } from "./constants.js";

export async function ensureSettings() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.settings);
  const settings = {
    ...DEFAULT_SETTINGS,
    ...(result[STORAGE_KEYS.settings] || {}),
  };

  if (!result[STORAGE_KEYS.settings]) {
    await chrome.storage.local.set({
      [STORAGE_KEYS.settings]: settings,
    });
  }

  return settings;
}

export async function getSettings() {
  return ensureSettings();
}

export async function saveSettings(settings) {
  const merged = {
    ...DEFAULT_SETTINGS,
    ...settings,
  };
  // The active model is mirrored into the flat fields the scan pipeline reads.
  const active = (merged.models || []).find((model) => model.id === merged.activeModelId);
  const normalized = active
    ? {
        ...merged,
        provider: active.provider,
        model: active.model,
        apiBaseUrl: active.apiBaseUrl,
        apiKey: active.apiKey,
      }
    : merged;

  await chrome.storage.local.set({
    [STORAGE_KEYS.settings]: normalized,
  });

  return normalized;
}

export async function getLastPlan() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.lastPlan);
  return result[STORAGE_KEYS.lastPlan] || null;
}

export async function saveLastPlan(plan) {
  await chrome.storage.local.set({
    [STORAGE_KEYS.lastPlan]: plan,
  });
}

export async function getLastApply() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.lastApply);
  return result[STORAGE_KEYS.lastApply] || null;
}

export async function saveLastApply(snapshot) {
  await chrome.storage.local.set({
    [STORAGE_KEYS.lastApply]: snapshot,
  });
}

export async function clearLastApply() {
  await chrome.storage.local.remove(STORAGE_KEYS.lastApply);
}
