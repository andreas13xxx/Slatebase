/**
 * Mirrors Slatebase's pane tree (`state/paneTreeState.ts`) into Obsidian's
 * layout model, for `workspace.rootSplit`, `leaf.parent` and
 * `workspace.getLayout()`.
 *
 * Mapping: a `SplitNode` becomes a `WorkspaceSplit`, a `PaneNode` (one tab row)
 * becomes a `WorkspaceTabs`. Directions are translated, because Obsidian names
 * the divider (`'vertical'` = side by side) while Slatebase names the
 * arrangement (`'horizontal'` = side by side).
 *
 * Known limit: Slatebase has a `WorkspaceLeaf` object only for plugin-view tabs
 * and for the active file tab, not for every open file tab. `WorkspaceTabs.children`
 * therefore lists just those leaves; `getLayout()` is built from the tab state
 * itself and lists every tab.
 *
 * @module pane-layout
 */

import type { PaneTree, PaneTreeNode, SplitDirection } from '../../state/paneTreeState'
import type { TabEntry } from '../../state/tabState'
import { WorkspaceSplit, WorkspaceTabs, type WorkspaceItem, type WorkspaceLeaf, type WorkspaceParent } from './view-registry'

/** Tab path prefix of plugin-view tabs (`__view::<viewType>`). */
export const VIEW_TAB_PREFIX = '__view::'

/** Slatebase split direction → Obsidian's (which names the divider). */
export function paneToObsidianDirection(direction: SplitDirection): 'vertical' | 'horizontal' {
  return direction === 'horizontal' ? 'vertical' : 'horizontal'
}

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif'])
const AUDIO_EXTENSIONS = new Set(['mp3', 'wav', 'ogg', 'm4a', 'flac', 'webm'])
const VIDEO_EXTENSIONS = new Set(['mp4', 'mov', 'mkv', 'ogv'])

/** Obsidian view type a tab corresponds to (`markdown`, `canvas`, a plugin view type, …). */
export function viewTypeForTab(tab: Pick<TabEntry, 'filePath'>): string {
  const path = tab.filePath
  if (path.startsWith(VIEW_TAB_PREFIX)) return path.slice(VIEW_TAB_PREFIX.length)
  if (path === '__graph__') return 'graph'
  const ext = path.includes('.') ? path.slice(path.lastIndexOf('.') + 1).toLowerCase() : ''
  if (ext === 'md') return 'markdown'
  if (ext === 'canvas') return 'canvas'
  if (ext === 'base') return 'bases'
  if (ext === 'pdf') return 'pdf'
  if (IMAGE_EXTENSIONS.has(ext)) return 'image'
  if (AUDIO_EXTENSIONS.has(ext)) return 'audio'
  if (VIDEO_EXTENSIONS.has(ext)) return 'video'
  return 'markdown'
}

/** Resolves the leaf object (if any) that represents one tab of one pane. */
export type LeafForTab = (tab: TabEntry, context: { paneId: string; isActivePane: boolean; isActiveTab: boolean }) => WorkspaceLeaf | null

/**
 * Rebuild `root`'s subtree from `tree`, in place (so `workspace.rootSplit` keeps
 * its identity), and point every resolved leaf's `parent` at its tab group.
 *
 * @param previouslyParented - leaves that had a parent from the last mirror;
 *        any not placed this time get `parent = null`
 * @returns the leaves placed this time (pass back in as `previouslyParented`)
 */
export function mirrorPaneTree(
  root: WorkspaceSplit,
  tree: PaneTree,
  leafForTab: LeafForTab,
  previouslyParented: ReadonlySet<WorkspaceLeaf>,
): Set<WorkspaceLeaf> {
  const placed = new Set<WorkspaceLeaf>()

  const buildTabs = (node: Extract<PaneTreeNode, { kind: 'pane' }>, parent: WorkspaceParent): WorkspaceTabs => {
    const group = new WorkspaceTabs()
    group.parent = parent
    const isActivePane = node.id === tree.activePaneId
    for (const tab of node.tabState.tabs) {
      const isActiveTab = tab.id === node.tabState.activeTabId
      const leaf = leafForTab(tab, { paneId: node.id, isActivePane, isActiveTab })
      if (!leaf || placed.has(leaf)) continue
      leaf.parent = group
      placed.add(leaf)
      if (isActiveTab) group.currentTab = group.children.length
      group.children.push(leaf)
    }
    return group
  }

  const build = (node: PaneTreeNode, parent: WorkspaceParent): WorkspaceItem => {
    if (node.kind === 'pane') return buildTabs(node, parent)
    const split = new WorkspaceSplit()
    split.parent = parent
    split.direction = paneToObsidianDirection(node.direction)
    split.children = node.children.map((child) => build(child, split))
    return split
  }

  if (tree.root.kind === 'split') {
    root.direction = paneToObsidianDirection(tree.root.direction)
    root.children = tree.root.children.map((child) => build(child, root))
  } else {
    root.direction = 'vertical'
    root.children = [buildTabs(tree.root, root)]
  }

  for (const leaf of previouslyParented) {
    if (!placed.has(leaf) && leaf.location === 'main') leaf.parent = null
  }
  return placed
}

/**
 * Serializable layout in the shape of Obsidian's `workspace.getLayout().main`:
 * nested `split`/`tabs`/`leaf` nodes, one `leaf` per open tab.
 */
export function buildLayoutJson(tree: PaneTree): Record<string, unknown> {
  const node = (n: PaneTreeNode): Record<string, unknown> => {
    if (n.kind === 'split') {
      return {
        id: n.id,
        type: 'split',
        direction: paneToObsidianDirection(n.direction),
        children: n.children.map(node),
      }
    }
    const activeIndex = n.tabState.tabs.findIndex((t) => t.id === n.tabState.activeTabId)
    return {
      id: n.id,
      type: 'tabs',
      ...(activeIndex > 0 ? { currentTab: activeIndex } : {}),
      children: n.tabState.tabs.map((tab) => ({
        id: tab.id,
        type: 'leaf',
        ...(tab.pinned ? { pinned: true } : {}),
        state: {
          type: viewTypeForTab(tab),
          // Obsidian's markdown modes: 'source' (editing) / 'preview' (reading).
          state: tab.filePath.startsWith('__') ? {} : { file: tab.filePath, mode: tab.mode === 'view' ? 'preview' : 'source' },
        },
      })),
    }
  }

  const main = node(tree.root)
  // Obsidian's `main` is always a split; wrap a lone tab group like it does.
  return {
    main: main['type'] === 'split' ? main : { id: 'root', type: 'split', direction: 'vertical', children: [main] },
    active: findActiveTabId(tree),
  }
}

/**
 * Structural fingerprint of a pane tree: splits, panes and their tab ids. Not
 * tab content (an edit is no layout change) and not the active pane/tab
 * (switching is Obsidian's 'active-leaf-change', not 'layout-change').
 */
export function paneLayoutSignature(tree: PaneTree): string {
  const node = (n: PaneTreeNode): string =>
    n.kind === 'split'
      ? `${n.direction}(${n.children.map(node).join(',')})`
      : `${n.id}[${n.tabState.tabs.map((t) => t.id).join('|')}]`
  return node(tree.root)
}

function findActiveTabId(tree: PaneTree): string | null {
  const visit = (n: PaneTreeNode): string | null => {
    if (n.kind === 'pane') return n.id === tree.activePaneId ? n.tabState.activeTabId : null
    for (const child of n.children) {
      const found = visit(child)
      if (found) return found
    }
    return null
  }
  return visit(tree.root)
}
