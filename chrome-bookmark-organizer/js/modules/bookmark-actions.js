import { ORGANIZER_ROOT_TITLE } from "./constants.js";
import { clearLastApply, getLastApply, saveLastApply } from "./storage.js";

export async function applyBookmarkPlan(plan) {
  const moveGroups = (plan.suggestions || []).filter(
    (group) => group.type === "move" && group.bookmarkIds?.length,
  );
  const cleanupRequested = (plan.suggestions || []).some(
    (group) => group.type === "cleanup-empty-folders",
  );

  if (!moveGroups.length && !cleanupRequested) {
    return createEmptyApplyResult();
  }

  const createdFolderIds = [];
  const movedBookmarks = [];
  const fallbackParentId = await getDefaultTargetRootId();
  const targetRootId = fallbackParentId;
  const movedIds = new Set();

  for (const group of moveGroups) {
    const targetFolderId = await ensureFolderPath(
      targetRootId,
      group.folderPath,
      createdFolderIds,
    );

    for (const bookmarkId of group.bookmarkIds) {
      if (movedIds.has(bookmarkId)) {
        continue;
      }

      const currentNode = await getBookmarkById(bookmarkId);

      if (!currentNode?.url) {
        continue;
      }

      if (currentNode.parentId === targetFolderId) {
        continue;
      }

      movedBookmarks.push({
        id: currentNode.id,
        title: currentNode.title,
        url: currentNode.url,
        fromParentId: currentNode.parentId,
        fromIndex: currentNode.index,
        toParentId: targetFolderId,
      });
      await chrome.bookmarks.move(bookmarkId, {
        parentId: targetFolderId,
      });

      movedIds.add(bookmarkId);
    }
  }

  const removedSourceFolders = await removeEmptyBookmarkFolders({
    organizerRootId: null,
    createdFolderIds,
  });

  const snapshot = {
    appliedAt: new Date().toISOString(),
    organizerRootId: null,
    createdFolderIds,
    movedBookmarks,
    removedSourceFolders,
    fallbackParentId,
  };

  await saveLastApply(snapshot);

  return {
    movedCount: movedBookmarks.length,
    appliedGroupCount: moveGroups.length,
    createdFolderCount: createdFolderIds.length,
    removedSourceFolderCount: removedSourceFolders.length,
    appliedAt: snapshot.appliedAt,
  };
}

function createEmptyApplyResult() {
  return {
    movedCount: 0,
    appliedGroupCount: 0,
    createdFolderCount: 0,
    removedSourceFolderCount: 0,
  };
}

export async function undoLastApply() {
  const snapshot = await getLastApply();

  if (!snapshot) {
    return {
      undoneCount: 0,
      removedFolderCount: 0,
    };
  }

  const movedBookmarks = [...(snapshot.movedBookmarks || [])].sort((left, right) => {
    if (left.fromParentId === right.fromParentId) {
      return left.fromIndex - right.fromIndex;
    }

    return left.fromParentId.localeCompare(right.fromParentId);
  });

  let undoneCount = 0;
  const failedBookmarks = [];
  const restoredFolderIds = new Map();
  const removedFolderMap = new Map(
    (snapshot.removedSourceFolders || []).map((folder) => [folder.id, folder]),
  );
  let restoredSourceFolderCount = 0;

  for (const item of movedBookmarks) {
    const bookmark = await getBookmarkById(item.id);

    if (!bookmark?.url) {
      failedBookmarks.push({
        id: item.id,
        title: item.title,
        reason: "收藏已不存在",
      });
      continue;
    }

    const targetParentId = await resolveUndoParentId(
      item.fromParentId,
      removedFolderMap,
      restoredFolderIds,
      snapshot.fallbackParentId || snapshot.organizerRootId,
    );

    try {
      await chrome.bookmarks.move(item.id, {
        parentId: targetParentId,
        index: item.fromIndex,
      });
      undoneCount += 1;
    } catch {
      try {
        await chrome.bookmarks.move(item.id, {
          parentId: targetParentId,
        });
        undoneCount += 1;
      } catch (error) {
        failedBookmarks.push({
          id: item.id,
          title: item.title,
          reason: error instanceof Error ? error.message : "移动失败",
        });
      }
    }
  }

  restoredSourceFolderCount = await restoreAllRemovedFolders(
    removedFolderMap,
    restoredFolderIds,
    snapshot.fallbackParentId || snapshot.organizerRootId,
  );

  let removedFolderCount = 0;

  for (const folderId of [...(snapshot.createdFolderIds || [])].reverse()) {
    const folder = await getBookmarkById(folderId);

    if (!folder || folder.url) {
      continue;
    }

    const children = await chrome.bookmarks.getChildren(folderId);

    if (children.length === 0) {
      try {
        await chrome.bookmarks.remove(folderId);
        removedFolderCount += 1;
      } catch {
        // Ignore folders that Chrome already removed or temporarily locks.
      }
    }
  }

  await clearLastApply();

  return {
    undoneCount,
    removedFolderCount,
    restoredSourceFolderCount,
    failedCount: failedBookmarks.length,
    failedBookmarks,
  };
}

async function removeEmptyBookmarkFolders(options) {
  const [root] = await chrome.bookmarks.getTree();
  const protectedIds = await getProtectedFolderIds(options);
  const removedFolders = [];

  for (const topLevelNode of root?.children || []) {
    await removeEmptyFolderTree(topLevelNode, protectedIds, removedFolders, false);
  }

  return removedFolders;
}

async function removeEmptyFolderTree(node, protectedIds, removedFolders, isProtectedSubtree) {
  if (node.url) {
    return true;
  }

  const currentProtectedSubtree = isProtectedSubtree || protectedIds.protectedSubtreeRootIds.has(node.id);
  let remainingChildCount = 0;

  for (const child of node.children || []) {
    const childStillExists = await removeEmptyFolderTree(
      child,
      protectedIds,
      removedFolders,
      currentProtectedSubtree,
    );

    if (childStillExists) {
      remainingChildCount += 1;
    }
  }

  if (
    remainingChildCount > 0 ||
    currentProtectedSubtree ||
    protectedIds.folderIds.has(node.id)
  ) {
    return true;
  }

  removedFolders.push({
    id: node.id,
    title: node.title,
    parentId: node.parentId,
    index: node.index,
  });

  try {
    await chrome.bookmarks.remove(node.id);
    return false;
  } catch {
    removedFolders.pop();
    return true;
  }
}

async function getProtectedFolderIds(options) {
  const [root] = await chrome.bookmarks.getTree();
  const topLevelIds = (root?.children || []).map((child) => child.id);
  const organizerRootIds = collectOrganizerRootIds(root);

  return {
    folderIds: new Set([
      root?.id,
      ...topLevelIds,
      options.organizerRootId,
      ...organizerRootIds,
      ...(options.createdFolderIds || []),
    ].filter(Boolean)),
    protectedSubtreeRootIds: new Set([
      options.organizerRootId,
      ...organizerRootIds,
    ].filter(Boolean)),
  };
}

function collectOrganizerRootIds(node, ids = []) {
  if (!node || node.url) {
    return ids;
  }

  if (node.title === ORGANIZER_ROOT_TITLE) {
    ids.push(node.id);
    return ids;
  }

  for (const child of node.children || []) {
    collectOrganizerRootIds(child, ids);
  }

  return ids;
}

async function restoreAllRemovedFolders(removedFolderMap, restoredFolderIds, fallbackParentId) {
  let restoredCount = 0;

  for (const folderId of removedFolderMap.keys()) {
    const before = restoredFolderIds.size;
    await restoreRemovedFolder(folderId, removedFolderMap, restoredFolderIds, fallbackParentId);
    restoredCount += restoredFolderIds.size - before;
  }

  return restoredCount;
}

async function resolveUndoParentId(folderId, removedFolderMap, restoredFolderIds, fallbackParentId) {
  if (await getBookmarkById(folderId)) {
    return folderId;
  }

  if (!removedFolderMap.has(folderId)) {
    return fallbackParentId;
  }

  return restoreRemovedFolder(folderId, removedFolderMap, restoredFolderIds, fallbackParentId);
}

async function restoreRemovedFolder(folderId, removedFolderMap, restoredFolderIds, fallbackParentId) {
  if (restoredFolderIds.has(folderId)) {
    return restoredFolderIds.get(folderId);
  }

  const folder = removedFolderMap.get(folderId);

  if (!folder) {
    return fallbackParentId;
  }

  const parentId = await resolveUndoParentId(
    folder.parentId,
    removedFolderMap,
    restoredFolderIds,
    fallbackParentId,
  );
  const restoredId = await ensureFolder(parentId, folder.title, [], folder.index);
  restoredFolderIds.set(folderId, restoredId);

  return restoredId;
}

async function ensureFolderPath(rootFolderId, folderPath, createdFolderIds) {
  let currentParentId = rootFolderId;

  for (const title of folderPath) {
    currentParentId = await ensureFolder(currentParentId, title, createdFolderIds);
  }

  return currentParentId;
}

async function ensureFolder(parentId, title, createdFolderIds, index) {
  const children = await chrome.bookmarks.getChildren(parentId);
  const existing = children.find((child) => !child.url && child.title === title);

  if (existing) {
    return existing.id;
  }

  const createDetails = {
    parentId,
    title,
  };

  if (Number.isInteger(index)) {
    createDetails.index = index;
  }

  const created = await chrome.bookmarks.create(createDetails);

  createdFolderIds.push(created.id);
  return created.id;
}

async function getDefaultTargetRootId() {
  const [root] = await chrome.bookmarks.getTree();
  const children = root?.children || [];

  const bookmarksBar =
    children.find((child) => child.id === "1") ||
    children.find((child) => /bar/i.test(child.title)) ||
    children.find((child) => child.title.includes("书签栏")) ||
    children.find((child) => child.title.includes("收藏栏")) ||
    children[0];

  if (!bookmarksBar) {
    throw new Error("Could not find a writable bookmark root.");
  }

  return bookmarksBar.id;
}

async function getBookmarkById(id) {
  try {
    const result = await chrome.bookmarks.get(id);
    return result[0] || null;
  } catch {
    return null;
  }
}
