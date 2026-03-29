import { create } from 'zustand';

export interface PaneSession {
  projectHash: string;
  sessionId: string;
  projectPath: string;
  isNew?: boolean;
  slug?: string;
  slugSessionIds?: string[];
  permissionMode?: string;
}

export interface LeafPane {
  type: 'leaf';
  id: string;
  session: PaneSession | null;
}

export interface SplitPane {
  type: 'split';
  id: string;
  direction: 'horizontal' | 'vertical';
  first: PaneNode;
  second: PaneNode;
  ratio: number;
}

export type PaneNode = LeafPane | SplitPane;

type DropPosition = 'left' | 'right' | 'top' | 'bottom';

let paneCounter = 0;
function newPaneId() {
  return `pane-${++paneCounter}`;
}

function countLeaves(node: PaneNode): number {
  if (node.type === 'leaf') return 1;
  return countLeaves(node.first) + countLeaves(node.second);
}

function findLeaf(node: PaneNode, id: string): LeafPane | null {
  if (node.type === 'leaf') return node.id === id ? node : null;
  return findLeaf(node.first, id) || findLeaf(node.second, id);
}

function replaceNode(node: PaneNode, targetId: string, replacement: PaneNode): PaneNode {
  if (node.id === targetId) return replacement;
  if (node.type === 'leaf') return node;
  return {
    ...node,
    first: replaceNode(node.first, targetId, replacement),
    second: replaceNode(node.second, targetId, replacement),
  };
}

function removeLeaf(node: PaneNode, targetId: string): PaneNode | null {
  if (node.type === 'leaf') {
    return node.id === targetId ? null : node;
  }
  if (node.first.id === targetId) return node.second;
  if (node.second.id === targetId) return node.first;
  const firstResult = removeLeaf(node.first, targetId);
  if (firstResult !== node.first) {
    return firstResult ? { ...node, first: firstResult } : node.second;
  }
  const secondResult = removeLeaf(node.second, targetId);
  if (secondResult !== node.second) {
    return secondResult ? { ...node, second: secondResult } : node.first;
  }
  return node;
}

function findFirstLeaf(node: PaneNode): LeafPane {
  if (node.type === 'leaf') return node;
  return findFirstLeaf(node.first);
}

function updateLeafSession(node: PaneNode, paneId: string, session: PaneSession | null): PaneNode {
  if (node.type === 'leaf') {
    if (node.id === paneId) return { ...node, session };
    return node;
  }
  return {
    ...node,
    first: updateLeafSession(node.first, paneId, session),
    second: updateLeafSession(node.second, paneId, session),
  };
}

function updateSplitRatio(node: PaneNode, splitId: string, ratio: number): PaneNode {
  if (node.type === 'leaf') return node;
  if (node.id === splitId) return { ...node, ratio };
  return {
    ...node,
    first: updateSplitRatio(node.first, splitId, ratio),
    second: updateSplitRatio(node.second, splitId, ratio),
  };
}

const ROOT_ID = 'root-leaf';

interface PaneState {
  root: PaneNode;
  activePaneId: string;
  splitPane: (targetPaneId: string, position: DropPosition, session: PaneSession) => void;
  closePane: (paneId: string) => void;
  setActivePane: (paneId: string) => void;
  setSessionInActivePane: (session: PaneSession | null) => void;
  movePane: (sourcePaneId: string, targetPaneId: string, position: DropPosition) => void;
  resizeSplit: (splitId: string, ratio: number) => void;
  getActiveSession: () => PaneSession | null;
  reset: () => void;
}

export const usePaneStore = create<PaneState>((set, get) => ({
  root: { type: 'leaf', id: ROOT_ID, session: null } as PaneNode,
  activePaneId: ROOT_ID,

  splitPane: (targetPaneId, position, session) => {
    const { root } = get();
    if (countLeaves(root) >= 8) return;

    const targetLeaf = findLeaf(root, targetPaneId);
    if (!targetLeaf) return;

    const newLeaf: LeafPane = { type: 'leaf', id: newPaneId(), session };
    const direction: 'horizontal' | 'vertical' =
      position === 'left' || position === 'right' ? 'horizontal' : 'vertical';
    const isFirstNew = position === 'left' || position === 'top';

    const splitNode: SplitPane = {
      type: 'split',
      id: newPaneId(),
      direction,
      first: isFirstNew ? newLeaf : targetLeaf,
      second: isFirstNew ? targetLeaf : newLeaf,
      ratio: 0.5,
    };

    const newRoot = replaceNode(root, targetPaneId, splitNode);
    set({ root: newRoot, activePaneId: newLeaf.id });
  },

  closePane: (paneId) => {
    const { root, activePaneId } = get();
    if (root.type === 'leaf') {
      set({ root: { type: 'leaf', id: ROOT_ID, session: null }, activePaneId: ROOT_ID });
      return;
    }
    const newRoot = removeLeaf(root, paneId);
    if (!newRoot) {
      set({ root: { type: 'leaf', id: ROOT_ID, session: null }, activePaneId: ROOT_ID });
      return;
    }
    const newActive = paneId === activePaneId ? findFirstLeaf(newRoot).id : activePaneId;
    set({ root: newRoot, activePaneId: newActive });
  },

  setActivePane: (paneId) => {
    set({ activePaneId: paneId });
  },

  setSessionInActivePane: (session) => {
    const { root, activePaneId } = get();
    set({ root: updateLeafSession(root, activePaneId, session) });
  },

  movePane: (sourcePaneId, targetPaneId, position) => {
    if (sourcePaneId === targetPaneId) return;
    const { root } = get();
    const sourceLeaf = findLeaf(root, sourcePaneId);
    const targetLeaf = findLeaf(root, targetPaneId);
    if (!sourceLeaf?.session || !targetLeaf) return;

    const session = sourceLeaf.session;
    // Remove source pane first
    let newRoot = removeLeaf(root, sourcePaneId);
    if (!newRoot) return;

    // Now split the target with the moved session
    const target = findLeaf(newRoot, targetPaneId);
    if (!target) return;

    const newLeaf: LeafPane = { type: 'leaf', id: newPaneId(), session };
    const direction: 'horizontal' | 'vertical' =
      position === 'left' || position === 'right' ? 'horizontal' : 'vertical';
    const isFirstNew = position === 'left' || position === 'top';

    const splitNode: SplitPane = {
      type: 'split',
      id: newPaneId(),
      direction,
      first: isFirstNew ? newLeaf : target,
      second: isFirstNew ? target : newLeaf,
      ratio: 0.5,
    };

    newRoot = replaceNode(newRoot, targetPaneId, splitNode);
    set({ root: newRoot, activePaneId: newLeaf.id });
  },

  resizeSplit: (splitId, ratio) => {
    const clamped = Math.max(0.15, Math.min(0.85, ratio));
    set({ root: updateSplitRatio(get().root, splitId, clamped) });
  },

  getActiveSession: () => {
    const { root, activePaneId } = get();
    const leaf = findLeaf(root, activePaneId);
    return leaf?.session ?? null;
  },

  reset: () => {
    set({ root: { type: 'leaf', id: ROOT_ID, session: null }, activePaneId: ROOT_ID });
  },
}));
