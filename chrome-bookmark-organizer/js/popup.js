const elements = {
  scanButton: document.querySelector("#scanButton"),
  applyButton: document.querySelector("#applyButton"),
  undoButton: document.querySelector("#undoButton"),
  optionsButton: document.querySelector("#optionsButton"),
  summaryGrid: document.querySelector("#summaryGrid"),
  duplicatesList: document.querySelector("#duplicatesList"),
  suggestionsList: document.querySelector("#suggestionsList"),
  scanTime: document.querySelector("#scanTime"),
  statusMessage: document.querySelector("#statusMessage"),
  providerStatus: document.querySelector("#providerStatus"),
};

let currentPlan = null;

bootstrap().catch((error) => {
  renderStatus(error.message, "error");
});

async function bootstrap() {
  bindEvents();
  await refreshState();
}

function bindEvents() {
  elements.scanButton.addEventListener("click", async () => {
    await runAction("正在扫描收藏夹...", async () => {
      const response = await chrome.runtime.sendMessage({ type: "scanBookmarks" });

      if (!response.ok) {
        throw new Error(response.error);
      }

      renderPlan(response.plan);
      renderStatus(
        response.plan?.ai?.message || "扫描完成，已由 AI 生成整理建议。",
        response.plan?.ai?.status === "applied" ? "success" : "error",
      );
    });
  });

  elements.applyButton.addEventListener("click", async () => {
    await runAction("正在应用整理建议...", async () => {
      const response = await chrome.runtime.sendMessage({ type: "applyPlan" });

      if (!response.ok) {
        throw new Error(response.error);
      }

      const movedCount = response.result?.movedCount ?? 0;
      const groupCount = response.result?.appliedGroupCount ?? 0;
      const removedSourceFolderCount = response.result?.removedSourceFolderCount ?? 0;

      renderStatus(
        `已应用 ${groupCount} 个分组建议，移动 ${movedCount} 条收藏，清理 ${removedSourceFolderCount} 个空目录。建议再扫描一次查看最新状态。`,
        "success",
      );

      await refreshState();
    });
  });

  elements.undoButton.addEventListener("click", async () => {
    await runAction("正在撤销上次整理...", async () => {
      const response = await chrome.runtime.sendMessage({ type: "undoLastApply" });

      if (!response.ok) {
        throw new Error(response.error);
      }

      const undoneCount = response.result?.undoneCount ?? 0;
      const failedCount = response.result?.failedCount ?? 0;
      const failedText = failedCount ? `，${failedCount} 条未能恢复，请在书签管理器中手动检查` : "";
      renderStatus(`已撤销上次整理，本次恢复 ${undoneCount} 条收藏${failedText}。`, failedCount ? "error" : "success");
      await refreshState();
    });
  });

  elements.optionsButton.addEventListener("click", async () => {
    await chrome.runtime.openOptionsPage();
  });
}

async function refreshState() {
  const response = await chrome.runtime.sendMessage({ type: "getExtensionState" });

  if (!response.ok) {
    throw new Error(response.error);
  }

  renderPlan(response.plan);
  renderProviderStatus(response.settings, response.plan);
}

async function runAction(message, action) {
  setBusy(true);
  renderStatus(message, "info");

  try {
    await action();
  } catch (error) {
    renderStatus(error.message, "error");
  } finally {
    setBusy(false);
  }
}

function setBusy(isBusy) {
  elements.scanButton.disabled = isBusy;
  elements.undoButton.disabled = isBusy;
  elements.applyButton.disabled = isBusy || !hasApplicableSuggestions(currentPlan);
}

function renderPlan(plan) {
  currentPlan = plan;

  if (!plan) {
    renderEmptySummary();
    elements.duplicatesList.textContent = "还没有扫描结果。";
    elements.duplicatesList.classList.add("empty-state");
    elements.suggestionsList.textContent = "配置 AI 后扫描，会在这里显示汇总分类与目标文件夹。";
    elements.suggestionsList.classList.add("empty-state");
    elements.scanTime.textContent = "尚未扫描";
    elements.applyButton.disabled = true;
    return;
  }

  renderSummary(plan.summary);
  renderDuplicates(plan.duplicateGroups);
  renderSuggestions(plan.suggestions);
  elements.scanTime.textContent = formatDate(plan.generatedAt);
  elements.applyButton.disabled = !hasApplicableSuggestions(plan);
}

function renderEmptySummary() {
  const stats = [
    { label: "总收藏", value: "-", tone: "primary" },
    { label: "待归档", value: "-", tone: "primary" },
    { label: "分类组", value: "-", tone: "primary" },
    { label: "暂不处理", value: "-", tone: "primary" },
    { label: "重复组", value: "-" },
    { label: "重复条目", value: "-" },
    { label: "空目录", value: "-" },
  ];

  elements.summaryGrid.replaceChildren(...stats.map(createStatCard));
}

function renderSummary(summary = {}) {
  const stats = [
    { label: "总收藏", value: summary.totalBookmarks ?? 0, tone: "primary" },
    { label: "待归档", value: summary.moveCandidateCount ?? 0, tone: "primary" },
    { label: "分类组", value: summary.suggestedGroupCount ?? 0, tone: "primary" },
    { label: "暂不处理", value: summary.ungroupedCount ?? 0, tone: "primary" },
    { label: "重复组", value: summary.duplicateGroupCount ?? 0 },
    { label: "重复条目", value: summary.duplicateBookmarkCount ?? 0 },
    { label: "空目录", value: summary.emptyFolderCount ?? 0 },
  ];

  elements.summaryGrid.replaceChildren(...stats.map(createStatCard));
}

function renderDuplicates(groups = []) {
  if (!groups.length) {
    elements.duplicatesList.textContent = "未发现明显的重复收藏。";
    elements.duplicatesList.classList.add("empty-state");
    return;
  }

  const cards = groups.slice(0, 6).map((group) => {
    const card = document.createElement("article");
    card.className = "stack-card";

    const title = document.createElement("div");
    title.className = "card-topline";
    title.textContent = `${group.count} 条重复 · ${group.normalizedUrl}`;

    const sampleList = document.createElement("ul");
    sampleList.className = "mini-list";

    group.bookmarks.slice(0, 4).forEach((bookmark) => {
      const item = document.createElement("li");
      item.textContent = `${bookmark.title} · ${bookmark.parentPath || "根目录"}`;
      sampleList.appendChild(item);
    });

    card.append(title, sampleList);
    return card;
  });

  elements.duplicatesList.replaceChildren(...cards);
  elements.duplicatesList.classList.remove("empty-state");
}

function renderSuggestions(suggestions = []) {
  if (!suggestions.length) {
    elements.suggestionsList.textContent = "当前没有适合自动整理的分组建议。";
    elements.suggestionsList.classList.add("empty-state");
    return;
  }

  const cards = suggestions.map((suggestion) => {
    const card = document.createElement("details");
    card.className = "stack-card";

    const summary = document.createElement("summary");
    summary.className = "suggestion-summary";

    const head = document.createElement("div");
    head.className = "suggestion-head";

    const titleRow = document.createElement("div");
    titleRow.className = "suggestion-title-row";

    const title = document.createElement("div");
    title.className = "card-topline";
    title.textContent = formatSuggestionTitle(suggestion);
    titleRow.appendChild(title);

    const brief = document.createElement("div");
    brief.className = "suggestion-brief";
    brief.append(
      createTag(`${getSuggestionTypeLabel(suggestion)} ${Math.round((suggestion.confidence ?? 0) * 100)}%`),
    );

    suggestion.topDomains?.slice(0, 3).forEach((item) => {
      brief.append(createTag(`${item.domain}×${item.count}`));
    });

    const sampleList = document.createElement("ul");
    sampleList.className = "mini-list";
    appendSuggestionSamples(sampleList, suggestion, 2, false);

    head.append(titleRow, brief);

    if (sampleList.childElementCount) {
      head.appendChild(sampleList);
    }

    summary.appendChild(head);

    const detailBody = document.createElement("div");
    detailBody.className = "suggestion-detail-body";

    const meta = document.createElement("p");
    meta.className = "card-meta";
    meta.textContent = suggestion.reason || "AI 综合判断";

    const details = document.createElement("div");
    details.className = "suggestion-details";

    if (suggestion.mediums?.length) {
      details.append(
        createTagList(
          "媒介",
          suggestion.mediums.map((item) => `${item.label}×${item.count}`),
        ),
      );
    }

    if (suggestion.matchedTerms?.length) {
      details.append(createTagList("命中", suggestion.matchedTerms.slice(0, 8)));
    }

    if (suggestion.topDomains?.length) {
      details.append(
        createTagList(
          "主要站点",
          suggestion.topDomains.map((item) => `${item.domain}×${item.count}`),
        ),
      );
    }

    const detailSampleList = document.createElement("ul");
    detailSampleList.className = "mini-list";
    appendSuggestionSamples(detailSampleList, suggestion, 6, true);

    detailBody.appendChild(meta);
    if (details.childElementCount) {
      detailBody.appendChild(details);
    }

    if (detailSampleList.childElementCount) {
      detailBody.appendChild(detailSampleList);
    }

    card.append(summary, detailBody);
    return card;
  });

  elements.suggestionsList.replaceChildren(...cards);
  elements.suggestionsList.classList.remove("empty-state");
}

function appendSuggestionSamples(list, suggestion, limit, includeMeta) {
  if (suggestion.type === "cleanup-empty-folders") {
    suggestion.emptyFolders?.slice(0, limit).forEach((folder) => {
      const item = document.createElement("li");
      item.textContent = folder.path || folder.title;
      list.appendChild(item);
    });
    return;
  }

  suggestion.bookmarks?.slice(0, limit).forEach((bookmark) => {
    const item = document.createElement("li");

    const title = document.createElement("span");
    title.textContent = `${bookmark.title} · ${bookmark.domain}`;
    item.appendChild(title);

    if (includeMeta && (bookmark.matchReason || bookmark.parentPath)) {
      const matchMeta = document.createElement("small");
      matchMeta.className = "item-meta";
      matchMeta.textContent = [
        formatBookmarkClassification(bookmark.classification),
        bookmark.matchReason ? `依据：${bookmark.matchReason}` : "",
        bookmark.parentPath ? `原位置：${bookmark.parentPath}` : "",
      ]
        .filter(Boolean)
        .join(" · ");
      item.appendChild(matchMeta);
    }

    list.appendChild(item);
  });
}

function createTagList(label, values) {
  const wrapper = document.createElement("div");
  wrapper.className = "tag-list";

  const labelElement = document.createElement("span");
  labelElement.className = "tag-list-label";
  labelElement.textContent = label;
  wrapper.appendChild(labelElement);

  values.forEach((value) => {
    wrapper.appendChild(createTag(value));
  });

  return wrapper;
}

function createTag(value) {
  const tag = document.createElement("span");
  tag.className = "tag";
  tag.textContent = value;
  return tag;
}

function getSuggestionTypeLabel(suggestion) {
  if (suggestion.groupType === "cleanup" || suggestion.type === "cleanup-empty-folders") {
    return "空目录清理";
  }

  if (suggestion.groupType === "domain") {
    return "站点归档";
  }

  if (suggestion.groupType === "ai") {
    return "AI 汇总";
  }

  return "主题归档";
}

function formatSuggestionTitle(suggestion) {
  if (suggestion.type === "cleanup-empty-folders") {
    return `清理空目录 · ${suggestion.emptyFolderCount ?? 0} 个`;
  }

  return `${suggestion.folderPath.join(" / ")} · ${suggestion.bookmarkCount} 条`;
}

function hasApplicableSuggestions(plan) {
  return (plan?.suggestions || []).some((suggestion) => {
    if (suggestion.type === "cleanup-empty-folders") {
      return (suggestion.emptyFolderCount || 0) > 0;
    }

    return suggestion.type === "move" && suggestion.bookmarkIds?.length > 0;
  });
}

function formatBookmarkClassification(classification) {
  if (!classification?.topic || !classification?.purpose) {
    return "";
  }

  const mediumText = classification.mediums?.length
    ? ` · 媒介：${classification.mediums.map((medium) => medium.label).join("、")}`
    : "";

  return `分类：${classification.topic.label} / ${classification.purpose.label}${mediumText}`;
}

function createStatCard(stat) {
  const card = document.createElement("article");
  card.className = "stat-card";
  card.dataset.tone = stat.tone || "default";

  const value = document.createElement("strong");
  value.textContent = String(stat.value);

  const label = document.createElement("span");
  label.textContent = stat.label;

  card.append(label, value);
  return card;
}

function renderProviderStatus(settings, plan) {
  if (!settings?.aiEnabled) {
    elements.providerStatus.textContent = "AI 未启用";
    return;
  }

  const provider = settings.provider || "local";
  const aiStatus = plan?.ai?.status || "ready";
  elements.providerStatus.textContent = `${provider} · ${aiStatus}`;
}

function renderStatus(message, tone) {
  elements.statusMessage.textContent = message;
  elements.statusMessage.dataset.tone = tone;
}

function formatDate(value) {
  if (!value) {
    return "尚未扫描";
  }

  return new Date(value).toLocaleString("zh-CN", {
    hour12: false,
  });
}
