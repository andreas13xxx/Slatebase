import { translateNow } from '../../i18n'

/**
 * Shared formatting helpers for the git-sync and mail-import settings
 * sections — both show a "last run" line with the same result vocabulary
 * (git-sync additionally has `conflict`), so the formatting lives in one
 * place instead of being duplicated verbatim in both components.
 */

export type SyncRunResult = 'success' | 'error' | 'conflict' | null

export function formatLastRun(lastRunAt: string | null): string {
  if (!lastRunAt) return translateNow('settingsUi.notRunYet')
  return new Date(lastRunAt).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })
}

export function resultLabel(result: SyncRunResult): string {
  switch (result) {
    case 'success': return translateNow('settingsUi.resSuccess')
    case 'error': return translateNow('settingsUi.resError')
    case 'conflict': return translateNow('settingsUi.resConflict')
    default: return translateNow('settingsUi.resPending')
  }
}

export function resultBadgeClass(result: SyncRunResult): string {
  switch (result) {
    case 'success': return 'sync-status-badge--success'
    case 'error': return 'sync-status-badge--error'
    case 'conflict': return 'sync-status-badge--conflict'
    default: return 'sync-status-badge--pending'
  }
}
