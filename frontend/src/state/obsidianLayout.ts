/**
 * Obsidian's layout tree ↔ Slatebase's pane tree, for the saved layouts in `.obsidian/workspaces.json`.
 *
 * Obsidian describes a layout as nested nodes (the shape of its workspace.json):
 *
 *   split  { id, type: 'split', direction: 'vertical' | 'horizontal', children: [...] }
 *   tabs   { id, type: 'tabs', currentTab: <index>, children: [leaf, ...] }
 *   leaf   { id, type: 'leaf', pinned?: true, state: { type: 'markdown', state: { file, mode, ... } } }
 *
 * Its `vertical` means panes side by side ("Split right"), which is Slatebase's `horizontal`. A leaf
 * Slatebase has no equivalent for (a side panel, a view of a plugin it does not have) is skipped and
 * counted; it stays in the file because the file is only ever replaced layout by layout. Tabs of another
 * vault have no place in this vault's file and are left out of the Obsidian tree (the Slatebase snapshot
 * stored beside it keeps them).
 */
import type { PersistedPaneNode, PersistedPaneTab, PersistedPaneTree, PersistedPaneTreeNode, SplitDirection } from './paneTreeState'
import { generatePaneId } from './paneTreeState'

type Json = Record<string, unknown>

const GRAPH_PATH = '__graph__'

const VIEW_TYPE_BY_EXTENSION: Record<string, string> = {
  md: 'markdown',
  canvas: 'canvas',
  base: 'bases',
  pdf: 'pdf',
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', svg: 'image', webp: 'image', bmp: 'image', avif: 'image',
  mp3: 'audio', wav: 'audio', ogg: 'audio', m4a: 'audio', flac: 'audio',
  mp4: 'video', webm: 'video', mov: 'video', mkv: 'video',
}

const FILE_VIEW_TYPES: ReadonlySet<string> = new Set(['markdown', 'canvas', 'bases', 'pdf', 'image', 'audio', 'video'])

function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** An Obsidian-style node id: 16 hex characters. */
function nodeId(): string {
  const bytes = new Uint8Array(8)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(bytes)
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

function basename(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1)
}

function extension(path: string): string {
  const name = basename(path)
  const dot = name.lastIndexOf('.')
  return dot === -1 ? '' : name.slice(dot + 1).toLowerCase()
}

// ─── Slatebase → Obsidian ────────────────────────────────────────────────────

function tabToLeaf(tab: PersistedPaneTab, vaultId: string): Json | null {
  if (tab.vaultId !== vaultId) return null
  let state: Json
  if (tab.filePath === GRAPH_PATH) {
    state = { type: 'graph', state: {}, title: 'Graph view' }
  } else if (tab.filePath.startsWith('__')) {
    return null // a virtual tab (plugin view, web viewer, …) has no counterpart
  } else {
    const type = VIEW_TYPE_BY_EXTENSION[extension(tab.filePath)]
    if (!type) return null
    const fileState: Json = { file: tab.filePath }
    if (type === 'markdown') {
      fileState['mode'] = tab.mode === 'edit' ? 'source' : 'preview'
      fileState['source'] = false
    }
    state = { type, state: fileState, title: basename(tab.filePath).replace(/\.[^.]+$/, '') }
  }
  const leaf: Json = { id: nodeId(), type: 'leaf', state }
  if (tab.pinned) leaf['pinned'] = true
  return leaf
}

function nodeToObsidian(node: PersistedPaneTreeNode, vaultId: string, activePaneId: string, out: { active: string; files: string[] }): Json {
  if (node.kind === 'pane') {
    const leaves: Json[] = []
    let currentTab = 0
    for (const tab of node.tabs) {
      const leaf = tabToLeaf(tab, vaultId)
      if (!leaf) continue
      if (`${tab.vaultId}::${tab.filePath}` === node.activeTabId || (node.activeTabId === null && leaves.length === 0)) currentTab = leaves.length
      leaves.push(leaf)
      const file = (leaf['state'] as Json)['state'] as Json
      if (typeof file['file'] === 'string') out.files.push(file['file'])
    }
    const tabs: Json = { id: nodeId(), type: 'tabs', children: leaves, currentTab }
    if (node.id === activePaneId && leaves.length > 0) out.active = (leaves[currentTab] as Json)['id'] as string
    return tabs
  }
  const direction = node.direction === 'horizontal' ? 'vertical' : 'horizontal'
  return {
    id: nodeId(),
    type: 'split',
    children: node.children.map((child) => nodeToObsidian(child, vaultId, activePaneId, out)),
    direction,
  }
}

/** The Obsidian layout for a pane tree: `main`, the id of the active leaf, and the files that are open. */
export function paneTreeToObsidian(tree: PersistedPaneTree, vaultId: string): { main: Json; active: string; lastOpenFiles: string[] } {
  const out = { active: '', files: [] as string[] }
  const root = nodeToObsidian(tree.root, vaultId, tree.activePaneId, out)
  // Obsidian's main area is a split; wrap a single tab group in one
  const main: Json = root['type'] === 'split' ? root : { id: nodeId(), type: 'split', children: [root], direction: 'vertical' }
  return { main, active: out.active, lastOpenFiles: [...new Set(out.files)].slice(0, 20) }
}

// ─── Obsidian → Slatebase ────────────────────────────────────────────────────

function leafToTab(leaf: Json, vaultId: string): PersistedPaneTab | null {
  const view = isObject(leaf['state']) ? leaf['state'] : null
  const type = view && typeof view['type'] === 'string' ? view['type'] : null
  if (!view || !type) return null
  const inner = isObject(view['state']) ? view['state'] : {}
  const pinned = leaf['pinned'] === true
  if (type === 'graph') return { vaultId, filePath: GRAPH_PATH, fileName: 'Graph', mode: 'view', pinned }
  if (!FILE_VIEW_TYPES.has(type) || typeof inner['file'] !== 'string' || inner['file'] === '') return null
  const filePath = inner['file']
  if (filePath.startsWith('/') || filePath.split('/').some((segment) => segment === '..')) return null
  return {
    vaultId,
    filePath,
    fileName: basename(filePath),
    mode: type === 'markdown' && inner['mode'] === 'source' ? 'edit' : 'view',
    pinned,
  }
}

interface ReadState { skipped: number }

function nodeFromObsidian(node: unknown, vaultId: string, state: ReadState): PersistedPaneTreeNode | null {
  if (!isObject(node)) {
    state.skipped++
    return null
  }
  if (node['type'] === 'tabs' || node['type'] === 'leaf') {
    const leaves = node['type'] === 'leaf' ? [node] : Array.isArray(node['children']) ? node['children'] : []
    const tabs: PersistedPaneTab[] = []
    const kept: number[] = []
    leaves.forEach((leaf, index) => {
      const tab = isObject(leaf) ? leafToTab(leaf, vaultId) : null
      if (tab) {
        tabs.push(tab)
        kept.push(index)
      } else {
        state.skipped++
      }
    })
    const current = typeof node['currentTab'] === 'number' ? node['currentTab'] : 0
    const currentTab = tabs[Math.max(0, kept.indexOf(current))]
    const pane: PersistedPaneNode = {
      kind: 'pane',
      id: generatePaneId(),
      tabs,
      activeTabId: currentTab ? `${currentTab.vaultId}::${currentTab.filePath}` : null,
    }
    return pane
  }
  if (node['type'] === 'split') {
    const children = (Array.isArray(node['children']) ? node['children'] : [])
      .map((child) => nodeFromObsidian(child, vaultId, state))
      .filter((child): child is PersistedPaneTreeNode => child !== null)
    if (children.length === 0) return null
    if (children.length === 1) return children[0]!
    const direction: SplitDirection = node['direction'] === 'horizontal' ? 'vertical' : 'horizontal'
    return { kind: 'split', id: generatePaneId(), direction, children, sizes: children.map(() => 1 / children.length) }
  }
  state.skipped++
  return null
}

/**
 * The pane tree for an Obsidian layout's `main` tree, or null if nothing in it can be shown. `skipped` counts
 * the leaves and nodes Slatebase cannot show; they stay in the file.
 */
export function obsidianToPaneTree(main: unknown, vaultId: string): { tree: PersistedPaneTree; skipped: number } | null {
  const state: ReadState = { skipped: 0 }
  const root = nodeFromObsidian(main, vaultId, state)
  if (!root) return null
  const firstPane = (node: PersistedPaneTreeNode): PersistedPaneNode => (node.kind === 'pane' ? node : firstPane(node.children[0]!))
  return { tree: { root, activePaneId: firstPane(root).id }, skipped: state.skipped }
}
