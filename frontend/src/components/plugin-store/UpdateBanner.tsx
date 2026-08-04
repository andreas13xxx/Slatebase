/**
 * UpdateBanner — Banner component for plugin update notifications.
 *
 * Displays a summary of available updates with an "Update all" button,
 * a loading state during bulk updates, and a result summary after completion.
 */
import { Loader2, AlertTriangle } from 'lucide-react'
import { useTranslation } from '../../i18n'
import type { BulkUpdateResult } from './types'

/** Props for the UpdateBanner component. */
export interface UpdateBannerProps {
  /** Number of plugins with available updates. */
  updateCount: number
  /** Whether a bulk update is currently running. */
  isUpdating: boolean
  /** Called when user clicks "Alle aktualisieren". */
  onUpdateAll: () => void
  /** Result summary after bulk update completes (null when no result yet). */
  bulkResult: BulkUpdateResult | null
}

/**
 * Banner component that shows update availability, progress, and results.
 *
 * Display states:
 * 1. Nothing to show (updateCount === 0 and no result): renders null
 * 2. Updates available: shows count + "Alle aktualisieren" button
 * 3. Updating: shows spinner + progress message
 * 4. Result: shows success/failure summary
 */
export function UpdateBanner({ updateCount, isUpdating, onUpdateAll, bulkResult }: UpdateBannerProps) {
  const { t } = useTranslation()

  // State 1: Nothing to display
  if (updateCount === 0 && bulkResult === null) {
    return null
  }

  // State 4: Show result summary after bulk update
  if (bulkResult !== null) {
    const successCount = bulkResult.updated.length
    const failCount = bulkResult.failed.length
    const hasFailures = failCount > 0
    const variantClass = hasFailures
      ? 'plugin-store-update-banner--error'
      : 'plugin-store-update-banner--success'

    return (
      <div className={`plugin-store-update-banner ${variantClass}`} role="status">
        <span className="plugin-store-update-banner__summary">
          {t('pluginStore.bulkResult', {
            updated: String(successCount),
            failed: String(failCount),
          })}
        </span>
        {hasFailures && (
          <ul className="plugin-store-update-banner__failures">
            {bulkResult.failed.map((failure) => (
              <li key={failure.pluginId} className="plugin-store-update-banner__failure-item">
                <AlertTriangle size={14} aria-hidden="true" />
                <span>{failure.pluginId}: {failure.reason}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  }

  // State 3: Bulk update in progress
  if (isUpdating) {
    return (
      <div className="plugin-store-update-banner" role="status" aria-live="polite">
        <Loader2 size={16} className="spin" aria-hidden="true" />
        <span>{t('pluginStore.updatingAll')}</span>
      </div>
    )
  }

  // State 2: Updates available
  return (
    <div className="plugin-store-update-banner" role="status">
      <span className="plugin-store-update-banner__count">
        {t('pluginStore.updatesAvailable', { count: String(updateCount) })}
      </span>
      <button
        className="plugin-store-update-banner__button"
        onClick={onUpdateAll}
      >
        {t('pluginStore.updateAll')}
      </button>
    </div>
  )
}
