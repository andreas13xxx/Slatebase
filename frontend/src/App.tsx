import { useEffect, useRef, useCallback, useState } from 'react'
import { AppProvider, useAppContext, loadVaults, importFile, importFolder, exportVault } from './state'
import { ApiClient } from './api'
import { AuthProvider, useAuthContext } from './state/authContext'
import { TabProvider, useTabContext } from './state/tabContext'
import { I18nProvider, useTranslation } from './i18n'
import { VaultList } from './components/VaultList'
import { FileExplorer } from './components/FileExplorer'
import { TabContent } from './components/TabContent'
import { LoginPage } from './components/LoginPage'
import { ChangePasswordPage } from './components/ChangePasswordPage'
import { ProfilePage } from './components/ProfilePage'
import { SessionsPage } from './components/SessionsPage'
import { AdminUsersPage } from './components/AdminUsersPage'
import { AdminConfigPage } from './components/AdminConfigPage'
import { AdminAuditPage } from './components/AdminAuditPage'
import { AdminVaultsPage } from './components/AdminVaultsPage'
import { VaultSharing } from './components/VaultSharing'
import { VaultDeletionWorkflow } from './components/VaultDeletionWorkflow'
import { SlatebaseLogo } from './components/SlatebaseLogo'
import { SidebarToolbar } from './components/SidebarToolbar'
import { MyVaultsPage } from './components/MyVaultsPage'
import {
  User, LogOut, Settings, Shield, FileText, Clock,
  Database, Share2, Trash2, Server, Download,
  Upload, FolderOpen, PanelRight, PanelLeft, X, Eye, Pencil,
} from 'lucide-react'
import { getFileIcon, getDisplayName } from './utils/fileIcons'
import './App.css'

/** Singleton ApiClient instance shared across the app. */
const apiClient = new ApiClient()

/** LocalStorage key for persisting the last selected vault. */
const LAST_VAULT_KEY = 'slatebase_last_vault'

/** Available pages in the app. */
type AppPage =
  | 'vaults'
  | 'my-vaults'
  | 'profile'
  | 'sessions'
  | 'admin-users'
  | 'admin-vaults'
  | 'admin-config'
  | 'admin-audit'
  | 'vault-sharing'
  | 'vault-deletion'

/**
 * User avatar and dropdown menu component.
 */
function UserMenu({ onNavigate, onLogout, hasVaultSelected, onImportFile, onImportFolder, onExportVault }: {
  onNavigate: (page: AppPage) => void
  onLogout: () => void
  hasVaultSelected: boolean
  onImportFile: () => void
  onImportFolder: () => void
  onExportVault: () => void
}) {
  const { authState } = useAuthContext()
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({})

  const user = authState.user
  if (!user) return null

  const initials = (user.displayName || user.username).slice(0, 2).toUpperCase()
  const displayName = user.displayName || user.username

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  // Calculate dropdown position when opened
  useEffect(() => {
    if (open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect()
      const dropdownWidth = 210
      // Position below the trigger, aligned to the right edge
      let left = rect.right - dropdownWidth
      // Ensure it doesn't go off-screen to the left
      if (left < 8) left = 8
      setDropdownStyle({
        top: rect.bottom + 8,
        left,
      })
    }
  }, [open])

  return (
    <div className="user-menu" ref={menuRef}>
      <button
        ref={triggerRef}
        className="user-menu-trigger"
        onClick={() => setOpen(!open)}
        type="button"
        aria-label={t('userMenu.ariaLabel')}
        aria-expanded={open}
      >
        {user.avatarUrl ? (
          <img className="user-menu-avatar" src={user.avatarUrl} alt={displayName} />
        ) : (
          <span className="user-menu-avatar user-menu-avatar--initials">{initials}</span>
        )}
      </button>
      {open && (
        <div className="user-menu-dropdown" role="menu" style={dropdownStyle}>
          <div className="user-menu-info">
            <span className="user-menu-name">{displayName}</span>
            <span className="user-menu-role">{user.role === 'admin' ? t('userMenu.roleAdmin') : t('userMenu.roleUser')}</span>
          </div>
          {hasVaultSelected && (
            <>
              <div className="user-menu-divider" />
              <span className="user-menu-section-label">{t('vault.label')}</span>
              <button className="user-menu-item" role="menuitem" onClick={() => { onImportFile(); setOpen(false) }}>
                <Upload size={14} /> {t('files.importFile')}
              </button>
              <button className="user-menu-item" role="menuitem" onClick={() => { onImportFolder(); setOpen(false) }}>
                <FolderOpen size={14} /> {t('files.importFolder')}
              </button>
              <button className="user-menu-item" role="menuitem" onClick={() => { onExportVault(); setOpen(false) }}>
                <Download size={14} /> {t('files.exportVault')}
              </button>
              <button className="user-menu-item" role="menuitem" onClick={() => { onNavigate('vault-sharing'); setOpen(false) }}>
                <Share2 size={14} /> {t('userMenu.sharing')}
              </button>
              <button className="user-menu-item user-menu-item--danger" role="menuitem" onClick={() => { onNavigate('vault-deletion'); setOpen(false) }}>
                <Trash2 size={14} /> {t('vault.deleteVault')}
              </button>
            </>
          )}
          <div className="user-menu-divider" />
          <button className="user-menu-item" role="menuitem" onClick={() => { onNavigate('profile'); setOpen(false) }}>
            <User size={14} /> {t('userMenu.profile')}
          </button>
          <button className="user-menu-item" role="menuitem" onClick={() => { onNavigate('sessions'); setOpen(false) }}>
            <Clock size={14} /> {t('userMenu.sessions')}
          </button>
          {user.role === 'admin' && (
            <>
              <div className="user-menu-divider" />
              <span className="user-menu-section-label">{t('userMenu.administration')}</span>
              <button className="user-menu-item" role="menuitem" onClick={() => { onNavigate('admin-users'); setOpen(false) }}>
                <Shield size={14} /> {t('userMenu.userManagement')}
              </button>
              <button className="user-menu-item" role="menuitem" onClick={() => { onNavigate('admin-vaults'); setOpen(false) }}>
                <Database size={14} /> {t('userMenu.vaultOverview')}
              </button>
              <button className="user-menu-item" role="menuitem" onClick={() => { onNavigate('admin-config'); setOpen(false) }}>
                <Settings size={14} /> {t('userMenu.serverConfig')}
              </button>
              <button className="user-menu-item" role="menuitem" onClick={() => { onNavigate('admin-audit'); setOpen(false) }}>
                <FileText size={14} /> {t('userMenu.auditLog')}
              </button>
            </>
          )}
          <div className="user-menu-divider" />
          <button className="user-menu-item user-menu-item--danger" role="menuitem" onClick={() => { onLogout(); setOpen(false) }}>
            <LogOut size={14} /> {t('auth.logout')}
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * Hook for mouse-driven panel resize.
 * Returns a ref to attach to the resize handle and the current width.
 */
function useResize(initialWidth: number, min: number, max: number, side: 'left' | 'right' = 'left') {
  const [width, setWidth] = useState(initialWidth)
  const dragging = useRef(false)
  const startX = useRef(0)
  const startWidth = useRef(0)

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    dragging.current = true
    startX.current = e.clientX
    startWidth.current = width
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    function onMouseMove(ev: MouseEvent) {
      if (!dragging.current) return
      const delta = side === 'left' ? ev.clientX - startX.current : startX.current - ev.clientX
      const newWidth = Math.min(max, Math.max(min, startWidth.current + delta))
      setWidth(newWidth)
    }

    function onMouseUp() {
      dragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [width, min, max, side])

  return { width, onMouseDown }
}

/** Translation keys for settings pages. */
const PAGE_LABEL_KEYS: Record<AppPage, string> = {
  vaults: 'pages.vaults',
  'my-vaults': 'pages.myVaults',
  profile: 'pages.profile',
  sessions: 'pages.sessions',
  'admin-users': 'pages.adminUsers',
  'admin-vaults': 'pages.adminVaults',
  'admin-config': 'pages.adminConfig',
  'admin-audit': 'pages.adminAudit',
  'vault-sharing': 'pages.vaultSharing',
  'vault-deletion': 'pages.vaultDeletion',
}

/** Icons for settings pages. */
const PAGE_ICONS: Partial<Record<AppPage, React.ReactNode>> = {
  'my-vaults': <Database size={13} />,
  profile: <User size={13} />,
  sessions: <Clock size={13} />,
  'admin-users': <Shield size={13} />,
  'admin-vaults': <Server size={13} />,
  'admin-config': <Settings size={13} />,
  'admin-audit': <FileText size={13} />,
  'vault-sharing': <Share2 size={13} />,
  'vault-deletion': <Trash2 size={13} />,
}

/**
 * Inner component that uses AppContext and TabContext to render the main vault view.
 */
function AppContent() {
  const { state, dispatch } = useAppContext()
  const { authState, authDispatch } = useAuthContext()
  const { tabState, tabDispatch } = useTabContext()
  const { t } = useTranslation()
  const prevVaultId = useRef<string | null>(null)
  // Settings tabs: list of open pages + which is active
  const [openSettingsPages, setOpenSettingsPages] = useState<AppPage[]>([])
  const [activeSettingsPage, setActiveSettingsPage] = useState<AppPage | null>(null)
  const [showRightPanel, setShowRightPanel] = useState(true)
  const [showSidebar, setShowSidebar] = useState(true)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)

  const sidebar = useResize(260, 180, 400, 'left')
  const rightPanel = useResize(240, 160, 500, 'right')

  // Fetch vaults on mount
  useEffect(() => {
    loadVaults(dispatch, apiClient)
  }, [dispatch])

  // Restore last selected vault after vaults are loaded
  useEffect(() => {
    if (state.vaults.length === 0) return
    if (state.selectedVaultId !== null) return
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

  // When selectedVaultId changes, fetch the vault tree and clear old tabs
  useEffect(() => {
    const vaultId = state.selectedVaultId
    if (vaultId && vaultId !== prevVaultId.current) {
      if (prevVaultId.current !== null) {
        tabDispatch({ type: 'CLEAR_ALL_TABS' })
      }
      dispatch({ type: 'LOADING_STARTED' })
      apiClient.fetchVaultTree(vaultId).then(
        (tree) => dispatch({ type: 'TREE_LOADED', payload: tree }),
        (err) => {
          const error =
            err && typeof err === 'object' && 'code' in err && 'message' in err
              ? { code: err.code as string, message: err.message as string }
              : { code: 'INTERNAL_ERROR', message: t('vault.treeLoadError') }
          dispatch({ type: 'ERROR_OCCURRED', payload: error })
        },
      )
    }
    prevVaultId.current = vaultId
  }, [state.selectedVaultId, dispatch, tabDispatch])

  const handleLogout = useCallback(async () => {
    try { await apiClient.logout() } catch { /* ignore */ }
    apiClient.setToken(null)
    apiClient.setCsrfToken(null)
    authDispatch({ type: 'LOGOUT' })
    localStorage.removeItem(LAST_VAULT_KEY)
  }, [authDispatch])

  function handleImportFile() { fileInputRef.current?.click() }
  function handleImportFolder() { folderInputRef.current?.click() }

  function handleExportVault() {
    if (state.selectedVaultId) {
      const vault = state.vaults.find((v) => v.id === state.selectedVaultId)
      void exportVault(dispatch, apiClient, state.selectedVaultId, vault?.name)
    }
  }

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
    if (page === 'vaults') {
      setActiveSettingsPage(null)
      return
    }
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
      case 'my-vaults': return <MyVaultsPage apiClient={apiClient} />
      case 'profile': return <ProfilePage apiClient={apiClient} />
      case 'sessions': return <SessionsPage apiClient={apiClient} />
      case 'admin-users': return <AdminUsersPage apiClient={apiClient} />
      case 'admin-vaults': return <AdminVaultsPage apiClient={apiClient} />
      case 'admin-config': return <AdminConfigPage apiClient={apiClient} />
      case 'admin-audit': return <AdminAuditPage apiClient={apiClient} />
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
      default: return null
    }
  }

  const isShowingSettings = activeSettingsPage !== null
  const user = authState.user

  return (
    <div className="app">
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
                </div>
                <UserMenu
                  onNavigate={handleNavigate}
                  onLogout={handleLogout}
                  hasVaultSelected={state.selectedVaultId !== null}
                  onImportFile={handleImportFile}
                  onImportFolder={handleImportFolder}
                  onExportVault={handleExportVault}
                />
              </div>

              <div className="app-sidebar-body">
                <div className="app-sidebar-section">
                  <span className="app-sidebar-section-label">{t('vault.label')}</span>
                  <VaultList />
                </div>

                {state.selectedVaultId && (
                  <div className="app-sidebar-section">
                    <span className="app-sidebar-section-label">{t('files.label')}</span>
                    <FileExplorer />
                  </div>
                )}
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
            onImportFile={handleImportFile}
            onImportFolder={handleImportFolder}
            onExportVault={handleExportVault}
            onNavigate={handleNavigate}
            isAdmin={user?.role === 'admin'}
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
                  const TabFileIcon = getFileIcon(tab.fileName)
                  const displayName = getDisplayName(tab.fileName)
                  return (
                    <div
                      key={tab.id}
                      role="tab"
                      aria-selected={isActive}
                      aria-label={tab.filePath}
                      className={`tab-bar-tab${isActive ? ' tab-bar-tab--active' : ''}`}
                      onClick={() => { setActiveSettingsPage(null); tabDispatch({ type: 'ACTIVATE_TAB', payload: { tabId: tab.id } }) }}
                      title={tab.filePath}
                      tabIndex={isActive ? 0 : -1}
                    >
                      <TabFileIcon size={13} className="tab-bar-tab-icon" />
                      <span className="tab-bar-tab-label">
                        {hasUnsaved ? '● ' : ''}{displayName}
                      </span>
                      {!tab.isBinary && (
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
              <TabContent />
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
                <div className="app-right-panel-header">
                  <PanelRight size={13} />
                  {t('rightPanel.title')}
                </div>
                <div className="app-right-panel-body">
                  <p className="app-right-panel-placeholder">
                    {t('rightPanel.placeholder')}<br /><br />
                    {t('rightPanel.plannedFeatures')}
                  </p>
                </div>
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
      </main>
    </div>
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
      {children}
    </I18nProvider>
  )
}

/**
 * Auth guard component.
 */
function AuthGuard() {
  const { authState, authDispatch } = useAuthContext()

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
      apiClient.setToken(null)
      apiClient.setCsrfToken(null)
      authDispatch({ type: 'SESSION_EXPIRED' })
    })
    return () => { apiClient.setOnSessionExpired(null) }
  }, [authDispatch])

  if (!authState.isAuthenticated) {
    return <LoginPage apiClient={apiClient} />
  }

  if (authState.mustChangePassword) {
    return <ChangePasswordPage apiClient={apiClient} />
  }

  return (
    <AppProvider apiClient={apiClient}>
      <TabProvider>
        <AppContent />
      </TabProvider>
    </AppProvider>
  )
}

/**
 * Root App component.
 * Provider hierarchy: AuthProvider → I18nBridge (reads user locale) → AuthGuard → App content.
 */
export function App() {
  return (
    <AuthProvider>
      <I18nBridge>
        <AuthGuard />
      </I18nBridge>
    </AuthProvider>
  )
}
