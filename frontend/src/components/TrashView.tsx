import { useState, useEffect, useCallback } from 'react'
import { useTranslation, translateNow } from '../i18n'
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
  const { t } = useTranslation()
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
      showToast('error', translateNow('commonUi.c_trashLoadFailed'))
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
      showToast('success', translateNow('commonUi.c_restoredNamed', { path: entry.originalPath }))
      await fetchTrash()
    } catch (err: unknown) {
      const message = err && typeof err === 'object' && 'message' in err
        ? (err as { message: string }).message
        : translateNow('commonUi.c_unknownError')
      showToast('error', translateNow('commonUi.c_restoreFailed', { message: message }))
    } finally {
      setActionInProgress(null)
    }
  }, [apiClient, vaultId, fetchTrash])

  const handleDeletePermanently = useCallback(async (entry: TrashEntryInfo) => {
    setConfirmDelete(null)
    setActionInProgress(entry.id)
    try {
      await apiClient.deleteTrash(vaultId, entry.id)
      showToast('success', translateNow('commonUi.c_deletedPermanently', { path: entry.originalPath }))
      await fetchTrash()
    } catch (err: unknown) {
      const message = err && typeof err === 'object' && 'message' in err
        ? (err as { message: string }).message
        : translateNow('commonUi.c_unknownError')
      showToast('error', translateNow('commonUi.c_deleteFailed', { message: message }))
    } finally {
      setActionInProgress(null)
    }
  }, [apiClient, vaultId, fetchTrash])

  if (loading) {
    return (
      <div className="trash-view" aria-label={t('commonUi.c_trash')}>
        <div className="trash-view__header">
          <Trash2 size={18} className="trash-view__header-icon" aria-hidden="true" />
          <h2 className="trash-view__title">{t('commonUi.c_trash')}</h2>
        </div>
        <div className="trash-view__loading" role="status" aria-live="polite">
          <Loader2 size={18} className="trash-view__spinner" aria-hidden="true" />
          <span>{t('commonUi.c_trashLoading')}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="trash-view" aria-label={t('commonUi.c_trash')}>
      <div className="trash-view__header">
        <Trash2 size={18} className="trash-view__header-icon" aria-hidden="true" />
        <h2 className="trash-view__title">{t('commonUi.c_trash')}</h2>
        <span className="trash-view__count" aria-label={t('commonUi.c_entriesCount', { n: entries.length })}>{entries.length}</span>
      </div>

      {entries.length === 0 ? (
        <div className="trash-view__empty" role="status" aria-live="polite">
          <Trash2 size={32} className="trash-view__empty-icon" aria-hidden="true" />
          <p className="trash-view__empty-text">{t('commonUi.c_trashEmpty')}</p>
        </div>
      ) : (
        <ul className="trash-view__list" role="list" aria-label={t('commonUi.c_deletedFiles')}>
          {entries.map((entry) => (
            <li key={entry.id} className="trash-view__entry">
              <div className="trash-view__entry-icon" aria-hidden="true">
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
                  {t('commonUi.c_deletedOn', { date: formatDeletionDate(entry.deletedAt) })}
                </span>
              </div>
              <div className="trash-view__entry-actions" role="group" aria-label={t('commonUi.c_actionsFor', { path: entry.originalPath })}>
                <button
                  type="button"
                  className="trash-view__btn trash-view__btn--restore"
                  onClick={() => void handleRestore(entry)}
                  disabled={actionInProgress === entry.id}
                  title={t('commonUi.c_restore')}
                  aria-label={t('commonUi.c_restoreNamed', { path: entry.originalPath })}
                >
                  <RotateCcw size={14} aria-hidden="true" />
                  <span>{t('commonUi.c_restore')}</span>
                </button>
                <button
                  type="button"
                  className="trash-view__btn trash-view__btn--delete"
                  onClick={() => setConfirmDelete(entry)}
                  disabled={actionInProgress === entry.id}
                  title={t('commonUi.c_deletePermanently')}
                  aria-label={t('commonUi.c_deleteNamed', { path: entry.originalPath })}
                >
                  <Trash2 size={14} aria-hidden="true" />
                  <span>{t('commonUi.c_deletePermanently')}</span>
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ConfirmModal
        open={confirmDelete !== null}
        title={t('commonUi.c_deletePermanently')}
        message={confirmDelete
          ? t('commonUi.c_permanentDeleteMessage', { path: confirmDelete.originalPath })
          : ''
        }
        confirmLabel={t('commonUi.c_deletePermanently')}
        cancelLabel={t('commonUi.c_cancel')}
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
