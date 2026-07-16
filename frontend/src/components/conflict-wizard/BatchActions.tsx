import { useState } from 'react'
import { useTranslation } from '../../i18n'
import type { BatchResolveResult } from './types'
import './BatchActions.css'

/** Maximum number of conflicts allowed in a single batch operation. */
const MAX_BATCH_SIZE = 100

/** Props for the BatchActions component. */
export interface BatchActionsProps {
  /** Number of selected conflicts for the batch. */
  selectedCount: number
  /** The resolution strategy being applied. */
  strategy: string
  /** Whether a batch is currently processing. */
  isProcessing: boolean
  /** Result of the last batch operation (null if none yet). */
  result: BatchResolveResult | null
  /** Called when user confirms the batch action. */
  onConfirm: () => void
  /** Called when user cancels the batch action. */
  onCancel: () => void
  /** Called when user dismisses the result. */
  onDismissResult: () => void
}

/**
 * BatchActions provides the confirmation dialog and result summary
 * for batch conflict resolution. It validates the batch limit,
 * shows a confirmation prompt with count and strategy, and displays
 * the result after batch completion.
 */
export function BatchActions({
  selectedCount,
  strategy,
  isProcessing,
  result,
  onConfirm,
  onCancel,
  onDismissResult,
}: BatchActionsProps) {
  const { t } = useTranslation()
  const [errorsExpanded, setErrorsExpanded] = useState(false)

  const exceedsLimit = selectedCount > MAX_BATCH_SIZE

  // Show result summary if batch has completed
  if (result) {
    return (
      <div className="batch-actions__result">
        <h4 className="batch-actions__result-title">
          {t('sync.conflictWizard.batchTitle')}
        </h4>
        <p className="batch-actions__result-summary">
          {t('sync.conflictWizard.batchResult', {
            succeeded: String(result.succeeded),
            failed: String(result.failed),
          })}
        </p>
        {result.errors.length > 0 && (
          <div className="batch-actions__errors">
            <button
              className="batch-actions__errors-toggle"
              onClick={() => setErrorsExpanded(!errorsExpanded)}
              aria-expanded={errorsExpanded}
            >
              {t('sync.conflictWizard.batchErrorsToggle', {
                count: String(result.errors.length),
              })}
            </button>
            {errorsExpanded && (
              <ul className="batch-actions__errors-list">
                {result.errors.map((err, idx) => (
                  <li key={idx} className="batch-actions__error-item">
                    <span className="batch-actions__error-path">{err.documentPath}</span>
                    <span className="batch-actions__error-reason">{err.error}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <button
          className="batch-actions__btn batch-actions__btn--primary"
          onClick={onDismissResult}
        >
          {t('sync.conflictWizard.buttonsConfirm')}
        </button>
      </div>
    )
  }

  // Show confirmation dialog
  return (
    <div className="batch-actions__confirmation">
      <h4 className="batch-actions__confirmation-title">
        {t('sync.conflictWizard.batchTitle')}
      </h4>

      {exceedsLimit ? (
        <p className="batch-actions__limit-warning">
          {t('sync.conflictWizard.batchLimitExceeded')}
        </p>
      ) : (
        <p className="batch-actions__confirmation-text">
          {t('sync.conflictWizard.batchConfirm', {
            count: String(selectedCount),
            strategy,
          })}
        </p>
      )}

      <div className="batch-actions__buttons">
        <button
          className="batch-actions__btn batch-actions__btn--primary"
          disabled={exceedsLimit || isProcessing || selectedCount === 0}
          onClick={onConfirm}
        >
          {isProcessing
            ? t('sync.conflictWizard.batchProcessing')
            : t('sync.conflictWizard.buttonsConfirm')}
        </button>
        <button
          className="batch-actions__btn batch-actions__btn--secondary"
          disabled={isProcessing}
          onClick={onCancel}
        >
          {t('sync.conflictWizard.buttonsCancel')}
        </button>
      </div>
    </div>
  )
}
