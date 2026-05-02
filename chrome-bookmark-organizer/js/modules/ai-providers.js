const MAX_TOP_LEVEL_CATEGORIES = 8;
const LARGE_GROUP_THRESHOLD = 18;

function extractJsonBlock(text) {
  const trimmed = text.trim();

  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    return trimmed;
  }

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);

  if (fencedMatch) {
    return fencedMatch[1].trim();
  }

  const arrayStart = trimmed.indexOf("[");
  const arrayEnd = trimmed.lastIndexOf("]");

  if (arrayStart >= 0 && arrayEnd > arrayStart) {
    return trimmed.slice(arrayStart, arrayEnd + 1);
  }

  const objectStart = trimmed.indexOf("{");
  const objectEnd = trimmed.lastIndexOf("}");

  if (objectStart >= 0 && objectEnd > objectStart) {
    return trimmed.slice(objectStart, objectEnd + 1);
  }

  throw new Error(
    `AI response does not contain valid JSON. Preview: ${formatDebugPreview(trimmed)}`,
  );
}

export async function createPlanWithAi(basePlan, bookmarks, settings) {
  if (!settings.aiEnabled || settings.provider === "local") {
    return {
      ...basePlan,
      ai: {
        provider: settings.provider || "local",
        status: "required",
        message: "请先在设置中启用 Gemini 或 OpenAI-compatible，扫描才会生成可应用的整理建议。",
      },
    };
  }

  try {
    const provider = createProvider(settings);
    const maxBookmarkCount = Math.min(
      1000,
      Math.max(20, Number(settings.maxAiGroupCount || 300)),
    );
    const candidateBookmarks = bookmarks.slice(0, maxBookmarkCount);
    const cleanupSuggestions = (basePlan.suggestions || []).filter(
      (suggestion) => suggestion.type === "cleanup-empty-folders",
    );
    const groups = await provider.organizeBookmarks(candidateBookmarks, settings);
    const moveSuggestions = buildMoveSuggestionsFromAi(
      groups,
      candidateBookmarks,
    );
    const suggestions = [...moveSuggestions, ...cleanupSuggestions];
    const moveCandidateCount = moveSuggestions.reduce(
      (sum, group) => sum + group.bookmarkCount,
      0,
    );

    return {
      ...basePlan,
      suggestions,
      summary: {
        ...basePlan.summary,
        suggestedGroupCount: suggestions.length,
        moveCandidateCount,
        ungroupedCount: Math.max(0, (basePlan.summary?.totalBookmarks || 0) - moveCandidateCount),
      },
      ai: {
        provider: settings.provider,
        status: "applied",
        message: `AI 汇总 ${moveSuggestions.length} 个分组，覆盖 ${moveCandidateCount} 条收藏。`,
      },
    };
  } catch (error) {
    return {
      ...basePlan,
      ai: {
        provider: settings.provider,
        status: "error",
        message: error instanceof Error ? error.message : "Unknown AI error",
      },
    };
  }
}

function createProvider(settings) {
  switch (settings.provider) {
    case "gemini":
      return createGeminiProvider();
    case "openai-compatible":
      return createOpenAiCompatibleProvider();
    default:
      throw new Error("Unsupported AI provider.");
  }
}

function createGeminiProvider() {
  return {
    async organizeBookmarks(bookmarks, settings) {
      if (!settings.apiKey) {
        throw new Error("Gemini API Key is required.");
      }

      if (!settings.model) {
        throw new Error("Please configure a Gemini model name first.");
      }

      const prompt = buildOrganizerPrompt(bookmarks, settings);
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        settings.model,
      )}:generateContent?key=${encodeURIComponent(settings.apiKey)}`;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: prompt,
                },
              ],
            },
          ],
        }),
      });

      if (!response.ok) {
        throw new Error(`Gemini request failed: ${response.status}`);
      }

      const data = await response.json();
      const text =
        data?.candidates?.[0]?.content?.parts
          ?.map((part) => part.text || "")
          .join("\n") || "";

      return parseOrganizerResponse(text);
    },
  };
}

function createOpenAiCompatibleProvider() {
  return {
    async organizeBookmarks(bookmarks, settings) {
      if (!settings.apiKey) {
        throw new Error("OpenAI-compatible API Key is required.");
      }

      if (!settings.model) {
        throw new Error("Please configure the model name first.");
      }

      const apiBaseUrl = settings.apiBaseUrl?.trim() || "https://api.openai.com/v1";
      const prompt = buildOrganizerPrompt(bookmarks, settings);
      const instructions =
        'You organize browser bookmarks for a Chinese-speaking user. Return a strict JSON object only: {"groups":[...]}.';
      const responsesResult = await requestOpenAiResponses({
        apiBaseUrl,
        settings,
        prompt,
        instructions,
      });

      if (responsesResult.ok) {
        return parseOrganizerResponse(responsesResult.text);
      }

      const response = await fetch(`${apiBaseUrl.replace(/\/+$/, "")}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${settings.apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          model: settings.model,
          temperature: 0.1,
          stream: false,
          max_completion_tokens: 4096,
          response_format: {
            type: "json_object",
          },
          messages: [
            {
              role: "system",
              content: instructions,
            },
            {
              role: "user",
              content: prompt,
            },
          ],
        }),
      });

      const responseText = await response.text();

      if (!response.ok) {
        throw new Error(
          `OpenAI-compatible request failed: ${response.status} ${responseText.slice(0, 200)}`,
        );
      }

      const text = extractOpenAiCompatibleContent(responseText);
      return parseOrganizerResponse(text);
    },
  };
}

async function requestOpenAiResponses({ apiBaseUrl, settings, prompt, instructions }) {
  const requestBody = {
    model: settings.model,
    input: prompt,
    instructions,
    temperature: 0.1,
    max_output_tokens: 4096,
    stream: false,
    text: {
      format: {
        type: "json_object",
      },
    },
  };
  const firstAttempt = await fetchOpenAiResponses(apiBaseUrl, settings.apiKey, requestBody);

  if (firstAttempt.ok) {
    return firstAttempt;
  }

  const fallbackBody = { ...requestBody };
  delete fallbackBody.text;
  const fallbackAttempt = await fetchOpenAiResponses(apiBaseUrl, settings.apiKey, fallbackBody);

  if (fallbackAttempt.ok) {
    return fallbackAttempt;
  }

  return {
    ok: false,
    text: "",
    error: `${firstAttempt.error}; ${fallbackAttempt.error}`,
  };
}

async function fetchOpenAiResponses(apiBaseUrl, apiKey, body) {
  const response = await fetch(`${apiBaseUrl.replace(/\/+$/, "")}/responses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  const responseText = await response.text();

  if (!response.ok) {
    return {
      ok: false,
      text: "",
      error: `Responses API failed: ${response.status} ${formatDebugPreview(responseText)}`,
    };
  }

  try {
    return {
      ok: true,
      text: extractOpenAiResponsesContent(responseText),
      error: "",
    };
  } catch (error) {
    return {
      ok: false,
      text: "",
      error: error instanceof Error ? error.message : "Failed to parse Responses API result",
    };
  }
}

function extractOpenAiCompatibleContent(responseText) {
  const trimmed = responseText.trim();

  if (!trimmed.startsWith("data:")) {
    const data = JSON.parse(trimmed);
    const content =
      data?.choices?.[0]?.message?.content ||
      data?.choices?.[0]?.text ||
      data?.output_text ||
      "";

    if (content) {
      return content;
    }

    throw new Error(
      `OpenAI-compatible response did not contain message content. Preview: ${formatDebugPreview(trimmed)}`,
    );
  }

  return parseOpenAiSseContent(trimmed);
}

function extractOpenAiResponsesContent(responseText) {
  const trimmed = responseText.trim();

  if (trimmed.startsWith("data:")) {
    return parseOpenAiSseContent(trimmed);
  }

  const data = JSON.parse(trimmed);
  const outputText =
    data?.output_text ||
    (data?.output || [])
      .flatMap((item) => item?.content || [])
      .map((content) => content?.text || "")
      .join("");

  if (outputText) {
    return outputText;
  }

  throw new Error(
    `Responses API result did not contain output text. Preview: ${formatDebugPreview(trimmed)}`,
  );
}

function parseOpenAiSseContent(text) {
  const chunks = [];
  const eventTypes = new Set();
  let sawEmptyChoices = false;
  let sawUsageOnlyChunk = false;

  for (const line of text.split(/\r?\n/)) {
    const trimmedLine = line.trim();

    if (trimmedLine.startsWith("event:")) {
      eventTypes.add(trimmedLine.replace(/^event:\s*/, ""));
      continue;
    }

    if (!trimmedLine.startsWith("data:")) {
      continue;
    }

    const payload = trimmedLine.replace(/^data:\s*/, "");

    if (!payload || payload === "[DONE]") {
      continue;
    }

    const data = JSON.parse(payload);
    const choices = data?.choices;
    const responseDelta = data?.delta;
    const outputTextDelta = data?.type === "response.output_text.delta" ? data.delta : "";
    const responseOutputText = data?.output_text;
    const deltaContent = data?.choices?.[0]?.delta?.content;
    const messageContent = data?.choices?.[0]?.message?.content;
    const textContent = data?.choices?.[0]?.text;

    if (Array.isArray(choices) && choices.length === 0) {
      sawEmptyChoices = true;
    }

    if (data?.usage && (!choices || choices.length === 0)) {
      sawUsageOnlyChunk = true;
    }

    if (deltaContent) {
      chunks.push(deltaContent);
    } else if (messageContent) {
      chunks.push(messageContent);
    } else if (textContent) {
      chunks.push(textContent);
    } else if (outputTextDelta) {
      chunks.push(outputTextDelta);
    } else if (typeof responseDelta === "string") {
      chunks.push(responseDelta);
    } else if (responseOutputText) {
      chunks.push(responseOutputText);
    }
  }

  const content = chunks.join("");

  if (!content.trim()) {
    const diagnostic = [
      sawEmptyChoices ? "stream chunks contained choices: []" : "",
      sawUsageOnlyChunk ? "stream contained usage-only chunks" : "",
      eventTypes.size ? `events: ${[...eventTypes].join(", ")}` : "",
    ]
      .filter(Boolean)
      .join("; ");

    throw new Error(
      `OpenAI-compatible stream did not contain text content${diagnostic ? ` (${diagnostic})` : ""}. 请检查 API Base URL 是否真的是 Chat Completions 兼容端点、模型名是否支持该端点，以及网关是否强制流式但未返回 delta.content。Preview: ${formatDebugPreview(text)}`,
    );
  }

  return content;
}

function buildOrganizerPrompt(bookmarks, settings) {
  const payload = bookmarks.map((bookmark) =>
    settings.sendTitlesOnly
      ? {
          id: bookmark.id,
          title: bookmark.title,
          domain: bookmark.domain,
          currentFolder: bookmark.parentPath || "根目录",
        }
      : {
          id: bookmark.id,
          title: bookmark.title,
          domain: bookmark.domain,
          url: bookmark.url,
          currentFolder: bookmark.parentPath || "根目录",
        },
  );

  return [
    "你是一个浏览器收藏夹整理助手，需要直接产出可执行的收藏移动方案。",
    "请通读全部收藏，不要按固定关键词或单一域名机械分类；要根据标题、域名、URL、原文件夹综合理解用途。",
    `一级分类总数必须控制在 ${MAX_TOP_LEVEL_CATEGORIES} 个以内；二级分类数量不做限制，folderPath 最多 2 层，不要额外包一层 Bookmark Organizer 或 收藏夹整理。`,
    "不要把一级分类上限误解成分组总数上限；可以输出很多个二级分组，只要它们归属于不超过 8 个一级目录。",
    "目录深度规则：如果一个分组本身很小且同一一级目录下只有 1 个二级主题，就直接使用一级目录，不要创建无意义二级目录。",
    `大组例外：如果某个一级主题下会包含超过 ${LARGE_GROUP_THRESHOLD} 条收藏，不能压成一个一级大桶，必须拆成 2 到 5 个更具体的分组；可以使用二级目录表达用途差异。`,
    "例如不要把 40 条内容都放进“Agent 开发”；应拆成“Agent 开发 / 框架资料”“Agent 开发 / 平台接口”“Agent 开发 / 示例项目”“Agent 开发 / 部署运维”等具体组。",
    "目标是把值得归档的收藏移动到少量、清晰、实用的中文文件夹中；不要制造比原来更多的分类。",
    "允许创建二级路径，例如 [\"模型开发\", \"API 文档\"]，但总层级最多 2 层。",
    "不要使用“生活资源”“综合资源”“常用资源”“其他资源”这类大而泛的兜底分类，除非组内收藏确实都是同一生活场景。",
    "语义不相干的内容不能放进同一组：下载工具、音乐娱乐、政务办事、购物、旅行、医疗健康、金融投资、设计素材、开发文档必须按用途分开或跳过低价值项。",
    "例如“下载音乐”和“政务办事”不能同放在“生活资源”；如果都值得归档，应分别命名为“音乐娱乐”“政务办事”或更具体的用途。",
    "不要使用笼统的 AI 分类名，例如“AI 与大模型”“AI 与自动化”“人工智能”“AI 工具”。",
    "遇到 AI 相关收藏时，必须按具体用途命名，例如“模型开发 / API 文档”“Agent 开发 / 框架资料”“Agent 开发 / 平台接口”“Prompt 工程 / 案例模板”“AI 绘图 / 生成工具”“AI 产品 / 聊天助手”“RAG 知识库 / 检索资料”。",
    `每个分组理想大小是 3 到 ${LARGE_GROUP_THRESHOLD} 条；超过 ${LARGE_GROUP_THRESHOLD} 条时必须继续按用途细分，除非整组确实是同一个产品或同一个连续资料集。`,
    "尽可能覆盖所有输入收藏：每个 bookmark id 最多出现一次，但除重复项、明显失效页面、纯登录页、一次性支付页外，都应该被放进某个分组。",
    "不要因为不确定就省略收藏；如果少量收藏确实无法判断用途，可以放入“待进一步整理”，但这个分组只能作为最后兜底。",
    "最终 bookmarkIds 覆盖数量应尽量接近输入数量，不能只处理看起来最容易分类的一部分。",
    "文件夹名称必须是简体中文，短而具体，不要包含斜杠、冒号、引号等非法字符。",
    "只返回 JSON 对象，不要解释、不要 Markdown。",
    "JSON 顶层必须是对象，格式必须为：",
    '{"groups":[{"folderPath":["一级文件夹","可选二级文件夹"],"reason":"为什么这些收藏应归为一组","confidence":0.0,"bookmarkIds":["id1","id2"]}]}',
    `bookmarkIds 只能使用输入里存在的 id。不要输出空分组。一级目录数量不能超过 ${MAX_TOP_LEVEL_CATEGORIES}，groups 数组长度不限。`,
    JSON.stringify(payload, null, 2),
  ].join("\n");
}

function parseOrganizerResponse(text) {
  const jsonText = extractJsonBlock(text);
  let parsed;

  try {
    parsed = JSON.parse(jsonText);
  } catch (error) {
    throw new Error(
      `AI returned malformed JSON. ${error instanceof Error ? error.message : ""} Preview: ${formatDebugPreview(jsonText)}`,
    );
  }

  const groups = Array.isArray(parsed) ? parsed : parsed.groups;

  if (!Array.isArray(groups)) {
    throw new Error("AI response must be a JSON array or an object with groups.");
  }

  return enforceTopLevelLimit(refineOversizedGroups(flattenSingleChildFolders(groups
    .filter((item) => item && Array.isArray(item.bookmarkIds))
    .map((item) => ({
      folderPath: normalizeFolderPath(item.folderPath || item.folderName || item.name),
      reason: String(item.reason || "AI 综合判断").trim() || "AI 综合判断",
      confidence: clampConfidence(Number(item.confidence || 0.75)),
      bookmarkIds: item.bookmarkIds.map((id) => String(id)),
    }))
    .filter((item) => item.folderPath.length && item.bookmarkIds.length))));
}

function enforceTopLevelLimit(groups) {
  const topLevelCount = new Set(groups.map((group) => group.folderPath[0])).size;
  const allowedTopLevels = [];
  const allowedSet = new Set();

  groups.forEach((group) => {
    const topLevel = group.folderPath[0];

    if (allowedSet.has(topLevel)) {
      return;
    }

    if (allowedTopLevels.length < MAX_TOP_LEVEL_CATEGORIES) {
      allowedTopLevels.push(topLevel);
      allowedSet.add(topLevel);
    }
  });

  if (topLevelCount <= MAX_TOP_LEVEL_CATEGORIES) {
    return groups;
  }

  return groups.map((group) => {
    if (allowedSet.has(group.folderPath[0])) {
      return group;
    }

    const fallbackTopLevel = allowedTopLevels[allowedTopLevels.length - 1] || "待进一步整理";

    return {
      ...group,
      folderPath: [fallbackTopLevel, group.folderPath.join(" - ")],
      reason: `${group.reason}；为控制一级目录数量，归并到 ${fallbackTopLevel}`,
      confidence: Math.min(group.confidence, 0.65),
    };
  });
}

function flattenSingleChildFolders(groups) {
  const childCounts = new Map();

  groups.forEach((group) => {
    if (group.folderPath.length < 2) {
      return;
    }

    const parent = group.folderPath[0];
    childCounts.set(parent, (childCounts.get(parent) || 0) + 1);
  });

  return groups.map((group) => {
    if (
      group.folderPath.length < 2 ||
      childCounts.get(group.folderPath[0]) !== 1 ||
      group.bookmarkIds.length > LARGE_GROUP_THRESHOLD
    ) {
      return group;
    }

    return {
      ...group,
      folderPath: [group.folderPath[0]],
    };
  });
}

function refineOversizedGroups(groups) {
  return groups.map((group) => {
    if (group.bookmarkIds.length <= LARGE_GROUP_THRESHOLD || group.folderPath.length > 1) {
      return group;
    }

    if (!isBroadBucketName(group.folderPath[0])) {
      return group;
    }

    return {
      ...group,
      folderPath: [group.folderPath[0], "待人工细分"],
      reason: `${group.reason}；该分组条目较多，保留二级目录提醒继续细分`,
      confidence: Math.min(group.confidence, 0.6),
    };
  });
}

function isBroadBucketName(name) {
  return /^(AI|人工智能|Agent|代理|模型|开发|技术|工具|资源|资料|生活|综合|其他|常用)/i.test(
    String(name || "").trim(),
  );
}

function formatDebugPreview(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .slice(0, 300);
}

function buildMoveSuggestionsFromAi(groups, bookmarks) {
  const bookmarkMap = new Map(bookmarks.map((bookmark) => [bookmark.id, bookmark]));
  const usedIds = new Set();

  const candidateSuggestions = groups
    .map((group, index) => {
      const groupBookmarks = [];

      for (const id of group.bookmarkIds) {
        if (usedIds.has(id) || !bookmarkMap.has(id)) {
          continue;
        }

        usedIds.add(id);
        groupBookmarks.push(bookmarkMap.get(id));
      }

      if (!groupBookmarks.length) {
        return null;
      }

      return {
        id: `ai-${index + 1}-${group.folderPath.join("-")}`,
        type: "move",
        folderPath: group.folderPath,
        reason: group.reason,
        confidence: group.confidence,
        groupType: "ai",
        matchedTerms: [],
        mediums: [],
        topDomains: getTopDomains(groupBookmarks),
        bookmarkIds: groupBookmarks.map((bookmark) => bookmark.id),
        bookmarkCount: groupBookmarks.length,
        bookmarks: groupBookmarks.slice(0, 6).map((bookmark) => ({
          id: bookmark.id,
          title: bookmark.title,
          url: bookmark.url,
          domain: bookmark.domain,
          parentPath: bookmark.parentPath,
          matchReason: group.reason,
          classification: null,
          confidence: group.confidence,
        })),
      };
    })
    .filter(Boolean);
  const suggestions = candidateSuggestions;

  const assignedIds = new Set(
    suggestions.flatMap((suggestion) => suggestion.bookmarkIds || []),
  );
  let remainingBookmarks = bookmarks.filter((bookmark) => !assignedIds.has(bookmark.id));

  if (!remainingBookmarks.length) {
    return suggestions;
  }

  const topLevels = [...new Set(suggestions.map((suggestion) => suggestion.folderPath[0]))];
  const fallbackPath =
    topLevels.length >= MAX_TOP_LEVEL_CATEGORIES
      ? [topLevels[topLevels.length - 1], "待进一步整理"]
      : ["待进一步整理"];

  suggestions.push(
    buildFallbackSuggestion(remainingBookmarks, suggestions.length + 1, fallbackPath),
  );

  return suggestions;
}

function buildFallbackSuggestion(bookmarks, index, folderPath = ["待进一步整理"]) {
  const confidence = 0.52;

  return {
    id: `ai-${index}-${folderPath.join("-")}`,
    type: "move",
    folderPath,
    reason: "AI 未给出明确分类，先集中归档避免遗漏",
    confidence,
    groupType: "ai",
    matchedTerms: [],
    mediums: [],
    topDomains: getTopDomains(bookmarks),
    bookmarkIds: bookmarks.map((bookmark) => bookmark.id),
    bookmarkCount: bookmarks.length,
    bookmarks: bookmarks.slice(0, 6).map((bookmark) => ({
      id: bookmark.id,
      title: bookmark.title,
      url: bookmark.url,
      domain: bookmark.domain,
      parentPath: bookmark.parentPath,
      matchReason: "AI 未给出明确分类，先集中归档避免遗漏",
      classification: null,
      confidence,
    })),
  };
}

function normalizeFolderPath(value) {
  const rawPath = Array.isArray(value) ? value : [value];

  return rawPath
    .map((name) => sanitizeFolderName(name))
    .filter(Boolean)
    .slice(0, 2);
}

function sanitizeFolderName(name) {
  return String(name || "")
    .replace(/[\\/:*?"<>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function clampConfidence(value) {
  if (!Number.isFinite(value)) {
    return 0.75;
  }

  return Math.max(0.5, Math.min(0.98, value));
}

function getTopDomains(bookmarks) {
  const domainCounts = new Map();

  bookmarks.forEach((bookmark) => {
    if (!bookmark.domain) {
      return;
    }

    domainCounts.set(bookmark.domain, (domainCounts.get(bookmark.domain) || 0) + 1);
  });

  return Array.from(domainCounts.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, 4)
    .map(([domain, count]) => ({
      domain,
      count,
    }));
}
