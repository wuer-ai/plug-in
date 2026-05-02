import { ORGANIZER_ROOT_TITLE, TRACKING_QUERY_KEYS } from "./constants.js";

export function analyzeBookmarks(tree) {
  const { bookmarks, folderCount } = createBookmarkInventory(tree);
  const emptyFolders = collectEmptyFolders(tree);
  const duplicateGroups = detectDuplicateGroups(bookmarks);
  const duplicateIds = new Set(
    duplicateGroups.flatMap((group) => group.bookmarkIds),
  );
  const cleanupSuggestion = buildEmptyFolderCleanupSuggestion(emptyFolders);
  const suggestions = cleanupSuggestion ? [cleanupSuggestion] : [];

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      totalBookmarks: bookmarks.length,
      folderCount,
      emptyFolderCount: emptyFolders.length,
      duplicateGroupCount: duplicateGroups.length,
      duplicateBookmarkCount: duplicateGroups.reduce((sum, group) => sum + group.count, 0),
      suggestedGroupCount: suggestions.length,
      moveCandidateCount: 0,
      ungroupedCount: bookmarks.length - duplicateIds.size,
    },
    duplicateGroups,
    suggestions,
    ai: {
      provider: "local",
      status: "required",
      message: "AI summary is required for bookmark moves",
    },
  };
}

export function createBookmarkInventory(tree) {
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

function collectEmptyFolders(tree) {
  const emptyFolders = [];

  for (const root of tree) {
    collectEmptyFolderNode(root, [], 0, false, emptyFolders);
  }

  return emptyFolders;
}

function collectEmptyFolderNode(node, folderTrail, depth, isOrganizerSubtree, emptyFolders) {
  if (node.url) {
    return true;
  }

  const title = String(node.title || "").trim();
  const nextTrail = title ? [...folderTrail, title] : folderTrail;
  const currentOrganizerSubtree = isOrganizerSubtree || title === ORGANIZER_ROOT_TITLE;
  let hasRemainingContent = false;

  for (const child of node.children || []) {
    const childHasRemainingContent = collectEmptyFolderNode(
      child,
      nextTrail,
      depth + 1,
      currentOrganizerSubtree,
      emptyFolders,
    );

    if (childHasRemainingContent) {
      hasRemainingContent = true;
    }
  }

  const isChromeRoot = node.id === "0" || depth <= 1;

  if (isChromeRoot || currentOrganizerSubtree) {
    return true;
  }

  if (!hasRemainingContent) {
    emptyFolders.push({
      id: node.id,
      title: title || "未命名文件夹",
      parentId: node.parentId || "",
      parentPath: folderTrail.join(" / "),
      path: nextTrail.join(" / "),
    });
    return false;
  }

  return true;
}

function buildEmptyFolderCleanupSuggestion(emptyFolders) {
  if (!emptyFolders.length) {
    return null;
  }

  return {
    id: "cleanup-empty-folders",
    type: "cleanup-empty-folders",
    folderPath: ["清理空目录"],
    reason: "发现空文件夹，可安全清理",
    confidence: 1,
    groupType: "cleanup",
    matchedTerms: [],
    mediums: [],
    topDomains: [],
    bookmarkIds: [],
    bookmarkCount: 0,
    emptyFolderIds: emptyFolders.map((folder) => folder.id),
    emptyFolderCount: emptyFolders.length,
    emptyFolders: emptyFolders.slice(0, 8),
  };
}

function walkNode(node, folderTrail, bookmarks, onFolder) {
  const title = String(node.title || "").trim();
  const nextTrail = title ? [...folderTrail, title] : folderTrail;

  if (node.url) {
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
