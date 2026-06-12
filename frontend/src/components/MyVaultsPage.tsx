import { useState, useEffect, useCallback, useRef, type FormEvent } from 'react'
import { useAppContext, loadVaults, deleteVault, exportVault } from '../state'
import { useTranslation } from '../i18n'
import type { IApiClient, UserSearchResult } from '../api'
import type { VaultInfo } from '../types'
import { Database, Eye, Pencil, Crown, Trash2, Share2, RefreshCw, X, ArrowRightLeft, Download } from 'lucide-react'
import { ConfirmModal } from './ConfirmModal'
import { VaultDeletionWorkflow } from './VaultDeletionWorkflow'

interface ShareInfo {
  userId: string
  username?: string
  displayName?: string
  permission: 'read' | 'write'
}

interface MyVaultsPageProps {
  apiClient: IApiClient
  onOpenSync?: (vaultId: string) => void
}

/** Debounce delay for user search. */
const SEARCH_DEBOUNCE_MS = 300

/**
 * Vault overview page for normal users.
 * Shows owned vaults with inline share management, transfer, delete,
 * and shared vaults with owner and permission info.
 */
export function MyVaultsPage({ apiClient, onOpenSync }: MyVaultsPageProps) {
  const { state, dispatch } = useAppContext()
  const { t } = useTranslation()
  const [sharesMap, setSharesMap] = useState<Map<string, ShareInfo[]>>(new Map())
  const [expandedVault, setExpandedVault] = useState<string | null>(null)
  const [transferVault, setTransferVault] = useState<string | null>(null)
  const [vaultStats, setVaultStats] = useState<Map<string, { fileCount: number; sizeBytes: number }>>(new Map())
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; vault: VaultInfo | null }>({
    open: false, vault: null,
  })
  const [deletionWorkflow, setDeletionWorkflow] = useState<{ open: boolean; vaultId: string } | null>(null)

  const ownedVaults = state.vaults.filter((v) => v.permission === 'owner')
  const sharedVaults = state.vaults.filter((v) => v.permission === 'read' || v.permission === 'write')

  // Stable identity strings for dependency tracking (re-fire when vault list changes)
  const ownedVaultIds = ownedVaults.map((v) => v.id).join(',')
  const sharedVaultIds = sharedVaults.map((v) => v.id).join(',')

  /** Load shares for all owned vaults. */
  const loadAllShares = useCallback(async () => {
    if (ownedVaults.length === 0) { setSharesMap(new Map()); return }
    const map = new Map<string, ShareInfo[]>()
    const token = apiClient.getToken()
    const headers: Record<string, string> = {}
    if (token) headers['Authorization'] = `Bearer ${token}`

    await Promise.all(
      ownedVaults.map(async (vault) => {
        try {
          const res = await fetch(`/api/v1/vaults/${vault.id}/shares`, { headers })
          if (res.ok) {
            const data: ShareInfo[] = await res.json()
            map.set(vault.id, data)
          }
        } catch { /* ignore */ }
      }),
    )
    setSharesMap(map)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiClient, ownedVaultIds])

  /** Load file count and size for all vaults. */
  const loadStats = useCallback(async () => {
    const allVaults = [...ownedVaults, ...sharedVaults]
    if (allVaults.length === 0) { setVaultStats(new Map()); return }
    const stats = new Map<string, { fileCount: number; sizeBytes: number }>()

    await Promise.all(
      allVaults.map(async (vault) => {
        try {
          const tree = await apiClient.fetchVaultTree(vault.id)
          let fileCount = 0
          let sizeBytes = 0
          function countFiles(node: { type: string; size?: number; children?: typeof node[] }): void {
            if (node.type === 'file') { fileCount++; sizeBytes += node.size ?? 0 }
            node.children?.forEach(countFiles)
          }
          countFiles(tree)
          stats.set(vault.id, { fileCount, sizeBytes })
        } catch { /* ignore */ }
      }),
    )
    setVaultStats(stats)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiClient, ownedVaultIds, sharedVaultIds])

  useEffect(() => { void loadAllShares() }, [loadAllShares]) // eslint-disable-line react-hooks/set-state-in-effect
  useEffect(() => { void loadStats() }, [loadStats]) // eslint-disable-line react-hooks/set-state-in-effect

  async function handleDelete(vault: VaultInfo): Promise<void> {
    const shares = sharesMap.get(vault.id) ?? []
    if (shares.length > 0) {
      // Vault has shares — open the guided deletion workflow
      setDeletionWorkflow({ open: true, vaultId: vault.id })
    } else {
      // No shares — simple confirmation
      setDeleteConfirm({ open: true, vault })
    }
  }

  async function handleDeleteConfirmed(): Promise<void> {
    const vault = deleteConfirm.vault
    setDeleteConfirm({ open: false, vault: null })
    if (!vault) return
    await deleteVault(dispatch, apiClient, vault.id)
  }

  function handleDeletionWorkflowComplete(): void {
    setDeletionWorkflow(null)
    void loadVaults(dispatch, apiClient)
    void loadAllShares()
  }

  function handleRefresh(): void {
    void loadVaults(dispatch, apiClient)
  }

  async function handleRevokeShare(vaultId: string, userId: string): Promise<void> {
    const token = apiClient.getToken()
    const csrf = apiClient.getCsrfToken()
    const headers: Record<string, string> = {}
    if (token) headers['Authorization'] = `Bearer ${token}`
    if (csrf) headers['X-CSRF-Token'] = csrf
    try {
      await fetch(`/api/v1/vaults/${vaultId}/shares/${userId}`, { method: 'DELETE', headers })
      await loadAllShares()
    } catch { /* ignore */ }
  }

  async function handleChangePermission(vaultId: string, userId: string, newPermission: 'read' | 'write'): Promise<void> {
    const token = apiClient.getToken()
    const csrf = apiClient.getCsrfToken()
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (token) headers['Authorization'] = `Bearer ${token}`
    if (csrf) headers['X-CSRF-Token'] = csrf
    try {
      await fetch(`/api/v1/vaults/${vaultId}/shares/${userId}`, {
        method: 'PUT', headers, body: JSON.stringify({ permission: newPermission }),
      })
      await loadAllShares()
    } catch { /* ignore */ }
  }

  async function handleTransfer(vaultId: string, newOwnerId: string): Promise<void> {
    const token = apiClient.getToken()
    const csrf = apiClient.getCsrfToken()
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (token) headers['Authorization'] = `Bearer ${token}`
    if (csrf) headers['X-CSRF-Token'] = csrf

    try {
      const res = await fetch(`/api/v1/vaults/${vaultId}/transfer`, {
        method: 'POST', headers, body: JSON.stringify({ newOwnerId }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ message: 'Fehler' }))
        throw new Error((body as { message?: string }).message ?? `HTTP ${res.status}`)
      }
      void loadVaults(dispatch, apiClient)
    } catch (err: unknown) {
      throw err instanceof Error ? err : new Error(String(err))
    }
  }

  function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <div className="my-vaults-page">
      <div className="my-vaults-header">
        <Database size={22} color="var(--accent-text)" />
        <h1 className="my-vaults-title">Meine Vaults</h1>
        <button
          className="admin-users-btn admin-users-btn--small"
          onClick={handleRefresh}
          style={{ marginLeft: 'auto' }}
        >
          <RefreshCw size={13} /> Aktualisieren
        </button>
      </div>

      {/* Owned vaults section */}
      <section className="my-vaults-section">
        <h2 className="my-vaults-section-title">
          <Crown size={14} /> Eigene Vaults ({ownedVaults.length})
        </h2>
        {ownedVaults.length === 0 ? (
          <p className="my-vaults-empty">Keine eigenen Vaults vorhanden.</p>
        ) : (
          <ul className="my-vaults-list">
            {ownedVaults.map((vault) => {
              const shares = sharesMap.get(vault.id) ?? []
              const stats = vaultStats.get(vault.id)
              const isExpanded = expandedVault === vault.id
              return (
                <li key={vault.id} className="my-vaults-item my-vaults-item--detailed">
                  <div className="my-vaults-item-main">
                    <Database size={14} className="my-vaults-item-icon" />
                    <span className="my-vaults-item-name">{vault.name}</span>
                    {stats && (
                      <span className="my-vaults-item-stats">
                        {stats.fileCount} Dateien · {formatBytes(stats.sizeBytes)}
                      </span>
                    )}
                    <button
                      className="my-vaults-share-btn"
                      onClick={() => setExpandedVault(isExpanded ? null : vault.id)}
                      title="Freigaben verwalten"
                      aria-label={`Freigaben für "${vault.name}" verwalten`}
                    >
                      <Share2 size={12} />
                      {shares.length > 0 && <span className="my-vaults-share-count">{shares.length}</span>}
                    </button>
                    <button
                      className="my-vaults-action-btn"
                      onClick={() => void exportVault(dispatch, apiClient, vault.id, vault.name)}
                      title="Vault exportieren"
                      aria-label={`Vault "${vault.name}" exportieren`}
                    >
                      <Download size={12} />
                    </button>
                    <button
                      className={`my-vaults-action-btn${vault.syncEnabled ? ' my-vaults-action-btn--sync-active' : ''}`}
                      onClick={() => onOpenSync?.(vault.id)}
                      title={vault.syncEnabled ? 'Vault-Sync aktiv — konfigurieren' : 'Vault-Sync konfigurieren'}
                      aria-label={`Sync für "${vault.name}" konfigurieren`}
                    >
                      <RefreshCw size={12} />
                    </button>
                    <button
                      className={`my-vaults-action-btn${transferVault === vault.id ? ' my-vaults-action-btn--active' : ''}`}
                      onClick={() => setTransferVault(transferVault === vault.id ? null : vault.id)}
                      title="Besitz übertragen"
                      aria-label={`Vault "${vault.name}" übertragen`}
                    >
                      <ArrowRightLeft size={12} />
                    </button>
                    <button
                      className="my-vaults-delete-btn"
                      onClick={() => void handleDelete(vault)}
                      title={`"${vault.name}" löschen`}
                      aria-label={`Vault "${vault.name}" löschen`}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>

                  {/* Inline share management */}
                  {isExpanded && (
                    <div className="my-vaults-sharing-panel">
                      {shares.length > 0 && (
                        <div className="my-vaults-sharing-list">
                          {shares.map((s) => (
                            <div key={s.userId} className="my-vaults-sharing-entry">
                              <span className="my-vaults-sharing-user">{s.username ?? s.userId}</span>
                              <select
                                className="my-vaults-sharing-perm-select"
                                value={s.permission}
                                onChange={(e) => void handleChangePermission(vault.id, s.userId, e.target.value as 'read' | 'write')}
                                aria-label={`Berechtigung für ${s.username ?? s.userId}`}
                              >
                                <option value="read">Lesen</option>
                                <option value="write">Schreiben</option>
                              </select>
                              <button
                                className="my-vaults-sharing-revoke"
                                onClick={() => void handleRevokeShare(vault.id, s.userId)}
                                title="Freigabe widerrufen"
                                aria-label={`Freigabe für ${s.username ?? s.userId} widerrufen`}
                              >
                                <X size={12} />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                      {shares.length === 0 && (
                        <p className="my-vaults-sharing-empty">Noch nicht geteilt.</p>
                      )}
                      <AddShareForm
                        apiClient={apiClient}
                        vaultId={vault.id}
                        onShareAdded={loadAllShares}
                      />
                    </div>
                  )}

                  {/* Inline transfer form */}
                  {transferVault === vault.id && (
                    <TransferForm
                      apiClient={apiClient}
                      vaultId={vault.id}
                      vaultName={vault.name}
                      onTransferred={() => { setTransferVault(null); void loadVaults(dispatch, apiClient) }}
                      onCancel={() => setTransferVault(null)}
                      onTransfer={handleTransfer}
                    />
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {/* Shared vaults section */}
      <section className="my-vaults-section">
        <h2 className="my-vaults-section-title">
          Mit mir geteilt ({sharedVaults.length})
        </h2>
        {sharedVaults.length === 0 ? (
          <p className="my-vaults-empty">Keine geteilten Vaults vorhanden.</p>
        ) : (
          <ul className="my-vaults-list">
            {sharedVaults.map((vault) => {
              const stats = vaultStats.get(vault.id)
              return (
                <li key={vault.id} className="my-vaults-item my-vaults-item--detailed">
                  <div className="my-vaults-item-main">
                    <Database size={14} className="my-vaults-item-icon" />
                    <span className="my-vaults-item-name">{vault.name}</span>
                    {stats && (
                      <span className="my-vaults-item-stats">
                        {stats.fileCount} Dateien · {formatBytes(stats.sizeBytes)}
                      </span>
                    )}
                    {vault.permission === 'read' ? (
                      <span className="my-vaults-badge my-vaults-badge--read">
                        <Eye size={11} /> Nur Lesen
                      </span>
                    ) : (
                      <span className="my-vaults-badge my-vaults-badge--write">
                        <Pencil size={11} /> Bearbeiten
                      </span>
                    )}
                  </div>
                  <div className="my-vaults-item-owner">
                    Besitzer: <strong>{vault.ownerName ?? vault.ownerId ?? '—'}</strong>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {/* Delete Confirmation Modal (only for vaults without shares) */}
      <ConfirmModal
        open={deleteConfirm.open}
        title={t('vault.deleteVault')}
        message={deleteConfirm.vault ? t('vault.deleteConfirm', { name: deleteConfirm.vault.name }) : ''}
        confirmLabel={t('common.delete')}
        variant="danger"
        onConfirm={handleDeleteConfirmed}
        onCancel={() => setDeleteConfirm({ open: false, vault: null })}
      />

      {/* Vault Deletion Workflow (shown when vault has active shares) */}
      {deletionWorkflow?.open && (
        <div className="vault-deletion-workflow-overlay">
          <div className="vault-deletion-workflow-modal">
            <VaultDeletionWorkflow
              apiClient={apiClient}
              vaultId={deletionWorkflow.vaultId}
              onComplete={handleDeletionWorkflowComplete}
            />
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Inline Add Share Form ───────────────────────────────────────────────────

interface AddShareFormProps {
  apiClient: IApiClient
  vaultId: string
  onShareAdded: () => Promise<void>
}

function AddShareForm({ apiClient, vaultId, onShareAdded }: AddShareFormProps) {
  const [username, setUsername] = useState('')
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [permission, setPermission] = useState<'read' | 'write'>('read')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<UserSearchResult[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [])

  function handleUsernameChange(value: string): void {
    setUsername(value)
    setSelectedUserId(null)
    if (error) setError(null)

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      if (value.trim().length === 0) { setSuggestions([]); setShowSuggestions(false); return }
      void apiClient.searchUsers(value.trim()).then((results) => {
        setSuggestions(results)
        setShowSuggestions(results.length > 0)
      }).catch(() => { setSuggestions([]); setShowSuggestions(false) })
    }, SEARCH_DEBOUNCE_MS)
  }

  function selectSuggestion(user: UserSearchResult): void {
    setUsername(user.username)
    setSelectedUserId(user.userId)
    setSuggestions([])
    setShowSuggestions(false)
  }

  async function handleSubmit(e: FormEvent): Promise<void> {
    e.preventDefault()
    setError(null)
    setShowSuggestions(false)

    const trimmed = username.trim()
    if (trimmed === '') { setError('Benutzername eingeben.'); return }

    const targetId = selectedUserId ?? trimmed
    setLoading(true)

    try {
      const token = apiClient.getToken()
      const csrf = apiClient.getCsrfToken()
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (token) headers['Authorization'] = `Bearer ${token}`
      if (csrf) headers['X-CSRF-Token'] = csrf

      const res = await fetch(`/api/v1/vaults/${vaultId}/shares`, {
        method: 'POST', headers, body: JSON.stringify({ userId: targetId, permission }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({ message: 'Fehler' }))
        throw new Error(body.message ?? `HTTP ${res.status}`)
      }

      setUsername('')
      setSelectedUserId(null)
      setPermission('read')
      await onShareAdded()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Fehler beim Hinzufügen')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form className="my-vaults-add-share" onSubmit={handleSubmit} noValidate>
      <div className="my-vaults-add-share-row">
        <div className="my-vaults-add-share-input-wrap">
          <input
            type="text"
            className="my-vaults-add-share-input"
            value={username}
            onChange={(e) => handleUsernameChange(e.target.value)}
            onFocus={() => { if (suggestions.length > 0 && !selectedUserId) setShowSuggestions(true) }}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            placeholder="Benutzer hinzufügen…"
            autoComplete="off"
            aria-label="Benutzername für Freigabe"
          />
          {showSuggestions && suggestions.length > 0 && (
            <ul className="my-vaults-add-share-suggestions">
              {suggestions.map((user) => (
                <li
                  key={user.userId}
                  className="my-vaults-add-share-suggestion"
                  onMouseDown={(e) => { e.preventDefault(); selectSuggestion(user) }}
                >
                  <span>{user.username}</span>
                  {user.displayName && user.displayName !== user.username && (
                    <span className="my-vaults-add-share-suggestion-name">{user.displayName}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
        <select
          className="my-vaults-add-share-perm"
          value={permission}
          onChange={(e) => setPermission(e.target.value as 'read' | 'write')}
          aria-label="Berechtigung"
        >
          <option value="read">Lesen</option>
          <option value="write">Schreiben</option>
        </select>
        <button type="submit" className="my-vaults-add-share-btn" disabled={loading}>
          {loading ? '…' : '+'}
        </button>
      </div>
      {error && <p className="my-vaults-add-share-error">{error}</p>}
    </form>
  )
}

// ─── Inline Transfer Form ────────────────────────────────────────────────────

interface TransferFormProps {
  apiClient: IApiClient
  vaultId: string
  vaultName: string
  onTransferred: () => void
  onCancel: () => void
  onTransfer: (vaultId: string, newOwnerId: string) => Promise<void>
}

/**
 * Inline form for transferring vault ownership with user autocomplete.
 * Shows a warning before executing the transfer.
 */
function TransferForm({ apiClient, vaultId, vaultName, onTransferred, onCancel, onTransfer }: TransferFormProps) {
  const [username, setUsername] = useState('')
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmStep, setConfirmStep] = useState(false)
  const [suggestions, setSuggestions] = useState<UserSearchResult[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [])

  function handleUsernameChange(value: string): void {
    setUsername(value)
    setSelectedUserId(null)
    setConfirmStep(false)
    if (error) setError(null)

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      if (value.trim().length === 0) { setSuggestions([]); setShowSuggestions(false); return }
      void apiClient.searchUsers(value.trim()).then((results) => {
        setSuggestions(results)
        setShowSuggestions(results.length > 0)
      }).catch(() => { setSuggestions([]); setShowSuggestions(false) })
    }, SEARCH_DEBOUNCE_MS)
  }

  function selectSuggestion(user: UserSearchResult): void {
    setUsername(user.username)
    setSelectedUserId(user.userId)
    setSuggestions([])
    setShowSuggestions(false)
  }

  function handleInitiate(e: FormEvent): void {
    e.preventDefault()
    setError(null)
    setShowSuggestions(false)

    const trimmed = username.trim()
    if (trimmed === '') { setError('Benutzername eingeben.'); return }

    setConfirmStep(true)
  }

  async function handleConfirm(): Promise<void> {
    const targetId = selectedUserId ?? username.trim()
    setLoading(true)
    setError(null)

    try {
      await onTransfer(vaultId, targetId)
      onTransferred()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Übertragung fehlgeschlagen')
      setConfirmStep(false)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="my-vaults-transfer-panel">
      <div className="my-vaults-transfer-header">
        <ArrowRightLeft size={12} />
        <span>Besitz übertragen</span>
      </div>

      {!confirmStep ? (
        <form onSubmit={handleInitiate} noValidate>
          <div className="my-vaults-add-share-row">
            <div className="my-vaults-add-share-input-wrap">
              <input
                type="text"
                className="my-vaults-add-share-input"
                value={username}
                onChange={(e) => handleUsernameChange(e.target.value)}
                onFocus={() => { if (suggestions.length > 0 && !selectedUserId) setShowSuggestions(true) }}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                placeholder="Neuer Besitzer…"
                autoComplete="off"
                aria-label="Benutzername für Übertragung"
              />
              {showSuggestions && suggestions.length > 0 && (
                <ul className="my-vaults-add-share-suggestions">
                  {suggestions.map((user) => (
                    <li
                      key={user.userId}
                      className="my-vaults-add-share-suggestion"
                      onMouseDown={(e) => { e.preventDefault(); selectSuggestion(user) }}
                    >
                      <span>{user.username}</span>
                      {user.displayName && user.displayName !== user.username && (
                        <span className="my-vaults-add-share-suggestion-name">{user.displayName}</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <button type="submit" className="my-vaults-add-share-btn" disabled={loading || username.trim() === ''}>
              Weiter
            </button>
            <button type="button" className="my-vaults-transfer-cancel" onClick={onCancel}>
              <X size={12} />
            </button>
          </div>
          {error && <p className="my-vaults-add-share-error">{error}</p>}
        </form>
      ) : (
        <div className="my-vaults-transfer-confirm">
          <p className="my-vaults-transfer-warning">
            ⚠️ Vault <strong>„{vaultName}"</strong> wird an <strong>{username}</strong> übertragen. Du verlierst den Zugriff.
          </p>
          <div className="my-vaults-transfer-confirm-actions">
            <button
              type="button"
              className="my-vaults-transfer-confirm-btn"
              onClick={() => void handleConfirm()}
              disabled={loading}
            >
              {loading ? 'Übertrage…' : 'Übertragen'}
            </button>
            <button
              type="button"
              className="my-vaults-transfer-cancel"
              onClick={() => setConfirmStep(false)}
              disabled={loading}
            >
              Abbrechen
            </button>
          </div>
          {error && <p className="my-vaults-add-share-error">{error}</p>}
        </div>
      )}
    </div>
  )
}
