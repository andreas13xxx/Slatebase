// SyncProtocolLogger — Convenience class for writing structured sync protocol events.
// Buffers events during a sync run and flushes them to the store at the end.
// Also handles grouping of similar consecutive events (e.g., "... und 500 weitere").

import crypto from 'node:crypto'
import type { ISyncProtocolStore, SyncProtocolEntry, SyncProtocolLevel, SyncProtocolEventType } from './protocol-types.js'

/** Threshold after which consecutive similar events are grouped. */
const GROUP_THRESHOLD = 10

/**
 * Helper class for writing structured sync protocol events.
 * Creates a run ID per sync operation and provides typed methods for each event type.
 * Buffers events and flushes at the end — also groups repetitive file-level events.
 */
export class SyncProtocolLogger {
  private readonly buffer: SyncProtocolEntry[] = []
  readonly runId: string

  constructor(
    private readonly store: ISyncProtocolStore,
    private readonly vaultId: string,
  ) {
    this.runId = crypto.randomUUID()
  }

  // ─── Event Methods ───────────────────────────────────────────────────────

  /** Log sync operation start. */
  syncStart(triggerType: 'manual' | 'interval', mode: 'bidirectional' | 'readonly'): void {
    const trigger = triggerType === 'manual' ? 'manuell' : 'Intervall'
    const modeLabel = mode === 'bidirectional' ? 'bidirektional' : 'nur lesen'
    this.add('info', 'sync_start', `Sync gestartet (${trigger}, ${modeLabel})`)
  }

  /** Log sync complete. */
  syncComplete(durationMs: number, pulledCount: number, pushedCount: number, conflictsDetected: number, errorCount: number): void {
    const parts: string[] = [`${(durationMs / 1000).toFixed(1)}s`]
    parts.push(`↓${pulledCount}`)
    parts.push(`↑${pushedCount}`)
    if (conflictsDetected > 0) parts.push(`${conflictsDetected} Konflikt${conflictsDetected > 1 ? 'e' : ''}`)
    if (errorCount > 0) parts.push(`${errorCount} Fehler`)
    this.add('info', 'sync_complete', `Sync abgeschlossen (${parts.join(', ')})`, undefined, undefined, durationMs)
  }

  /** Log connection attempt. */
  connecting(endpoint: string, database: string): void {
    this.add('info', 'connecting', `Verbindung zu ${endpoint}/${database} …`)
  }

  /** Log successful connection. */
  connected(lastSeq: string | null): void {
    const seqInfo = lastSeq ? `seq: ${lastSeq}` : 'Initial-Sync'
    this.add('info', 'connected', `Verbindung hergestellt (${seqInfo})`)
  }

  /** Log connection failure. */
  connectionFailed(error: string): void {
    this.add('error', 'connection_failed', `Verbindung fehlgeschlagen: ${error}`)
  }

  /** Log auth failure. */
  authFailed(): void {
    this.add('error', 'auth_failed', `Authentifizierung fehlgeschlagen`)
  }

  /** Log pull start. */
  pullStart(changeCount: number, since: string | null): void {
    const sinceInfo = since ? `seit seq ${since}` : 'vollständig'
    this.add('info', 'pull_start', `Pull gestartet (${sinceInfo}, ${changeCount} Änderungen)`)
  }

  /** Log pull complete. */
  pullComplete(pulledCount: number, conflictCount: number, errorCount: number): void {
    const parts: string[] = [`${pulledCount} Dateien`]
    if (conflictCount > 0) parts.push(`${conflictCount} Konflikt${conflictCount > 1 ? 'e' : ''}`)
    if (errorCount > 0) parts.push(`${errorCount} Fehler`)
    this.add('info', 'pull_complete', `Pull abgeschlossen (${parts.join(', ')})`)
  }

  /** Log push start. */
  pushStart(changedCount: number, deletedCount: number): void {
    const parts: string[] = []
    if (changedCount > 0) parts.push(`${changedCount} geänderte`)
    if (deletedCount > 0) parts.push(`${deletedCount} gelöschte`)
    this.add('info', 'push_start', `Push gestartet (${parts.join(', ')} Datei${changedCount + deletedCount > 1 ? 'en' : ''})`)
  }

  /** Log push complete. */
  pushComplete(pushedCount: number, errorCount: number): void {
    const parts: string[] = [`${pushedCount} Dateien`]
    if (errorCount > 0) parts.push(`${errorCount} Fehler`)
    this.add('info', 'push_complete', `Push abgeschlossen (${parts.join(', ')})`)
  }

  /** Log individual file pulled. */
  filePulled(filePath: string, size: number, isBinary: boolean, chunkCount?: number): void {
    const sizeStr = formatSize(size)
    const type = isBinary ? 'binär' : 'text'
    const chunks = chunkCount && chunkCount > 1 ? `, ${chunkCount} Chunks` : ''
    this.add('info', 'file_pulled', `${filePath} (${sizeStr}, ${type}${chunks})`, filePath, size)
  }

  /** Log individual file pushed. */
  filePushed(filePath: string, size: number): void {
    const sizeStr = formatSize(size)
    this.add('info', 'file_pushed', `${filePath} (${sizeStr})`, filePath, size)
  }

  /** Log file deleted (during pull). */
  fileDeleted(filePath: string): void {
    this.add('info', 'file_deleted', `${filePath} (gelöscht)`, filePath)
  }

  /** Log file push-deleted (tombstone sent to CouchDB). */
  filePushDeleted(filePath: string): void {
    this.add('info', 'file_push_deleted', `${filePath} (Tombstone)`, filePath)
  }

  /** Log file-level error. */
  fileFailed(filePath: string, errorType: string, description: string): void {
    this.add('error', 'file_failed', `${filePath}: ${description} (${errorType})`, filePath)
  }

  /** Log conflict detected. */
  conflict(filePath: string): void {
    this.add('warn', 'conflict', `${filePath} (lokal neuer als remote)`, filePath)
  }

  /** Log checkpoint update. */
  checkpoint(lastSeq: string): void {
    this.add('info', 'checkpoint', `Checkpoint aktualisiert (seq: ${lastSeq})`)
  }

  /** Log scheduler start. */
  schedulerStart(intervalMinutes: number): void {
    this.add('info', 'scheduler_start', `Intervall-Sync gestartet (alle ${intervalMinutes} min)`)
  }

  /** Log scheduler stop. */
  schedulerStop(): void {
    this.add('info', 'scheduler_stop', `Intervall-Sync gestoppt`)
  }

  /** Log config change. */
  configChanged(action: string): void {
    this.add('info', 'config_changed', `Konfiguration: ${action}`)
  }

  // ─── Flush ────────────────────────────────────────────────────────────────

  /**
   * Groups consecutive similar events and writes all buffered entries to the store.
   * Call this at the end of a sync operation.
   */
  async flush(): Promise<void> {
    if (this.buffer.length === 0) return

    const grouped = this.groupConsecutiveEvents(this.buffer)
    await this.store.append(this.vaultId, grouped)
    this.buffer.length = 0
  }

  /**
   * Writes a single entry immediately without buffering.
   * Use for non-sync-run events (scheduler, config changes).
   */
  async writeImmediate(entries: SyncProtocolEntry[]): Promise<void> {
    if (entries.length === 0) return
    await this.store.append(this.vaultId, entries)
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private add(
    level: SyncProtocolLevel,
    event: SyncProtocolEventType,
    message: string,
    filePath?: string,
    size?: number,
    durationMs?: number,
  ): void {
    const entry: SyncProtocolEntry = {
      timestamp: new Date().toISOString(),
      level,
      event,
      message,
      runId: this.runId,
    }
    if (filePath !== undefined) entry.path = filePath
    if (size !== undefined) entry.size = size
    if (durationMs !== undefined) entry.durationMs = durationMs
    this.buffer.push(entry)
  }

  /**
   * Groups consecutive events of the same type when they exceed GROUP_THRESHOLD.
   * E.g., 50 consecutive file_pulled events become:
   * - first 10 entries shown individually
   * - then one summary entry "… und 40 weitere Dateien empfangen"
   */
  private groupConsecutiveEvents(entries: SyncProtocolEntry[]): SyncProtocolEntry[] {
    if (entries.length <= GROUP_THRESHOLD) return entries

    const result: SyncProtocolEntry[] = []
    let i = 0

    while (i < entries.length) {
      const current = entries[i]!
      const currentEvent = current.event

      // Check if this is a groupable file-level event
      if (isGroupableEvent(currentEvent)) {
        // Count consecutive entries of the same event type
        let runLength = 1
        while (i + runLength < entries.length && entries[i + runLength]!.event === currentEvent) {
          runLength++
        }

        if (runLength > GROUP_THRESHOLD) {
          // Show first GROUP_THRESHOLD entries individually
          for (let j = 0; j < GROUP_THRESHOLD; j++) {
            result.push(entries[i + j]!)
          }
          // Add summary entry for the rest
          const remaining = runLength - GROUP_THRESHOLD
          const summaryMessage = getSummaryMessage(currentEvent, remaining)
          const summaryEntry: SyncProtocolEntry = {
            timestamp: entries[i + runLength - 1]!.timestamp,
            level: current.level,
            event: current.event,
            message: summaryMessage,
          }
          if (current.runId !== undefined) summaryEntry.runId = current.runId
          result.push(summaryEntry)
          i += runLength
        } else {
          // Not enough to group — add all individually
          for (let j = 0; j < runLength; j++) {
            result.push(entries[i + j]!)
          }
          i += runLength
        }
      } else {
        result.push(current)
        i++
      }
    }

    return result
  }
}

// ─── Standalone Helper (for non-run events like scheduler) ───────────────────

/**
 * Creates a single protocol entry without a run ID.
 * Use for standalone events (scheduler, config changes) that don't belong to a sync run.
 */
export function createProtocolEntry(
  level: SyncProtocolLevel,
  event: SyncProtocolEventType,
  message: string,
): SyncProtocolEntry {
  return {
    timestamp: new Date().toISOString(),
    level,
    event,
    message,
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isGroupableEvent(event: SyncProtocolEventType): boolean {
  return event === 'file_pulled' || event === 'file_pushed' || event === 'file_deleted' || event === 'file_push_deleted'
}

function getSummaryMessage(event: SyncProtocolEventType, remaining: number): string {
  switch (event) {
    case 'file_pulled':
      return `… und ${remaining} weitere Dateien empfangen`
    case 'file_pushed':
      return `… und ${remaining} weitere Dateien gesendet`
    case 'file_deleted':
      return `… und ${remaining} weitere Dateien gelöscht`
    case 'file_push_deleted':
      return `… und ${remaining} weitere Tombstones gesendet`
    default:
      return `… und ${remaining} weitere`
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
