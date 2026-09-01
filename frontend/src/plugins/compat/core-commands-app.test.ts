import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EditorView } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { history } from '@codemirror/commands'
import { CommandRegistry } from './command-registry'
import { registerCoreAppCommands, type CoreAppCommandHandlers } from './core-commands-app'
import { EditorShim, setEditorViewAccessor } from './editor-shim'
import { setActiveEditorView } from '../../editor/plugin-extensions'
import { setActiveCanvasController } from '../../state/activeCanvasBridge'
import { favoritesStore } from '../../state/favoritesStore'
import * as ToastNotificationModule from '../../components/ToastNotification'
import type { IApiClient } from '../../api'
import type { TabEntry } from '../../state/tabState'
import type { PublicUserInfo } from '../../state/authState'
import { zoomIn, zoomOut, resetZoom } from '../../state/zoomStore'

vi.mock('../../state/zoomStore', () => ({
  zoomIn: vi.fn(),
  zoomOut: vi.fn(),
  resetZoom: vi.fn(),
}))

/** Minimal mock covering every IApiClient member (mirrors FileExplorer.test.tsx's helper). */
function createMockApiClient(overrides: Partial<IApiClient> = {}): IApiClient {
  return {
    setToken: vi.fn(),
    getToken: vi.fn().mockReturnValue(null),
    setCsrfToken: vi.fn(),
    getCsrfToken: vi.fn().mockReturnValue(null),
    setOnSessionExpired: vi.fn(),
    fetchVaults: vi.fn(),
    fetchAllVaults: vi.fn(),
    fetchVaultTree: vi.fn().mockResolvedValue({ name: '', path: '', type: 'directory', children: [] }),
    fetchFileContent: vi.fn(),
    createVault: vi.fn(),
    deleteVault: vi.fn(),
    importFile: vi.fn(),
    importFolder: vi.fn(),
    deleteContent: vi.fn(),
    saveFile: vi.fn(),
    moveContent: vi.fn(),
    renameContent: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    getSessions: vi.fn(),
    invalidateSession: vi.fn(),
    invalidateAllOtherSessions: vi.fn(),
    getProfile: vi.fn(),
    updateProfile: vi.fn(),
    changePassword: vi.fn(),
    deleteSelf: vi.fn(),
    searchUsers: vi.fn(),
    ...overrides,
  } as IApiClient
}

function makeTab(overrides: Partial<TabEntry> = {}): TabEntry {
  return {
    id: 'vault-1::note.md',
    vaultId: 'vault-1',
    filePath: 'note.md',
    fileName: 'note.md',
    mode: 'edit',
    isBinary: false,
    content: 'hello',
    editBuffer: null,
    loading: false,
    error: null,
    ...overrides,
  }
}

function makeUser(overrides: Partial<PublicUserInfo> = {}): PublicUserInfo {
  return {
    userId: 'u1', username: 'u1', displayName: 'U1', email: 'u1@example.com', avatarUrl: '',
    role: 'user', preferredLanguage: 'de', colorScheme: 'light', suspended: false,
    mustChangePassword: false, createdAt: '2024-01-01',
    ...overrides,
  }
}

describe('registerCoreAppCommands', () => {
  let registry: CommandRegistry
  let apiClient: IApiClient
  let handlers: CoreAppCommandHandlers
  let tabDispatch: ReturnType<typeof vi.fn>
  let appDispatch: ReturnType<typeof vi.fn>
  let authDispatch: ReturnType<typeof vi.fn>
  let rightPanelDispatch: ReturnType<typeof vi.fn>
  let leftPanelDispatch: ReturnType<typeof vi.fn>
  let onToggleSidebar: ReturnType<typeof vi.fn>
  let onToggleRightPanel: ReturnType<typeof vi.fn>

  beforeEach(() => {
    registry = new CommandRegistry()
    apiClient = createMockApiClient()
    tabDispatch = vi.fn()
    appDispatch = vi.fn()
    authDispatch = vi.fn()
    rightPanelDispatch = vi.fn()
    leftPanelDispatch = vi.fn()
    onToggleSidebar = vi.fn()
    onToggleRightPanel = vi.fn()

    handlers = {
      vaultId: 'vault-1',
      vaultName: 'My Vault',
      apiClient,
      tabState: { tabs: [makeTab()], activeTabId: 'vault-1::note.md' },
      tabDispatch,
      appDispatch,
      authState: { isAuthenticated: true, user: makeUser(), token: null, csrfToken: null, mustChangePassword: false, isLoading: false, error: null },
      authDispatch,
      showSidebar: false,
      showRightPanel: false,
      rightPanelSections: [{ id: 'sec-1', viewIds: ['outline', 'links', 'tags', 'properties', 'search'], activeViewId: 'outline', heightFraction: 1 }],
      rightPanelDispatch,
      leftPanelSections: [{ id: 'side-1', viewIds: ['explorer', 'favorites', 'recent'], activeViewId: 'explorer', heightFraction: 1 }],
      leftPanelDispatch,
      onToggleSidebar,
      onToggleRightPanel,
      onOpenSettings: vi.fn(),
      onNavigate: vi.fn(),
      onCreateFile: vi.fn(),
      onCreateFolder: vi.fn(),
      onCreateCanvas: vi.fn(),
      onOpenGraph: vi.fn(),
      onOpenLocalGraph: vi.fn(),
      onDailyNote: vi.fn(),
      onDailyNoteOffset: vi.fn(),
      onCreateWelcomeVault: vi.fn(),
      onOpenTemplateSelector: vi.fn(),
      onOpenReleaseNotes: vi.fn(),
      onOpenDebugInfo: vi.fn(),
      onNavigateBack: vi.fn(),
      onNavigateForward: vi.fn(),
      onOpenQuickSwitcher: vi.fn(),
      searchQuery: '',
      searchCaseSensitive: false,
      searchRegex: false,
    }

    registerCoreAppCommands(registry, () => handlers)
  })

  it('registers commands under their real, sometimes-unprefixed Obsidian IDs', () => {
    expect(registry.getCommand('workspace:close')).toBeDefined()
    expect(registry.getCommand('app:toggle-left-sidebar')).toBeDefined()
    expect(registry.getCommand('theme:toggle-light-dark')).toBeDefined()
    expect(registry.getCommand('outline:open')).toBeDefined()
    // Unprefixed core commands (no leading namespace, matches real Obsidian exactly).
    expect(registry.getCommand('daily-notes')).toBeDefined()
    expect(registry.getCommand('insert-template')).toBeDefined()
  })

  it('workspace:close closes the active tab', () => {
    registry.executeCommand('workspace:close')
    expect(tabDispatch).toHaveBeenCalledWith({ type: 'CLOSE_TAB', payload: { tabId: 'vault-1::note.md' } })
  })

  it('workspace:close-others closes every tab except the active one', () => {
    handlers.tabState = {
      tabs: [makeTab({ id: 'a' }), makeTab({ id: 'b' }), makeTab({ id: 'c' })],
      activeTabId: 'b',
    }

    registry.executeCommand('workspace:close-others')

    expect(tabDispatch).toHaveBeenCalledWith({ type: 'CLOSE_TAB', payload: { tabId: 'a' } })
    expect(tabDispatch).toHaveBeenCalledWith({ type: 'CLOSE_TAB', payload: { tabId: 'c' } })
    expect(tabDispatch).not.toHaveBeenCalledWith({ type: 'CLOSE_TAB', payload: { tabId: 'b' } })
  })

  it('workspace:close-others skips pinned tabs', () => {
    handlers.tabState = {
      tabs: [makeTab({ id: 'a', pinned: true }), makeTab({ id: 'b' }), makeTab({ id: 'c', pinned: true })],
      activeTabId: 'b',
    }

    registry.executeCommand('workspace:close-others')

    expect(tabDispatch).not.toHaveBeenCalledWith({ type: 'CLOSE_TAB', payload: { tabId: 'a' } })
    expect(tabDispatch).not.toHaveBeenCalledWith({ type: 'CLOSE_TAB', payload: { tabId: 'c' } })
  })

  it('workspace:toggle-pin toggles the active tab\'s pinned flag', () => {
    handlers.tabState = { tabs: [makeTab({ id: 'a' })], activeTabId: 'a' }

    registry.executeCommand('workspace:toggle-pin')

    expect(tabDispatch).toHaveBeenCalledWith({ type: 'TOGGLE_PIN', payload: { tabId: 'a' } })
  })

  it('workspace:undo-close-pane pops history and reopens the tab', async () => {
    ;(apiClient.fetchFileContent as ReturnType<typeof vi.fn>).mockResolvedValue({
      path: 'closed.md', name: 'closed.md', content: '', size: 0, encoding: 'utf-8', isBinary: false, isTruncated: false,
    })
    handlers.tabState = {
      tabs: [],
      activeTabId: null,
      closedTabsHistory: [makeTab({ id: 'vault-1::closed.md', filePath: 'closed.md', fileName: 'closed.md' })],
    }

    registry.executeCommand('workspace:undo-close-pane')
    await Promise.resolve()
    await Promise.resolve()

    expect(tabDispatch).toHaveBeenCalledWith({ type: 'POP_CLOSED_TAB' })
    expect(tabDispatch).toHaveBeenCalledWith({
      type: 'OPEN_TAB',
      payload: { vaultId: 'vault-1', filePath: 'closed.md', fileName: 'closed.md' },
    })
  })

  it('workspace:next-tab activates the next tab, wrapping around at the end', () => {
    handlers.tabState = {
      tabs: [makeTab({ id: 'a' }), makeTab({ id: 'b' }), makeTab({ id: 'c' })],
      activeTabId: 'c',
    }

    registry.executeCommand('workspace:next-tab')

    expect(tabDispatch).toHaveBeenCalledWith({ type: 'ACTIVATE_TAB', payload: { tabId: 'a' } })
  })

  it('workspace:goto-tab-2 activates the second tab', () => {
    handlers.tabState = {
      tabs: [makeTab({ id: 'a' }), makeTab({ id: 'b' })],
      activeTabId: 'a',
    }

    registry.executeCommand('workspace:goto-tab-2')

    expect(tabDispatch).toHaveBeenCalledWith({ type: 'ACTIVATE_TAB', payload: { tabId: 'b' } })
  })

  it('workspace:copy-path copies the active file\'s vault-relative path', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })

    registry.executeCommand('workspace:copy-path')
    await Promise.resolve()

    expect(writeText).toHaveBeenCalledWith('note.md')
  })

  it('workspace:export-pdf switches an edit-mode tab to reading mode, then prints', () => {
    handlers.tabState = { tabs: [makeTab({ mode: 'edit' })], activeTabId: 'vault-1::note.md' }
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {})
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => { cb(0); return 0 })

    registry.executeCommand('workspace:export-pdf')

    expect(tabDispatch).toHaveBeenCalledWith({ type: 'TOGGLE_MODE', payload: { tabId: 'vault-1::note.md' } })
    expect(printSpy).toHaveBeenCalled()
    printSpy.mockRestore()
    rafSpy.mockRestore()
  })

  it('workspace:export-pdf does not toggle mode when already in reading mode', () => {
    handlers.tabState = { tabs: [makeTab({ mode: 'view' })], activeTabId: 'vault-1::note.md' }
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {})
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => { cb(0); return 0 })

    registry.executeCommand('workspace:export-pdf')

    expect(tabDispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'TOGGLE_MODE' }))
    expect(printSpy).toHaveBeenCalled()
    printSpy.mockRestore()
    rafSpy.mockRestore()
  })

  it('workspace:export-pdf shows an error toast for a binary file', () => {
    handlers.tabState = { tabs: [makeTab({ isBinary: true })], activeTabId: 'vault-1::note.md' }
    const toastSpy = vi.spyOn(ToastNotificationModule, 'showToast').mockImplementation(() => {})
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {})

    registry.executeCommand('workspace:export-pdf')

    expect(toastSpy).toHaveBeenCalledWith('error', expect.any(String))
    expect(printSpy).not.toHaveBeenCalled()
    toastSpy.mockRestore()
    printSpy.mockRestore()
  })

  it('app:toggle-left-sidebar and app:toggle-right-sidebar delegate to the app callbacks', () => {
    registry.executeCommand('app:toggle-left-sidebar')
    expect(onToggleSidebar).toHaveBeenCalled()

    registry.executeCommand('app:toggle-right-sidebar')
    expect(onToggleRightPanel).toHaveBeenCalled()
  })

  it('theme:toggle-light-dark persists the new color scheme via the API and auth dispatch', async () => {
    const updatedUser = makeUser({ colorScheme: 'dark' })
    ;(apiClient.updateProfile as ReturnType<typeof vi.fn>).mockResolvedValue(updatedUser)

    registry.executeCommand('theme:toggle-light-dark')
    await Promise.resolve()
    await Promise.resolve()

    expect(apiClient.updateProfile).toHaveBeenCalledWith({ colorScheme: 'dark' })
    expect(authDispatch).toHaveBeenCalledWith({ type: 'PROFILE_UPDATED', payload: { user: updatedUser } })
  })

  it('outline:open opens the right panel (if closed) and switches the context panel to outline', () => {
    registry.executeCommand('outline:open')

    expect(onToggleRightPanel).toHaveBeenCalled()
    expect(rightPanelDispatch).toHaveBeenCalledWith({ type: 'SET_ACTIVE_VIEW', sectionId: 'sec-1', viewId: 'outline' })
  })

  it('outline:open does not re-toggle an already-open right panel', () => {
    handlers.showRightPanel = true

    registry.executeCommand('outline:open')

    expect(onToggleRightPanel).not.toHaveBeenCalled()
  })

  it('markdown:toggle-preview toggles the active tab\'s edit/view mode', () => {
    registry.executeCommand('markdown:toggle-preview')
    expect(tabDispatch).toHaveBeenCalledWith({ type: 'TOGGLE_MODE', payload: { tabId: 'vault-1::note.md' } })
  })

  it('graph:open and canvas:new-file delegate to their app callbacks', () => {
    registry.executeCommand('graph:open')
    expect(handlers.onOpenGraph).toHaveBeenCalled()

    registry.executeCommand('canvas:new-file')
    expect(handlers.onCreateCanvas).toHaveBeenCalled()
  })

  it('app:open-sandbox-vault delegates to onCreateWelcomeVault', () => {
    registry.executeCommand('app:open-sandbox-vault')
    expect(handlers.onCreateWelcomeVault).toHaveBeenCalled()
  })

  it('window:zoom-in/out/reset-zoom delegate to the zoom store', () => {
    registry.executeCommand('window:zoom-in')
    expect(zoomIn).toHaveBeenCalled()

    registry.executeCommand('window:zoom-out')
    expect(zoomOut).toHaveBeenCalled()

    registry.executeCommand('window:reset-zoom')
    expect(resetZoom).toHaveBeenCalled()
  })

  it('daily-notes:goto-next/goto-prev delegate to onDailyNoteOffset with +1/-1', () => {
    registry.executeCommand('daily-notes:goto-next')
    expect(handlers.onDailyNoteOffset).toHaveBeenCalledWith(1)

    registry.executeCommand('daily-notes:goto-prev')
    expect(handlers.onDailyNoteOffset).toHaveBeenCalledWith(-1)
  })

  it('app:show-release-notes and app:show-debug-info delegate to their open handlers', () => {
    registry.executeCommand('app:show-release-notes')
    expect(handlers.onOpenReleaseNotes).toHaveBeenCalled()

    registry.executeCommand('app:show-debug-info')
    expect(handlers.onOpenDebugInfo).toHaveBeenCalled()
  })

  it('graph:open-local opens a Lokaler_Graph for the active file tab', () => {
    registry.executeCommand('graph:open-local')
    expect(handlers.onOpenLocalGraph).toHaveBeenCalledWith('note.md')
  })

  it('graph:open-local has no effect when the active tab is a sentinel (non-file) tab', () => {
    handlers.tabState = { tabs: [makeTab({ id: 'g', filePath: '__graph__' })], activeTabId: 'g' }
    registry.executeCommand('graph:open-local')
    expect(handlers.onOpenLocalGraph).not.toHaveBeenCalled()
  })

  it('graph:open-local has no effect when no tab is active', () => {
    handlers.tabState = { tabs: [], activeTabId: null }
    registry.executeCommand('graph:open-local')
    expect(handlers.onOpenLocalGraph).not.toHaveBeenCalled()
  })

  it('global-search:open and command-palette:open dispatch the existing window events', () => {
    const searchListener = vi.fn()
    const paletteListener = vi.fn()
    window.addEventListener('slatebase:open-search', searchListener)
    window.addEventListener('slatebase:open-command-palette', paletteListener)

    registry.executeCommand('global-search:open')
    registry.executeCommand('command-palette:open')

    expect(searchListener).toHaveBeenCalled()
    expect(paletteListener).toHaveBeenCalled()

    window.removeEventListener('slatebase:open-search', searchListener)
    window.removeEventListener('slatebase:open-command-palette', paletteListener)
  })

  it('app:delete-file deletes the active file after confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    registry.executeCommand('app:delete-file')
    await Promise.resolve()
    await Promise.resolve()

    expect(apiClient.deleteContent).toHaveBeenCalledWith('vault-1', 'note.md')
    expect(tabDispatch).toHaveBeenCalledWith({ type: 'CLOSE_TABS_BY_PATH', payload: { pathPrefix: 'note.md' } })
  })

  it('app:delete-file does nothing when the user cancels the confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)

    registry.executeCommand('app:delete-file')
    await Promise.resolve()

    expect(apiClient.deleteContent).not.toHaveBeenCalled()
  })

  it('true-gap commands (no Slatebase equivalent) are registered but do nothing, without throwing', () => {
    expect(registry.getCommand('workspace:toggle-pin')).toBeDefined()
    expect(registry.getCommand('window:zoom-in')).toBeDefined()
    expect(registry.getCommand('switcher:open')).toBeDefined()

    expect(() => registry.executeCommand('workspace:toggle-pin')).not.toThrow()
    expect(() => registry.executeCommand('window:zoom-in')).not.toThrow()
  })

  it('commands that need an active file no-op instead of throwing when no tab is open', () => {
    handlers.tabState = { tabs: [], activeTabId: null }

    expect(() => registry.executeCommand('workspace:close')).not.toThrow()
    expect(() => registry.executeCommand('markdown:toggle-preview')).not.toThrow()
    expect(tabDispatch).not.toHaveBeenCalled()
  })
})

describe('registerCoreAppCommands — editor:* commands needing app context', () => {
  let registry: CommandRegistry
  let apiClient: IApiClient
  let handlers: CoreAppCommandHandlers
  let tabDispatch: ReturnType<typeof vi.fn>
  let view: EditorView

  beforeEach(() => {
    view = new EditorView({
      state: EditorState.create({ doc: 'hello [[Other Note]] world', extensions: [history()] }),
      parent: document.body,
    })
    setEditorViewAccessor(() => view)
    setActiveEditorView(view)
    const editor = new EditorShim()

    registry = new CommandRegistry()
    apiClient = createMockApiClient()
    tabDispatch = vi.fn()

    handlers = {
      vaultId: 'vault-1',
      vaultName: 'My Vault',
      apiClient,
      tabState: { tabs: [makeTab({ editBuffer: 'unsaved content' })], activeTabId: 'vault-1::note.md' },
      tabDispatch,
      appDispatch: vi.fn(),
      authState: { isAuthenticated: true, user: makeUser(), token: null, csrfToken: null, mustChangePassword: false, isLoading: false, error: null },
      authDispatch: vi.fn(),
      showSidebar: false,
      showRightPanel: false,
      rightPanelSections: [],
      rightPanelDispatch: vi.fn(),
      leftPanelSections: [],
      leftPanelDispatch: vi.fn(),
      onToggleSidebar: vi.fn(),
      onToggleRightPanel: vi.fn(),
      onOpenSettings: vi.fn(),
      onNavigate: vi.fn(),
      onCreateFile: vi.fn(),
      onCreateFolder: vi.fn(),
      onCreateCanvas: vi.fn(),
      onOpenGraph: vi.fn(),
      onOpenLocalGraph: vi.fn(),
      onDailyNote: vi.fn(),
      onDailyNoteOffset: vi.fn(),
      onCreateWelcomeVault: vi.fn(),
      onOpenTemplateSelector: vi.fn(),
      onOpenReleaseNotes: vi.fn(),
      onOpenDebugInfo: vi.fn(),
      onNavigateBack: vi.fn(),
      onNavigateForward: vi.fn(),
      onOpenQuickSwitcher: vi.fn(),
      searchQuery: '',
      searchCaseSensitive: false,
      searchRegex: false,
    }

    registry.setEditorContextResolver(() => ({ editor, file: { path: 'note.md', basename: 'note', extension: 'md' } }))
    registerCoreAppCommands(registry, () => handlers)
  })

  afterEach(() => {
    view.destroy()
    setEditorViewAccessor(() => null)
    setActiveEditorView(null)
  })

  it('editor:save-file saves the tab\'s unsaved edit buffer', async () => {
    ;(apiClient.saveFile as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)

    registry.executeCommand('editor:save-file')
    await Promise.resolve()
    await Promise.resolve()

    expect(apiClient.saveFile).toHaveBeenCalledWith('vault-1', 'note.md', 'unsaved content')
  })

  it('editor:follow-link opens the wikilink under the cursor as a tab', () => {
    view.dispatch({ selection: { anchor: 8, head: 8 } }) // inside [[Other Note]]

    registry.executeCommand('editor:follow-link')

    expect(tabDispatch).toHaveBeenCalledWith({
      type: 'OPEN_TAB',
      payload: { vaultId: 'vault-1', filePath: 'Other Note.md', fileName: 'Other Note.md' },
    })
  })

  it('editor:follow-link does nothing when the cursor is not on a link', () => {
    view.dispatch({ selection: { anchor: 0, head: 0 } })

    registry.executeCommand('editor:follow-link')

    expect(tabDispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'OPEN_TAB' }))
  })

  it('editor:open-search opens the CM6 search panel', () => {
    registry.executeCommand('editor:open-search')

    expect(view.dom.querySelector('.cm-search')).not.toBeNull()
  })
})

describe('registerCoreAppCommands — bookmark types (Requirements 11-14)', () => {
  let registry: CommandRegistry
  let apiClient: IApiClient
  let handlers: CoreAppCommandHandlers
  let toastSpy: ReturnType<typeof vi.spyOn>

  function makeHandlers(overrides: Partial<CoreAppCommandHandlers> = {}): CoreAppCommandHandlers {
    return {
      vaultId: 'vault-1',
      vaultName: 'My Vault',
      apiClient,
      tabState: { tabs: [makeTab()], activeTabId: 'vault-1::note.md' },
      tabDispatch: vi.fn(),
      appDispatch: vi.fn(),
      authState: { isAuthenticated: true, user: makeUser(), token: null, csrfToken: null, mustChangePassword: false, isLoading: false, error: null },
      authDispatch: vi.fn(),
      showSidebar: false,
      showRightPanel: false,
      rightPanelSections: [],
      rightPanelDispatch: vi.fn(),
      leftPanelSections: [],
      leftPanelDispatch: vi.fn(),
      onToggleSidebar: vi.fn(),
      onToggleRightPanel: vi.fn(),
      onOpenSettings: vi.fn(),
      onNavigate: vi.fn(),
      onCreateFile: vi.fn(),
      onCreateFolder: vi.fn(),
      onCreateCanvas: vi.fn(),
      onOpenGraph: vi.fn(),
      onOpenLocalGraph: vi.fn(),
      onDailyNote: vi.fn(),
      onDailyNoteOffset: vi.fn(),
      onCreateWelcomeVault: vi.fn(),
      onOpenTemplateSelector: vi.fn(),
      onOpenReleaseNotes: vi.fn(),
      onOpenDebugInfo: vi.fn(),
      onNavigateBack: vi.fn(),
      onNavigateForward: vi.fn(),
      onOpenQuickSwitcher: vi.fn(),
      searchQuery: '',
      searchCaseSensitive: false,
      searchRegex: false,
      ...overrides,
    }
  }

  beforeEach(() => {
    localStorage.clear()
    registry = new CommandRegistry()
    apiClient = createMockApiClient()
    handlers = makeHandlers()
    toastSpy = vi.spyOn(ToastNotificationModule, 'showToast').mockImplementation(() => {})
    registerCoreAppCommands(registry, () => handlers)
  })

  afterEach(() => {
    setActiveEditorView(null)
    toastSpy.mockRestore()
  })

  describe('bookmarks:bookmark-current-heading', () => {
    it('bookmarks the nearest heading at or above the cursor', () => {
      const doc = '# Heading One\n\nSome text here.\n\n## Heading Two\n\nMore text under cursor.'
      const view = new EditorView({ state: EditorState.create({ doc }), parent: document.body })
      const cursorPos = view.state.doc.line(7).from
      view.dispatch({ selection: { anchor: cursorPos } })
      setActiveEditorView(view)

      registry.executeCommand('bookmarks:bookmark-current-heading')

      const [entry] = favoritesStore.getForVault('vault-1')
      expect(entry?.type).toBe('heading')
      expect(entry?.heading).toBe('Heading Two')
      expect(entry?.path).toBe('note.md')
      view.destroy()
    })

    it('shows an error toast and adds no bookmark when there is no heading above the cursor', () => {
      const doc = 'Just plain text, no heading anywhere.'
      const view = new EditorView({ state: EditorState.create({ doc }), parent: document.body })
      setActiveEditorView(view)

      registry.executeCommand('bookmarks:bookmark-current-heading')

      expect(favoritesStore.getForVault('vault-1')).toHaveLength(0)
      expect(toastSpy).toHaveBeenCalledWith('error', expect.any(String))
      view.destroy()
    })

    it('does nothing when no editor is active', () => {
      setActiveEditorView(null)

      registry.executeCommand('bookmarks:bookmark-current-heading')

      expect(favoritesStore.getForVault('vault-1')).toHaveLength(0)
    })
  })

  describe('bookmarks:bookmark-current-search', () => {
    it('bookmarks the current search query and flags', () => {
      handlers.searchQuery = 'TODO'
      handlers.searchCaseSensitive = true
      handlers.searchRegex = false

      registry.executeCommand('bookmarks:bookmark-current-search')

      const [entry] = favoritesStore.getForVault('vault-1')
      expect(entry?.type).toBe('search')
      expect(entry?.searchQuery).toBe('TODO')
      expect(entry?.searchCaseSensitive).toBe(true)
    })

    it('shows an error toast when there is no active search query', () => {
      handlers.searchQuery = '   '

      registry.executeCommand('bookmarks:bookmark-current-search')

      expect(favoritesStore.getForVault('vault-1')).toHaveLength(0)
      expect(toastSpy).toHaveBeenCalledWith('error', expect.any(String))
    })
  })

  describe('bookmarks:bookmark-current-section (block)', () => {
    it('generates and inserts a block marker when the paragraph has none, then bookmarks it', () => {
      const doc = 'First paragraph.\n\nSecond paragraph without id.\n\nThird paragraph.'
      const view = new EditorView({ state: EditorState.create({ doc, extensions: [history()] }), parent: document.body })
      const cursorPos = view.state.doc.line(3).from + 5 // inside "Second paragraph..."
      view.dispatch({ selection: { anchor: cursorPos } })
      setActiveEditorView(view)

      registry.executeCommand('bookmarks:bookmark-current-section')

      expect(view.state.doc.line(3).text).toMatch(/^Second paragraph without id\. \^[a-zA-Z0-9-]+$/)
      const [entry] = favoritesStore.getForVault('vault-1')
      expect(entry?.type).toBe('block')
      expect(entry?.blockId).toBeTruthy()
      view.destroy()
    })

    it('reuses an existing block marker instead of inserting a new one', () => {
      const doc = 'First paragraph.\n\nSecond paragraph. ^existing-id'
      const view = new EditorView({ state: EditorState.create({ doc, extensions: [history()] }), parent: document.body })
      const cursorPos = view.state.doc.line(3).from + 5
      view.dispatch({ selection: { anchor: cursorPos } })
      setActiveEditorView(view)

      registry.executeCommand('bookmarks:bookmark-current-section')

      expect(view.state.doc.line(3).text).toBe('Second paragraph. ^existing-id')
      const [entry] = favoritesStore.getForVault('vault-1')
      expect(entry?.blockId).toBe('existing-id')
      view.destroy()
    })

    it('does nothing when no editor is active', () => {
      setActiveEditorView(null)

      registry.executeCommand('bookmarks:bookmark-current-section')

      expect(favoritesStore.getForVault('vault-1')).toHaveLength(0)
    })
  })

  describe('bookmarks:bookmark-all-tabs', () => {
    it('bookmarks every open file tab not already favorited', () => {
      handlers.tabState = {
        tabs: [makeTab({ id: 'a', filePath: 'a.md' }), makeTab({ id: 'b', filePath: 'b.md' })],
        activeTabId: 'a',
      }

      registry.executeCommand('bookmarks:bookmark-all-tabs')

      const paths = favoritesStore.getForVault('vault-1').map((e) => e.path)
      expect(paths.sort()).toEqual(['a.md', 'b.md'])
    })

    it('skips tabs that are already favorited', () => {
      favoritesStore.add('vault-1', 'a.md')
      handlers.tabState = {
        tabs: [makeTab({ id: 'a', filePath: 'a.md' }), makeTab({ id: 'b', filePath: 'b.md' })],
        activeTabId: 'a',
      }

      registry.executeCommand('bookmarks:bookmark-all-tabs')

      expect(favoritesStore.getForVault('vault-1')).toHaveLength(2)
    })

    it('shows an info toast and adds nothing when all open tabs are already favorited', () => {
      favoritesStore.add('vault-1', 'note.md')
      handlers.tabState = { tabs: [makeTab({ filePath: 'note.md' })], activeTabId: 'vault-1::note.md' }

      registry.executeCommand('bookmarks:bookmark-all-tabs')

      expect(favoritesStore.getForVault('vault-1')).toHaveLength(1)
      expect(toastSpy).toHaveBeenCalledWith('info', expect.any(String))
    })

    it('stops and shows an info toast once the 50-entry cap is reached', () => {
      for (let i = 0; i < 50; i++) {
        favoritesStore.add('vault-1', `existing-${i}.md`)
      }
      handlers.tabState = {
        tabs: [makeTab({ id: 'a', filePath: 'new-a.md' }), makeTab({ id: 'b', filePath: 'new-b.md' })],
        activeTabId: 'a',
      }

      registry.executeCommand('bookmarks:bookmark-all-tabs')

      expect(favoritesStore.getForVault('vault-1')).toHaveLength(50)
      expect(toastSpy).toHaveBeenCalledWith('info', expect.stringContaining('Limit'))
    })
  })
})

describe('registerCoreAppCommands — frontmatter properties (markdown:*)', () => {
  let registry: CommandRegistry
  let apiClient: IApiClient
  let handlers: CoreAppCommandHandlers
  let toastSpy: ReturnType<typeof vi.spyOn>

  function makeHandlers(overrides: Partial<CoreAppCommandHandlers> = {}): CoreAppCommandHandlers {
    return {
      vaultId: 'vault-1',
      vaultName: 'My Vault',
      apiClient,
      tabState: { tabs: [makeTab()], activeTabId: 'vault-1::note.md' },
      tabDispatch: vi.fn(),
      appDispatch: vi.fn(),
      authState: { isAuthenticated: true, user: makeUser(), token: null, csrfToken: null, mustChangePassword: false, isLoading: false, error: null },
      authDispatch: vi.fn(),
      showSidebar: false,
      showRightPanel: false,
      rightPanelSections: [],
      rightPanelDispatch: vi.fn(),
      leftPanelSections: [],
      leftPanelDispatch: vi.fn(),
      onToggleSidebar: vi.fn(),
      onToggleRightPanel: vi.fn(),
      onOpenSettings: vi.fn(),
      onNavigate: vi.fn(),
      onCreateFile: vi.fn(),
      onCreateFolder: vi.fn(),
      onCreateCanvas: vi.fn(),
      onOpenGraph: vi.fn(),
      onOpenLocalGraph: vi.fn(),
      onDailyNote: vi.fn(),
      onDailyNoteOffset: vi.fn(),
      onCreateWelcomeVault: vi.fn(),
      onOpenTemplateSelector: vi.fn(),
      onOpenReleaseNotes: vi.fn(),
      onOpenDebugInfo: vi.fn(),
      onNavigateBack: vi.fn(),
      onNavigateForward: vi.fn(),
      onOpenQuickSwitcher: vi.fn(),
      searchQuery: '',
      searchCaseSensitive: false,
      searchRegex: false,
      ...overrides,
    }
  }

  beforeEach(() => {
    registry = new CommandRegistry()
    apiClient = createMockApiClient()
    handlers = makeHandlers()
    toastSpy = vi.spyOn(ToastNotificationModule, 'showToast').mockImplementation(() => {})
    registerCoreAppCommands(registry, () => handlers)
  })

  afterEach(() => {
    setActiveEditorView(null)
    toastSpy.mockRestore()
  })

  describe('markdown:add-alias', () => {
    it('creates a frontmatter block with an empty aliases array when none exists', () => {
      const view = new EditorView({ state: EditorState.create({ doc: 'Just body text.' }), parent: document.body })
      setActiveEditorView(view)

      registry.executeCommand('markdown:add-alias')

      expect(view.state.doc.toString()).toBe('---\naliases: []\n---\nJust body text.')
      view.destroy()
    })

    it('adds an aliases key to an existing frontmatter block', () => {
      const view = new EditorView({ state: EditorState.create({ doc: '---\ntags: [a]\n---\nBody.' }), parent: document.body })
      setActiveEditorView(view)

      registry.executeCommand('markdown:add-alias')

      expect(view.state.doc.toString()).toBe('---\ntags: [a]\naliases: []\n---\nBody.')
      view.destroy()
    })

    it('does nothing when aliases already exists', () => {
      const doc = '---\naliases: [foo]\n---\nBody.'
      const view = new EditorView({ state: EditorState.create({ doc }), parent: document.body })
      setActiveEditorView(view)

      registry.executeCommand('markdown:add-alias')

      expect(view.state.doc.toString()).toBe(doc)
      view.destroy()
    })

    it('shows an error toast and does nothing when no editor is active', () => {
      setActiveEditorView(null)

      registry.executeCommand('markdown:add-alias')

      expect(toastSpy).toHaveBeenCalledWith('error', expect.any(String))
    })
  })

  describe('markdown:add-metadata-property', () => {
    it('adds a placeholder "property" key when no frontmatter exists', () => {
      const view = new EditorView({ state: EditorState.create({ doc: 'Body.' }), parent: document.body })
      setActiveEditorView(view)

      registry.executeCommand('markdown:add-metadata-property')

      expect(view.state.doc.toString()).toBe('---\nproperty: ""\n---\nBody.')
      view.destroy()
    })

    it('increments the placeholder key when "property" is already taken', () => {
      const view = new EditorView({ state: EditorState.create({ doc: '---\nproperty: existing\n---\nBody.' }), parent: document.body })
      setActiveEditorView(view)

      registry.executeCommand('markdown:add-metadata-property')

      expect(view.state.doc.toString()).toBe('---\nproperty: existing\nproperty-1: ""\n---\nBody.')
      view.destroy()
    })
  })

  describe('markdown:clear-metadata-properties', () => {
    it('removes the entire frontmatter block', () => {
      const view = new EditorView({ state: EditorState.create({ doc: '---\ntags: [a]\naliases: [b]\n---\nBody.' }), parent: document.body })
      setActiveEditorView(view)

      registry.executeCommand('markdown:clear-metadata-properties')

      expect(view.state.doc.toString()).toBe('Body.')
      view.destroy()
    })

    it('does nothing when there is no frontmatter block', () => {
      const view = new EditorView({ state: EditorState.create({ doc: 'Body.' }), parent: document.body })
      setActiveEditorView(view)

      registry.executeCommand('markdown:clear-metadata-properties')

      expect(view.state.doc.toString()).toBe('Body.')
      view.destroy()
    })
  })
})

describe('registerCoreAppCommands — canvas:jump-to-group', () => {
  let registry: CommandRegistry
  let apiClient: IApiClient
  let handlers: CoreAppCommandHandlers
  let toastSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    registry = new CommandRegistry()
    apiClient = createMockApiClient()
    handlers = {
      vaultId: 'vault-1',
      vaultName: 'My Vault',
      apiClient,
      tabState: { tabs: [makeTab()], activeTabId: 'vault-1::note.md' },
      tabDispatch: vi.fn(),
      appDispatch: vi.fn(),
      authState: { isAuthenticated: true, user: makeUser(), token: null, csrfToken: null, mustChangePassword: false, isLoading: false, error: null },
      authDispatch: vi.fn(),
      showSidebar: false,
      showRightPanel: false,
      rightPanelSections: [],
      rightPanelDispatch: vi.fn(),
      leftPanelSections: [],
      leftPanelDispatch: vi.fn(),
      onToggleSidebar: vi.fn(),
      onToggleRightPanel: vi.fn(),
      onOpenSettings: vi.fn(),
      onNavigate: vi.fn(),
      onCreateFile: vi.fn(),
      onCreateFolder: vi.fn(),
      onCreateCanvas: vi.fn(),
      onOpenGraph: vi.fn(),
      onOpenLocalGraph: vi.fn(),
      onDailyNote: vi.fn(),
      onDailyNoteOffset: vi.fn(),
      onCreateWelcomeVault: vi.fn(),
      onOpenTemplateSelector: vi.fn(),
      onOpenReleaseNotes: vi.fn(),
      onOpenDebugInfo: vi.fn(),
      onNavigateBack: vi.fn(),
      onNavigateForward: vi.fn(),
      onOpenQuickSwitcher: vi.fn(),
      searchQuery: '',
      searchCaseSensitive: false,
      searchRegex: false,
    }
    toastSpy = vi.spyOn(ToastNotificationModule, 'showToast').mockImplementation(() => {})
    registerCoreAppCommands(registry, () => handlers)
  })

  afterEach(() => {
    setActiveCanvasController(null)
    toastSpy.mockRestore()
  })

  it('delegates to the active canvas controller when one is registered', () => {
    const jumpToSelectedGroup = vi.fn().mockReturnValue(true)
    setActiveCanvasController({ jumpToSelectedGroup, exportAsImage: vi.fn() })

    registry.executeCommand('canvas:jump-to-group')

    expect(jumpToSelectedGroup).toHaveBeenCalled()
    expect(toastSpy).not.toHaveBeenCalled()
  })

  it('shows an error toast when the controller reports nothing to jump to', () => {
    setActiveCanvasController({ jumpToSelectedGroup: () => false, exportAsImage: vi.fn() })

    registry.executeCommand('canvas:jump-to-group')

    expect(toastSpy).toHaveBeenCalledWith('error', expect.any(String))
  })

  it('shows an error toast when no canvas is active', () => {
    registry.executeCommand('canvas:jump-to-group')

    expect(toastSpy).toHaveBeenCalledWith('error', expect.any(String))
  })

  describe('canvas:export-as-image', () => {
    it('delegates to the active canvas controller when one is registered', () => {
      const exportAsImage = vi.fn().mockResolvedValue(true)
      setActiveCanvasController({ jumpToSelectedGroup: () => false, exportAsImage })

      registry.executeCommand('canvas:export-as-image')

      expect(exportAsImage).toHaveBeenCalled()
      expect(toastSpy).not.toHaveBeenCalled()
    })

    it('shows an error toast when no canvas is active', () => {
      registry.executeCommand('canvas:export-as-image')

      expect(toastSpy).toHaveBeenCalledWith('error', expect.any(String))
    })
  })
})

describe('registerCoreAppCommands — canvas:convert-to-file', () => {
  it('converts the active canvas to a .md file, saves it, and opens it', async () => {
    const canvasJson = JSON.stringify({
      nodes: [{ id: '1', type: 'text', x: 0, y: 0, width: 100, height: 100, text: 'Hello canvas' }],
      edges: [],
    })
    const fetchFileContent = vi.fn()
      .mockResolvedValueOnce({ content: canvasJson, isBinary: false })
      .mockResolvedValueOnce({ content: 'Hello canvas', isBinary: false })
    const saveFile = vi.fn().mockResolvedValue(undefined)
    const apiClient = createMockApiClient({ fetchFileContent, saveFile })
    const tabDispatch = vi.fn()
    const registry = new CommandRegistry()
    const handlers = makeMinimalHandlers({ apiClient, tabDispatch, activeTab: makeTab({ filePath: 'Board.canvas', fileName: 'Board.canvas' }) })
    registerCoreAppCommands(registry, () => handlers)

    registry.executeCommand('canvas:convert-to-file')
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()

    expect(saveFile).toHaveBeenCalledWith('vault-1', 'Board.md', 'Hello canvas')
    expect(tabDispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'OPEN_TAB', payload: expect.objectContaining({ filePath: 'Board.md' }) }))
  })

  it('shows an error toast when the active tab is not a canvas', () => {
    const toastSpy = vi.spyOn(ToastNotificationModule, 'showToast').mockImplementation(() => {})
    const registry = new CommandRegistry()
    const handlers = makeMinimalHandlers({ activeTab: makeTab({ filePath: 'note.md' }) })
    registerCoreAppCommands(registry, () => handlers)

    registry.executeCommand('canvas:convert-to-file')

    expect(toastSpy).toHaveBeenCalledWith('error', expect.any(String))
    toastSpy.mockRestore()
  })
})

describe('registerCoreAppCommands — note-composer:*', () => {
  afterEach(() => {
    setActiveEditorView(null)
  })

  describe('note-composer:split-file', () => {
    it('extracts the current selection into a new file and replaces it with a wikilink', async () => {
      const view = new EditorView({ state: EditorState.create({ doc: 'Before. Selected text. After.' }), parent: document.body })
      const from = 'Before. '.length
      const to = from + 'Selected text.'.length
      view.dispatch({ selection: { anchor: from, head: to } })
      setActiveEditorView(view)

      const saveFile = vi.fn().mockResolvedValue(undefined)
      const apiClient = createMockApiClient({ saveFile })
      const registry = new CommandRegistry()
      const handlers = makeMinimalHandlers({ apiClient, activeTab: makeTab({ filePath: 'notes/Doc.md' }) })
      registerCoreAppCommands(registry, () => handlers)
      const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('New Note')

      registry.executeCommand('note-composer:split-file')
      await Promise.resolve()
      await Promise.resolve()

      expect(saveFile).toHaveBeenCalledWith('vault-1', 'notes/New Note.md', 'Selected text.')
      expect(view.state.doc.toString()).toBe('Before. [[New Note]] After.')
      promptSpy.mockRestore()
      view.destroy()
    })

    it('shows an error toast when there is no selection', () => {
      const view = new EditorView({ state: EditorState.create({ doc: 'No selection here.' }), parent: document.body })
      setActiveEditorView(view)
      const toastSpy = vi.spyOn(ToastNotificationModule, 'showToast').mockImplementation(() => {})
      const registry = new CommandRegistry()
      const handlers = makeMinimalHandlers({ activeTab: makeTab() })
      registerCoreAppCommands(registry, () => handlers)

      registry.executeCommand('note-composer:split-file')

      expect(toastSpy).toHaveBeenCalledWith('error', expect.any(String))
      toastSpy.mockRestore()
      view.destroy()
    })

    it('does nothing when the user cancels the filename prompt', async () => {
      const view = new EditorView({ state: EditorState.create({ doc: 'Selected text.' }), parent: document.body })
      view.dispatch({ selection: { anchor: 0, head: 8 } })
      setActiveEditorView(view)
      const saveFile = vi.fn()
      const apiClient = createMockApiClient({ saveFile })
      const registry = new CommandRegistry()
      const handlers = makeMinimalHandlers({ apiClient, activeTab: makeTab() })
      registerCoreAppCommands(registry, () => handlers)
      const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue(null)

      registry.executeCommand('note-composer:split-file')
      await Promise.resolve()

      expect(saveFile).not.toHaveBeenCalled()
      promptSpy.mockRestore()
      view.destroy()
    })
  })

  describe('note-composer:extract-heading', () => {
    it('extracts the heading section at the cursor into a new file', async () => {
      const doc = '# Title\n\n## My Heading\n\nSection body.'
      const view = new EditorView({ state: EditorState.create({ doc }), parent: document.body })
      view.dispatch({ selection: { anchor: doc.indexOf('Section body') } })
      setActiveEditorView(view)

      const saveFile = vi.fn().mockResolvedValue(undefined)
      const apiClient = createMockApiClient({ saveFile })
      const registry = new CommandRegistry()
      const handlers = makeMinimalHandlers({ apiClient, activeTab: makeTab({ filePath: 'Doc.md' }) })
      registerCoreAppCommands(registry, () => handlers)

      registry.executeCommand('note-composer:extract-heading')
      await Promise.resolve()
      await Promise.resolve()

      expect(saveFile).toHaveBeenCalledWith('vault-1', 'My Heading.md', '## My Heading\n\nSection body.')
      expect(view.state.doc.toString()).toBe('# Title\n\n[[My Heading]]')
      view.destroy()
    })

    it('shows an error toast when there is no heading above the cursor', () => {
      const view = new EditorView({ state: EditorState.create({ doc: 'No heading here.' }), parent: document.body })
      setActiveEditorView(view)
      const toastSpy = vi.spyOn(ToastNotificationModule, 'showToast').mockImplementation(() => {})
      const registry = new CommandRegistry()
      const handlers = makeMinimalHandlers({ activeTab: makeTab() })
      registerCoreAppCommands(registry, () => handlers)

      registry.executeCommand('note-composer:extract-heading')

      expect(toastSpy).toHaveBeenCalledWith('error', expect.any(String))
      toastSpy.mockRestore()
      view.destroy()
    })
  })

  describe('note-composer:merge-file', () => {
    it('appends the active file to the prompted target, saves it, deletes the source, and closes its tab', async () => {
      const fetchFileContent = vi.fn().mockResolvedValue({ content: 'Target content.', isBinary: false })
      const saveFile = vi.fn().mockResolvedValue(undefined)
      const deleteContent = vi.fn().mockResolvedValue(undefined)
      const apiClient = createMockApiClient({ fetchFileContent, saveFile, deleteContent })
      const tabDispatch = vi.fn()
      const registry = new CommandRegistry()
      const handlers = makeMinimalHandlers({
        apiClient, tabDispatch,
        activeTab: makeTab({ filePath: 'source.md', content: 'Source content.' }),
      })
      registerCoreAppCommands(registry, () => handlers)
      const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('target.md')

      registry.executeCommand('note-composer:merge-file')
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()

      expect(fetchFileContent).toHaveBeenCalledWith('vault-1', 'target.md')
      expect(saveFile).toHaveBeenCalledWith('vault-1', 'target.md', 'Target content.\n\nSource content.')
      expect(deleteContent).toHaveBeenCalledWith('vault-1', 'source.md')
      expect(tabDispatch).toHaveBeenCalledWith({ type: 'CLOSE_TABS_BY_PATH', payload: { pathPrefix: 'source.md' } })
      promptSpy.mockRestore()
    })

    it('shows an error toast when the target equals the source', async () => {
      const toastSpy = vi.spyOn(ToastNotificationModule, 'showToast').mockImplementation(() => {})
      const registry = new CommandRegistry()
      const handlers = makeMinimalHandlers({ activeTab: makeTab({ filePath: 'source.md' }) })
      registerCoreAppCommands(registry, () => handlers)
      const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('source.md')

      registry.executeCommand('note-composer:merge-file')
      await Promise.resolve()

      expect(toastSpy).toHaveBeenCalledWith('error', expect.any(String))
      toastSpy.mockRestore()
      promptSpy.mockRestore()
    })

    it('does nothing when the user cancels the target prompt', async () => {
      const saveFile = vi.fn()
      const apiClient = createMockApiClient({ saveFile })
      const registry = new CommandRegistry()
      const handlers = makeMinimalHandlers({ apiClient, activeTab: makeTab() })
      registerCoreAppCommands(registry, () => handlers)
      const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue(null)

      registry.executeCommand('note-composer:merge-file')
      await Promise.resolve()

      expect(saveFile).not.toHaveBeenCalled()
      promptSpy.mockRestore()
    })
  })
})

/** Minimal CoreAppCommandHandlers builder shared by tests below that don't need the full beforeEach setup above. */
describe('registerCoreAppCommands — footnotes and commands without an equivalent', () => {
  afterEach(() => {
    setActiveEditorView(null)
  })

  it('footnotes:open moves the cursor to the first footnote definition', () => {
    const doc = 'Behauptung[^1] und noch eine[^2].\n\n[^1]: Erste Quelle\n[^2]: Zweite Quelle\n'
    const view = new EditorView({ state: EditorState.create({ doc }), parent: document.body })
    setActiveEditorView(view)
    const registry = new CommandRegistry()
    registerCoreAppCommands(registry, () => makeMinimalHandlers({ activeTab: makeTab() }))

    registry.executeCommand('footnotes:open')

    expect(view.state.selection.main.head).toBe(doc.indexOf('[^1]: '))
    view.destroy()
  })

  it('footnotes:open says so when the note has no footnotes', () => {
    const toastSpy = vi.spyOn(ToastNotificationModule, 'showToast').mockImplementation(() => {})
    const view = new EditorView({ state: EditorState.create({ doc: 'Eine Notiz ohne Fussnoten.' }), parent: document.body })
    setActiveEditorView(view)
    const registry = new CommandRegistry()
    registerCoreAppCommands(registry, () => makeMinimalHandlers({ activeTab: makeTab() }))

    registry.executeCommand('footnotes:open')

    expect(toastSpy).toHaveBeenCalledWith('info', expect.stringContaining('keine Fußnoten'))
    toastSpy.mockRestore()
    view.destroy()
  })

  it('explains a command Slatebase has no equivalent for instead of doing nothing', () => {
    const toastSpy = vi.spyOn(ToastNotificationModule, 'showToast').mockImplementation(() => {})
    const registry = new CommandRegistry()
    registerCoreAppCommands(registry, () => makeMinimalHandlers({ activeTab: makeTab() }))

    registry.executeCommand('bases:insert')
    registry.executeCommand('open-with-default-app:open')

    expect(toastSpy).toHaveBeenNthCalledWith(1, 'info', expect.stringContaining('Bases'))
    expect(toastSpy).toHaveBeenNthCalledWith(2, 'info', expect.stringContaining('server'))
    toastSpy.mockRestore()
  })

  it('still registers those commands, so a plugin lookup resolves them', () => {
    const registry = new CommandRegistry()
    registerCoreAppCommands(registry, () => makeMinimalHandlers({ activeTab: makeTab() }))

    expect(registry.getCommand('bases:insert')).toBeDefined()
    expect(registry.getCommand('workspace:split-vertical')).toBeDefined()
  })
})

function makeMinimalHandlers(overrides: { apiClient?: IApiClient; tabDispatch?: ReturnType<typeof vi.fn>; activeTab: TabEntry }): CoreAppCommandHandlers {
  const apiClient = overrides.apiClient ?? createMockApiClient()
  return {
    vaultId: 'vault-1',
    vaultName: 'My Vault',
    apiClient,
    tabState: { tabs: [overrides.activeTab], activeTabId: overrides.activeTab.id },
    tabDispatch: overrides.tabDispatch ?? vi.fn(),
    appDispatch: vi.fn(),
    authState: { isAuthenticated: true, user: makeUser(), token: null, csrfToken: null, mustChangePassword: false, isLoading: false, error: null },
    authDispatch: vi.fn(),
    showSidebar: false,
    showRightPanel: false,
    rightPanelSections: [],
    rightPanelDispatch: vi.fn(),
    leftPanelSections: [],
    leftPanelDispatch: vi.fn(),
    onToggleSidebar: vi.fn(),
    onToggleRightPanel: vi.fn(),
    onOpenSettings: vi.fn(),
    onNavigate: vi.fn(),
    onCreateFile: vi.fn(),
    onCreateFolder: vi.fn(),
    onCreateCanvas: vi.fn(),
    onOpenGraph: vi.fn(),
    onOpenLocalGraph: vi.fn(),
    onDailyNote: vi.fn(),
    onDailyNoteOffset: vi.fn(),
    onCreateWelcomeVault: vi.fn(),
    onOpenTemplateSelector: vi.fn(),
    onOpenReleaseNotes: vi.fn(),
    onOpenDebugInfo: vi.fn(),
    onNavigateBack: vi.fn(),
    onNavigateForward: vi.fn(),
    onOpenQuickSwitcher: vi.fn(),
    searchQuery: '',
    searchCaseSensitive: false,
    searchRegex: false,
  }
}
