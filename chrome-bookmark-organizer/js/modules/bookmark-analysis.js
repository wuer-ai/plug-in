import {
  CATEGORY_RULES,
  ORGANIZER_ROOT_TITLE,
  TRACKING_QUERY_KEYS,
} from "./constants.js";

export function analyzeBookmarks(tree) {
  const { bookmarks, folderCount } = flattenBookmarkTree(tree);
  const duplicateGroups = detectDuplicateGroups(bookmarks);
  const duplicateIds = new Set(
    duplicateGroups.flatMap((group) => group.bookmarkIds),
  );
  const suggestions = buildMoveSuggestions(bookmarks, duplicateIds);

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      totalBookmarks: bookmarks.length,
      folderCount,
      duplicateGroupCount: duplicateGroups.length,
      duplicateBookmarkCount: duplicateGroups.reduce((sum, group) => sum + group.count, 0),
      suggestedGroupCount: suggestions.length,
      moveCandidateCount: suggestions.reduce((sum, group) => sum + group.bookmarkCount, 0),
      ungroupedCount:
        bookmarks.length -
        duplicateIds.size -
        suggestions.reduce((sum, group) => sum + group.bookmarkCount, 0),
    },
    duplicateGroups,
    suggestions,
    ai: {
      provider: "local",
      status: "idle",
      message: "Local rules only",
    },
  };
}

function flattenBookmarkTree(tree) {
  const bookmarks = [];
  let folderCount = 0;

  for (const root of tree) {
    walkNode(root, [], bookmarks, () => {
      folderCount += 1;
    });
  }

  return {
    bookmarks,
    folderCount,
  };
}

function walkNode(node, folderTrail, bookmarks, onFolder) {
  const title = String(node.title || "").trim();
  const nextTrail = title ? [...folderTrail, title] : folderTrail;

  if (node.url) {
    if (folderTrail.includes(ORGANIZER_ROOT_TITLE)) {
      return;
    }

    const urlObject = safeParseUrl(node.url);

    bookmarks.push({
      id: node.id,
      title: title || "未命名收藏",
      url: node.url,
      normalizedUrl: normalizeUrl(node.url),
      domain: normalizeDomain(urlObject?.hostname || ""),
      path: urlObject?.pathname || "/",
      pathKey: getPathKey(urlObject?.pathname || "/"),
      parentId: node.parentId || "",
      parentPath: folderTrail.join(" / "),
      dateAdded: node.dateAdded || null,
    });

    return;
  }

  if (node.id !== "0") {
    onFolder();
  }

  for (const child of node.children || []) {
    walkNode(child, nextTrail, bookmarks, onFolder);
  }
}

function detectDuplicateGroups(bookmarks) {
  const groups = new Map();

  for (const bookmark of bookmarks) {
    const bucket = groups.get(bookmark.normalizedUrl) || [];
    bucket.push({
      id: bookmark.id,
      title: bookmark.title,
      url: bookmark.url,
      domain: bookmark.domain,
      parentPath: bookmark.parentPath,
    });
    groups.set(bookmark.normalizedUrl, bucket);
  }

  return Array.from(groups.entries())
    .filter(([, items]) => items.length > 1)
    .map(([normalizedUrl, items]) => ({
      normalizedUrl,
      count: items.length,
      bookmarkIds: items.map((item) => item.id),
      bookmarks: items.slice(0, 6),
    }))
    .sort((left, right) => right.count - left.count);
}

function buildMoveSuggestions(bookmarks, duplicateIds) {
  const uniqueBookmarks = bookmarks.filter((bookmark) => !duplicateIds.has(bookmark.id));
  const categoryBuckets = new Map();
  const domainBuckets = new Map();

  for (const bookmark of uniqueBookmarks) {
    const category = classifyBookmark(bookmark);

    if (category) {
      const bucket = categoryBuckets.get(category.key) || {
        id: category.key,
        type: "move",
        folderPath: category.folderPath,
        reason: category.reason,
        confidenceValues: [],
        bookmarks: [],
      };

      bucket.bookmarks.push(bookmark);
      bucket.confidenceValues.push(category.confidence);
      categoryBuckets.set(category.key, bucket);
      continue;
    }

    const bucket = domainBuckets.get(bookmark.domain) || [];
    bucket.push(bookmark);
    domainBuckets.set(bookmark.domain, bucket);
  }

  const suggestions = [];
  const assignedIds = new Set();

  for (const bucket of categoryBuckets.values()) {
    if (bucket.bookmarks.length < 2) {
      continue;
    }

    bucket.bookmarks.forEach((bookmark) => assignedIds.add(bookmark.id));
    suggestions.push(buildSuggestion(bucket.folderPath, bucket.bookmarks, {
      reason: bucket.reason,
      confidence: average(bucket.confidenceValues),
    }));
  }

  for (const [domain, items] of domainBuckets.entries()) {
    if (!domain || items.length < 3) {
      continue;
    }

    const remaining = items.filter((item) => !assignedIds.has(item.id));

    if (remaining.length < 3) {
      continue;
    }

    remaining.forEach((bookmark) => assignedIds.add(bookmark.id));
    suggestions.push(
      buildSuggestion(["站点归档", domain], remaining, {
        reason: "同域名聚合",
        confidence: 0.64,
      }),
    );
  }

  return suggestions.sort((left, right) => {
    if (right.bookmarkCount !== left.bookmarkCount) {
      return right.bookmarkCount - left.bookmarkCount;
    }

    return right.confidence - left.confidence;
  });
}

function buildSuggestion(folderPath, bookmarks, meta) {
  return {
    id: `${folderPath.join("-")}-${bookmarks[0].id}`,
    type: "move",
    folderPath,
    reason: meta.reason,
    confidence: Number(meta.confidence.toFixed(2)),
    bookmarkIds: bookmarks.map((bookmark) => bookmark.id),
    bookmarkCount: bookmarks.length,
    bookmarks: bookmarks.slice(0, 6).map((bookmark) => ({
      id: bookmark.id,
      title: bookmark.title,
      url: bookmark.url,
      domain: bookmark.domain,
      parentPath: bookmark.parentPath,
    })),
  };
}

function classifyBookmark(bookmark) {
  const haystack = `${bookmark.title} ${bookmark.domain} ${bookmark.path}`.toLowerCase();

  let bestMatch = null;

  for (const rule of CATEGORY_RULES) {
    let score = 0;
    const reasons = [];

    if (matchesDomain(bookmark.domain, rule.domains)) {
      score += 0.38;
      reasons.push("域名特征");
    }

    if (matchesKeyword(haystack, rule.keywords)) {
      score += 0.3;
      reasons.push("标题关键词");
    }

    if (matchesPath(bookmark.path, rule.paths)) {
      score += 0.2;
      reasons.push("路径模式");
    }

    if (score < 0.5) {
      continue;
    }

    const candidate = {
      key: rule.key,
      folderPath: rule.folderPath,
      confidence: Math.min(0.95, score),
      reason: reasons.join(" + "),
    };

    if (!bestMatch || candidate.confidence > bestMatch.confidence) {
      bestMatch = candidate;
    }
  }

  return bestMatch;
}

function normalizeUrl(rawUrl) {
  const parsed = safeParseUrl(rawUrl);

  if (!parsed) {
    return rawUrl.trim();
  }

  const searchParams = Array.from(parsed.searchParams.entries())
    .filter(([key]) => {
      const normalizedKey = key.toLowerCase();
      return !normalizedKey.startsWith("utm_") && !TRACKING_QUERY_KEYS.has(normalizedKey);
    })
    .sort(([left], [right]) => left.localeCompare(right));

  const query = new URLSearchParams(searchParams).toString();
  const hostname = normalizeDomain(parsed.hostname);
  const pathname = parsed.pathname.replace(/\/+$/, "") || "/";

  return `${parsed.protocol}//${hostname}${pathname}${query ? `?${query}` : ""}`;
}

function safeParseUrl(value) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function normalizeDomain(domain) {
  return domain.toLowerCase().replace(/^www\./, "");
}

function getPathKey(pathname) {
  const firstSegment = pathname.split("/").filter(Boolean)[0];
  return firstSegment || "/";
}

function matchesDomain(domain, domainRules) {
  return domainRules.some((rule) => domain === rule || domain.endsWith(`.${rule}`));
}

function matchesKeyword(haystack, keywords) {
  return keywords.some((keyword) => haystack.includes(keyword.toLowerCase()));
}

function matchesPath(pathname, paths) {
  return paths.some((pathRule) => pathname.toLowerCase().includes(pathRule.toLowerCase()));
}

function average(values) {
  if (!values.length) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
