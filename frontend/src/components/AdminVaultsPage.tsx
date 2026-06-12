import { useState, useEffect, useCallback } from 'react'
import type { IApiClient } from '../api'
import type { VaultInfo } from '../types'
import { useTranslation } from '../i18n'
import { Server, RefreshCw, Users, FileText, HardDrive, Trash2 } from 'lucide-react'
import { ConfirmModal } from './ConfirmModal'

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
  const { t } = useTranslation()

  const [vaults, setVaults] = useState<VaultAdminEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; vaultId: string; vaultName: string }>({
    open: false, vaultId: '', vaultName: '',
  })

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
          let shareCount = 0
          try {
            const tree = await apiClient.fetchVaultTree(v.id)
            function countFiles(node: { type: string; size?: number; children?: typeof node[] }): void {
              if (node.type === 'file') { fileCount++; sizeBytes += node.size ?? 0 }
              node.children?.forEach(countFiles)
            }
            countFiles(tree)
          } catch { /* ignore */ }
          try {
            const token = apiClient.getToken()
            const headers: Record<string, string> = {}
            if (token) headers['Authorization'] = `Bearer ${token}`
            const res = await fetch(`/api/v1/vaults/${v.id}/shares`, { headers })
            if (res.ok) {
              const shares: unknown[] = await res.json()
              shareCount = shares.length
            }
          } catch { /* ignore */ }
          return { ...v, fileCount, sizeBytes, shareCount }
        }),
      )
      setVaults(enriched)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('admin.vaults.loadError'))
    } finally {
      setLoading(false)
    }
  }, [apiClient])

  useEffect(() => { void loadVaults() }, [loadVaults]) // eslint-disable-line react-hooks/set-state-in-effect

  async function handleDelete(vaultId: string, vaultName: string): Promise<void> {
    setDeleteConfirm({ open: true, vaultId, vaultName })
  }

  async function handleDeleteConfirmed(): Promise<void> {
    const { vaultId, vaultName } = deleteConfirm
    setDeleteConfirm({ open: false, vaultId: '', vaultName: '' })
    try {
      await apiClient.deleteVault(vaultId)
      setMessage({ type: 'success', text: t('admin.vaults.deleteSuccess', { name: vaultName }) })
      void loadVaults()
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) : String(err)
      setMessage({ type: 'error', text: t('admin.vaults.deleteError', { message: msg }) })
    }
  }

  return (
    <div className="admin-users-page">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <Server size={22} color="var(--accent-text)" />
        <h1 className="admin-users-title" style={{ margin: 0 }}>{t('admin.vaults.title')}</h1>
        <button className="admin-users-btn admin-users-btn--small" onClick={() => void loadVaults()} style={{ marginLeft: 'auto' }}>
          <RefreshCw size={13} /> {t('admin.vaults.refresh')}
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
        <p className="admin-users-loading">{t('admin.vaults.loading')}</p>
      ) : vaults.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>{t('admin.vaults.empty')}</p>
      ) : (
        <div className="admin-users-table-wrapper">
          <table className="admin-users-table">
            <thead>
              <tr>
                <th>{t('admin.vaults.tableName')}</th>
                <th>{t('admin.vaults.tableOwner')}</th>
                <th><FileText size={12} style={{ verticalAlign: 'middle' }} /> {t('admin.vaults.tableFiles')}</th>
                <th><HardDrive size={12} style={{ verticalAlign: 'middle' }} /> {t('admin.vaults.tableSize')}</th>
                <th><Users size={12} style={{ verticalAlign: 'middle' }} /> {t('admin.vaults.tableShares')}</th>
                <th>{t('admin.vaults.tableActions')}</th>
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
                    {vault.shareCount !== undefined && vault.shareCount > 0
                      ? <span style={{ fontWeight: 500 }}>{vault.shareCount}</span>
                      : <span style={{ color: 'var(--text-muted)' }}>—</span>
                    }
                  </td>
                  <td>
                    <button
                      className="admin-users-btn admin-users-btn--small admin-users-btn--danger"
                      onClick={() => void handleDelete(vault.id, vault.name)}
                      title={t('admin.vaults.deleteTitle', { name: vault.name })}
                    >
                      <Trash2 size={12} /> {t('admin.vaults.delete')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        open={deleteConfirm.open}
        title={t('admin.vaults.deleteTitle', { name: deleteConfirm.vaultName })}
        message={t('admin.vaults.deleteConfirm', { name: deleteConfirm.vaultName })}
        confirmLabel={t('common.delete')}
        variant="danger"
        onConfirm={handleDeleteConfirmed}
        onCancel={() => setDeleteConfirm({ open: false, vaultId: '', vaultName: '' })}
      />
    </div>
  )
}
