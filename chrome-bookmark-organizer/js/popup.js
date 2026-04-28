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
      renderStatus("扫描完成，已经生成本地整理建议。", "success");
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

      renderStatus(
        `已应用 ${groupCount} 个分组建议，移动 ${movedCount} 条收藏。建议再扫描一次查看最新状态。`,
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
      renderStatus(`已撤销上次整理，本次恢复 ${undoneCount} 条收藏。`, "success");
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
  elements.applyButton.disabled = isBusy || !(currentPlan?.suggestions?.length > 0);
}

function renderPlan(plan) {
  currentPlan = plan;

  if (!plan) {
    renderEmptySummary();
    elements.duplicatesList.textContent = "还没有扫描结果。";
    elements.duplicatesList.classList.add("empty-state");
    elements.suggestionsList.textContent = "扫描后会在这里显示建议分类与目标文件夹。";
    elements.suggestionsList.classList.add("empty-state");
    elements.scanTime.textContent = "尚未扫描";
    elements.applyButton.disabled = true;
    return;
  }

  renderSummary(plan.summary);
  renderDuplicates(plan.duplicateGroups);
  renderSuggestions(plan.suggestions);
  elements.scanTime.textContent = formatDate(plan.generatedAt);
  elements.applyButton.disabled = !(plan.suggestions?.length > 0);
}

function renderEmptySummary() {
  const stats = [
    { label: "总收藏", value: "-" },
    { label: "重复组", value: "-" },
    { label: "推荐分组", value: "-" },
    { label: "待移动条目", value: "-" },
  ];

  elements.summaryGrid.replaceChildren(...stats.map(createStatCard));
}

function renderSummary(summary = {}) {
  const stats = [
    { label: "总收藏", value: summary.totalBookmarks ?? 0 },
    { label: "重复组", value: summary.duplicateGroupCount ?? 0 },
    { label: "推荐分组", value: summary.suggestedGroupCount ?? 0 },
    { label: "待移动条目", value: summary.moveCandidateCount ?? 0 },
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
    const card = document.createElement("article");
    card.className = "stack-card";

    const title = document.createElement("div");
    title.className = "card-topline";
    title.textContent = `${suggestion.folderPath.join(" / ")} · ${suggestion.bookmarkCount} 条`;

    const meta = document.createElement("p");
    meta.className = "card-meta";
    meta.textContent = `${suggestion.reason} · 置信度 ${Math.round(
      (suggestion.confidence ?? 0) * 100,
    )}%`;

    const sampleList = document.createElement("ul");
    sampleList.className = "mini-list";

    suggestion.bookmarks.slice(0, 4).forEach((bookmark) => {
      const item = document.createElement("li");
      item.textContent = `${bookmark.title} · ${bookmark.domain}`;
      sampleList.appendChild(item);
    });

    card.append(title, meta, sampleList);
    return card;
  });

  elements.suggestionsList.replaceChildren(...cards);
  elements.suggestionsList.classList.remove("empty-state");
}

function createStatCard(stat) {
  const card = document.createElement("article");
  card.className = "stat-card";

  const value = document.createElement("strong");
  value.textContent = String(stat.value);

  const label = document.createElement("span");
  label.textContent = stat.label;

  card.append(value, label);
  return card;
}

function renderProviderStatus(settings, plan) {
  if (!settings?.aiEnabled) {
    elements.providerStatus.textContent = "本地模式";
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
