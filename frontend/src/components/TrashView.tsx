import { useState, useEffect, useCallback } from 'react'
import { Trash2, RotateCcw, FileText, Folder, Loader2 } from 'lucide-react'
import type { IApiClient, TrashEntryInfo } from '../api'
import { ConfirmModal } from './ConfirmModal'
import { showToast } from './ToastNotification'
import './TrashView.css'

export interface TrashViewProps {
  /** Vault ID to display trash entries for. */
  vaultId: string
  /** API client instance. */
  apiClient: IApiClient
}

/**
 * Formats a date string to DD.MM.YYYY HH:mm in local timezone.
 */
function formatDeletionDate(isoDate: string): string {
  const date = new Date(isoDate)
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year = date.getFullYear()
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${day}.${month}.${year} ${hours}:${minutes}`
}

/**
 * Papierkorb-Ansicht — displays deleted files with restore and permanent delete actions.
 */
export function TrashView({ vaultId, apiClient }: TrashViewProps) {
  const [entries, setEntries] = useState<TrashEntryInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [actionInProgress, setActionInProgress] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<TrashEntryInfo | null>(null)

  const fetchTrash = useCallback(async () => {
    setLoading(true)
    try {
      const result = await apiClient.listTrash(vaultId)
      setEntries(result.entries)
    } catch {
      showToast('error', 'Papierkorb konnte nicht geladen werden.')
    } finally {
      setLoading(false)
    }
  }, [apiClient, vaultId])

  useEffect(() => {
    // Data fetching on mount — setState inside async callback is expected
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchTrash()
  }, [fetchTrash])

  const handleRestore = useCallback(async (entry: TrashEntryInfo) => {
    setActionInProgress(entry.id)
    try {
      await apiClient.restoreTrash(vaultId, entry.id)
      showToast('success', `"${entry.originalPath}" wiederhergestellt.`)
      await fetchTrash()
    } catch (err: unknown) {
      const message = err && typeof err === 'object' && 'message' in err
        ? (err as { message: string }).message
        : 'Unbekannter Fehler'
      showToast('error', `Wiederherstellung fehlgeschlagen: ${message}`)
    } finally {
      setActionInProgress(null)
    }
  }, [apiClient, vaultId, fetchTrash])

  const handleDeletePermanently = useCallback(async (entry: TrashEntryInfo) => {
    setConfirmDelete(null)
    setActionInProgress(entry.id)
    try {
      await apiClient.deleteTrash(vaultId, entry.id)
      showToast('success', `"${entry.originalPath}" endgültig gelöscht.`)
      await fetchTrash()
    } catch (err: unknown) {
      const message = err && typeof err === 'object' && 'message' in err
        ? (err as { message: string }).message
        : 'Unbekannter Fehler'
      showToast('error', `Löschen fehlgeschlagen: ${message}`)
    } finally {
      setActionInProgress(null)
    }
  }, [apiClient, vaultId, fetchTrash])

  if (loading) {
    return (
      <div className="trash-view">
        <div className="trash-view__header">
          <Trash2 size={18} className="trash-view__header-icon" />
          <h2 className="trash-view__title">Papierkorb</h2>
        </div>
        <div className="trash-view__loading">
          <Loader2 size={18} className="trash-view__spinner" />
          <span>Lade Papierkorb…</span>
        </div>
      </div>
    )
  }

  return (
    <div className="trash-view">
      <div className="trash-view__header">
        <Trash2 size={18} className="trash-view__header-icon" />
        <h2 className="trash-view__title">Papierkorb</h2>
        <span className="trash-view__count">{entries.length}</span>
      </div>

      {entries.length === 0 ? (
        <div className="trash-view__empty">
          <Trash2 size={32} className="trash-view__empty-icon" />
          <p className="trash-view__empty-text">Der Papierkorb ist leer.</p>
        </div>
      ) : (
        <ul className="trash-view__list" role="list">
          {entries.map((entry) => (
            <li key={entry.id} className="trash-view__entry">
              <div className="trash-view__entry-icon">
                {entry.isDirectory
                  ? <Folder size={16} />
                  : <FileText size={16} />
                }
              </div>
              <div className="trash-view__entry-info">
                <span className="trash-view__entry-path" title={entry.originalPath}>
                  {entry.originalPath}
                </span>
                <span className="trash-view__entry-date">
                  Gelöscht: {formatDeletionDate(entry.deletedAt)}
                </span>
              </div>
              <div className="trash-view__entry-actions">
                <button
                  type="button"
                  className="trash-view__btn trash-view__btn--restore"
                  onClick={() => void handleRestore(entry)}
                  disabled={actionInProgress === entry.id}
                  title="Wiederherstellen"
                  aria-label={`${entry.originalPath} wiederherstellen`}
                >
                  <RotateCcw size={14} />
                  <span>Wiederherstellen</span>
                </button>
                <button
                  type="button"
                  className="trash-view__btn trash-view__btn--delete"
                  onClick={() => setConfirmDelete(entry)}
                  disabled={actionInProgress === entry.id}
                  title="Endgültig löschen"
                  aria-label={`${entry.originalPath} endgültig löschen`}
                >
                  <Trash2 size={14} />
                  <span>Endgültig löschen</span>
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ConfirmModal
        open={confirmDelete !== null}
        title="Endgültig löschen"
        message={confirmDelete
          ? `"${confirmDelete.originalPath}" wird unwiderruflich gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.`
          : ''
        }
        confirmLabel="Endgültig löschen"
        cancelLabel="Abbrechen"
        variant="danger"
        onConfirm={() => {
          if (confirmDelete) {
            void handleDeletePermanently(confirmDelete)
          }
        }}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  )
}
