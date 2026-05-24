import { useEffect, useRef, useCallback, useState } from 'react'
import { AppProvider, useAppContext, loadVaults, importFile, importFolder } from './state'
import { ApiClient } from './api'
import { AuthProvider, useAuthContext } from './state/authContext'
import { TabProvider, useTabContext } from './state/tabContext'
import { VaultList } from './components/VaultList'
import { FileExplorer } from './components/FileExplorer'
import { TabBar } from './components/TabBar'
import { TabContent } from './components/TabContent'
import { LoginPage } from './components/LoginPage'
import { ChangePasswordPage } from './components/ChangePasswordPage'
import { ProfilePage } from './components/ProfilePage'
import { SessionsPage } from './components/SessionsPage'
import { AdminUsersPage } from './components/AdminUsersPage'
import { AdminConfigPage } from './components/AdminConfigPage'
import { AdminAuditPage } from './components/AdminAuditPage'
import { VaultSharing } from './components/VaultSharing'
import { VaultDeletionWorkflow } from './components/VaultDeletionWorkflow'
import './App.css'

/** Singleton ApiClient instance shared across the app. */
const apiClient = new ApiClient()

/** Available pages in the app. */
type AppPage = 'vaults' | 'profile' | 'sessions' | 'admin-users' | 'admin-config' | 'admin-audit' | 'vault-sharing' | 'vault-deletion'

/**
 * User avatar and dropdown menu component.
 * Shows the user's avatar (or initials fallback) and a dropdown with navigation options.
 * Includes vault-specific actions (import, sharing, deletion) when a vault is selected.
 */
function UserMenu({ onNavigate, onLogout, hasVaultSelected, onImportFile, onImportFolder }: {
  onNavigate: (page: AppPage) => void
  onLogout: () => void
  hasVaultSelected: boolean
  onImportFile: () => void
  onImportFolder: () => void
}) {
  const { authState } = useAuthContext()
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const user = authState.user
  if (!user) return null

  const initials = (user.displayName || user.username).slice(0, 2).toUpperCase()

  // Close menu on outside click
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

  return (
    <div className="user-menu" ref={menuRef}>
      <button
        className="user-menu-trigger"
        onClick={() => setOpen(!open)}
        type="button"
        aria-label="Benutzermenü"
        aria-expanded={open}
      >
        {user.avatarUrl ? (
          <img className="user-menu-avatar" src={user.avatarUrl} alt={user.displayName || user.username} />
        ) : (
          <span className="user-menu-avatar user-menu-avatar--initials">{initials}</span>
        )}
      </button>
      {open && (
        <div className="user-menu-dropdown" role="menu">
          <div className="user-menu-info">
            <span className="user-menu-name">{user.displayName || user.username}</span>
            <span className="user-menu-role">{user.role === 'admin' ? 'Administrator' : 'Benutzer'}</span>
          </div>
          {hasVaultSelected && (
            <>
              <div className="user-menu-divider" />
              <span className="user-menu-section-label">Vault</span>
              <button className="user-menu-item" role="menuitem" onClick={() => { onImportFile(); setOpen(false) }}>
                Datei importieren
              </button>
              <button className="user-menu-item" role="menuitem" onClick={() => { onImportFolder(); setOpen(false) }}>
                Ordner importieren
              </button>
              <button className="user-menu-item" role="menuitem" onClick={() => { onNavigate('vault-sharing'); setOpen(false) }}>
                Freigaben
              </button>
              <button className="user-menu-item user-menu-item--danger" role="menuitem" onClick={() => { onNavigate('vault-deletion'); setOpen(false) }}>
                Vault löschen
              </button>
            </>
          )}
          <div className="user-menu-divider" />
          <button className="user-menu-item" role="menuitem" onClick={() => { onNavigate('profile'); setOpen(false) }}>
            Profil
          </button>
          <button className="user-menu-item" role="menuitem" onClick={() => { onNavigate('sessions'); setOpen(false) }}>
            Sitzungen
          </button>
          {user.role === 'admin' && (
            <>
              <div className="user-menu-divider" />
              <button className="user-menu-item" role="menuitem" onClick={() => { onNavigate('admin-users'); setOpen(false) }}>
                Benutzerverwaltung
              </button>
              <button className="user-menu-item" role="menuitem" onClick={() => { onNavigate('admin-config'); setOpen(false) }}>
                Serverkonfiguration
              </button>
              <button className="user-menu-item" role="menuitem" onClick={() => { onNavigate('admin-audit'); setOpen(false) }}>
                Audit-Log
              </button>
            </>
          )}
          <div className="user-menu-divider" />
          <button className="user-menu-item user-menu-item--danger" role="menuitem" onClick={() => { onLogout(); setOpen(false) }}>
            Abmelden
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * Inner component that uses AppContext and TabContext to render the main vault view.
 * Fetches vaults on mount. Clears tabs when vault changes.
 */
function AppContent() {
  const { state, dispatch } = useAppContext()
  const { authDispatch } = useAuthContext()
  const { tabDispatch } = useTabContext()
  const prevVaultId = useRef<string | null>(null)
  const [currentPage, setCurrentPage] = useState<AppPage>('vaults')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)

  // Fetch vaults on mount
  useEffect(() => {
    loadVaults(dispatch, apiClient)
  }, [dispatch])

  // When selectedVaultId changes, fetch the vault tree and clear old tabs
  useEffect(() => {
    const vaultId = state.selectedVaultId
    if (vaultId && vaultId !== prevVaultId.current) {
      // Clear tabs from previous vault
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
              : { code: 'INTERNAL_ERROR', message: 'Fehler beim Laden der Verzeichnisstruktur' }
          dispatch({ type: 'ERROR_OCCURRED', payload: error })
        },
      )
    }
    prevVaultId.current = vaultId
  }, [state.selectedVaultId, dispatch, tabDispatch])

  /**
   * Handles logout: clears token/csrfToken on ApiClient and dispatches LOGOUT.
   */
  const handleLogout = useCallback(async () => {
    try {
      await apiClient.logout()
    } catch {
      // Ignore errors during logout — we clear the session regardless
    }
    apiClient.setToken(null)
    apiClient.setCsrfToken(null)
    authDispatch({ type: 'LOGOUT' })
  }, [authDispatch])

  /** Triggers the hidden file input for importing a single file. */
  function handleImportFile() {
    fileInputRef.current?.click()
  }

  /** Triggers the hidden folder input for importing a folder. */
  function handleImportFolder() {
    folderInputRef.current?.click()
  }

  /** Handles file selection from the hidden file input. */
  function handleFileSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (file && state.selectedVaultId) {
      importFile(dispatch, apiClient, state.selectedVaultId, file)
    }
    event.target.value = ''
  }

  /** Handles folder selection from the hidden folder input. */
  function handleFolderSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const files = event.target.files
    if (files && files.length > 0 && state.selectedVaultId) {
      importFolder(dispatch, apiClient, state.selectedVaultId, files)
    }
    event.target.value = ''
  }

  /** Renders the current page content based on navigation state. */
  function renderPage() {
    switch (currentPage) {
      case 'profile':
        return <ProfilePage apiClient={apiClient} />
      case 'sessions':
        return <SessionsPage apiClient={apiClient} />
      case 'admin-users':
        return <AdminUsersPage apiClient={apiClient} />
      case 'admin-config':
        return <AdminConfigPage apiClient={apiClient} />
      case 'admin-audit':
        return <AdminAuditPage apiClient={apiClient} />
      case 'vault-sharing':
        return state.selectedVaultId
          ? <VaultSharing apiClient={apiClient} vaultId={state.selectedVaultId} />
          : null
      case 'vault-deletion':
        return state.selectedVaultId
          ? <VaultDeletionWorkflow
              apiClient={apiClient}
              vaultId={state.selectedVaultId}
              onComplete={() => {
                loadVaults(dispatch, apiClient)
                setCurrentPage('vaults')
              }}
            />
          : null
      case 'vaults':
      default:
        return (
          <>
            <TabBar />
            <TabContent />
          </>
        )
    }
  }

  return (
    <div className="app">
      {/* Hidden file inputs for import (triggered from UserMenu) */}
      <input
        ref={fileInputRef}
        type="file"
        style={{ display: 'none' }}
        onChange={handleFileSelected}
        aria-hidden="true"
        tabIndex={-1}
      />
      <input
        ref={folderInputRef}
        type="file"
        // @ts-expect-error webkitdirectory is a non-standard attribute
        webkitdirectory=""
        style={{ display: 'none' }}
        onChange={handleFolderSelected}
        aria-hidden="true"
        tabIndex={-1}
      />

      {/* Global loading indicator */}
      {state.loading && (
        <div className="app-loading" role="status" aria-live="polite">
          <span className="app-loading-spinner" aria-hidden="true" />
          <span>Laden…</span>
        </div>
      )}

      {/* Global error banner */}
      {state.error && (
        <div className="app-error" role="alert">
          <span className="app-error-message">
            Fehler: [{state.error.code}] {state.error.message}
          </span>
        </div>
      )}

      <main className="app-main app-main--vault-view">
        <div className="app-vault-layout">
          <aside className="app-sidebar">
            <div className="app-sidebar-header">
              <h1 className="app-title">Slatebase</h1>
              <UserMenu
                onNavigate={setCurrentPage}
                onLogout={handleLogout}
                hasVaultSelected={state.selectedVaultId !== null}
                onImportFile={handleImportFile}
                onImportFolder={handleImportFolder}
              />
            </div>
            <VaultList />
            {currentPage !== 'vaults' && (
              <button
                className="app-back-button"
                onClick={() => setCurrentPage('vaults')}
                type="button"
              >
                ← Zurück zu Tresoren
              </button>
            )}
            {currentPage === 'vaults' && state.selectedVaultId && <FileExplorer />}
          </aside>
          <section className="app-content">
            {renderPage()}
          </section>
        </div>
      </main>
    </div>
  )
}

/**
 * Auth guard component that conditionally renders LoginPage or the main app
 * based on the current auth state.
 *
 * - If not authenticated → show LoginPage
 * - If authenticated but mustChangePassword → show placeholder (ChangePasswordPage not yet implemented)
 * - If authenticated → show main app content
 *
 * Also wires up the onSessionExpired callback on the ApiClient.
 */
function AuthGuard() {
  const { authState, authDispatch } = useAuthContext()

  // Wire up the onSessionExpired callback so 401 responses dispatch SESSION_EXPIRED
  useEffect(() => {
    apiClient.setOnSessionExpired(() => {
      apiClient.setToken(null)
      apiClient.setCsrfToken(null)
      authDispatch({ type: 'SESSION_EXPIRED' })
    })
    return () => {
      apiClient.setOnSessionExpired(null)
    }
  }, [authDispatch])

  // Not authenticated → show login page
  if (!authState.isAuthenticated) {
    return <LoginPage apiClient={apiClient} />
  }

  // Authenticated but must change password → show change password page
  if (authState.mustChangePassword) {
    return <ChangePasswordPage apiClient={apiClient} />
  }

  // Authenticated → render main app
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
 * AuthProvider wraps everything so auth state is available throughout.
 */
export function App() {
  return (
    <AuthProvider>
      <AuthGuard />
    </AuthProvider>
  )
}

