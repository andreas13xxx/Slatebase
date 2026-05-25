import { useState, useEffect, useCallback } from 'react'
import type { IApiClient } from '../api'
import type { VaultInfo } from '../types'
import { Server, RefreshCw, Users, FileText, HardDrive, Trash2 } from 'lucide-react'

interface VaultAdminEntry extends VaultInfo {
  fileCount?: number
  sizeBytes?: number
  shareCount?: number
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
 * Admin page showing a table of ALL vaults (across all users) with owner, file count, size.
 * Admins can delete vaults from here.
 */
export function AdminVaultsPage({ apiClient }: AdminVaultsPageProps) {
  const [vaults, setVaults] = useState<VaultAdminEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const loadVaults = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await apiClient.fetchAllVaults()

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
        }),
      )
      setVaults(enriched)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Fehler beim Laden der Vaults')
    } finally {
      setLoading(false)
    }
  }, [apiClient])

  useEffect(() => { void loadVaults() }, [loadVaults])

  async function handleDelete(vaultId: string, vaultName: string): Promise<void> {
    if (!window.confirm(`Vault "${vaultName}" wirklich löschen? Alle Dateien werden unwiderruflich entfernt.`)) return
    try {
      await apiClient.deleteVault(vaultId)
      setMessage({ type: 'success', text: `Vault "${vaultName}" gelöscht.` })
      void loadVaults()
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) : String(err)
      setMessage({ type: 'error', text: `Fehler beim Löschen: ${msg}` })
    }
  }

  return (
    <div className="admin-users-page">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <Server size={22} color="var(--accent-text)" />
        <h1 className="admin-users-title" style={{ margin: 0 }}>Alle Vaults (Admin)</h1>
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
      ) : vaults.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Keine Vaults vorhanden.</p>
      ) : (
        <div className="admin-users-table-wrapper">
          <table className="admin-users-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Besitzer</th>
                <th><FileText size={12} style={{ verticalAlign: 'middle' }} /> Dateien</th>
                <th><HardDrive size={12} style={{ verticalAlign: 'middle' }} /> Größe</th>
                <th><Users size={12} style={{ verticalAlign: 'middle' }} /> Berechtigung</th>
                <th>Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {vaults.map((vault) => (
                <tr key={vault.id}>
                  <td style={{ fontWeight: 600 }}>{vault.name}</td>
                  <td style={{ color: vault.ownerName ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                    {vault.ownerName ?? vault.ownerId ?? '—'}
                  </td>
                  <td>{vault.fileCount ?? '—'}</td>
                  <td>{vault.sizeBytes !== undefined ? formatBytes(vault.sizeBytes) : '—'}</td>
                  <td>
                    {vault.permission === 'owner' && <span className="my-vaults-badge my-vaults-badge--owner">Besitzer</span>}
                    {vault.permission === 'read' && <span className="my-vaults-badge my-vaults-badge--read">Lesen</span>}
                    {vault.permission === 'write' && <span className="my-vaults-badge my-vaults-badge--write">Bearbeiten</span>}
                    {!vault.permission && <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>}
                  </td>
                  <td>
                    <button
                      className="admin-users-btn admin-users-btn--small admin-users-btn--danger"
                      onClick={() => void handleDelete(vault.id, vault.name)}
                      title={`"${vault.name}" löschen`}
                    >
                      <Trash2 size={12} /> Löschen
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
