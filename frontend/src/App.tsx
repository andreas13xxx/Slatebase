import { useEffect, useRef } from 'react'
import { AppProvider, useAppContext, loadVaults } from './state'
import { ApiClient } from './api'
import { TabProvider, useTabContext } from './state/tabContext'
import { VaultList } from './components/VaultList'
import { FileExplorer } from './components/FileExplorer'
import { TabBar } from './components/TabBar'
import { TabContent } from './components/TabContent'
import './App.css'

const apiClient = new ApiClient()

/**
 * Inner component that uses AppContext and TabContext to render the appropriate view.
 * Fetches vaults on mount. Clears tabs when vault changes.
 */
function AppContent() {
  const { state, dispatch } = useAppContext()
  const { tabDispatch } = useTabContext()
  const prevVaultId = useRef<string | null>(null)

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

  return (
    <div className="app">
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
              <VaultList />
            </div>
            {state.selectedVaultId && <FileExplorer />}
          </aside>
          <section className="app-content">
            <TabBar />
            <TabContent />
          </section>
        </div>
      </main>
    </div>
  )
}

/**
 * Root App component. TabProvider wraps AppContent so useTabContext is available.
 */
export default function App() {
  return (
    <AppProvider apiClient={apiClient}>
      <TabProvider>
        <AppContent />
      </TabProvider>
    </AppProvider>
  )
}
