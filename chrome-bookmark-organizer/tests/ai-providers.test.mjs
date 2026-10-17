import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../js/modules/ai-providers.js", import.meta.url), "utf8");
const { createPlanWithAi } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
const groups = JSON.stringify({ groups: [{ folderPath: ["开发文档"], bookmarkIds: ["1"], confidence: 0.9 }] });
const base = { suggestions: [], summary: { totalBookmarks: 1 } };
const bookmarks = [{ id: "1", title: "文档", domain: "example.com", url: "https://example.com", parentPath: "" }];
const settings = { aiEnabled: true, provider: "openai-compatible", apiBaseUrl: "https://sub2api.example/v1", apiKey: "test-secret", model: "gpt-6.1-sol", sendTitlesOnly: true };
const json = (data, status = 200) => new Response(JSON.stringify(data), { status });
const success = () => json({ output: [{ content: [{ type: "output_text", text: groups }] }] });
const sse = (events) => new Response(events.map((data) => `event: ${data.type}\ndata: ${JSON.stringify(data)}\n\n`).join(""));

async function scan(t, handler, overrides = {}) {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    const call = { url, options, body: JSON.parse(options.body) };
    calls.push(call);
    return handler(call, calls.length);
  });
  const plan = await createPlanWithAi(base, bookmarks, { ...settings, ...overrides });
  return { plan, calls };
}

for (const suffix of ["", "/", "/responses", "/chat/completions"]) {
  test(`normalizes base URL ${suffix || 'base'}`, async (t) => {
    const { plan, calls } = await scan(t, () => success(), { apiBaseUrl: `https://sub2api.example/v1${suffix}` });
    assert.equal(plan.ai.status, "applied");
    assert.equal(calls[0].url, "https://sub2api.example/v1/responses");
  });
}

test("adds v1 to a root URL", async (t) => {
  const { calls } = await scan(t, () => success(), { apiBaseUrl: "https://sub2api.example" });
  assert.equal(calls[0].url, "https://sub2api.example/v1/responses");
});

test("preserves a custom gateway prefix", async (t) => {
  const { calls } = await scan(t, () => success(), { apiBaseUrl: "https://sub2api.example/gateway/v1" });
  assert.equal(calls[0].url, "https://sub2api.example/gateway/v1/responses");
});

test("rejects query credentials before any network request", async (t) => {
  const { plan, calls } = await scan(t, () => success(), { apiBaseUrl: "https://sub2api.example/v1?key=test-secret" });
  assert.equal(plan.ai.status, "error");
  assert.equal(calls.length, 0);
  assert.equal(plan.ai.message.includes(settings.apiKey), false);
});

test("header timeouts abort and return a diagnostic without retrying", async (t) => {
  // Fire only the per-request header timer, without sleeping in the test.
  t.mock.method(globalThis, "setTimeout", (callback, delay) => {
    if (delay === 25000) queueMicrotask(callback);
    return 0;
  });
  const { plan, calls } = await scan(t, ({ options }) => new Promise((_resolve, reject) => {
    options.signal.addEventListener("abort", () => reject(new Error("Aborted")), { once: true });
  }));
  assert.equal(plan.ai.status, "error");
  assert.match(plan.ai.message, /超时/);
  assert.equal(calls.length, 1);
});

test("does not accept an incomplete JSON response", async (t) => {
  const { plan, calls } = await scan(t, () => json({ status: "incomplete", output_text: groups, incomplete_details: { reason: "max_output_tokens" } }));
  assert.equal(plan.ai.status, "error");
  assert.match(plan.ai.message, /max_output_tokens/);
  assert.equal(calls.length, 1);
});

test("uses a Codex-compatible Responses envelope without temperature", async (t) => {
  const { calls } = await scan(t, () => success());
  assert.equal(calls[0].body.model, "gpt-6.1-sol");
  assert.equal(calls[0].body.stream, true);
  assert.equal(calls[0].body.store, false);
  assert.equal(calls[0].body.input[0].content[0].type, "input_text");
  assert.equal("temperature" in calls[0].body, false);
});

test("parses SSE starting with event and does not duplicate terminal output", async (t) => {
  const { plan, calls } = await scan(t, () => sse([
    { type: "response.created", response: { output: [] } },
    { type: "response.output_text.delta", delta: groups.slice(0, 20) },
    { type: "response.output_text.delta", delta: groups.slice(20) },
    { type: "response.completed", response: { output: [{ content: [{ text: groups }] }] } },
  ]));
  assert.equal(plan.ai.status, "applied");
  assert.equal(plan.summary.moveCandidateCount, 1);
  assert.equal(calls.length, 1);
});

test("accepts terminal-only SSE", async (t) => {
  const { plan } = await scan(t, () => sse([{ type: "response.completed", response: { output_text: groups } }]));
  assert.equal(plan.ai.status, "applied");
});

test("removes rejected optional Responses parameters on one retry", async (t) => {
  const { plan, calls } = await scan(t, (_call, n) => n === 1
    ? json({ detail: "Unsupported parameter: max_output_tokens" }, 400) : success());
  assert.equal(plan.ai.status, "applied");
  assert.equal(calls.length, 2);
  assert.equal("max_output_tokens" in calls[1].body, false);
  assert.equal("text" in calls[1].body, false);
  assert.equal(calls[1].body.stream, true);
});

test("falls back to chat only when the Responses endpoint is incompatible", async (t) => {
  const { plan, calls } = await scan(t, (_call, n) => n === 1
    ? json({ error: "not found" }, 404) : json({ choices: [{ message: { content: groups } }] }));
  assert.equal(plan.ai.status, "applied");
  assert.equal(calls.length, 2);
  assert.equal(calls[1].url, "https://sub2api.example/v1/chat/completions");
});

test("retries chat without unsupported JSON/token options", async (t) => {
  const { plan, calls } = await scan(t, (_call, n) => {
    if (n === 1) return json({ error: "not found" }, 404);
    if (n === 2) return json({ error: { message: "Unsupported parameter: response_format" } }, 400);
    return json({ choices: [{ message: { content: groups } }] });
  });
  assert.equal(plan.ai.status, "applied");
  assert.equal(calls.length, 3);
  assert.equal("response_format" in calls[2].body, false);
  assert.equal("max_completion_tokens" in calls[2].body, false);
});

for (const status of [401, 403, 429, 500]) {
  test(`does not retry HTTP ${status} and preserves its diagnostic`, async (t) => {
    const { plan, calls } = await scan(t, () => json({ message: "access denied" }, status));
    assert.equal(plan.ai.status, "error");
    assert.equal(calls.length, 1);
    assert.match(plan.ai.message, new RegExp(String(status)));
  });
}

test("network errors have a useful diagnostic and are not retried", async (t) => {
  const { plan, calls } = await scan(t, () => { throw new TypeError("Failed to fetch"); });
  assert.equal(plan.ai.status, "error");
  assert.equal(calls.length, 1);
  assert.match(plan.ai.message, /无法连接 API/);
});

test("does not fallback or accept partial output after a stream error", async (t) => {
  const { plan, calls } = await scan(t, () => sse([
    { type: "response.output_text.delta", delta: groups },
    { type: "response.failed", response: { error: { message: "failure" } } },
  ]));
  assert.equal(plan.ai.status, "error");
  assert.equal(calls.length, 1);
});

test("redacts an echoed API key from HTTP errors", async (t) => {
  const { plan } = await scan(t, () => json({ message: `Invalid key ${settings.apiKey}` }, 401));
  assert.equal(plan.ai.message.includes(settings.apiKey), false);
});

test("Gemini uses the configured native gateway and a key header", async (t) => {
  const { plan, calls } = await scan(t, () => json({ candidates: [{ content: { parts: [{ text: groups }] } }] }), {
    provider: "gemini", apiBaseUrl: "https://gemini.example/v1beta", model: "models/gemini-test",
  });
  assert.equal(plan.ai.status, "applied");
  assert.equal(calls[0].url, "https://gemini.example/v1beta/models/gemini-test:generateContent");
  assert.equal(calls[0].options.headers["x-goog-api-key"], settings.apiKey);
});

test("disabled AI sends no API request", async (t) => {
  const { plan, calls } = await scan(t, () => { throw new Error("Unexpected call"); }, { aiEnabled: false });
  assert.equal(plan.ai.status, "required");
  assert.equal(calls.length, 0);
});

test("custom instructions are added to the prompt", async (t) => {
  const { calls } = await scan(t, () => success(), { customInstructions: "工作相关放在“工作”目录" });
  assert.match(calls[0].body.input[0].content[0].text, /工作相关放在“工作”目录/);
});

test("testModelConnection reports success and failure", async (t) => {
  const { testModelConnection } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
  t.mock.method(globalThis, "fetch", async () => success());
  assert.equal((await testModelConnection(settings)).ok, true);
  t.mock.method(globalThis, "fetch", async () => json({ error: "bad key test-secret" }, 401));
  const failed = await testModelConnection(settings);
  assert.equal(failed.ok, false);
  assert.ok(!failed.message.includes("test-secret"));
});
