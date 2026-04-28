function extractJsonBlock(text) {
  const trimmed = text.trim();

  if (trimmed.startsWith("[")) {
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

  throw new Error("AI response does not contain valid JSON.");
}

export async function refinePlanWithAi(plan, settings) {
  if (!settings.aiEnabled) {
    return {
      ...plan,
      ai: {
        provider: "local",
        status: "disabled",
        message: "Remote AI disabled",
      },
    };
  }

  if (settings.provider === "local") {
    return {
      ...plan,
      ai: {
        provider: "local",
        status: "local-only",
        message: "Using local rules only",
      },
    };
  }

  const maxAiGroupCount = Math.max(1, Number(settings.maxAiGroupCount || 5));
  const lowConfidenceThreshold = Number(settings.lowConfidenceThreshold || 0.72);
  const candidateGroups = (plan.suggestions || [])
    .filter((group) => !settings.remoteNamingOnly || group.confidence < lowConfidenceThreshold)
    .slice(0, maxAiGroupCount);

  if (!candidateGroups.length) {
    return {
      ...plan,
      ai: {
        provider: settings.provider,
        status: "skipped",
        message: "No low-confidence groups to refine",
      },
    };
  }

  try {
    const provider = createProvider(settings);
    const suggestions = await provider.suggestFolderNames(candidateGroups, settings);

    if (!suggestions.length) {
      return {
        ...plan,
        ai: {
          provider: settings.provider,
          status: "empty",
          message: "AI returned no refinement",
        },
      };
    }

    const suggestionMap = new Map(suggestions.map((item) => [item.id, item]));
    const refinedPlan = {
      ...plan,
      suggestions: plan.suggestions.map((group) => {
        const refinement = suggestionMap.get(group.id);

        if (!refinement?.folderName) {
          return group;
        }

        const nextFolderPath = [...group.folderPath];
        nextFolderPath[nextFolderPath.length - 1] = sanitizeFolderName(refinement.folderName);

        return {
          ...group,
          folderPath: nextFolderPath,
          confidence: Math.max(group.confidence, Number(refinement.confidence || group.confidence)),
          reason: `${group.reason} · AI 命名优化`,
        };
      }),
      ai: {
        provider: settings.provider,
        status: "applied",
        message: `AI refined ${suggestions.length} groups`,
      },
    };

    return refinedPlan;
  } catch (error) {
    return {
      ...plan,
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
    async suggestFolderNames(groups, settings) {
      if (!settings.apiKey) {
        throw new Error("Gemini API Key is required.");
      }

      if (!settings.model) {
        throw new Error("Please configure a Gemini model name first.");
      }

      const prompt = buildNamingPrompt(groups, settings);
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

      return parseNamingResponse(text);
    },
  };
}

function createOpenAiCompatibleProvider() {
  return {
    async suggestFolderNames(groups, settings) {
      if (!settings.apiKey) {
        throw new Error("OpenAI-compatible API Key is required.");
      }

      if (!settings.model) {
        throw new Error("Please configure the model name first.");
      }

      const apiBaseUrl = settings.apiBaseUrl?.trim() || "https://api.openai.com/v1";
      const response = await fetch(`${apiBaseUrl.replace(/\/+$/, "")}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${settings.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: settings.model,
          temperature: 0.2,
          messages: [
            {
              role: "system",
              content:
                "You help organize browser bookmarks. Respond with a strict JSON array only.",
            },
            {
              role: "user",
              content: buildNamingPrompt(groups, settings),
            },
          ],
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenAI-compatible request failed: ${response.status}`);
      }

      const data = await response.json();
      const text = data?.choices?.[0]?.message?.content || "";
      return parseNamingResponse(text);
    },
  };
}

function buildNamingPrompt(groups, settings) {
  const payload = groups.map((group) => ({
    id: group.id,
    currentFolderName: group.folderPath[group.folderPath.length - 1],
    samples: group.bookmarks.map((bookmark) =>
      settings.sendTitlesOnly
        ? {
            title: bookmark.title,
            domain: bookmark.domain,
          }
        : {
            title: bookmark.title,
            domain: bookmark.domain,
            url: bookmark.url,
          },
    ),
  }));

  return [
    "You are organizing browser bookmarks for a Chinese-speaking user.",
    "Return a JSON array only.",
    'Each item must be: {"id":"...", "folderName":"...", "confidence":0.0}',
    "Folder names should be concise, practical, and written in Simplified Chinese.",
    "Do not add explanations outside JSON.",
    JSON.stringify(payload, null, 2),
  ].join("\n");
}

function parseNamingResponse(text) {
  const jsonText = extractJsonBlock(text);
  const parsed = JSON.parse(jsonText);

  if (!Array.isArray(parsed)) {
    throw new Error("AI response must be a JSON array.");
  }

  return parsed
    .filter((item) => item && typeof item.id === "string" && typeof item.folderName === "string")
    .map((item) => ({
      id: item.id,
      folderName: item.folderName,
      confidence: clampConfidence(Number(item.confidence || 0.7)),
    }));
}

function sanitizeFolderName(name) {
  return String(name).replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim() || "智能整理";
}

function clampConfidence(value) {
  if (!Number.isFinite(value)) {
    return 0.7;
  }

  return Math.max(0.5, Math.min(0.98, value));
}
