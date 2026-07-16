import { useState, useCallback } from 'react'
import { useTranslation } from '../../i18n'
import { useAppContext } from '../../state'
import { extractErrorMessage } from '../../utils/error'

/**
 * Props for the MergePreview component.
 */
export interface MergePreviewProps {
  /** Initial content for the textarea (chosen base version). */
  initialContent: string
  /** Document path for display and API call. */
  documentPath: string
  /** Vault ID for API call. */
  vaultId: string
  /** Called after successful confirmation (merge resolved). */
  onConfirm: () => void
  /** Called when user cancels (returns to previous step). */
  onCancel: () => void
}

/**
 * MergePreview provides a manual merge editor where users can combine
 * content from both versions. It features an editable textarea pre-filled
 * with the chosen base version, an optional Markdown preview mode, and
 * confirm/cancel buttons that interact with the backend API.
 */
export function MergePreview({
  initialContent,
  documentPath,
  vaultId,
  onConfirm,
  onCancel,
}: MergePreviewProps) {
  const { t } = useTranslation()
  const { apiClient } = useAppContext()
  const [editedContent, setEditedContent] = useState(initialContent)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleConfirm = useCallback(async () => {
    if (!apiClient || isSubmitting) return
    setIsSubmitting(true)
    setError(null)

    try {
      await apiClient.resolveConflictMerge(vaultId, documentPath, editedContent)
      onConfirm()
    } catch (err) {
      setError(extractErrorMessage(err, t('sync.conflictWizard.errorsResolveFailed')))
    } finally {
      setIsSubmitting(false)
    }
  }, [apiClient, vaultId, documentPath, editedContent, isSubmitting, onConfirm, t])

  const handleCancel = useCallback(() => {
    onCancel()
  }, [onCancel])

  return (
    <div className="merge-preview">
      {/* Header */}
      <div className="merge-preview__header">
        <h3 className="merge-preview__title">
          {t('sync.conflictWizard.mergeTitle')}
        </h3>
        <span className="merge-preview__document-path">{documentPath}</span>
      </div>

      {/* Mode toggle: Editor / Preview */}
      <div className="merge-preview__mode-toggle">
        <button
          className={`merge-preview__mode-btn ${!showPreview ? 'merge-preview__mode-btn--active' : ''}`}
          onClick={() => setShowPreview(false)}
          disabled={isSubmitting}
        >
          {t('sync.conflictWizard.mergeEditor')}
        </button>
        <button
          className={`merge-preview__mode-btn ${showPreview ? 'merge-preview__mode-btn--active' : ''}`}
          onClick={() => setShowPreview(true)}
          disabled={isSubmitting}
        >
          {t('sync.conflictWizard.mergePreview')}
        </button>
      </div>

      {/* Editor textarea */}
      {!showPreview && (
        <textarea
          className="merge-preview__editor"
          value={editedContent}
          onChange={(e) => setEditedContent(e.target.value)}
          disabled={isSubmitting}
          spellCheck={false}
          aria-label={t('sync.conflictWizard.mergeEditor')}
        />
      )}

      {/* Read-only preview */}
      {showPreview && (
        <pre className="merge-preview__preview">
          <code>{editedContent}</code>
        </pre>
      )}

      {/* Error message */}
      {error && (
        <p className="merge-preview__error">{error}</p>
      )}

      {/* Action buttons */}
      <div className="merge-preview__actions">
        <button
          className="merge-preview__btn merge-preview__btn--primary"
          onClick={handleConfirm}
          disabled={isSubmitting}
        >
          {isSubmitting
            ? t('sync.conflictWizard.buttonsConfirm') + '...'
            : t('sync.conflictWizard.buttonsConfirm')}
        </button>
        <button
          className="merge-preview__btn merge-preview__btn--secondary"
          onClick={handleCancel}
          disabled={isSubmitting}
        >
          {t('sync.conflictWizard.buttonsCancel')}
        </button>
      </div>
    </div>
  )
}
