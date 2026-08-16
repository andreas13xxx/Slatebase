/**
 * core-commands-app — Obsidian's built-in commands that need app-level context.
 *
 * `core-commands.ts` covers `editor:*` commands that only touch document text via
 * `IEditor`. Everything else — tab management (`workspace:*`), the file tree
 * (`file-explorer:*`), app chrome (`app:*`, `theme:*`), Graph/Canvas/Daily Notes,
 * and the side panels (outline/backlinks/tags/bookmarks/search) — needs access to
 * Slatebase's own React state (tabs, the API client, the context/sidebar panels),
 * which only exists inside the component tree, not the vault-scoped plugin shims.
 *
 * `CommandPaletteContainer` is where that state already lives (it's also where the
 * user-facing `slatebase:*` palette commands are built), so it calls
 * `registerCoreAppCommands` once and keeps it fed with fresh state via a ref —
 * see that component for the wiring.
 *
 * Where Slatebase has no equivalent feature at all (native window management,
 * PDF export, a quick-switcher, Obsidian's Bases tables, ...), the command is
 * still registered, as a literal no-op — see core-commands.ts's docstring for why.
 *
 * @module core-commands-app
 */

import type { Dispatch } from 'react'
import { openSearchPanel } from '@codemirror/search'
import type { EditorView } from '@codemirror/view'
import type { ICommandRegistry } from './command-registry'
import type { IEditor } from './editor-shim'
import type { IApiClient } from '../../api'
import type { AppAction } from '../../types'
import type { TabState, TabAction, TabEntry } from '../../state/tabState'
import { openTab, saveTab } from '../../state/tabActions'
import type { AuthState, AuthAction } from '../../state/authState'
import type { ContextPanelAction, ContextPanelViewId, SplitSection as ContextPanelSection } from '../../state/contextPanelState'
import type { SidebarPanelAction, SidebarViewId, SidebarSplitSection as SidebarPanelSection } from '../../state/sidebarPanelState'
import type { SettingsCategory, SettingsSection } from '../../state/settingsState'
import { favoritesStore } from '../../state/favoritesStore'
import { getActiveEditorView } from '../../editor/plugin-extensions'
import { showToast } from '../../components/ToastNotification'
import type { Locale } from '../../i18n'
import { translateCoreCommandName } from './core-command-i18n'

/** Pages the CommandPalette / core commands can navigate to (mirrors CommandPaletteContainer's NavigablePage). */
export type NavigablePage =
  | 'profile' | 'sessions' | 'chat' | 'mcp-tokens'
  | 'admin-users' | 'admin-vaults' | 'admin-config' | 'admin-audit' | 'admin-logs'
  | 'trash' | 'plugins'

/** All the app-level state and callbacks core commands outside `editor:*` need. */
export interface CoreAppCommandHandlers {
  vaultId: string | null
  vaultName: string
  apiClient: IApiClient
  tabState: TabState
  tabDispatch: Dispatch<TabAction>
  appDispatch: Dispatch<AppAction>
  authState: AuthState
  authDispatch: Dispatch<AuthAction>
  showSidebar: boolean
  showRightPanel: boolean
  contextPanelSections: ContextPanelSection[]
  contextPanelDispatch: Dispatch<ContextPanelAction>
  sidebarPanelSections: SidebarPanelSection[]
  sidebarPanelDispatch: Dispatch<SidebarPanelAction>
  onToggleSidebar: () => void
  onToggleRightPanel: () => void
  onOpenSettings: (nav?: { category: SettingsCategory; section: SettingsSection }) => void
  onNavigate: (page: NavigablePage) => void
  onCreateFile: () => void
  onCreateFolder: () => void
  onCreateCanvas: () => void
  onOpenGraph: () => void
  onDailyNote: () => void
  onOpenTemplateSelector: () => void
  onNavigateBack: () => void
  onNavigateForward: () => void
  onOpenQuickSwitcher: () => void
  /** Current vault-search panel query/flags, for `bookmarks:bookmark-current-search`. */
  searchQuery: string
  searchCaseSensitive: boolean
  searchRegex: boolean
}

function getActiveTab(h: CoreAppCommandHandlers): TabEntry | null {
  return h.tabState.tabs.find((t) => t.id === h.tabState.activeTabId) ?? null
}

function refreshTree(h: CoreAppCommandHandlers): void {
  if (!h.vaultId) return
  const vaultId = h.vaultId
  h.apiClient.fetchVaultTree(vaultId).then(
    (tree) => h.appDispatch({ type: 'VAULT_TREE_LOADED', payload: { vaultId, tree } }),
    () => { /* ignore — tree stays stale until the next successful refresh */ },
  )
}

// ─── Tabs (workspace:*) ─────────────────────────────────────────────────────

function closeTab(h: CoreAppCommandHandlers): void {
  const tab = getActiveTab(h)
  if (tab) h.tabDispatch({ type: 'CLOSE_TAB', payload: { tabId: tab.id } })
}

function closeOtherTabs(h: CoreAppCommandHandlers): void {
  const activeId = h.tabState.activeTabId
  for (const tab of h.tabState.tabs) {
    if (tab.id !== activeId) h.tabDispatch({ type: 'CLOSE_TAB', payload: { tabId: tab.id } })
  }
}

function activateTabByOffset(h: CoreAppCommandHandlers, offset: number): void {
  const { tabs, activeTabId } = h.tabState
  if (tabs.length === 0) return
  const currentIndex = tabs.findIndex((t) => t.id === activeTabId)
  const nextIndex = ((currentIndex === -1 ? 0 : currentIndex) + offset + tabs.length) % tabs.length
  h.tabDispatch({ type: 'ACTIVATE_TAB', payload: { tabId: tabs[nextIndex]!.id } })
}

function activateTabByIndex(h: CoreAppCommandHandlers, index: number): void {
  const tab = h.tabState.tabs[index]
  if (tab) h.tabDispatch({ type: 'ACTIVATE_TAB', payload: { tabId: tab.id } })
}

async function copyToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
  } catch { /* clipboard unavailable (insecure context / permissions) — nothing more we can do */ }
}

async function renameActiveFile(h: CoreAppCommandHandlers): Promise<void> {
  const tab = getActiveTab(h)
  if (!tab || !h.vaultId) return
  const dir = tab.filePath.includes('/') ? tab.filePath.slice(0, tab.filePath.lastIndexOf('/') + 1) : ''
  const next = window.prompt('Rename file', tab.fileName)
  if (next === null || next.trim() === '') return
  const newPath = `${dir}${next.trim()}`
  try {
    await h.apiClient.moveContent(h.vaultId, tab.filePath, newPath)
    h.tabDispatch({ type: 'UPDATE_TAB_PATHS', payload: { oldPathPrefix: tab.filePath, newPathPrefix: newPath } })
    refreshTree(h)
  } catch { /* ignore — surfaced to the user only via the FileExplorer's own rename UI today */ }
}

// ─── File explorer ──────────────────────────────────────────────────────────

function ensureSidebarVisible(h: CoreAppCommandHandlers): void {
  if (!h.showSidebar) h.onToggleSidebar()
}

function setSidebarPanelView(h: CoreAppCommandHandlers, viewId: SidebarViewId): void {
  ensureSidebarVisible(h)
  const section = h.sidebarPanelSections.find((s) => s.viewIds.includes(viewId))
  if (section) h.sidebarPanelDispatch({ type: 'SET_ACTIVE_VIEW', sectionId: section.id, viewId })
}

function revealActiveFile(h: CoreAppCommandHandlers): void {
  const tab = getActiveTab(h)
  if (!tab) return
  setSidebarPanelView(h, 'explorer')
  window.dispatchEvent(new CustomEvent('slatebase:reveal-file', { detail: { path: tab.filePath } }))
}

async function duplicateActiveFile(h: CoreAppCommandHandlers): Promise<void> {
  const tab = getActiveTab(h)
  if (!tab || !h.vaultId) return
  const lastSlash = tab.filePath.lastIndexOf('/')
  const dir = lastSlash >= 0 ? tab.filePath.slice(0, lastSlash + 1) : ''
  const nameOnly = tab.filePath.slice(dir.length)
  const dotIndex = nameOnly.lastIndexOf('.')
  const base = dotIndex > 0 ? nameOnly.slice(0, dotIndex) : nameOnly
  const ext = dotIndex > 0 ? nameOnly.slice(dotIndex) : ''
  const newPath = `${dir}${base}-Kopie${ext}`
  try {
    const { content } = await h.apiClient.fetchFileContent(h.vaultId, tab.filePath)
    await h.apiClient.saveFile(h.vaultId, newPath, content)
    refreshTree(h)
  } catch { /* ignore */ }
}

async function moveActiveFile(h: CoreAppCommandHandlers): Promise<void> {
  const tab = getActiveTab(h)
  if (!tab || !h.vaultId) return
  const destination = window.prompt('Move to folder (vault-relative path, empty for vault root)', '')
  if (destination === null) return
  const fileName = tab.filePath.split('/').pop() ?? tab.filePath
  const newPath = destination.trim() ? `${destination.trim().replace(/\/$/, '')}/${fileName}` : fileName
  try {
    await h.apiClient.moveContent(h.vaultId, tab.filePath, newPath)
    h.tabDispatch({ type: 'UPDATE_TAB_PATHS', payload: { oldPathPrefix: tab.filePath, newPathPrefix: newPath } })
    refreshTree(h)
  } catch { /* ignore */ }
}

async function deleteActiveFile(h: CoreAppCommandHandlers): Promise<void> {
  const tab = getActiveTab(h)
  if (!tab || !h.vaultId) return
  if (!window.confirm(`"${tab.fileName}" löschen?`)) return
  try {
    await h.apiClient.deleteContent(h.vaultId, tab.filePath)
    h.tabDispatch({ type: 'CLOSE_TABS_BY_PATH', payload: { pathPrefix: tab.filePath } })
    refreshTree(h)
  } catch { /* ignore */ }
}

// ─── Theme ───────────────────────────────────────────────────────────────────

async function cycleTheme(h: CoreAppCommandHandlers, options: Array<'light' | 'dark' | 'system'>): Promise<void> {
  const current = h.authState.user?.colorScheme ?? 'system'
  const index = options.indexOf(current)
  const next = options[(index + 1) % options.length]!
  try {
    const updatedUser = await h.apiClient.updateProfile({ colorScheme: next })
    h.authDispatch({ type: 'PROFILE_UPDATED', payload: { user: updatedUser } })
  } catch { /* ignore — theme stays as-is until the next successful save */ }
}

// ─── Side panels (outline/backlinks/tags/bookmarks) ────────────────────────

function ensureRightPanelVisible(h: CoreAppCommandHandlers): void {
  if (!h.showRightPanel) h.onToggleRightPanel()
}

function setContextPanelView(h: CoreAppCommandHandlers, viewId: ContextPanelViewId): void {
  ensureRightPanelVisible(h)
  const section = h.contextPanelSections.find((s) => s.viewIds.includes(viewId))
  if (section) h.contextPanelDispatch({ type: 'SET_ACTIVE_VIEW', sectionId: section.id, viewId })
}

// ─── Follow link (editor:follow-link / open-link-in-new-*) ────────────────
// No split-pane or popout-window support exists (see workspace:* no-ops below),
// so "open in new tab/split/window" all degenerate to the same "open in a tab".

function followLink(h: CoreAppCommandHandlers, editor: IEditor): void {
  const cursor = editor.getCursor('head')
  const line = editor.getLine(cursor.line)
  let target: string | null = null

  for (const re of [/\[\[([^\]|#]+)[^\]]*\]\]/g, /\[[^\]]*\]\(([^)]+)\)/g]) {
    re.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = re.exec(line))) {
      if (cursor.ch >= match.index && cursor.ch <= match.index + match[0].length) {
        target = match[1]!.trim()
        break
      }
    }
    if (target) break
  }
  if (!target) return

  if (/^https?:\/\//.test(target)) {
    window.open(target, '_blank', 'noopener,noreferrer')
    return
  }
  if (!h.vaultId) return
  const filePath = /\.[a-zA-Z0-9]+$/.test(target) ? target : `${target}.md`
  const fileName = filePath.split('/').pop() ?? filePath
  void openTab(h.tabDispatch, h.appDispatch, h.apiClient, h.vaultId, filePath, fileName)
}

// ─── Insert current date/time (unprefixed core "Templates" commands) ──────

function insertCurrentDate(editor: IEditor): void {
  const now = new Date()
  const formatted = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  editor.replaceSelection(formatted)
}

function insertCurrentTime(editor: IEditor): void {
  const now = new Date()
  const formatted = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  editor.replaceSelection(formatted)
}

// ─── Bookmarks: heading/block/search/all-tabs (Requirements 11-14) ────────
// The four `bookmarks:bookmark-*` no-ops below (see buildSpecs) complete the
// bookmark types beyond plain file favorites, which already run through
// `bookmarks:bookmark-current-view`/`unbookmark-current-view` above.

/** Same pattern as `plugins/block-ref/marker-parser.ts`'s (unexported) block-marker regex. */
const BLOCK_MARKER_REGEX = / \^([a-zA-Z0-9][a-zA-Z0-9-]*)\r?$/

/** Nearest Markdown heading at or above the cursor's line (Requirement 11.1). */
function findHeadingBeforeCursor(view: EditorView): string | null {
  const cursorLine = view.state.doc.lineAt(view.state.selection.main.head).number
  for (let lineNo = cursorLine; lineNo >= 1; lineNo--) {
    const match = /^#{1,6}\s+(.+?)\s*#*$/.exec(view.state.doc.line(lineNo).text)
    if (match) return match[1]!.trim()
  }
  return null
}

function bookmarkCurrentHeading(h: CoreAppCommandHandlers): void {
  const tab = getActiveTab(h)
  const view = getActiveEditorView()
  if (!tab || !h.vaultId || !view) return

  const heading = findHeadingBeforeCursor(view)
  if (!heading) {
    showToast('error', 'Keine Überschrift oberhalb des Cursors gefunden')
    return
  }
  favoritesStore.addHeadingBookmark(h.vaultId, tab.filePath, heading)
}

function bookmarkCurrentSearch(h: CoreAppCommandHandlers): void {
  if (!h.vaultId || h.searchQuery.trim() === '') {
    showToast('error', 'Keine aktive Suchanfrage vorhanden')
    return
  }
  favoritesStore.addSearchBookmark(h.vaultId, h.searchQuery, h.searchCaseSensitive, h.searchRegex)
}

/** Last line of the paragraph (consecutive non-blank lines) containing `lineNo`. */
function findParagraphEndLine(view: EditorView, lineNo: number): number {
  const doc = view.state.doc
  let toLine = lineNo
  while (toLine < doc.lines && doc.line(toLine + 1).text.trim() !== '') toLine++
  return toLine
}

/** A block ID not already used by any `^id` marker in the document. */
function generateUniqueBlockId(content: string): string {
  const used = new Set<string>()
  const re = /\^([a-zA-Z0-9][a-zA-Z0-9-]*)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(content))) used.add(m[1]!)
  let id: string
  do {
    id = Math.random().toString(36).slice(2, 8)
  } while (used.has(id))
  return id
}

function bookmarkCurrentBlock(h: CoreAppCommandHandlers): void {
  const tab = getActiveTab(h)
  const view = getActiveEditorView()
  if (!tab || !h.vaultId || !view) return

  const cursorLine = view.state.doc.lineAt(view.state.selection.main.head).number
  const endLine = findParagraphEndLine(view, cursorLine)
  const lastLine = view.state.doc.line(endLine)
  const existing = BLOCK_MARKER_REGEX.exec(lastLine.text)

  if (existing) {
    favoritesStore.addBlockBookmark(h.vaultId, tab.filePath, existing[1]!)
    return
  }

  const blockId = generateUniqueBlockId(view.state.doc.toString())
  view.dispatch({ changes: { from: lastLine.to, insert: ` ^${blockId}` } })
  favoritesStore.addBlockBookmark(h.vaultId, tab.filePath, blockId)
}

/** True for tabs backing a real vault file (excludes plugin-view tabs and the graph tab). */
function isFileTab(tab: TabEntry): boolean {
  return !tab.filePath.startsWith('__view::') && tab.filePath !== '__graph__'
}

function bookmarkAllTabs(h: CoreAppCommandHandlers): void {
  if (!h.vaultId) return
  const vaultId = h.vaultId
  const fileTabs = h.tabState.tabs.filter(isFileTab)
  if (fileTabs.length === 0) return

  if (fileTabs.every((t) => favoritesStore.isFavorite(vaultId, t.filePath))) {
    showToast('info', 'Alle offenen Tabs sind bereits favorisiert')
    return
  }

  let added = 0
  let limitReached = false
  for (const tab of fileTabs) {
    if (favoritesStore.isFavorite(vaultId, tab.filePath)) continue
    const before = favoritesStore.getForVault(vaultId).length
    favoritesStore.add(vaultId, tab.filePath)
    if (favoritesStore.getForVault(vaultId).length > before) {
      added++
    } else {
      limitReached = true
      break
    }
  }

  if (limitReached) {
    showToast('info', `Limit von 50 Favoriten erreicht — ${added} Tab(s) hinzugefügt`)
  }
}

const noop = (): void => { /* no Slatebase equivalent — see module docstring */ }

interface CoreAppCommandSpec {
  /** Full Obsidian command ID, e.g. `'workspace:close'` or the unprefixed `'daily-notes'`. */
  id: string
  name: string
  /** When true, registers as editorCallback (only fires with an active editor) and `run` receives it. */
  editor?: boolean
  run: (h: CoreAppCommandHandlers, editor: IEditor) => void | Promise<void>
}

function splitId(fullId: string): { pluginId: string; id: string } {
  const i = fullId.indexOf(':')
  return i === -1 ? { pluginId: '', id: fullId } : { pluginId: fullId.slice(0, i), id: fullId.slice(i + 1) }
}

function buildSpecs(): CoreAppCommandSpec[] {
  const specs: CoreAppCommandSpec[] = [
    // ── workspace:* (tabs) ──
    { id: 'workspace:close', name: 'Close current tab', run: closeTab },
    { id: 'workspace:close-others', name: 'Close all other tabs', run: closeOtherTabs },
    { id: 'workspace:close-tab-group', name: 'Close this tab group', run: closeTab },
    { id: 'workspace:close-others-tab-group', name: 'Close others in tab group', run: closeOtherTabs },
    { id: 'workspace:next-tab', name: 'Go to next tab', run: (h) => activateTabByOffset(h, 1) },
    { id: 'workspace:previous-tab', name: 'Go to previous tab', run: (h) => activateTabByOffset(h, -1) },
    { id: 'workspace:goto-last-tab', name: 'Go to last tab', run: (h) => activateTabByIndex(h, h.tabState.tabs.length - 1) },
    { id: 'workspace:copy-path', name: 'Copy current file path from vault folder', run: (h) => { const t = getActiveTab(h); if (t) void copyToClipboard(t.filePath) } },
    { id: 'workspace:copy-full-path', name: 'Copy current file path from system root', run: (h) => { const t = getActiveTab(h); if (t) void copyToClipboard(`${h.vaultName}/${t.filePath}`) } },
    { id: 'workspace:edit-file-title', name: 'Rename file', run: renameActiveFile },
    { id: 'workspace:show-trash', name: 'Show trash', run: (h) => h.onNavigate('trash') },
    // No Slatebase equivalent — no split panes/tab groups, no pinning, no popout/new-window,
    // no closed-tab history, no blank-tab concept, no stacked-tabs layout, no URL scheme.
    { id: 'workspace:new-tab', name: 'New tab', run: noop },
    { id: 'workspace:toggle-pin', name: 'Toggle pin', run: noop },
    { id: 'workspace:split-vertical', name: 'Split right', run: noop },
    { id: 'workspace:split-horizontal', name: 'Split down', run: noop },
    { id: 'workspace:undo-close-pane', name: 'Undo close tab', run: noop },
    { id: 'workspace:move-to-new-window', name: 'Move current tab to new window', run: noop },
    { id: 'workspace:new-window', name: 'New window', run: noop },
    { id: 'workspace:close-window', name: 'Close window', run: noop },
    { id: 'workspace:open-in-new-window', name: 'Open current tab in new window', run: noop },
    { id: 'workspace:toggle-stacked-tabs', name: 'Toggle stacked tabs', run: noop },
    { id: 'workspace:copy-url', name: 'Copy Obsidian URL for current file', run: noop },
    { id: 'workspace:export-pdf', name: 'Export to PDF...', run: noop },

    // ── file-explorer:* ──
    { id: 'file-explorer:new-file', name: 'Create new note', run: (h) => h.onCreateFile() },
    { id: 'file-explorer:new-file-in-current-tab', name: 'Create new note in current tab', run: (h) => h.onCreateFile() },
    { id: 'file-explorer:new-file-in-new-pane', name: 'Create note to the right', run: (h) => h.onCreateFile() },
    { id: 'file-explorer:new-folder', name: 'Files: Create new folder', run: (h) => h.onCreateFolder() },
    { id: 'file-explorer:open', name: 'Files: Show file explorer', run: (h) => setSidebarPanelView(h, 'explorer') },
    { id: 'file-explorer:reveal-active-file', name: 'Files: Reveal current file in navigation', run: revealActiveFile },
    { id: 'file-explorer:duplicate-file', name: 'Make a copy of the current file', run: duplicateActiveFile },
    { id: 'file-explorer:move-file', name: 'Move current file to another folder', run: moveActiveFile },

    // ── app:* ──
    { id: 'app:reload', name: 'Reload app without saving', run: () => window.location.reload() },
    { id: 'app:open-settings', name: 'Open settings', run: (h) => h.onOpenSettings() },
    { id: 'app:toggle-left-sidebar', name: 'Toggle left sidebar', run: (h) => h.onToggleSidebar() },
    { id: 'app:toggle-right-sidebar', name: 'Toggle right sidebar', run: (h) => h.onToggleRightPanel() },
    { id: 'app:delete-file', name: 'Delete current file', run: deleteActiveFile },
    { id: 'app:open-vault', name: 'Manage vaults', run: (h) => h.onOpenSettings({ category: 'account', section: 'my-vaults' }) },
    { id: 'app:switch-vault', name: 'Change vault...', run: (h) => h.onOpenSettings({ category: 'account', section: 'my-vaults' }) },
    { id: 'app:open-another-vault', name: 'Open vault...', run: (h) => h.onOpenSettings({ category: 'account', section: 'my-vaults' }) },
    // No Slatebase equivalent — no ribbon UI, no sandbox vault, no in-app
    // help/debug pages, no split-pane default-mode setting.
    { id: 'app:toggle-ribbon', name: 'Toggle ribbon', run: noop },
    { id: 'app:go-back', name: 'Navigate back', run: (h) => h.onNavigateBack() },
    { id: 'app:go-forward', name: 'Navigate forward', run: (h) => h.onNavigateForward() },
    { id: 'app:open-sandbox-vault', name: 'Open sandbox vault', run: noop },
    { id: 'app:open-help', name: 'Open help', run: noop },
    { id: 'app:show-debug-info', name: 'Show debug info', run: noop },
    { id: 'app:show-release-notes', name: 'Show release notes', run: noop },
    { id: 'app:toggle-default-new-pane-mode', name: 'Toggle default mode for new tabs', run: noop },

    // ── theme:* ──
    { id: 'theme:toggle-light-dark', name: 'Toggle light/dark mode', run: (h) => cycleTheme(h, ['light', 'dark']) },
    { id: 'theme:switch', name: 'Change theme...', run: (h) => cycleTheme(h, ['light', 'dark', 'system']) },

    // ── window:* — no window/UI-scale management exists in a browser tab ──
    { id: 'window:zoom-in', name: 'Zoom in', run: noop },
    { id: 'window:zoom-out', name: 'Zoom out', run: noop },
    { id: 'window:reset-zoom', name: 'Reset zoom', run: noop },
    { id: 'window:toggle-always-on-top', name: 'Toggle window always on top', run: noop },

    // ── Graph / Canvas / Daily Notes ──
    { id: 'graph:open', name: 'Graph view: Open graph view', run: (h) => h.onOpenGraph() },
    { id: 'graph:open-local', name: 'Graph view: Open local graph', run: noop },
    { id: 'graph:animate', name: 'Graph view: Start graph time-lapse animation', run: noop },
    { id: 'canvas:new-file', name: 'Canvas: Create new canvas', run: (h) => h.onCreateCanvas() },
    { id: 'canvas:jump-to-group', name: 'Canvas: Jump to group', run: noop },
    { id: 'canvas:export-as-image', name: 'Canvas: Export as image', run: noop },
    { id: 'canvas:convert-to-file', name: 'Canvas: Convert to file...', run: noop },
    { id: 'daily-notes', name: "Daily notes: Open today's daily note", run: (h) => h.onDailyNote() },
    { id: 'daily-notes:goto-next', name: 'Daily notes: Open next daily note', run: noop },
    { id: 'daily-notes:goto-prev', name: 'Daily notes: Open previous daily note', run: noop },
    { id: 'insert-template', name: 'Templates: Insert template', run: (h) => h.onOpenTemplateSelector() },

    // ── markdown:* ──
    { id: 'markdown:toggle-preview', name: 'Toggle reading view', run: (h) => { const t = getActiveTab(h); if (t) h.tabDispatch({ type: 'TOGGLE_MODE', payload: { tabId: t.id } }) } },
    // No standalone "properties" editing API to script against outside the panel UI.
    { id: 'markdown:add-alias', name: 'Add alias', run: noop },
    { id: 'markdown:add-metadata-property', name: 'Add file property', run: noop },
    { id: 'markdown:clear-metadata-properties', name: 'Clear file properties', run: noop },

    // ── Side panels ──
    { id: 'outline:open', name: 'Outline: Show outline', run: (h) => setContextPanelView(h, 'outline') },
    { id: 'outline:open-for-current', name: 'Outline: Open outline of the current file', run: (h) => setContextPanelView(h, 'outline') },
    { id: 'backlink:open', name: 'Backlinks: Show backlinks', run: (h) => setContextPanelView(h, 'links') },
    { id: 'backlink:open-backlinks', name: 'Backlinks: Open backlinks for the current note', run: (h) => setContextPanelView(h, 'links') },
    { id: 'backlink:toggle-backlinks-in-document', name: 'Backlinks: Toggle backlinks in document', run: (h) => setContextPanelView(h, 'links') },
    { id: 'outgoing-links:open', name: 'Outgoing links: Show outgoing links', run: (h) => setContextPanelView(h, 'links') },
    { id: 'outgoing-links:open-for-current', name: 'Outgoing links: Open outgoing links for the current file', run: (h) => setContextPanelView(h, 'links') },
    { id: 'tag-pane:open', name: 'Tags view: Show tags', run: (h) => setContextPanelView(h, 'tags') },
    { id: 'bookmarks:open', name: 'Bookmarks: Show bookmarks', run: (h) => setSidebarPanelView(h, 'favorites') },
    { id: 'bookmarks:bookmark-current-view', name: 'Bookmarks: Bookmark...', run: (h) => { const t = getActiveTab(h); if (t && h.vaultId) favoritesStore.add(h.vaultId, t.filePath) } },
    { id: 'bookmarks:unbookmark-current-view', name: 'Bookmarks: Remove bookmark for the current file', run: (h) => { const t = getActiveTab(h); if (t && h.vaultId) favoritesStore.remove(h.vaultId, t.filePath) } },
    { id: 'file-recovery:open', name: 'File recovery: Open local history', run: (h) => { const t = getActiveTab(h); if (t) window.dispatchEvent(new CustomEvent('slatebase:open-file-recovery', { detail: { vaultId: t.vaultId, filePath: t.filePath } })) } },
    // No footnotes panel, no note-merge/split wizard, no Bases (table-view-over-folder)
    // feature, and "open in default app" / "show in system explorer" are desktop-only
    // concepts that cannot exist for a file stored on a remote server.
    { id: 'footnotes:open', name: 'Footnotes view: Show footnotes', run: noop },
    { id: 'note-composer:extract-heading', name: 'Note composer: Extract this heading...', run: noop },
    { id: 'note-composer:merge-file', name: 'Note composer: Merge current file with another file...', run: noop },
    { id: 'note-composer:split-file', name: 'Note composer: Extract current selection...', run: noop },
    { id: 'bases:add-item', name: 'Bases: Add item', run: noop },
    { id: 'bases:add-view', name: 'Bases: Add view', run: noop },
    { id: 'bases:change-view', name: 'Bases: Change view', run: noop },
    { id: 'bases:copy-table', name: 'Bases: Copy table to clipboard', run: noop },
    { id: 'bases:insert', name: 'Bases: Insert new base', run: noop },
    { id: 'bases:new-file', name: 'Bases: Create new base', run: noop },
    { id: 'open-with-default-app:open', name: 'Open in default app', run: noop },
    { id: 'open-with-default-app:show', name: 'Show in system explorer', run: noop },
    { id: 'switcher:open', name: 'Quick switcher: Open quick switcher', run: (h) => h.onOpenQuickSwitcher() },
    { id: 'bookmarks:bookmark-all-tabs', name: 'Bookmarks: Bookmark all tabs...', run: bookmarkAllTabs },
    { id: 'bookmarks:bookmark-current-heading', name: 'Bookmarks: Bookmark heading under cursor...', run: bookmarkCurrentHeading },
    { id: 'bookmarks:bookmark-current-search', name: 'Bookmarks: Bookmark current search...', run: bookmarkCurrentSearch },
    { id: 'bookmarks:bookmark-current-section', name: 'Bookmarks: Bookmark block under cursor...', run: bookmarkCurrentBlock },

    // ── Search / command palette — real, via the same window events the app itself uses ──
    { id: 'global-search:open', name: 'Search: Search in all files', run: () => window.dispatchEvent(new CustomEvent('slatebase:open-search')) },
    { id: 'command-palette:open', name: 'Command palette: Open command palette', run: () => window.dispatchEvent(new CustomEvent('slatebase:open-command-palette')) },

    // ── editor:* commands needing app context (not just IEditor) ──
    { id: 'editor:save-file', name: 'Save current file', editor: true, run: (h) => { const t = getActiveTab(h); if (t && h.vaultId) void saveTab(h.tabDispatch, h.apiClient, h.vaultId, t.filePath, t.editBuffer ?? t.content) } },
    { id: 'editor:toggle-source', name: 'Toggle Live Preview/Source mode', editor: true, run: (h) => { const t = getActiveTab(h); if (t) h.tabDispatch({ type: 'TOGGLE_MODE', payload: { tabId: t.id } }) } },
    { id: 'editor:toggle-line-numbers', name: 'Toggle line numbers', editor: true, run: () => window.dispatchEvent(new CustomEvent('slatebase:editor-command', { detail: { action: 'toggleLineNumbers' } })) },
    { id: 'editor:follow-link', name: 'Follow link under cursor', editor: true, run: followLink },
    { id: 'editor:open-link-in-new-leaf', name: 'Open link under cursor in new tab', editor: true, run: followLink },
    { id: 'editor:open-link-in-new-split', name: 'Open link under cursor to the right', editor: true, run: followLink },
    { id: 'editor:open-link-in-new-window', name: 'Open link under cursor in new window', editor: true, run: followLink },
    { id: 'editor:open-search', name: 'Search current file', editor: true, run: () => { const view = getActiveEditorView(); if (view) openSearchPanel(view) } },
    { id: 'editor:open-search-replace', name: 'Search & replace in current file', editor: true, run: () => { const view = getActiveEditorView(); if (view) openSearchPanel(view) } },
    { id: 'insert-current-date', name: 'Templates: Insert current date', editor: true, run: (_h, editor) => insertCurrentDate(editor) },
    { id: 'insert-current-time', name: 'Templates: Insert current time', editor: true, run: (_h, editor) => insertCurrentTime(editor) },
  ]

  for (let i = 1; i <= 8; i++) {
    specs.push({ id: `workspace:goto-tab-${i}`, name: `Go to tab #${i}`, run: (h) => activateTabByIndex(h, i - 1) })
  }

  return specs
}

/**
 * Register every core command that isn't a pure `editor:*` text operation
 * (see `registerCoreEditorCommands` in `core-commands.ts` for those).
 *
 * `getHandlers` is called at EXECUTION time, not registration time — pass a
 * function backed by a ref (not a snapshot object) so commands always act on
 * current tab/vault/panel state. Safe to call once; re-registering is only
 * needed if the registry itself changes.
 */
export function registerCoreAppCommands(registry: ICommandRegistry, getHandlers: () => CoreAppCommandHandlers, locale: Locale): void {
  for (const spec of buildSpecs()) {
    const { pluginId, id } = splitId(spec.id)
    const name = translateCoreCommandName(spec.id, locale, spec.name)
    if (spec.editor) {
      registry.addCommand(pluginId, { id, name, editorCallback: (editor) => { void spec.run(getHandlers(), editor) } })
    } else {
      registry.addCommand(pluginId, { id, name, callback: () => { void spec.run(getHandlers(), null as unknown as IEditor) } })
    }
  }
}
