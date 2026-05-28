import { useState } from 'react'
import { GitBranch, Download, Upload, SkipForward } from 'lucide-react'
import { useSyncContext } from '../state/syncContext'
import { useAppContext } from '../state/index'
import { resolveConflict } from '../state/syncActions'
import { ConfirmModal } from './ConfirmModal'
import type { ConflictEntry } from '../state/syncState'

/** Props for the ConflictResolutionView component. */
export interface ConflictResolutionViewProps {
  vaultId: string
  conflicts: ConflictEntry[]
  mode: 'bidirectional' | 'readonly'
}

/**
 * Determines which version is recommended based on modification dates.
 * Newer modification date wins; if identical, remote is recommended.
 */
function getRecommendation(conflict: ConflictEntry): 'remote' | 'local' {
  const localDate = new Date(conflict.local.modifiedAt).getTime()
  const remoteDate = new Date(conflict.remote.modifiedAt).getTime()
  if (localDate > remoteDate) return 'local'
  return 'remote' // remote wins on tie
}

/**
 * Formats a file size in bytes to a human-readable string (KB or MB).
 */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Formats an ISO date string to German locale.
 */
function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('de-DE')
}

/**
 * Displays sync conflicts and allows the user to resolve them.
 * Shows a list of conflicting documents with local/remote info,
 * a recommendation badge, and resolution action buttons.
 */
export function ConflictResolutionView({ vaultId, conflicts, mode }: ConflictResolutionViewProps) {
  const { dispatch } = useSyncContext()
  const { apiClient } = useAppContext()
  const [confirmAction, setConfirmAction] = useState<{
    documentPath: string
    resolution: string
    message: string
  } | null>(null)

  const handleResolve = (documentPath: string, resolution: string) => {
    if (!apiClient) return
    resolveConflict(dispatch, apiClient, vaultId, documentPath, resolution)
  }

  const handleConfirm = () => {
    if (confirmAction) {
      handleResolve(confirmAction.documentPath, confirmAction.resolution)
      setConfirmAction(null)
    }
  }

  if (conflicts.length === 0) {
    return (
      <div className="conflict-empty">
        <GitBranch size={24} />
        <p className="conflict-empty-text">Keine Konflikte vorhanden</p>
      </div>
    )
  }

  return (
    <div className="conflict-container">
      <div className="conflict-header">
        <GitBranch size={16} />
        <span className="conflict-header-title">
          {conflicts.length} {conflicts.length === 1 ? 'Konflikt' : 'Konflikte'}
        </span>
      </div>

      <div className="conflict-list">
        {conflicts.map((conflict) => {
          const recommendation = getRecommendation(conflict)
          return (
            <div key={conflict.documentPath} className="conflict-card">
              <div className="conflict-card-path">
                <GitBranch size={14} />
                <span className="conflict-card-path-text">{conflict.documentPath}</span>
              </div>

              <div className="conflict-card-info">
                <div className="conflict-card-section">
                  <div className="conflict-card-section-title">
                    Lokal
                    {recommendation === 'local' && (
                      <span className="conflict-badge conflict-badge--recommended">Empfohlen</span>
                    )}
                  </div>
                  <div className="conflict-card-details">
                    <span>Geändert: {formatDate(conflict.local.modifiedAt)}</span>
                    <span>Größe: {formatSize(conflict.local.size)}</span>
                  </div>
                </div>

                <div className="conflict-card-section">
                  <div className="conflict-card-section-title">
                    Remote
                    {recommendation === 'remote' && (
                      <span className="conflict-badge conflict-badge--recommended">Empfohlen</span>
                    )}
                  </div>
                  <div className="conflict-card-details">
                    <span>Revision: {conflict.remote.revision}</span>
                    <span>Geändert: {formatDate(conflict.remote.modifiedAt)}</span>
                    <span>Größe: {formatSize(conflict.remote.size)}</span>
                  </div>
                </div>
              </div>

              <div className="conflict-card-actions">
                <button
                  type="button"
                  className="conflict-btn conflict-btn--remote"
                  onClick={() => handleResolve(conflict.documentPath, 'use_remote')}
                  title="Remote-Version übernehmen"
                >
                  <Download size={14} />
                  Remote-Version übernehmen
                </button>

                <button
                  type="button"
                  className="conflict-btn conflict-btn--local"
                  onClick={() => handleResolve(conflict.documentPath, 'use_local')}
                  disabled={mode === 'readonly'}
                  title={
                    mode === 'readonly'
                      ? 'Im Nur-Lesen-Modus nicht verfügbar'
                      : 'Lokale Version behalten'
                  }
                >
                  <Upload size={14} />
                  Lokale Version behalten
                </button>

                <button
                  type="button"
                  className="conflict-btn conflict-btn--skip"
                  onClick={() => handleResolve(conflict.documentPath, 'skip')}
                  title="Überspringen"
                >
                  <SkipForward size={14} />
                  Überspringen
                </button>
              </div>
            </div>
          )
        })}
      </div>

      <ConfirmModal
        open={confirmAction !== null}
        title="Aktion bestätigen"
        message={confirmAction?.message ?? ''}
        variant="primary"
        confirmLabel="Bestätigen"
        cancelLabel="Abbrechen"
        onConfirm={handleConfirm}
        onCancel={() => setConfirmAction(null)}
      />
    </div>
  )
}
