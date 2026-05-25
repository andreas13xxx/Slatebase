import { useState, useEffect, useCallback } from 'react'
import type { IApiClient } from '../api'
import { Database, RefreshCw, Users, FileText, HardDrive } from 'lucide-react'

interface VaultAdminEntry {
  id: string
  name: string
  ownerId?: string
  createdAt?: string
  fileCount?: number
  sizeBytes?: number
  shareCount?: number
}

interface VaultShareEntry {
  vaultId: string
  userId: string
  permission: 'read' | 'write'
  grantedBy: string
  grantedAt: string
}

interface AdminVaultsPageProps {
  apiClient: IApiClient
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Admin page showing a table of all vaults with owner, file count, size, and shares.
 * Admins can change the owner and manage shares from here.
 */
export function AdminVaultsPage({ apiClient }: AdminVaultsPageProps) {
  const [vaults, setVaults] = useState<VaultAdminEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedVault, setSelectedVault] = useState<string | null>(null)
  const [shares, setShares] = useState<VaultShareEntry[]>([])
  const [sharesLoading, setSharesLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const loadVaults = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await apiClient.fetchVaults()
      // Enrich with tree info for file count
      const enriched: VaultAdminEntry[] = await Promise.all(
        data.map(async (v) => {
          let fileCount = 0
          let sizeBytes = 0
          try {
            const tree = await apiClient.fetchVaultTree(v.id)
            function countFiles(node: { type: string; size?: number; children?: typeof node[] }): void {
              if (node.type === 'file') { fileCount++; sizeBytes += node.size ?? 0 }
              node.children?.forEach(countFiles)
            }
            countFiles(tree)
          } catch { /* ignore */ }
          return { ...v, fileCount, sizeBytes }
        })
      )
      setVaults(enriched)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Fehler beim Laden der Vaults')
    } finally {
      setLoading(false)
    }
  }, [apiClient])

  useEffect(() => { void loadVaults() }, [loadVaults])

  const loadShares = useCallback(async (vaultId: string) => {
    setSharesLoading(true)
    try {
      const token = apiClient.getToken()
      const headers: Record<string, string> = {}
      if (token) headers['Authorization'] = `Bearer ${token}`
      const res = await fetch(`/api/v1/vaults/${vaultId}/shares`, { headers })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: VaultShareEntry[] = await res.json()
      setShares(data)
    } catch { setShares([]) }
    finally { setSharesLoading(false) }
  }, [apiClient])

  function handleSelectVault(id: string) {
    if (selectedVault === id) { setSelectedVault(null); setShares([]) }
    else { setSelectedVault(id); void loadShares(id) }
  }

  async function handleRevokeShare(vaultId: string, userId: string) {
    const token = apiClient.getToken()
    const csrf = apiClient.getCsrfToken()
    const headers: Record<string, string> = {}
    if (token) headers['Authorization'] = `Bearer ${token}`
    if (csrf) headers['X-CSRF-Token'] = csrf
    try {
      const res = await fetch(`/api/v1/vaults/${vaultId}/shares/${userId}`, { method: 'DELETE', headers })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setMessage({ type: 'success', text: `Freigabe für ${userId} widerrufen.` })
      void loadShares(vaultId)
    } catch (err) {
      setMessage({ type: 'error', text: `Fehler: ${err instanceof Error ? err.message : String(err)}` })
    }
  }

  return (
    <div className="admin-users-page">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <Database size={22} color="var(--accent-text)" />
        <h1 className="admin-users-title" style={{ margin: 0 }}>Vault-Übersicht</h1>
        <button className="admin-users-btn admin-users-btn--small" onClick={() => void loadVaults()} style={{ marginLeft: 'auto' }}>
          <RefreshCw size={13} /> Aktualisieren
        </button>
      </div>

      {message && (
        <div className={`admin-users-message admin-users-message--${message.type}`} style={{ marginBottom: 16 }}>
          {message.text}
          <button onClick={() => setMessage(null)} style={{ marginLeft: 8, background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}>×</button>
        </div>
      )}

      {error && <div className="admin-users-message admin-users-message--error">{error}</div>}

      {loading ? (
        <p className="admin-users-loading">Laden…</p>
      ) : (
        <div className="admin-users-table-wrapper">
          <table className="admin-users-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>ID</th>
                <th>Besitzer</th>
                <th><FileText size={12} style={{ verticalAlign: 'middle' }} /> Dateien</th>
                <th><HardDrive size={12} style={{ verticalAlign: 'middle' }} /> Größe</th>
                <th><Users size={12} style={{ verticalAlign: 'middle' }} /> Freigaben</th>
                <th>Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {vaults.map((vault) => (
                <>
                  <tr key={vault.id} style={{ cursor: 'pointer' }} onClick={() => handleSelectVault(vault.id)}>
                    <td style={{ fontWeight: 600 }}>{vault.name}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>{vault.id}</td>
                    <td style={{ color: vault.ownerId ? 'var(--text-primary)' : 'var(--text-muted)', fontStyle: vault.ownerId ? 'normal' : 'italic' }}>
                      {vault.ownerId ?? '—'}
                    </td>
                    <td>{vault.fileCount ?? '—'}</td>
                    <td>{vault.sizeBytes !== undefined ? formatBytes(vault.sizeBytes) : '—'}</td>
                    <td>{vault.shareCount ?? '—'}</td>
                    <td>
                      <button
                        className="admin-users-btn admin-users-btn--small"
                        onClick={(e) => { e.stopPropagation(); handleSelectVault(vault.id) }}
                      >
                        {selectedVault === vault.id ? 'Schließen' : 'Freigaben'}
                      </button>
                    </td>
                  </tr>
                  {selectedVault === vault.id && (
                    <tr key={`${vault.id}-shares`}>
                      <td colSpan={7} style={{ padding: '12px 16px', background: 'var(--bg-surface)' }}>
                        {sharesLoading ? (
                          <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Laden…</span>
                        ) : shares.length === 0 ? (
                          <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Keine Freigaben vorhanden.</span>
                        ) : (
                          <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                            <thead>
                              <tr>
                                <th style={{ textAlign: 'left', padding: '4px 10px', color: 'var(--text-secondary)', fontWeight: 600, fontSize: 12 }}>Benutzer</th>
                                <th style={{ textAlign: 'left', padding: '4px 10px', color: 'var(--text-secondary)', fontWeight: 600, fontSize: 12 }}>Berechtigung</th>
                                <th style={{ textAlign: 'left', padding: '4px 10px', color: 'var(--text-secondary)', fontWeight: 600, fontSize: 12 }}>Erteilt von</th>
                                <th style={{ textAlign: 'left', padding: '4px 10px', color: 'var(--text-secondary)', fontWeight: 600, fontSize: 12 }}>Datum</th>
                                <th />
                              </tr>
                            </thead>
                            <tbody>
                              {shares.map((s) => (
                                <tr key={s.userId}>
                                  <td style={{ padding: '4px 10px' }}>{s.userId}</td>
                                  <td style={{ padding: '4px 10px' }}>
                                    <span style={{ padding: '2px 8px', borderRadius: 'var(--radius-full)', fontSize: 11, fontWeight: 600, background: s.permission === 'write' ? 'var(--accent-light)' : 'var(--bg-elevated)', color: s.permission === 'write' ? 'var(--accent-text)' : 'var(--text-secondary)', border: '1px solid var(--border-subtle)' }}>
                                      {s.permission === 'write' ? 'Schreiben' : 'Lesen'}
                                    </span>
                                  </td>
                                  <td style={{ padding: '4px 10px', color: 'var(--text-secondary)' }}>{s.grantedBy}</td>
                                  <td style={{ padding: '4px 10px', color: 'var(--text-muted)', fontSize: 12 }}>{new Date(s.grantedAt).toLocaleDateString('de-DE')}</td>
                                  <td style={{ padding: '4px 10px' }}>
                                    <button className="admin-users-btn admin-users-btn--small admin-users-btn--danger" onClick={() => void handleRevokeShare(vault.id, s.userId)}>
                                      Widerrufen
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
