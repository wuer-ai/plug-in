import { ORGANIZER_ROOT_TITLE } from "./constants.js";
import { clearLastApply, getLastApply, saveLastApply } from "./storage.js";

export async function applyBookmarkPlan(plan) {
  const moveGroups = (plan.suggestions || []).filter(
    (group) => group.type === "move" && group.bookmarkIds?.length,
  );

  if (!moveGroups.length) {
    return {
      movedCount: 0,
      appliedGroupCount: 0,
      createdFolderCount: 0,
    };
  }

  const createdFolderIds = [];
  const movedBookmarks = [];
  const organizerRootId = await ensureOrganizerRoot(createdFolderIds);
  const movedIds = new Set();

  for (const group of moveGroups) {
    const targetFolderId = await ensureFolderPath(
      organizerRootId,
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
        fromParentId: currentNode.parentId,
        fromIndex: currentNode.index,
      });

      await chrome.bookmarks.move(bookmarkId, {
        parentId: targetFolderId,
      });

      movedIds.add(bookmarkId);
    }
  }

  const snapshot = {
    appliedAt: new Date().toISOString(),
    organizerRootId,
    createdFolderIds,
    movedBookmarks,
  };

  await saveLastApply(snapshot);

  return {
    movedCount: movedBookmarks.length,
    appliedGroupCount: moveGroups.length,
    createdFolderCount: createdFolderIds.length,
    appliedAt: snapshot.appliedAt,
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

  for (const item of movedBookmarks) {
    const bookmark = await getBookmarkById(item.id);

    if (!bookmark?.url) {
      continue;
    }

    try {
      await chrome.bookmarks.move(item.id, {
        parentId: item.fromParentId,
        index: item.fromIndex,
      });
      undoneCount += 1;
    } catch {
      await chrome.bookmarks.move(item.id, {
        parentId: item.fromParentId,
      });
      undoneCount += 1;
    }
  }

  let removedFolderCount = 0;

  for (const folderId of [...(snapshot.createdFolderIds || [])].reverse()) {
    const folder = await getBookmarkById(folderId);

    if (!folder || folder.url) {
      continue;
    }

    const children = await chrome.bookmarks.getChildren(folderId);

    if (children.length === 0) {
      await chrome.bookmarks.remove(folderId);
      removedFolderCount += 1;
    }
  }

  await clearLastApply();

  return {
    undoneCount,
    removedFolderCount,
  };
}

async function ensureOrganizerRoot(createdFolderIds) {
  const parentId = await getDefaultTargetRootId();
  return ensureFolder(parentId, ORGANIZER_ROOT_TITLE, createdFolderIds);
}

async function ensureFolderPath(rootFolderId, folderPath, createdFolderIds) {
  let currentParentId = rootFolderId;

  for (const title of folderPath) {
    currentParentId = await ensureFolder(currentParentId, title, createdFolderIds);
  }

  return currentParentId;
}

async function ensureFolder(parentId, title, createdFolderIds) {
  const children = await chrome.bookmarks.getChildren(parentId);
  const existing = children.find((child) => !child.url && child.title === title);

  if (existing) {
    return existing.id;
  }

  const created = await chrome.bookmarks.create({
    parentId,
    title,
  });

  createdFolderIds.push(created.id);
  return created.id;
}

async function getDefaultTargetRootId() {
  const [root] = await chrome.bookmarks.getTree();
  const children = root?.children || [];

  const otherBookmarks =
    children.find((child) => child.id === "2") ||
    children.find((child) => /other/i.test(child.title)) ||
    children.find((child) => child.title.includes("其他")) ||
    children[0];

  if (!otherBookmarks) {
    throw new Error("Could not find a writable bookmark root.");
  }

  return otherBookmarks.id;
}

async function getBookmarkById(id) {
  try {
    const result = await chrome.bookmarks.get(id);
    return result[0] || null;
  } catch {
    return null;
  }
}
