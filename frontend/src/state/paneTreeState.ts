/**
 * Pane-tree layout state — the data structure behind Split Panes.
 *
 * Replaces the flat single-tab-row assumption with a nestable tree: leaves are
 * panes (each wrapping the EXISTING `TabState` + `tabReducer`, unchanged), inner
 * nodes are splits with a direction and ratio-weighted children. Exactly one
 * pane is active; the global "active tab" is derived from the active pane.
 *
 * This module is pure (no React, no DOM) and delegates every tab-level change to
 * the existing `tabReducer`, so the large body of tab logic (pinning, close-
 * others, undo-close, path updates) is reused rather than rewritten.
 *
 * @module state/paneTreeState
 */

import {
  tabReducer,
  initialTabState,
  generateTabId,
  type TabState,
  type TabEntry,
  type TabAction,
  type TabMode,
} from './tabState'

// ─── Types ───────────────────────────────────────────────────────────────────

/** Split orientation: `horizontal` = panes side by side, `vertical` = stacked. */
export type SplitDirection = 'horizontal' | 'vertical'

/** A leaf node: one independent tab row (the existing TabState). */
export interface PaneNode {
  kind: 'pane'
  /** Stable pane id. */
  id: string
  /** The pane's own tab state (reuses the existing tab reducer). */
  tabState: TabState
}

/** An inner node: a split with a direction and ratio-weighted children. */
export interface SplitNode {
  kind: 'split'
  id: string
  direction: SplitDirection
  /** Two or more children (panes or nested splits). */
  children: PaneTreeNode[]
  /** Child size ratios, one per child, summing to 1. */
  sizes: number[]
}

/** A node in the pane tree. */
export type PaneTreeNode = PaneNode | SplitNode

/** The full pane-tree layout. */
export interface PaneTree {
  root: PaneTreeNode
  /** The id of the single active pane. */
  activePaneId: string
}

/** Smallest ratio a pane may occupy within its split (resize + normalization floor). */
export const MIN_PANE_RATIO = 0.1

// ─── Actions ───────────────────────────────────────────────────────────────────

/** Discriminated union of pane-tree layout actions. */
export type PaneTreeAction =
  /** Split the given pane in a direction; the new empty pane becomes active. */
  | { type: 'SPLIT_PANE'; payload: { paneId: string; direction: SplitDirection; newPaneId: string } }
  /** Close a pane (and collapse its split); the last remaining pane stays, empty. */
  | { type: 'CLOSE_PANE'; payload: { paneId: string } }
  /** Make a pane the active pane. */
  | { type: 'FOCUS_PANE'; payload: { paneId: string } }
  /** Resize two adjacent children of a split by setting the first child's ratio. */
  | { type: 'RESIZE_SPLIT'; payload: { splitId: string; childIndex: number; ratio: number } }
  /**
   * Dispatch a tab action to a specific pane's tab state. The pane-tree reducer
   * delegates to the existing `tabReducer`; if the action empties the pane, the
   * pane is collapsed (unless it is the last one).
   */
  | { type: 'PANE_TAB_ACTION'; payload: { paneId: string; action: TabAction } }
  /**
   * Move a tab from one pane to another (tab-drag between panes). The tab is
   * removed from the source pane (collapsing it if it empties, unless it is the
   * last pane) and inserted into the target pane at `toIndex` (appended when
   * omitted), where it becomes active. The target pane also becomes the active
   * pane. A no-op when source === target (reordering is a plain tab action).
   */
  | { type: 'MOVE_TAB_TO_PANE'; payload: { fromPaneId: string; toPaneId: string; tabId: string; toIndex?: number } }
  /**
   * Split a pane and place one of its tabs into the freshly-created pane. With
   * `copy: false` (edge-drop) the tab is MOVED — removed from the source — and
   * splitting a single-tab pane is a no-op (nothing would be gained). With
   * `copy: true` (the split command) the tab is DUPLICATED into the new pane so
   * both panes show it, matching Obsidian's "split" — this works even for a
   * single-tab pane. The new pane becomes active.
   */
  | {
      type: 'SPLIT_PANE_WITH_TAB'
      payload: { paneId: string; direction: SplitDirection; newPaneId: string; tabId: string; copy?: boolean }
    }

// ─── Helpers (pure) ──────────────────────────────────────────────────────────

/** Create a fresh empty pane. */
export function createPane(id: string, tabState: TabState = initialTabState): PaneNode {
  return { kind: 'pane', id, tabState }
}

/** Initial single-pane tree. */
export function createInitialPaneTree(paneId: string): PaneTree {
  return { root: createPane(paneId), activePaneId: paneId }
}

/** Find a pane node by id anywhere in the tree. */
export function findPane(tree: PaneTree, paneId: string): PaneNode | null {
  return findPaneIn(tree.root, paneId)
}

function findPaneIn(node: PaneTreeNode, paneId: string): PaneNode | null {
  if (node.kind === 'pane') return node.id === paneId ? node : null
  for (const child of node.children) {
    const found = findPaneIn(child, paneId)
    if (found) return found
  }
  return null
}

/** The active pane's tab state, or null if the active id does not resolve. */
export function getActivePaneTabState(tree: PaneTree): TabState | null {
  return findPane(tree, tree.activePaneId)?.tabState ?? null
}

/** The derived global active tab id (active pane's active tab). */
export function getActiveTabId(tree: PaneTree): string | null {
  return getActivePaneTabState(tree)?.activeTabId ?? null
}

/** List every pane in document order (left-to-right, depth-first). */
export function listPanes(tree: PaneTree): PaneNode[] {
  const out: PaneNode[] = []
  const walk = (node: PaneTreeNode): void => {
    if (node.kind === 'pane') out.push(node)
    else node.children.forEach(walk)
  }
  walk(tree.root)
  return out
}

/**
 * Normalize a split's `sizes` so they sum to 1 and none drops below the floor.
 * Keeps the relative proportions of the non-floored children.
 */
function normalizeSizes(sizes: number[]): number[] {
  const n = sizes.length
  if (n === 0) return []
  // Replace non-finite / non-positive with an equal share, then rescale.
  const cleaned = sizes.map((s) => (Number.isFinite(s) && s > 0 ? s : 1 / n))
  const sum = cleaned.reduce((a, b) => a + b, 0)
  const scaled = cleaned.map((s) => s / sum)
  // Enforce the minimum ratio; redistribute the deficit across the others.
  const floored = scaled.map((s) => Math.max(s, MIN_PANE_RATIO))
  const flooredSum = floored.reduce((a, b) => a + b, 0)
  return floored.map((s) => s / flooredSum)
}

/**
 * Map every node in the tree, replacing nodes the mapper returns a new value
 * for. The mapper returns `null` to signal "remove this node" (used by collapse).
 */
function mapTree(node: PaneTreeNode, fn: (pane: PaneNode) => PaneTreeNode): PaneTreeNode {
  if (node.kind === 'pane') return fn(node)
  return { ...node, children: node.children.map((c) => mapTree(c, fn)) }
}

/**
 * Remove a pane by id, collapsing a split that drops to a single child (the
 * surviving child takes the split's place). Returns the new root, or the
 * unchanged root if the pane was the only node (last pane stays, empty).
 */
function removePane(root: PaneTreeNode, paneId: string): PaneTreeNode {
  if (root.kind === 'pane') return root // last pane: never removed here

  const remove = (node: SplitNode): PaneTreeNode => {
    const kept: PaneTreeNode[] = []
    const keptSizes: number[] = []
    node.children.forEach((child, i) => {
      if (child.kind === 'pane' && child.id === paneId) return // drop it
      const mapped = child.kind === 'split' ? remove(child) : child
      kept.push(mapped)
      keptSizes.push(node.sizes[i] ?? 1 / node.children.length)
    })
    if (kept.length === 1) return kept[0]! // collapse: child replaces split
    return { ...node, children: kept, sizes: normalizeSizes(keptSizes) }
  }

  return remove(root)
}

/** Pick a sensible new active pane after the active one was removed. */
function firstPaneId(node: PaneTreeNode): string {
  let n: PaneTreeNode = node
  while (n.kind === 'split') n = n.children[0]!
  return n.id
}

/**
 * Remove a tab from a tab state WITHOUT recording it in `closedTabsHistory` —
 * a move is not a close, so the entry must not become undo-close material. The
 * active tab falls back to its neighbour, mirroring `tabReducer`'s CLOSE_TAB.
 */
function removeTabFromState(state: TabState, tabId: string): TabState {
  const index = state.tabs.findIndex((t) => t.id === tabId)
  if (index === -1) return state
  const tabs = state.tabs.filter((t) => t.id !== tabId)
  let activeTabId = state.activeTabId
  if (state.activeTabId === tabId) {
    if (tabs.length === 0) activeTabId = null
    else if (index < tabs.length) activeTabId = tabs[index]!.id
    else activeTabId = tabs[index - 1]!.id
  }
  return { ...state, tabs, activeTabId }
}

/**
 * Insert a tab into a tab state at `index` (appended when omitted) and make it
 * active. If a tab with the same id already exists (same file dragged back),
 * it is activated in place rather than duplicated.
 */
function insertTabIntoState(state: TabState, tab: TabEntry, index?: number): TabState {
  if (state.tabs.some((t) => t.id === tab.id)) {
    return { ...state, activeTabId: tab.id }
  }
  const tabs = [...state.tabs]
  const at = index === undefined ? tabs.length : Math.min(Math.max(index, 0), tabs.length)
  tabs.splice(at, 0, tab)
  return { ...state, tabs, activeTabId: tab.id }
}

// ─── Reducer (pure) ──────────────────────────────────────────────────────────

/** Pure reducer for all pane-tree layout transitions. */
export function paneTreeReducer(state: PaneTree, action: PaneTreeAction): PaneTree {
  switch (action.type) {
    case 'FOCUS_PANE': {
      if (!findPane(state, action.payload.paneId)) return state
      if (state.activePaneId === action.payload.paneId) return state
      return { ...state, activePaneId: action.payload.paneId }
    }

    case 'SPLIT_PANE': {
      const { paneId, direction, newPaneId } = action.payload
      const target = findPane(state, paneId)
      if (!target) return state
      const newPane = createPane(newPaneId)

      // Replace the target pane with a split of [target, newPane].
      const root = mapTree(state.root, (pane) => {
        if (pane.id !== paneId) return pane
        const split: SplitNode = {
          kind: 'split',
          id: `split-${newPaneId}`,
          direction,
          children: [pane, newPane],
          sizes: [0.5, 0.5],
        }
        return split
      })
      return { root, activePaneId: newPaneId }
    }

    case 'CLOSE_PANE': {
      const { paneId } = action.payload
      // Last pane: keep it, just clear its tabs (handled by tab actions elsewhere).
      if (state.root.kind === 'pane') return state
      if (!findPane(state, paneId)) return state

      const root = removePane(state.root, paneId)
      const activePaneId =
        state.activePaneId === paneId ? firstPaneId(root) : state.activePaneId
      return { root, activePaneId }
    }

    case 'RESIZE_SPLIT': {
      const { splitId, childIndex, ratio } = action.payload
      const root = resizeSplit(state.root, splitId, childIndex, ratio)
      return root === state.root ? state : { ...state, root }
    }

    case 'PANE_TAB_ACTION': {
      const { paneId, action: tabAction } = action.payload
      const target = findPane(state, paneId)
      if (!target) return state

      const nextTabState = tabReducer(target.tabState, tabAction)
      let root = mapTree(state.root, (pane) =>
        pane.id === paneId ? { ...pane, tabState: nextTabState } : pane,
      )

      // Collapse an emptied pane (unless it is the last one).
      let activePaneId = state.activePaneId
      if (nextTabState.tabs.length === 0 && root.kind === 'split') {
        root = removePane(root, paneId)
        if (activePaneId === paneId) activePaneId = firstPaneId(root)
      }
      return { root, activePaneId }
    }

    case 'MOVE_TAB_TO_PANE': {
      const { fromPaneId, toPaneId, tabId, toIndex } = action.payload
      if (fromPaneId === toPaneId) return state
      const from = findPane(state, fromPaneId)
      const to = findPane(state, toPaneId)
      if (!from || !to) return state
      const moved = from.tabState.tabs.find((t) => t.id === tabId)
      if (!moved) return state

      const fromTabState = removeTabFromState(from.tabState, tabId)
      // If the tab already lives in the target (same deterministic id), just
      // activate it there rather than inserting a duplicate.
      const toTabState = insertTabIntoState(to.tabState, moved, toIndex)

      let root = mapTree(state.root, (pane) => {
        if (pane.id === fromPaneId) return { ...pane, tabState: fromTabState }
        if (pane.id === toPaneId) return { ...pane, tabState: toTabState }
        return pane
      })

      // Collapse the source pane if it emptied (unless it is the last pane).
      const activePaneId = toPaneId
      if (fromTabState.tabs.length === 0 && root.kind === 'split') {
        root = removePane(root, fromPaneId)
      }
      return { root, activePaneId }
    }

    case 'SPLIT_PANE_WITH_TAB': {
      const { paneId, direction, newPaneId, tabId, copy = false } = action.payload
      const source = findPane(state, paneId)
      if (!source) return state
      const moved = source.tabState.tabs.find((t) => t.id === tabId)
      if (!moved) return state
      // MOVE mode: splitting a single-tab pane to relocate its only tab gains
      // nothing. COPY mode (the split command) duplicates, so it is allowed.
      if (!copy && source.tabState.tabs.length <= 1) return state

      const sourceTabState = copy ? source.tabState : removeTabFromState(source.tabState, tabId)
      const newPaneTabState: TabState = {
        tabs: [moved],
        activeTabId: moved.id,
        closedTabsHistory: [],
      }
      const newPane = createPane(newPaneId, newPaneTabState)

      const root = mapTree(state.root, (pane) => {
        if (pane.id !== paneId) return pane
        const updatedSource: PaneNode = { ...pane, tabState: sourceTabState }
        const split: SplitNode = {
          kind: 'split',
          id: `split-${newPaneId}`,
          direction,
          children: [updatedSource, newPane],
          sizes: [0.5, 0.5],
        }
        return split
      })
      return { root, activePaneId: newPaneId }
    }

    default:
      return state
  }
}

/** Set child `childIndex`'s ratio within the split `splitId`, rebalancing. */
function resizeSplit(
  node: PaneTreeNode,
  splitId: string,
  childIndex: number,
  ratio: number,
): PaneTreeNode {
  if (node.kind === 'pane') return node
  if (node.id === splitId) {
    if (childIndex < 0 || childIndex >= node.sizes.length) return node
    const clamped = Math.min(Math.max(ratio, MIN_PANE_RATIO), 1 - MIN_PANE_RATIO)
    // Distribute the remaining space across the other children proportionally.
    const others = node.sizes.filter((_, i) => i !== childIndex)
    const othersSum = others.reduce((a, b) => a + b, 0) || 1
    const remaining = 1 - clamped
    const sizes = node.sizes.map((s, i) =>
      i === childIndex ? clamped : (s / othersSum) * remaining,
    )
    return { ...node, sizes: normalizeSizes(sizes) }
  }
  return { ...node, children: node.children.map((c) => resizeSplit(c, splitId, childIndex, ratio)) }
}


// ─── Persistence (pure serialize / parse / migrate) ───────────────────────────

/**
 * Persisted tab entry — the minimal metadata needed to rebuild a tab on
 * restore. Content/buffers are deliberately omitted (re-fetched from the
 * server on restore), mirroring `PersistedTab` in `workspaceStore`.
 */
export interface PersistedPaneTab {
  vaultId: string
  filePath: string
  fileName: string
  mode: TabMode
  pinned: boolean
  /** Plugin-view icon, preserved for `__view::` tabs. */
  icon?: string
}

/** Persisted pane leaf. */
export interface PersistedPaneNode {
  kind: 'pane'
  id: string
  tabs: PersistedPaneTab[]
  activeTabId: string | null
}

/** Persisted split node. */
export interface PersistedSplitNode {
  kind: 'split'
  id: string
  direction: SplitDirection
  children: PersistedPaneTreeNode[]
  sizes: number[]
}

/** A persisted pane-tree node. */
export type PersistedPaneTreeNode = PersistedPaneNode | PersistedSplitNode

/** Full persisted pane-tree layout. */
export interface PersistedPaneTree {
  root: PersistedPaneTreeNode
  activePaneId: string
}

/** Serialize one tab entry to its persisted (content-free) shape. */
function serializeTab(tab: TabEntry): PersistedPaneTab {
  const persisted: PersistedPaneTab = {
    vaultId: tab.vaultId,
    filePath: tab.filePath,
    fileName: tab.fileName,
    mode: tab.mode,
    pinned: tab.pinned,
  }
  if (tab.icon !== undefined) persisted.icon = tab.icon
  return persisted
}

/** Serialize a live pane-tree node to its persisted shape. */
function serializeNode(node: PaneTreeNode): PersistedPaneTreeNode {
  if (node.kind === 'pane') {
    return {
      kind: 'pane',
      id: node.id,
      tabs: node.tabState.tabs.map(serializeTab),
      activeTabId: node.tabState.activeTabId,
    }
  }
  return {
    kind: 'split',
    id: node.id,
    direction: node.direction,
    children: node.children.map(serializeNode),
    sizes: node.sizes,
  }
}

/** Serialize a live pane tree to its persisted (content-free) shape. */
export function serializePaneTree(tree: PaneTree): PersistedPaneTree {
  return { root: serializeNode(tree.root), activePaneId: tree.activePaneId }
}

/**
 * Rehydrate a persisted tab into a full `TabEntry`. Content is empty until the
 * restore effect fetches it (`loading: true`), so a freshly restored tab is
 * visually in its loading state, exactly as an opened-then-fetched tab is.
 */
function rehydrateTab(tab: PersistedPaneTab): TabEntry {
  const entry: TabEntry = {
    id: generateTabId(tab.vaultId, tab.filePath),
    vaultId: tab.vaultId,
    filePath: tab.filePath,
    fileName: tab.fileName,
    mode: tab.mode,
    isBinary: false,
    content: '',
    editBuffer: null,
    loading: true,
    error: null,
    pinned: tab.pinned,
  }
  if (tab.icon !== undefined) entry.icon = tab.icon
  return entry
}

/** Rehydrate a persisted node into a live pane-tree node. */
function rehydrateNode(node: PersistedPaneTreeNode): PaneTreeNode {
  if (node.kind === 'pane') {
    const tabs = node.tabs.map(rehydrateTab)
    const activeTabId =
      node.activeTabId !== null && tabs.some((t) => t.id === node.activeTabId)
        ? node.activeTabId
        : (tabs[0]?.id ?? null)
    return { kind: 'pane', id: node.id, tabState: { tabs, activeTabId, closedTabsHistory: [] } }
  }
  return {
    kind: 'split',
    id: node.id,
    direction: node.direction,
    children: node.children.map(rehydrateNode),
    sizes: normalizeSizes(node.sizes),
  }
}

/** Rehydrate a persisted pane tree into a live `PaneTree` (loading tabs). */
export function rehydratePaneTree(persisted: PersistedPaneTree): PaneTree {
  const root = rehydrateNode(persisted.root)
  const activePaneId = findPaneIn(root, persisted.activePaneId)
    ? persisted.activePaneId
    : firstPaneId(root)
  return { root, activePaneId }
}

/**
 * Migrate the legacy flat tab list (persisted before Split Panes existed) into
 * a single-pane persisted tree. The flat `activeTabId` becomes the pane's
 * active tab. Called when no `paneTree` field is present in persisted state.
 */
export function migrateFlatTabsToPaneTree(
  tabs: PersistedPaneTab[],
  activeTabId: string | null,
  paneId: string,
): PersistedPaneTree {
  return {
    root: { kind: 'pane', id: paneId, tabs, activeTabId },
    activePaneId: paneId,
  }
}

/** True iff a value is a non-null object. */
function isObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object'
}

/** Leniently parse one persisted tab, or null if it is unusable. */
function parsePersistedTab(data: unknown): PersistedPaneTab | null {
  if (!isObject(data)) return null
  if (typeof data.vaultId !== 'string') return null
  if (typeof data.filePath !== 'string') return null
  if (typeof data.fileName !== 'string') return null
  if (data.mode !== 'edit' && data.mode !== 'view') return null
  const tab: PersistedPaneTab = {
    vaultId: data.vaultId,
    filePath: data.filePath,
    fileName: data.fileName,
    mode: data.mode,
    pinned: typeof data.pinned === 'boolean' ? data.pinned : false,
  }
  if (typeof data.icon === 'string') tab.icon = data.icon
  return tab
}

/**
 * Leniently parse a persisted pane-tree node. Returns null when the node is
 * structurally unusable; a split that loses all children collapses to null so
 * the caller falls back to a single pane.
 */
function parsePersistedNode(data: unknown): PersistedPaneTreeNode | null {
  if (!isObject(data)) return null

  if (data.kind === 'pane') {
    if (typeof data.id !== 'string') return null
    const rawTabs = Array.isArray(data.tabs) ? data.tabs : []
    const tabs = rawTabs
      .map(parsePersistedTab)
      .filter((t): t is PersistedPaneTab => t !== null)
    const activeTabId =
      typeof data.activeTabId === 'string' && tabs.some((t) => generateTabId(t.vaultId, t.filePath) === data.activeTabId)
        ? data.activeTabId
        : null
    return { kind: 'pane', id: data.id, tabs, activeTabId }
  }

  if (data.kind === 'split') {
    if (typeof data.id !== 'string') return null
    if (data.direction !== 'horizontal' && data.direction !== 'vertical') return null
    const rawChildren = Array.isArray(data.children) ? data.children : []
    const children = rawChildren
      .map(parsePersistedNode)
      .filter((c): c is PersistedPaneTreeNode => c !== null)
    if (children.length === 0) return null
    if (children.length === 1) return children[0]! // collapse a split that lost siblings
    const rawSizes = Array.isArray(data.sizes) ? data.sizes : []
    const sizes =
      rawSizes.length === children.length && rawSizes.every((s) => typeof s === 'number')
        ? (rawSizes as number[])
        : children.map(() => 1 / children.length)
    return { kind: 'split', id: data.id, direction: data.direction, children, sizes }
  }

  return null
}

/**
 * Leniently parse a persisted pane tree. Returns null when it is missing or
 * unusable, so the caller can fall back to migration or a fresh single pane.
 */
export function parsePersistedPaneTree(data: unknown): PersistedPaneTree | null {
  if (!isObject(data)) return null
  const root = parsePersistedNode(data.root)
  if (!root) return null
  const activePaneId = typeof data.activePaneId === 'string' ? data.activePaneId : firstPaneId(rehydrateNode(root))
  return { root, activePaneId }
}
