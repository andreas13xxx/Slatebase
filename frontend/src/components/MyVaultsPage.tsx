import { useState, useEffect, useCallback, useRef, type FormEvent } from 'react'
import { useAppContext, loadVaults, deleteVault } from '../state'
import type { IApiClient, UserSearchResult } from '../api'
import type { VaultInfo } from '../types'
import { Database, Eye, Pencil, Crown, Trash2, Share2, RefreshCw, X, ArrowRightLeft } from 'lucide-react'

interface ShareInfo {
  userId: string
  username?: string
  displayName?: string
  permission: 'read' | 'write'
}

interface MyVaultsPageProps {
  apiClient: IApiClient
}

/** Debounce delay for user search. */
const SEARCH_DEBOUNCE_MS = 300

/**
 * Vault overview page for normal users.
 * Shows owned vaults with inline share management, transfer, delete,
 * and shared vaults with owner and permission info.
 */
export function MyVaultsPage({ apiClient }: MyVaultsPageProps) {
  const { state, dispatch } = useAppContext()
  const [sharesMap, setSharesMap] = useState<Map<string, ShareInfo[]>>(new Map())
  const [expandedVault, setExpandedVault] = useState<string | null>(null)
  const [vaultStats, setVaultStats] = useState<Map<string, { fileCount: number; sizeBytes: number }>>(new Map())

  const ownedVaults = state.vaults.filter((v) => v.permission === 'owner')
  const sharedVaults = state.vaults.filter((v) => v.permission === 'read' || v.permission === 'write')

  /** Load shares for all owned vaults. */
  const loadAllShares = useCallback(async () => {
    if (ownedVaults.length === 0) return
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
  }, [apiClient, ownedVaults.length])

  /** Load file count and size for all vaults. */
  const loadStats = useCallback(async () => {
    const allVaults = [...ownedVaults, ...sharedVaults]
    if (allVaults.length === 0) return
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
  }, [apiClient, ownedVaults.length, sharedVaults.length])

  useEffect(() => { void loadAllShares() }, [loadAllShares])
  useEffect(() => { void loadStats() }, [loadStats])

  async function handleDelete(vault: VaultInfo): Promise<void> {
    const shares = sharesMap.get(vault.id) ?? []
    let msg = `Vault "${vault.name}" wirklich löschen? Alle Dateien werden unwiderruflich entfernt.`
    if (shares.length > 0) {
      msg = `⚠️ Dieser Vault ist mit ${shares.length} ${shares.length === 1 ? 'Person' : 'Personen'} geteilt.\n\n${msg}`
    }
    if (!window.confirm(msg)) return
    await deleteVault(dispatch, apiClient, vault.id)
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

  async function handleTransfer(vaultId: string, vaultName: string): Promise<void> {
    const newOwner = window.prompt(`Vault "${vaultName}" übertragen an (Benutzername oder ID):`)
    if (!newOwner || newOwner.trim() === '') return

    if (!window.confirm(`Vault "${vaultName}" wirklich an "${newOwner.trim()}" übertragen? Du verlierst den Zugriff.`)) return

    const token = apiClient.getToken()
    const csrf = apiClient.getCsrfToken()
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (token) headers['Authorization'] = `Bearer ${token}`
    if (csrf) headers['X-CSRF-Token'] = csrf

    try {
      const res = await fetch(`/api/v1/vaults/${vaultId}/transfer`, {
        method: 'POST', headers, body: JSON.stringify({ newOwnerId: newOwner.trim() }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ message: 'Fehler' }))
        window.alert(`Übertragung fehlgeschlagen: ${body.message ?? `HTTP ${res.status}`}`)
        return
      }
      void loadVaults(dispatch, apiClient)
    } catch (err: unknown) {
      window.alert(`Fehler: ${err instanceof Error ? err.message : String(err)}`)
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
                      onClick={() => void handleTransfer(vault.id, vault.name)}
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
