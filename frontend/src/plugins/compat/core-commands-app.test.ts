import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EditorView } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { history } from '@codemirror/commands'
import { CommandRegistry } from './command-registry'
import { registerCoreAppCommands, type CoreAppCommandHandlers } from './core-commands-app'
import { EditorShim, setEditorViewAccessor } from './editor-shim'
import { setActiveEditorView } from '../../editor/plugin-extensions'
import { favoritesStore } from '../../state/favoritesStore'
import * as ToastNotificationModule from '../../components/ToastNotification'
import type { IApiClient } from '../../api'
import type { TabEntry } from '../../state/tabState'
import type { PublicUserInfo } from '../../state/authState'

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
  let contextPanelDispatch: ReturnType<typeof vi.fn>
  let sidebarPanelDispatch: ReturnType<typeof vi.fn>
  let onToggleSidebar: ReturnType<typeof vi.fn>
  let onToggleRightPanel: ReturnType<typeof vi.fn>

  beforeEach(() => {
    registry = new CommandRegistry()
    apiClient = createMockApiClient()
    tabDispatch = vi.fn()
    appDispatch = vi.fn()
    authDispatch = vi.fn()
    contextPanelDispatch = vi.fn()
    sidebarPanelDispatch = vi.fn()
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
      contextPanelSections: [{ id: 'sec-1', viewIds: ['outline', 'links', 'tags', 'properties', 'search'], activeViewId: 'outline', heightFraction: 1 }],
      contextPanelDispatch,
      sidebarPanelSections: [{ id: 'side-1', viewIds: ['explorer', 'favorites', 'recent'], activeViewId: 'explorer', heightFraction: 1 }],
      sidebarPanelDispatch,
      onToggleSidebar,
      onToggleRightPanel,
      onOpenSettings: vi.fn(),
      onNavigate: vi.fn(),
      onCreateFile: vi.fn(),
      onCreateFolder: vi.fn(),
      onCreateCanvas: vi.fn(),
      onOpenGraph: vi.fn(),
      onDailyNote: vi.fn(),
      onOpenTemplateSelector: vi.fn(),
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
    expect(contextPanelDispatch).toHaveBeenCalledWith({ type: 'SET_ACTIVE_VIEW', sectionId: 'sec-1', viewId: 'outline' })
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
      contextPanelSections: [],
      contextPanelDispatch: vi.fn(),
      sidebarPanelSections: [],
      sidebarPanelDispatch: vi.fn(),
      onToggleSidebar: vi.fn(),
      onToggleRightPanel: vi.fn(),
      onOpenSettings: vi.fn(),
      onNavigate: vi.fn(),
      onCreateFile: vi.fn(),
      onCreateFolder: vi.fn(),
      onCreateCanvas: vi.fn(),
      onOpenGraph: vi.fn(),
      onDailyNote: vi.fn(),
      onOpenTemplateSelector: vi.fn(),
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
      contextPanelSections: [],
      contextPanelDispatch: vi.fn(),
      sidebarPanelSections: [],
      sidebarPanelDispatch: vi.fn(),
      onToggleSidebar: vi.fn(),
      onToggleRightPanel: vi.fn(),
      onOpenSettings: vi.fn(),
      onNavigate: vi.fn(),
      onCreateFile: vi.fn(),
      onCreateFolder: vi.fn(),
      onCreateCanvas: vi.fn(),
      onOpenGraph: vi.fn(),
      onDailyNote: vi.fn(),
      onOpenTemplateSelector: vi.fn(),
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
