export const ORGANIZER_ROOT_TITLE = "Bookmark Organizer";

export const STORAGE_KEYS = {
  settings: "bookmarkOrganizer.settings",
  lastPlan: "bookmarkOrganizer.lastPlan",
  lastApply: "bookmarkOrganizer.lastApply",
};

export const DEFAULT_SETTINGS = {
  aiEnabled: true,
  provider: "openai-compatible",
  model: "",
  apiBaseUrl: "https://api.openai.com/v1",
  apiKey: "",
  sendTitlesOnly: true,
  remoteNamingOnly: false,
  lowConfidenceThreshold: 0.72,
  maxAiGroupCount: 300,
  customInstructions: "",
  models: [],
  activeModelId: "",
};

export const TRACKING_QUERY_KEYS = new Set([
  "fbclid",
  "gclid",
  "igshid",
  "mc_cid",
  "mc_eid",
  "ref",
  "spm",
  "utm_campaign",
  "utm_content",
  "utm_id",
  "utm_medium",
  "utm_name",
  "utm_source",
  "utm_term",
]);
