/**
 * Shared formatting helpers for the git-sync and mail-import settings
 * sections — both show a "last run" line with the same result vocabulary
 * (git-sync additionally has `conflict`), so the formatting lives in one
 * place instead of being duplicated verbatim in both components.
 */

export type SyncRunResult = 'success' | 'error' | 'conflict' | null

export function formatLastRun(lastRunAt: string | null): string {
  if (!lastRunAt) return 'Noch nicht ausgeführt'
  return new Date(lastRunAt).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })
}

export function resultLabel(result: SyncRunResult): string {
  switch (result) {
    case 'success': return 'Erfolgreich'
    case 'error': return 'Fehler'
    case 'conflict': return 'Konflikt'
    default: return 'Ausstehend'
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
