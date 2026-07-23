import { useEffect, useRef, useCallback, useState, useMemo } from 'react'
import { AppProvider, useAppContext, loadVaults, importFile, importFolder, exportVault, reloadVaultTree } from './state'
import { ApiClient } from './api'
import { AuthProvider, useAuthContext } from './state/authContext'
import { TabProvider, useTabContext } from './state/tabContext'
import { FeatureProvider, useFeatureContext } from './state/featureContext'
import { SearchProvider } from './state/searchContext'
import { createDailyNoteService, loadDailyNotesConfigFromServer } from './state/dailyNoteService'
import { openTab } from './state/tabActions'
import { initialize as initializeRecentFiles, disconnect as disconnectRecentFiles } from './state/recentFilesStore'
import { initialize as initializeFavorites, disconnect as disconnectFavorites } from './state/favoritesStore'
import { initialize as initializeKeybindings, disconnect as disconnectKeybindings, matchesShortcut } from './state/keybindingsStore'
import { I18nProvider, useTranslation } from './i18n'
import { ToastProvider } from './components/Toast'
import { RealtimeProvider, type RealtimeEventHandlers } from './components/RealtimeProvider'
import { ToastNotification, showToast } from './components/ToastNotification'
import { ConnectionIndicator } from './components/ConnectionIndicator'
import { useRealtimeContext } from './state/realtimeContext'
import {
  dispatchRealtimeChatMessage,
  dispatchRealtimeUnreadUpdate,
  dispatchRealtimeConversationPreview,
  onRealtimeUnreadUpdate,
} from './state/realtimeChatBridge'
import { dispatchRealtimeVaultChange, onRealtimeVaultChange } from './state/realtimeVaultBridge'
import type { VaultChangeEvent } from './state/realtimeVaultBridge'
import { FileExplorer } from './components/FileExplorer'
import { TabContent } from './components/TabContent'
import { ErrorBoundary } from './components/ErrorBoundary'
import { UserMenu } from './components/UserMenu'
import { LoginPage } from './components/LoginPage'
import { ChangePasswordPage } from './components/ChangePasswordPage'
import { ProfilePage } from './components/ProfilePage'
import { SessionsPage } from './components/SessionsPage'
import { AdminUsersPage } from './components/AdminUsersPage'
import { AdminConfigPage } from './components/AdminConfigPage'
import { AdminAuditPage } from './components/AdminAuditPage'
import { AdminLogsPage } from './components/AdminLogsPage'
import { AdminVaultsPage } from './components/AdminVaultsPage'
import { VaultSharing } from './components/VaultSharing'
import { VaultDeletionWorkflow } from './components/VaultDeletionWorkflow'
import { ChatPage } from './components/ChatPage'
import { SlatebaseLogo } from './components/SlatebaseLogo'
import { SidebarToolbar } from './components/SidebarToolbar'
import { StatusBar } from './components/StatusBar'
import { MyVaultsPage } from './components/MyVaultsPage'
import { SyncConfigPage } from './components/SyncConfigPage'
import { SyncLogPage } from './components/SyncLogPage'
import { ConflictWizardPage } from './components/ConflictWizardPage'
import { McpTokensPage } from './components/McpTokensPage'
import { PluginManagementPage } from './components/PluginManagementPage'
import { PluginViewPanel } from './components/PluginViewPanel'
import { TrashView } from './components/TrashView'
import { VersionBrowser } from './components/VersionBrowser'
import { useVersionInfo } from './hooks/useVersionInfo'
import { SyncProvider } from './state/syncContext'
import { ContextPanelProvider } from './state/contextPanelContext'
import { SidebarPanelProvider } from './state/sidebarPanelContext'
import { ContextPanel } from './components/context-panel/ContextPanel'
import { SettingsPanel } from './components/settings/SettingsPanel'
import { SidebarPanel } from './components/sidebar-panel'
import { PluginProvider } from './plugins/compat/plugin-context'
import { CommandPaletteContainer } from './components/CommandPaletteContainer'
import { useResize } from './hooks/useResize'
import { useStatusBar } from './hooks/useStatusBar'
import { initialize as initializeWorkspace, getState as getWorkspaceState, updateLayout as updateWorkspaceLayout, updateTabs as updateWorkspaceTabs, update as updateWorkspace, clear as clearWorkspace, flush as flushWorkspace } from './state/workspaceStore'
import {
  User, Settings, Shield, FileText, Clock,
  Database, Share2, Trash2, Server,
  PanelRight, PanelLeft, X, Eye, Pencil, MessageCircle, RefreshCw, Key, ScrollText, Plug, GitMerge,
} from 'lucide-react'
import { getFileIcon, getFileIconClass, getDisplayName } from './utils/fileIcons'
import './App.css'

/** Singleton ApiClient instance shared across the app. */
const apiClient = new ApiClient()

/** Singleton DailyNoteService instance. */
const dailyNoteService = createDailyNoteService(apiClient)

// Synchronous token restore from localStorage — eliminates race condition
// where API calls fire before the useEffect in AuthGuard sets the token.
const _storedToken = localStorage.getItem('slatebase_token')
const _storedCsrf = localStorage.getItem('slatebase_csrf')
if (_storedToken) apiClient.setToken(_storedToken)
if (_storedCsrf) apiClient.setCsrfToken(_storedCsrf)

// Synchronous workspace state restore from localStorage — must run before
// any component reads getWorkspaceState() in their useState initializers.
initializeWorkspace()

/** LocalStorage key for persisting the last selected vault. */
const LAST_VAULT_KEY = 'slatebase_last_vault'

/** Available navigation pages in the app (opened as tabs in the main content area). */
export type AppPage =
  | 'my-vaults'
  | 'profile'
  | 'sessions'
  | 'chat'
  | 'admin-users'
  | 'admin-vaults'
  | 'admin-config'
  | 'admin-audit'
  | 'admin-logs'
  | 'vault-sharing'
  | 'vault-deletion'
  | 'sync-config'
  | 'sync-log'
  | 'conflicts'
  | 'mcp-tokens'
  | 'plugins'
  | 'trash'

/** Translation keys for navigation pages. */
const PAGE_LABEL_KEYS: Record<AppPage, string> = {
  'my-vaults': 'pages.myVaults',
  profile: 'pages.profile',
  sessions: 'pages.sessions',
  chat: 'pages.chat',
  'admin-users': 'pages.adminUsers',
  'admin-vaults': 'pages.adminVaults',
  'admin-config': 'pages.adminConfig',
  'admin-audit': 'pages.adminAudit',
  'admin-logs': 'pages.adminLogs',
  'vault-sharing': 'pages.vaultSharing',
  'vault-deletion': 'pages.vaultDeletion',
  'sync-config': 'pages.syncConfig',
  'sync-log': 'pages.syncLog',
  conflicts: 'pages.conflicts',
  'mcp-tokens': 'pages.mcpTokens',
  plugins: 'pages.plugins',
  trash: 'pages.trash',
}

/** Icons for settings pages. */
const PAGE_ICONS: Partial<Record<AppPage, React.ReactNode>> = {
  'my-vaults': <Database size={13} />,
  profile: <User size={13} />,
  sessions: <Clock size={13} />,
  chat: <MessageCircle size={13} />,
  'admin-users': <Shield size={13} />,
  'admin-vaults': <Server size={13} />,
  'admin-config': <Settings size={13} />,
  'admin-audit': <FileText size={13} />,
  'admin-logs': <ScrollText size={13} />,
  'vault-sharing': <Share2 size={13} />,
  'vault-deletion': <Trash2 size={13} />,
  'sync-config': <RefreshCw size={13} />,
  'sync-log': <Clock size={13} />,
  conflicts: <GitMerge size={13} />,
  'mcp-tokens': <Key size={13} />,
  plugins: <Plug size={13} />,
  trash: <Trash2 size={13} />,
}

/**
 * Hint shown when navigating directly to a disabled feature page.
 */
function FeatureDisabledHint({ featureName }: { featureName: string }) {
  return (
    <div style={{ padding: 32, color: 'var(--text-muted)', textAlign: 'center' }}>
      <p>Das Feature „{featureName}" ist derzeit deaktiviert.</p>
    </div>
  )
}

/**
 * Small wrapper that reads RealtimeContext to render the ConnectionIndicator.
 */
function RealtimeConnectionIndicator() {
  const { state } = useRealtimeContext()

  return (
    <ConnectionIndicator
      status={state.connectionStatus}
    />
  )
}

/**
 * Inner component that uses AppContext and TabContext to render the main vault view.
 */
function AppContent() {
  const { state, dispatch } = useAppContext()
  const { authState, authDispatch } = useAuthContext()
  const { tabState, tabDispatch } = useTabContext()
  const { isEnabled } = useFeatureContext()
  const { t } = useTranslation()
  const prevVaultId = useRef<string | null>(null)
  // Per-vault tab memory: saves tabs when switching away, restores when switching back
  const vaultTabsCacheRef = useRef<Map<string, { tabs: Array<{ filePath: string; fileName: string }>; activeTabId: string | null }>>(new Map())
  // Navigation tabs: list of open pages + which is active
  const [openSettingsPages, setOpenSettingsPages] = useState<AppPage[]>([])
  const [activeSettingsPage, setActiveSettingsPage] = useState<AppPage | null>(() => getWorkspaceState().activeSettingsPage)
  const [showRightPanel, setShowRightPanel] = useState(() => getWorkspaceState().rightPanelVisible)
  const [showSidebar, setShowSidebar] = useState(() => getWorkspaceState().sidebarVisible)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)
  const createFileTriggerRef = useRef<(() => void) | null>(null)
  const createVaultTriggerRef = useRef<(() => void) | null>(null)
  const createCanvasTriggerRef = useRef<(() => void) | null>(null)

  const handleRegisterCreateFile = useCallback((trigger: () => void) => { createFileTriggerRef.current = trigger }, [])
  const handleRegisterCreateVault = useCallback((trigger: () => void) => { createVaultTriggerRef.current = trigger }, [])
  const handleRegisterCreateCanvas = useCallback((trigger: () => void) => { createCanvasTriggerRef.current = trigger }, [])

  // Version browser state: which file to show versions for
  const [versionBrowserTarget, setVersionBrowserTarget] = useState<{ vaultId: string; filePath: string } | null>(null)

  const sidebar = useResize(260, 180, 400, 'left', 'sidebarWidth')
  const rightPanel = useResize(240, 160, 500, 'right', 'rightPanelWidth')
  const versionInfo = useVersionInfo()

  // Refresh key for sidebar panel views (favorites, recent files)
  const [sidebarRefreshKey, setSidebarRefreshKey] = useState(0)

  // Unified Settings Panel state
  const [settingsOpen, setSettingsOpen] = useState(false)

  // Status bar visibility (persisted in localStorage)
  const { visible: statusBarVisible } = useStatusBar()

  // Global unread count polling (30-second interval)
  // Disabled when SSE connection is active (realtime pushes unread counts)
  const { state: realtimeState } = useRealtimeContext()
  const [globalUnreadCount, setGlobalUnreadCount] = useState(0)

  // Register the unread update callback with the realtime bridge
  useEffect(() => {
    return onRealtimeUnreadUpdate((totalUnread) => {
      setGlobalUnreadCount(totalUnread)
    })
  }, [])

  // Register the vault change callback with the realtime bridge
  // Refreshes the file explorer tree and reloads affected open tabs
  useEffect(() => {
    return onRealtimeVaultChange((event) => {
      const { vaultId, action, path } = event

      // Refresh the file explorer tree for the affected vault
      // Only refresh if the vault tree is already loaded (user has expanded it)
      if (state.vaultTrees[vaultId] !== undefined) {
        void reloadVaultTree(dispatch, apiClient, vaultId)
      }

      // Reload content of open tabs affected by this change
      const affectedTabs = tabState.tabs.filter(
        (tab) => tab.vaultId === vaultId && tab.filePath === path
      )

      for (const tab of affectedTabs) {
        if (action === 'deleted') {
          // File was deleted — close the tab
          tabDispatch({ type: 'CLOSE_TAB', payload: { tabId: tab.id } })
        } else if (action === 'saved' || action === 'renamed') {
          // File was saved/renamed by another user — reload content if no unsaved edits
          if (tab.editBuffer === null) {
            // No local edits — safe to reload
            tabDispatch({ type: 'TAB_CONTENT_LOADED', payload: { tabId: tab.id, content: '', isBinary: tab.isBinary } })
            // Fetch fresh content
            apiClient.fetchFileContent(vaultId, path).then((result) => {
              tabDispatch({
                type: 'TAB_CONTENT_LOADED',
                payload: { tabId: tab.id, content: result.content, isBinary: result.isBinary },
              })
            }).catch(() => {
              // If fetch fails (e.g. file no longer exists), close tab
              tabDispatch({ type: 'CLOSE_TAB', payload: { tabId: tab.id } })
            })
          }
          // If there are unsaved local edits, don't reload — user would lose their work
          // The toast notification already informed them about the external change
        }
      }
    })
  }, [state.vaultTrees, tabState.tabs, dispatch, tabDispatch])

  useEffect(() => {
    // Skip polling when SSE is connected — unread updates come via realtime push
    if (realtimeState.connectionStatus === 'connected') return

    let cancelled = false

    const poll = async () => {
      try {
        const result = await apiClient.getUnreadTotal()
        if (!cancelled) {
          setGlobalUnreadCount(result.total)
        }
      } catch {
        // Silently ignore polling errors (e.g. network issues, 401)
      }
    }

    // Initial poll
    poll()

    // Set up 30-second interval
    const intervalId = setInterval(poll, 30_000)

    return () => {
      cancelled = true
      clearInterval(intervalId)
    }
  }, [realtimeState.connectionStatus])

  // Fetch vaults on mount
  useEffect(() => {
    loadVaults(dispatch, apiClient)
    // Initialize per-user server-synced stores
    initializeRecentFiles(apiClient).catch(() => { /* ignore */ })
    initializeFavorites(apiClient).catch(() => { /* ignore */ })
    initializeKeybindings(apiClient).catch(() => { /* ignore */ })
  }, [dispatch])

  // Restore last selected vault after vaults are loaded
  useEffect(() => {
    if (state.vaults.length === 0) return
    if (state.selectedVaultId !== null) return
    // Skip if workspace store has persisted state — the restore effect handles vault selection
    if (getWorkspaceState().selectedVaultId) return
    const lastId = localStorage.getItem(LAST_VAULT_KEY)
    if (lastId && state.vaults.some((v) => v.id === lastId)) {
      dispatch({ type: 'VAULT_SELECTED', payload: lastId })
    }
  }, [state.vaults, state.selectedVaultId, dispatch])

  // Persist selected vault to localStorage
  useEffect(() => {
    if (state.selectedVaultId) {
      localStorage.setItem(LAST_VAULT_KEY, state.selectedVaultId)
    }
  }, [state.selectedVaultId])

  // Persist panel visibility to workspace store
  useEffect(() => {
    updateWorkspaceLayout({ sidebarVisible: showSidebar, rightPanelVisible: showRightPanel })
  }, [showSidebar, showRightPanel])

  // Persist active settings page and selected vault to workspace store
  useEffect(() => {
    updateWorkspace({ activeSettingsPage, selectedVaultId: state.selectedVaultId })
  }, [activeSettingsPage, state.selectedVaultId])

  // Persist open tabs to workspace store (skip during initial restore phase)
  const isRestoringRef = useRef(true)
  useEffect(() => {
    // Don't persist until the restore effect has run at least once
    if (isRestoringRef.current) return
    const persistedTabs = tabState.tabs.map((t) => ({
      vaultId: t.vaultId,
      filePath: t.filePath,
      fileName: t.fileName,
      mode: t.mode,
    }))
    updateWorkspaceTabs(persistedTabs, tabState.activeTabId)
  }, [tabState.tabs, tabState.activeTabId])

  // Flush workspace state on page unload
  useEffect(() => {
    const handleBeforeUnload = () => { flushWorkspace() }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [])

  // Restore UI state from workspace store (survives page reload and session expiry)
  const hasRestoredRef = useRef(false)
  useEffect(() => {
    if (hasRestoredRef.current) return
    if (state.vaults.length === 0) return

    const wsState = getWorkspaceState()
    // Only restore if there are persisted tabs
    if (wsState.tabs.length === 0 && !wsState.selectedVaultId) {
      // Nothing to restore — enable persistence immediately
      hasRestoredRef.current = true
      isRestoringRef.current = false
      return
    }

    hasRestoredRef.current = true

    // Restore vault selection
    if (wsState.selectedVaultId && state.vaults.some((v) => v.id === wsState.selectedVaultId)) {
      dispatch({ type: 'VAULT_SELECTED', payload: wsState.selectedVaultId })
    }

    // Restore tabs — only if the vaults still exist, then fetch content
    const validVaultIds = new Set(state.vaults.map((v) => v.id))
    for (const tab of wsState.tabs) {
      if (!validVaultIds.has(tab.vaultId)) continue
      tabDispatch({
        type: 'OPEN_TAB',
        payload: { vaultId: tab.vaultId, filePath: tab.filePath, fileName: tab.fileName },
      })
      // Fetch content for regular file tabs (skip virtual tabs like __graph__, __view::*)
      const tabId = `${tab.vaultId}::${tab.filePath}`
      if (!tab.filePath.startsWith('__')) {
        apiClient.fetchFileContent(tab.vaultId, tab.filePath).then(
          (result) => {
            tabDispatch({
              type: 'TAB_CONTENT_LOADED',
              payload: { tabId, content: result.content, isBinary: result.isBinary },
            })
          },
          () => {
            // File no longer exists — close the tab
            tabDispatch({ type: 'CLOSE_TAB', payload: { tabId } })
          },
        )
      } else {
        // Virtual tabs (graph, plugin views) don't need content fetch
        tabDispatch({
          type: 'TAB_CONTENT_LOADED',
          payload: { tabId, content: '', isBinary: false },
        })
      }
    }

    // Restore active tab
    if (wsState.activeTabId) {
      tabDispatch({ type: 'ACTIVATE_TAB', payload: { tabId: wsState.activeTabId } })
    }

    // Enable tab persistence now that restore is complete
    isRestoringRef.current = false
  }, [state.vaults, dispatch, tabDispatch])

  // When a file tab becomes active (e.g. from FileExplorer click), deactivate settings page
  useEffect(() => {
    if (tabState.activeTabId && activeSettingsPage !== null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActiveSettingsPage(null)
    }
  }, [tabState.activeTabId]) // eslint-disable-line react-hooks/exhaustive-deps

  // When selectedVaultId changes, update directoryTree from vaultTrees and clear old tabs
  useEffect(() => {
    const vaultId = state.selectedVaultId
    if (vaultId !== prevVaultId.current) {
      if (prevVaultId.current !== null) {
        // Save current tabs for the previous vault before clearing
        const prevId = prevVaultId.current
        vaultTabsCacheRef.current.set(prevId, {
          tabs: tabState.tabs
            .filter((t) => t.vaultId === prevId)
            .map((t) => ({ filePath: t.filePath, fileName: t.fileName })),
          activeTabId: tabState.activeTabId,
        })

        // Vault changed or was deleted — clear all tabs
        const graphTab = tabState.tabs.find((t) => t.filePath === '__graph__')
        tabDispatch({ type: 'CLEAR_ALL_TABS' })

        // Restore cached tabs for the new vault (if any)
        if (vaultId) {
          const cached = vaultTabsCacheRef.current.get(vaultId)
          if (cached && cached.tabs.length > 0) {
            for (const tab of cached.tabs) {
              tabDispatch({
                type: 'OPEN_TAB',
                payload: { vaultId, filePath: tab.filePath, fileName: tab.fileName },
              })
              // Fetch content for regular file tabs
              const tabId = `${vaultId}::${tab.filePath}`
              if (!tab.filePath.startsWith('__')) {
                apiClient.fetchFileContent(vaultId, tab.filePath).then(
                  (result) => {
                    tabDispatch({
                      type: 'TAB_CONTENT_LOADED',
                      payload: { tabId, content: result.content, isBinary: result.isBinary },
                    })
                  },
                  () => {
                    tabDispatch({ type: 'CLOSE_TAB', payload: { tabId } })
                  },
                )
              } else {
                tabDispatch({
                  type: 'TAB_CONTENT_LOADED',
                  payload: { tabId, content: '', isBinary: false },
                })
              }
            }
            // Restore active tab
            if (cached.activeTabId) {
              tabDispatch({ type: 'ACTIVATE_TAB', payload: { tabId: cached.activeTabId } })
            }
          } else if (graphTab) {
            // No cached tabs but graph was open — re-open graph for new vault
            const vault = state.vaults.find((v) => v.id === vaultId)
            const graphTabName = vault ? `Graph — ${vault.name}` : 'Graph'
            tabDispatch({
              type: 'OPEN_TAB',
              payload: { vaultId, filePath: '__graph__', fileName: graphTabName },
            })
            const graphTabId = `${vaultId}::__graph__`
            tabDispatch({
              type: 'TAB_CONTENT_LOADED',
              payload: { tabId: graphTabId, content: '', isBinary: false },
            })
          }
        }
      }
      if (vaultId) {
        // If the tree is already loaded in vaultTrees, use it
        const existingTree = state.vaultTrees[vaultId]
        if (existingTree) {
          dispatch({ type: 'TREE_LOADED', payload: existingTree })
        } else if (apiClient) {
          // Fetch the tree
          dispatch({ type: 'LOADING_STARTED' })
          apiClient.fetchVaultTree(vaultId).then(
            (tree) => {
              dispatch({ type: 'TREE_LOADED', payload: tree })
              dispatch({ type: 'VAULT_TREE_LOADED', payload: { vaultId, tree } })
            },
            (err) => {
              const error =
                err && typeof err === 'object' && 'code' in err && 'message' in err
                  ? { code: err.code as string, message: err.message as string }
                  : { code: 'INTERNAL_ERROR', message: t('vault.treeLoadError') }
              dispatch({ type: 'ERROR_OCCURRED', payload: error })
            },
          )
        }
      }
    }
    prevVaultId.current = vaultId
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.selectedVaultId, dispatch, tabDispatch])

  // Global keyboard shortcut: Vault search (default: Ctrl+Shift+F / Cmd+Shift+F)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (matchesShortcut('slatebase:open-search', e)) {
        e.preventDefault()
        // Open right panel and focus search input
        setShowRightPanel(true)
        // Focus the search input after the panel renders
        setTimeout(() => {
          const input = document.querySelector('.search-panel__input') as HTMLInputElement | null
          if (input) {
            input.focus()
            input.select()
          }
        }, 50)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Global keyboard shortcut: Settings panel (default: Ctrl+,)
  useEffect(() => {
    const handleSettingsShortcut = (e: KeyboardEvent) => {
      if (matchesShortcut('slatebase:open-settings', e)) {
        e.preventDefault()
        setSettingsOpen(true)
      }
    }

    document.addEventListener('keydown', handleSettingsShortcut)
    return () => document.removeEventListener('keydown', handleSettingsShortcut)
  }, [])

  const handleLogout = useCallback(async () => {
    try { await apiClient.logout() } catch { /* ignore */ }
    apiClient.setToken(null)
    apiClient.setCsrfToken(null)
    authDispatch({ type: 'LOGOUT' })
    localStorage.removeItem(LAST_VAULT_KEY)
    clearWorkspace()
  }, [authDispatch])

  function handleImportFile() { fileInputRef.current?.click() }
  function handleImportFolder() { folderInputRef.current?.click() }

  function handleCreateVault() {
    if (createVaultTriggerRef.current) {
      createVaultTriggerRef.current()
    }
  }

  function handleCreateFile() {
    if (!state.selectedVaultId) return
    // Trigger inline file creation in the FileExplorer
    if (createFileTriggerRef.current) {
      createFileTriggerRef.current()
    }
  }

  function handleCreateCanvas() {
    if (!state.selectedVaultId) return
    if (createCanvasTriggerRef.current) {
      createCanvasTriggerRef.current()
    }
  }

  function handleExportVault() {
    if (state.selectedVaultId) {
      const vault = state.vaults.find((v) => v.id === state.selectedVaultId)
      void exportVault(dispatch, apiClient, state.selectedVaultId, vault?.name)
    }
  }

  function handleOpenGraph() {
    if (!state.selectedVaultId) return
    if (!isEnabled('knowledge-graph')) return
    // Check if a graph tab already exists for the current vault
    const existingGraphTab = tabState.tabs.find((t) => t.filePath === '__graph__' && t.vaultId === state.selectedVaultId)
    if (existingGraphTab) {
      // Activate existing graph tab
      setActiveSettingsPage(null)
      tabDispatch({ type: 'ACTIVATE_TAB', payload: { tabId: existingGraphTab.id } })
    } else {
      // Open new graph tab
      setActiveSettingsPage(null)
      const vault = state.vaults.find((v) => v.id === state.selectedVaultId)
      const graphTabName = vault ? `Graph — ${vault.name}` : 'Graph'
      tabDispatch({
        type: 'OPEN_TAB',
        payload: { vaultId: state.selectedVaultId, filePath: '__graph__', fileName: graphTabName },
      })
      // Mark as loaded immediately (no content to fetch)
      const graphTabId = `${state.selectedVaultId}::__graph__`
      tabDispatch({
        type: 'TAB_CONTENT_LOADED',
        payload: { tabId: graphTabId, content: '', isBinary: false },
      })
    }
  }

  /** Opens or creates today's daily note for the active vault. */
  const handleDailyNote = useCallback(async () => {
    if (!state.selectedVaultId) {
      showToast('error', 'Bitte zuerst einen Vault auswählen')
      return
    }

    const vaultId = state.selectedVaultId
    // Load config from server (updates localStorage cache), falls back to cache
    const dailyDir = await loadDailyNotesConfigFromServer(apiClient, vaultId)

    try {
      const filePath = await dailyNoteService.openOrCreate(vaultId, dailyDir)
      const fileName = filePath.split('/').pop() ?? filePath
      setActiveSettingsPage(null)
      await openTab(tabDispatch, dispatch, apiClient, vaultId, filePath, fileName)
      // Refresh file explorer tree (SSE vault:change excludes the triggering user)
      void reloadVaultTree(dispatch, apiClient, vaultId)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Tagesnotiz konnte nicht erstellt werden'
      showToast('error', message)
    }
  }, [state.selectedVaultId, tabDispatch, dispatch])

  // Global keyboard shortcut: Ctrl+Alt+D — open/create daily note
  useEffect(() => {
    const handleDailyNoteShortcut = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.altKey && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault()
        handleDailyNote()
      }
    }

    document.addEventListener('keydown', handleDailyNoteShortcut)
    return () => document.removeEventListener('keydown', handleDailyNoteShortcut)
  }, [handleDailyNote])

  /** Open a file from the sidebar panel (favorites or recent files). */
  const handleSidebarOpenFile = useCallback((vaultId: string, path: string) => {
    const fileName = path.split('/').pop() ?? path
    setActiveSettingsPage(null)
    // Switch vault if needed
    if (vaultId !== state.selectedVaultId) {
      dispatch({ type: 'VAULT_SELECTED', payload: vaultId })
    }
    void openTab(tabDispatch, dispatch, apiClient, vaultId, path, fileName)
    setSidebarRefreshKey((v) => v + 1)
  }, [state.selectedVaultId, tabDispatch, dispatch])

  function handleFileSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (file && state.selectedVaultId) importFile(dispatch, apiClient, state.selectedVaultId, file)
    event.target.value = ''
  }

  function handleFolderSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const files = event.target.files
    if (files && files.length > 0 && state.selectedVaultId) importFolder(dispatch, apiClient, state.selectedVaultId, files)
    event.target.value = ''
  }

  /** Open a settings page as a tab (or activate if already open). */
  function handleNavigate(page: AppPage) {
    setOpenSettingsPages((prev) => prev.includes(page) ? prev : [...prev, page])
    setActiveSettingsPage(page)
  }

  /** Close a settings tab. */
  function handleCloseSettingsTab(page: AppPage) {
    setOpenSettingsPages((prev) => {
      const next = prev.filter((p) => p !== page)
      if (activeSettingsPage === page) {
        setActiveSettingsPage(next.length > 0 ? (next[next.length - 1] ?? null) : null)
      }
      return next
    })
  }

  function renderSettingsPage(page: AppPage) {
    switch (page) {
      case 'my-vaults': return <MyVaultsPage apiClient={apiClient} onOpenSync={(vaultId) => {
        dispatch({ type: 'VAULT_SELECTED', payload: vaultId })
        handleNavigate('sync-config')
      }} />
      case 'profile': return <ProfilePage apiClient={apiClient} />
      case 'sessions': return <SessionsPage apiClient={apiClient} />
      case 'chat':
        if (!isEnabled('chat')) return <FeatureDisabledHint featureName="Chat" />
        return <ChatPage />
      case 'admin-users': return <AdminUsersPage apiClient={apiClient} />
      case 'admin-vaults': return <AdminVaultsPage apiClient={apiClient} />
      case 'admin-config': return <AdminConfigPage apiClient={apiClient} />
      case 'admin-audit': return <AdminAuditPage apiClient={apiClient} />
      case 'admin-logs': return <AdminLogsPage apiClient={apiClient} />
      case 'vault-sharing':
        return state.selectedVaultId
          ? <VaultSharing apiClient={apiClient} vaultId={state.selectedVaultId} />
          : <div style={{ padding: 24, color: 'var(--text-muted)' }}>{t('common.noSelection')}</div>
      case 'vault-deletion':
        return state.selectedVaultId
          ? <VaultDeletionWorkflow
              apiClient={apiClient}
              vaultId={state.selectedVaultId}
              onComplete={() => {
                loadVaults(dispatch, apiClient)
                handleCloseSettingsTab('vault-deletion')
              }}
            />
          : <div style={{ padding: 24, color: 'var(--text-muted)' }}>{t('common.noSelection')}</div>
      case 'sync-config':
        if (!isEnabled('vault-sync')) return <FeatureDisabledHint featureName="Vault-Sync" />
        return state.selectedVaultId
          ? <SyncProvider><SyncConfigPage vaultId={state.selectedVaultId} onOpenSyncLog={() => handleNavigate('sync-log')} /></SyncProvider>
          : <div style={{ padding: 24, color: 'var(--text-muted)' }}>{t('common.noSelection')}</div>
      case 'sync-log':
        if (!isEnabled('vault-sync')) return <FeatureDisabledHint featureName="Vault-Sync" />
        return state.selectedVaultId
          ? <SyncProvider><SyncLogPage vaultId={state.selectedVaultId} /></SyncProvider>
          : <div style={{ padding: 24, color: 'var(--text-muted)' }}>{t('common.noSelection')}</div>
      case 'conflicts':
        if (!isEnabled('vault-sync')) return <FeatureDisabledHint featureName="Vault-Sync" />
        return state.selectedVaultId
          ? <SyncProvider><ConflictWizardPage vaultId={state.selectedVaultId} /></SyncProvider>
          : <div style={{ padding: 24, color: 'var(--text-muted)' }}>{t('common.noSelection')}</div>
      case 'mcp-tokens':
        if (!isEnabled('mcp')) return <FeatureDisabledHint featureName="MCP" />
        return <McpTokensPage apiClient={apiClient} />
      case 'plugins':
        if (!isEnabled('obsidian-plugin-compat')) return <FeatureDisabledHint featureName="Plugin-Kompatibilität" />
        return state.selectedVaultId
          ? <PluginManagementPage apiClient={apiClient} vaultId={state.selectedVaultId} />
          : <div style={{ padding: 24, color: 'var(--text-muted)' }}>{t('common.noSelection')}</div>
      case 'trash':
        return state.selectedVaultId
          ? <TrashView vaultId={state.selectedVaultId} apiClient={apiClient} />
          : <div style={{ padding: 24, color: 'var(--text-muted)' }}>{t('common.noSelection')}</div>
      default: return null
    }
  }

  const isShowingSettings = activeSettingsPage !== null
  const user = authState.user
  const selectedVault = state.vaults.find((v) => v.id === state.selectedVaultId) ?? null
  const activeTab = tabState.tabs.find((tab) => tab.id === tabState.activeTabId) ?? null
  const selectedVaultName = selectedVault?.name ?? ''

  return (
    <PluginProvider
      vaultId={state.selectedVaultId}
      vaultName={selectedVaultName}
      apiClient={apiClient}
      directoryTree={state.directoryTree}
      tabState={tabState}
    >
    <div className="app">
      <CommandPaletteContainer
        onNavigate={handleNavigate}
        onCreateVault={handleCreateVault}
        onCreateFile={handleCreateFile}
        onImportFile={handleImportFile}
        onImportFolder={handleImportFolder}
        onExportVault={handleExportVault}
        onOpenGraph={handleOpenGraph}
        onDailyNote={handleDailyNote}
        onToggleSidebar={() => setShowSidebar((v) => !v)}
        onToggleRightPanel={() => setShowRightPanel((v) => !v)}
        onOpenSettings={() => setSettingsOpen(true)}
        onLogout={handleLogout}
        onToggleTheme={() => {
          const current = document.documentElement.getAttribute('data-theme') ?? 'system'
          const next = current === 'dark' ? 'light' : 'dark'
          document.documentElement.setAttribute('data-theme', next)
        }}
      />
      {/* Unified Settings Panel (renders as fixed overlay when open) */}
      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      {/* Version Browser Modal */}
      {versionBrowserTarget && (
        <div className="version-browser-modal-overlay" onClick={() => setVersionBrowserTarget(null)}>
          <div className="version-browser-modal" onClick={(e) => e.stopPropagation()}>
            <div className="version-browser-modal__header">
              <span className="version-browser-modal__title">Versionen — {versionBrowserTarget.filePath}</span>
              <button
                type="button"
                className="version-browser-modal__close"
                onClick={() => setVersionBrowserTarget(null)}
                aria-label="Schließen"
              >
                <X size={16} />
              </button>
            </div>
            <VersionBrowser
              vaultId={versionBrowserTarget.vaultId}
              filePath={versionBrowserTarget.filePath}
              currentContent={
                activeTab && activeTab.vaultId === versionBrowserTarget.vaultId && activeTab.filePath === versionBrowserTarget.filePath
                  ? (activeTab.editBuffer ?? activeTab.content)
                  : ''
              }
              apiClient={apiClient}
              onRestore={() => {
                // Reload the tab content after restore if it matches the active tab
                if (activeTab && activeTab.vaultId === versionBrowserTarget.vaultId && activeTab.filePath === versionBrowserTarget.filePath) {
                  apiClient.fetchFileContent(versionBrowserTarget.vaultId, versionBrowserTarget.filePath).then((result) => {
                    tabDispatch({
                      type: 'TAB_CONTENT_LOADED',
                      payload: { tabId: activeTab.id, content: result.content, isBinary: result.isBinary },
                    })
                  }).catch(() => { /* ignore */ })
                }
                setVersionBrowserTarget(null)
              }}
            />
          </div>
        </div>
      )}
      <input ref={fileInputRef} type="file" style={{ display: 'none' }} onChange={handleFileSelected} aria-hidden="true" tabIndex={-1} />
      <input ref={folderInputRef} type="file"
        // @ts-expect-error webkitdirectory is non-standard
        webkitdirectory=""
        style={{ display: 'none' }} onChange={handleFolderSelected} aria-hidden="true" tabIndex={-1} />

      {state.loading && (
        <div className="app-loading" role="status" aria-live="polite">
          <span className="app-loading-spinner" aria-hidden="true" />
          <span>{t('common.loading')}</span>
        </div>
      )}
      {state.error && (
        <div className="app-error" role="alert">
          {t('common.errorWithCode', { code: state.error.code, message: state.error.message })}
        </div>
      )}

      <main className="app-main app-main--vault-view">
        <div className="app-vault-layout">

          {/* ── Sidebar ── */}
          {showSidebar && (
            <aside className="app-sidebar" style={{ width: sidebar.width }}>
              <div className="app-sidebar-header">
                <div className="app-logo">
                  <SlatebaseLogo size={26} className="app-logo-icon" />
                  <span className="app-title">Slatebase</span>
                  {!versionInfo.loading && versionInfo.installed && versionInfo.installed !== 'development' && (
                    <span className="app-version">v{versionInfo.installed}</span>
                  )}
                  {versionInfo.latest && (
                    <a
                      href={versionInfo.latestUrl ?? '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="app-version-update"
                      title={`Update auf v${versionInfo.latest} verfügbar`}
                    >
                      (neu: v{versionInfo.latest})
                    </a>
                  )}
                </div>
                <div className="app-sidebar-header-actions">
                  <RealtimeConnectionIndicator />
                  <UserMenu
                    onNavigate={handleNavigate}
                    onLogout={handleLogout}
                    hasVaultSelected={state.selectedVaultId !== null}
                    onImportFile={handleImportFile}
                    onImportFolder={handleImportFolder}
                    onExportVault={handleExportVault}
                  />
                </div>
              </div>

              <div className="app-sidebar-body">
                <SidebarPanel
                  width={sidebar.width}
                  vaultId={state.selectedVaultId}
                  onOpenFile={handleSidebarOpenFile}
                  renderExplorer={() => (
                    <FileExplorer
                      onRegisterCreateFile={handleRegisterCreateFile}
                      onRegisterCreateVault={handleRegisterCreateVault}
                      onRegisterCreateCanvas={handleRegisterCreateCanvas}
                      onOpenVersions={(vaultId, filePath) => setVersionBrowserTarget({ vaultId, filePath })}
                    />
                  )}
                  refreshKey={sidebarRefreshKey}
                />
              </div>
            </aside>
          )}

          {/* ── Sidebar Resize Handle ── */}
          {showSidebar && (
            <div
              className="resize-handle"
              onMouseDown={sidebar.onMouseDown}
              title={t('resize.adjustWidth')}
              role="separator"
              aria-orientation="vertical"
            />
          )}

          {/* ── Toolbar ── */}
          <SidebarToolbar
            vaultId={state.selectedVaultId}
            vaultPermission={selectedVault?.permission}
            onCreateVault={handleCreateVault}
            onCreateFile={handleCreateFile}
            onCreateCanvas={handleCreateCanvas}
            onImportFile={handleImportFile}
            onImportFolder={handleImportFolder}
            onExportVault={handleExportVault}
            onNavigate={handleNavigate}
            onOpenGraph={handleOpenGraph}
            onOpenTrash={() => handleNavigate('trash')}
            onDailyNote={handleDailyNote}
            onOpenSettings={() => setSettingsOpen(true)}
            isAdmin={user?.role === 'admin'}
            isVaultOwner={selectedVault?.permission === 'owner'}
            syncEnabled={selectedVault?.syncEnabled}
            globalUnreadCount={globalUnreadCount}
          />

          {/* ── Main Content ── */}
          <section className="app-content">
            {/* Unified tab bar: settings tabs + file tabs in one row */}
            {(openSettingsPages.length > 0 || tabState.tabs.length > 0) && (
              <div className="tab-bar" role="tablist" aria-label={t('tabs.ariaLabel')}>
                {/* Settings tabs */}
                {openSettingsPages.map((page) => {
                  const isActive = isShowingSettings && page === activeSettingsPage
                  const pageLabel = t(PAGE_LABEL_KEYS[page] as Parameters<typeof t>[0])
                  return (
                    <div
                      key={`settings-${page}`}
                      role="tab"
                      aria-selected={isActive}
                      className={`tab-bar-tab${isActive ? ' tab-bar-tab--active' : ''}`}
                      onClick={() => setActiveSettingsPage(page)}
                      title={pageLabel}
                      tabIndex={isActive ? 0 : -1}
                    >
                      {PAGE_ICONS[page] && <span style={{ flexShrink: 0 }}>{PAGE_ICONS[page]}</span>}
                      <span className="tab-bar-tab-label">{pageLabel}</span>
                      <button
                        type="button"
                        className="tab-bar-close-btn"
                        aria-label={t('tabs.closePageAriaLabel', { name: pageLabel })}
                        title={t('common.close')}
                        onClick={(e) => { e.stopPropagation(); handleCloseSettingsTab(page) }}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  )
                })}
                {/* File tabs */}
                {tabState.tabs.map((tab) => {
                  const isActive = !isShowingSettings && tab.id === tabState.activeTabId
                  const hasUnsaved = tab.editBuffer !== null && tab.editBuffer !== tab.content
                  const modeLabel = tab.mode === 'edit' ? t('tabs.showPreview') : t('tabs.edit')
                  const ModeIcon = tab.mode === 'edit' ? Eye : Pencil
                  const isGraphTab = tab.filePath === '__graph__'
                  const TabFileIcon = isGraphTab ? Share2 : getFileIcon(tab.fileName)
                  const tabFileIconClass = isGraphTab ? 'tab-icon-graph' : getFileIconClass(tab.fileName)
                  const displayName = isGraphTab ? tab.fileName : getDisplayName(tab.fileName)
                  return (
                    <div
                      key={tab.id}
                      role="tab"
                      aria-selected={isActive}
                      aria-label={tab.filePath}
                      className={`tab-bar-tab${isActive ? ' tab-bar-tab--active' : ''}`}
                      onClick={() => { setActiveSettingsPage(null); tabDispatch({ type: 'ACTIVATE_TAB', payload: { tabId: tab.id } }) }}
                      title={isGraphTab ? 'Graph' : tab.filePath}
                      tabIndex={isActive ? 0 : -1}
                    >
                      <TabFileIcon size={13} className={`tab-bar-tab-icon ${tabFileIconClass}`} />
                      <span className="tab-bar-tab-label">
                        {hasUnsaved ? '● ' : ''}{displayName}
                      </span>
                      {!tab.isBinary && !isGraphTab && !tab.fileName.endsWith('.canvas') && (
                        <button
                          type="button"
                          className="tab-bar-mode-btn"
                          aria-label={modeLabel}
                          title={modeLabel}
                          onClick={(e) => { e.stopPropagation(); tabDispatch({ type: 'TOGGLE_MODE', payload: { tabId: tab.id } }) }}
                        >
                          <ModeIcon size={12} />
                        </button>
                      )}
                      <button
                        type="button"
                        className="tab-bar-close-btn"
                        aria-label={t('tabs.closeTabAriaLabel', { name: tab.fileName })}
                        title={t('tabs.closeTab')}
                        onClick={(e) => { e.stopPropagation(); tabDispatch({ type: 'CLOSE_TAB', payload: { tabId: tab.id } }) }}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Content: settings page or vault editor */}
            {isShowingSettings ? (
              <div className="tab-content" style={{ overflow: 'auto' }}>
                {renderSettingsPage(activeSettingsPage!)}
              </div>
            ) : (
              <ErrorBoundary>
                <TabContent onOpenVersions={(vaultId, filePath) => setVersionBrowserTarget({ vaultId, filePath })} />
              </ErrorBoundary>
            )}
          </section>

          {/* ── Right Panel + Resize ── */}
          {showRightPanel && (
            <>
              <div
                className="resize-handle"
                onMouseDown={rightPanel.onMouseDown}
                title={t('resize.adjustWidth')}
                role="separator"
                aria-orientation="vertical"
              />
              <aside className="app-right-panel" style={{ width: rightPanel.width }}>
                <PluginViewPanel />
                <ContextPanel
                  documentContent={activeTab && !activeTab.isBinary && activeTab.filePath !== '__graph__' ? (activeTab.editBuffer ?? activeTab.content) : null}
                  documentPath={activeTab && !activeTab.isBinary && activeTab.filePath !== '__graph__' ? activeTab.filePath : null}
                  vaultId={state.selectedVaultId}
                  width={rightPanel.width}
                />
              </aside>
            </>
          )}

          {/* Toggle right panel */}
          <button
            className={`right-panel-toggle${showRightPanel ? ' right-panel-toggle--active' : ''}`}
            onClick={() => setShowRightPanel((v) => !v)}
            title={showRightPanel ? t('rightPanel.hide') : t('rightPanel.show')}
            type="button"
            aria-pressed={showRightPanel}
          >
            <PanelRight size={15} />
          </button>

          {/* Toggle left panel (sidebar) */}
          <button
            className={`left-panel-toggle${showSidebar ? ' left-panel-toggle--active' : ''}`}
            onClick={() => setShowSidebar((v) => !v)}
            title={showSidebar ? t('rightPanel.hide') : t('rightPanel.show')}
            type="button"
            aria-pressed={showSidebar}
          >
            <PanelLeft size={15} />
          </button>
        </div>
        {statusBarVisible && <StatusBar />}
      </main>
    </div>
    </PluginProvider>
  )
}

/**
 * Connects I18nProvider to the auth state so locale follows the user's profile.
 * Also applies the user's color scheme preference to the document root.
 * Before login: browser language detection. After login: user.preferredLanguage.
 */
function I18nBridge({ children }: { children: React.ReactNode }) {
  const { authState } = useAuthContext()
  const userLocale = authState.user?.preferredLanguage ?? null
  const colorScheme = authState.user?.colorScheme ?? 'system'

  // Apply color scheme to <html> element
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', colorScheme)
  }, [colorScheme])

  return (
    <I18nProvider userLocale={userLocale}>
      <ObsidianLocaleSync />
      <ToastProvider>
        {children}
      </ToastProvider>
    </I18nProvider>
  )
}

/**
 * Syncs the active i18n locale to localStorage("language") and moment.locale().
 * Obsidian plugins (e.g. Calendar) read localStorage("language") to determine
 * which moment locale to activate. This ensures the plugin locale always matches
 * the user's chosen language, not the browser default.
 */
function ObsidianLocaleSync() {
  const { locale } = useTranslation()

  useEffect(() => {
    // Sync to localStorage — plugins read this via localStorage.getItem("language")
    localStorage.setItem('language', locale)

    // Also update the global moment locale so new moment() calls use it
    if (window.moment) {
      window.moment.locale(locale)
    }
  }, [locale])

  return null
}

/**
 * Auth guard component.
 * When a token is restored from localStorage, verifies the session is still valid
 * before rendering authenticated content — prevents stale-token API noise (401s).
 */
function AuthGuard() {
  const { authState, authDispatch } = useAuthContext()
  const [sessionVerified, setSessionVerified] = useState(false)

  // Restore apiClient tokens from persisted auth state (after page reload)
  useEffect(() => {
    if (authState.token) {
      apiClient.setToken(authState.token)
    }
    if (authState.csrfToken) {
      apiClient.setCsrfToken(authState.csrfToken)
    }
  }, [authState.token, authState.csrfToken])

  useEffect(() => {
    apiClient.setOnSessionExpired(() => {
      // Workspace state is already persisted continuously — no need to save explicitly
      apiClient.setToken(null)
      apiClient.setCsrfToken(null)
      // Disconnect server-synced stores
      disconnectRecentFiles()
      disconnectFavorites()
      disconnectKeybindings()
      authDispatch({ type: 'SESSION_EXPIRED' })
    })
    return () => { apiClient.setOnSessionExpired(null) }
  }, [authDispatch])

  // Verify session validity when auth state is restored from localStorage.
  // Skip when mustChangePassword is true — the session is valid but the
  // mustChangePassword middleware blocks all other endpoints with 403.
  // The ChangePasswordPage is rendered before the sessionVerified check,
  // so skipping verification here does not cause a stuck spinner.
  useEffect(() => {
    if (!authState.isAuthenticated || authState.mustChangePassword) {
      return
    }

    let cancelled = false

    async function verify() {
      const alive = await apiClient.checkSessionAlive()
      if (cancelled) return

      if (alive) {
        setSessionVerified(true)
      } else {
        // Session expired — clear auth state (triggers login page)
        // Workspace state is already persisted continuously — no explicit save needed
        apiClient.setToken(null)
        apiClient.setCsrfToken(null)
        disconnectRecentFiles()
        disconnectFavorites()
        disconnectKeybindings()
        authDispatch({ type: 'SESSION_EXPIRED' })
      }
    }

    void verify()
    return () => { cancelled = true }
  }, [authState.isAuthenticated, authState.mustChangePassword, authDispatch])

  if (!authState.isAuthenticated) {
    return <LoginPage apiClient={apiClient} />
  }

  if (authState.mustChangePassword) {
    return <ChangePasswordPage apiClient={apiClient} />
  }

  // Wait for session verification before rendering the app tree
  if (!sessionVerified) {
    return (
      <div className="app-loading" role="status" aria-live="polite">
        <span className="app-loading-spinner" aria-hidden="true" />
      </div>
    )
  }

  return (
    <FeatureProvider>
      <FeatureLoader />
      <RealtimeBridge>
        <AppProvider apiClient={apiClient}>
          <SearchProvider>
            <TabProvider>
              <ContextPanelProvider>
                <SidebarPanelProvider>
                  <AppContent />
                </SidebarPanelProvider>
              </ContextPanelProvider>
            </TabProvider>
          </SearchProvider>
        </AppProvider>
      </RealtimeBridge>
    </FeatureProvider>
  )
}

/**
 * Bridge component that connects the RealtimeProvider with auth state.
 * Sits inside AuthProvider, wrapping the app content.
 * Reads the session token from auth state.
 * Wires SSE event handlers to the module-level chat bridge for cross-provider communication.
 */
function RealtimeBridge({ children }: { children: React.ReactNode }) {
  const { authState } = useAuthContext()

  const token = authState.token ?? null

  const handlers = useMemo<RealtimeEventHandlers>(() => ({
    onChatMessage: (data: Record<string, unknown>) => {
      const message = {
        id: data.messageId as string,
        conversationId: data.conversationId as string,
        senderId: data.senderId as string,
        content: data.content as string,
        timestamp: data.timestamp as string,
      }
      dispatchRealtimeChatMessage(message)
      // Also update conversation preview for the conversation list
      dispatchRealtimeConversationPreview(
        message.conversationId,
        message.content,
        message.timestamp,
      )
    },
    onChatUnread: (totalUnread: number) => {
      dispatchRealtimeUnreadUpdate(totalUnread)
    },
    onVaultChange: (vaultId: string, data?: Record<string, unknown>) => {
      const event: VaultChangeEvent = {
        vaultId,
        action: (data?.action as 'saved' | 'deleted' | 'renamed') ?? 'saved',
        path: (data?.path as string) ?? '',
        userId: (data?.userId as string) ?? '',
        username: (data?.username as string) ?? '',
      }
      dispatchRealtimeVaultChange(event)
    },
  }), [])

  return (
    <RealtimeProvider
      token={token}
      handlers={handlers}
      getTicket={() => apiClient.getSseTicket()}
    >
      {children}
    </RealtimeProvider>
  )
}

/**
 * Loads feature toggles from the public API on mount.
 * Placed inside FeatureProvider to access dispatch, and renders nothing.
 */
function FeatureLoader() {
  const { dispatch } = useFeatureContext()

  useEffect(() => {
    dispatch({ type: 'FEATURES_LOADING' })
    apiClient.loadFeatures()
      .then(features => {
        dispatch({
          type: 'FEATURES_LOADED',
          features: features.map(f => ({
            name: f.name,
            enabled: f.enabled,
            type: 'hot' as const,
            description: '',
          })),
        })
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message :
          (typeof error === 'object' && error !== null && 'message' in error) ?
            String((error as { message: unknown }).message) : 'Fehler beim Laden der Features'
        dispatch({ type: 'FEATURES_ERROR', error: message })
      })
  }, [dispatch])

  return null
}

/**
 * Root App component.
 * Provider hierarchy: AuthProvider → I18nBridge (reads user locale) → AuthGuard → App content.
 * ToastNotification rendered at root level (uses module-level state, independent of providers).
 */
export function App() {
  return (
    <AuthProvider>
      <I18nBridge>
        <AuthGuard />
      </I18nBridge>
      <ToastNotification />
    </AuthProvider>
  )
}
