import { applyBookmarkPlan, undoLastApply } from "./js/modules/bookmark-actions.js";
import { refinePlanWithAi } from "./js/modules/ai-providers.js";
import { analyzeBookmarks } from "./js/modules/bookmark-analysis.js";
import {
  ensureSettings,
  getLastApply,
  getLastPlan,
  getSettings,
  saveLastPlan,
} from "./js/modules/storage.js";

chrome.runtime.onInstalled.addListener(async () => {
  await ensureSettings();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  void handleMessage(message)
    .then((result) => sendResponse({ ok: true, ...result }))
    .catch((error) =>
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
    );

  return true;
});

async function handleMessage(message) {
  await ensureSettings();

  switch (message?.type) {
    case "getExtensionState":
      return {
        plan: await getLastPlan(),
        lastApply: await getLastApply(),
        settings: await getSettings(),
      };
    case "scanBookmarks":
      return runBookmarkScan();
    case "applyPlan":
      return applySavedPlan();
    case "undoLastApply":
      return {
        result: await undoLastApply(),
      };
    default:
      throw new Error("Unsupported message type.");
  }
}

async function runBookmarkScan() {
  const tree = await chrome.bookmarks.getTree();
  const settings = await getSettings();
  const analyzedPlan = analyzeBookmarks(tree);
  const refinedPlan = await refinePlanWithAi(analyzedPlan, settings);

  await saveLastPlan(refinedPlan);

  return {
    plan: refinedPlan,
  };
}

async function applySavedPlan() {
  const plan = await getLastPlan();

  if (!plan) {
    throw new Error("No scan result found. Please scan bookmarks first.");
  }

  const result = await applyBookmarkPlan(plan);

  return {
    result,
  };
}
