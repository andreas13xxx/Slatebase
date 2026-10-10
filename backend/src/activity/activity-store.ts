import crypto from 'node:crypto'
import { mkdir, appendFile, readFile, writeFile, readdir, unlink, rename } from 'node:fs/promises'
import path from 'node:path'
import type { ILogger } from '../logger/index.js'
import type {
  IActivityService,
  ActivityEvent,
  ActivityEventInput,
  ActivityEventType,
  ActivityQuery,
  ActivityPage,
} from './types.js'
import { isNodeError } from '../shared/fs-utils.js'
import { KeyedMutex } from '../shared/async-mutex.js'

/**
 * Resolves a vault ID to its data directory path.
 * Same shape as the trash/version services use.
 */
export type VaultPathResolver = (vaultId: string) => string

/** Coalescing window for rapid `note.edited` events (frozen decision D1). */
const EDIT_COALESCE_WINDOW_MS = 60_000

/** Default page size cap for reads. */
const MAX_QUERY_LIMIT = 200

/** An open coalescing window for one (vaultId, path). */
interface OpenEditWindow {
  /** The event id being extended. */
  eventId: string
  /** The day-file the event was appended to (YYYY-MM-DD). */
  dateStr: string
  /** Epoch ms of the window start (the event's `timestamp`). */
  startedAtMs: number
  /** Epoch ms of the most recent edit folded in. */
  lastEditMs: number
}

/**
 * ActivityStore records and reads per-vault activity as append-only JSONL
 * under `.slatebase/activity/YYYY-MM-DD.jsonl`, modeled on the audit logger.
 *
 * It implements {@link IActivityService} directly (no separate service layer),
 * like PreferencesStore/VaultConfigStore — there is no business logic beyond
 * persistence and the `note.edited` coalescing.
 */
export class ActivityStore implements IActivityService {
  /** Activity directory relative to vault root. */
  private static readonly ACTIVITY_DIR = path.join('.slatebase', 'activity')

  /**
   * Serializes record/query/purge per vault. Prevents a coalescing rewrite
   * from racing a concurrent record or the periodic purge on the same vault.
   * Keyed by the vault's activity directory so different vaults never block.
   */
  private readonly locks = new KeyedMutex()

  /**
   * Open `note.edited` coalescing windows, keyed `${vaultId}\0${path}`.
   * Pure acceleration of "extend the same event": a process restart simply
   * starts a fresh event, which is acceptable (see D1).
   */
  private readonly openEditWindows = new Map<string, OpenEditWindow>()

  constructor(
    private readonly resolveVaultPath: VaultPathResolver,
    private readonly logger: ILogger,
  ) {}

  /**
   * Record one activity event. Never throws for an I/O failure — recording is
   * a side effect of the triggering write, not a precondition (R1.6).
   */
  async record(vaultId: string, event: ActivityEventInput): Promise<void> {
    try {
      // Internal .slatebase / dot-segment paths are never recorded (R1.5).
      if (this.isHiddenPath(event.path) || (event.oldPath !== undefined && this.isHiddenPath(event.oldPath))) {
        return
      }

      const activityDir = this.activityDir(vaultId)
      await this.locks.runExclusive(activityDir, async () => {
        if (event.type === 'note.edited') {
          await this.recordEditCoalesced(vaultId, activityDir, event)
        } else {
          await this.appendNew(activityDir, event)
        }
      })
    } catch (err) {
      this.logger.warn(
        'activity record failed (swallowed; recording is a side effect)',
        { vaultId, type: event.type, path: event.path, err: this.errText(err) },
      )
    }
  }

  /**
   * Read a page of events for a vault, newest first.
   * The cursor is an opaque `${timestamp}\0${id}` boundary; the next page
   * contains events strictly older than it (ties broken by id).
   */
  async query(vaultId: string, query: ActivityQuery): Promise<ActivityPage> {
    const activityDir = this.activityDir(vaultId)
    const limit = Math.min(Math.max(query.limit, 1), MAX_QUERY_LIMIT)
    const typeSet = query.types && query.types.length > 0 ? new Set(query.types) : null
    const cursor = this.parseCursor(query.cursor)

    return this.locks.runExclusive(activityDir, async () => {
      const files = await this.relevantFiles(activityDir, query.from, query.to)
      const matched: ActivityEvent[] = []

      // Read newest day-files first so we can stop once we have a full page.
      for (const file of files) {
        const content = await this.readFileSafe(path.join(activityDir, file))
        if (content === null) continue

        for (const line of content.split('\n')) {
          const trimmed = line.trim()
          if (trimmed === '') continue
          let evt: ActivityEvent
          try {
            evt = JSON.parse(trimmed) as ActivityEvent
          } catch {
            continue
          }
          if (!this.matches(evt, typeSet, query.from, query.to, cursor)) continue
          matched.push(evt)
        }
      }

      // Sort descending by timestamp, then id, for a stable deterministic order.
      matched.sort((a, b) => {
        if (a.timestamp !== b.timestamp) return b.timestamp.localeCompare(a.timestamp)
        return b.id.localeCompare(a.id)
      })

      const items = matched.slice(0, limit)
      const last = items[items.length - 1]
      const nextCursor = items.length === limit && last ? `${last.timestamp}\u0000${last.id}` : null

      return { items, nextCursor }
    })
  }

  /**
   * Delete activity day-files older than `retentionDays` for a vault.
   * Per-file fault tolerant (D2). Returns the number of files removed.
   */
  async purgeExpired(vaultId: string, retentionDays: number): Promise<number> {
    if (retentionDays <= 0) return 0
    const activityDir = this.activityDir(vaultId)

    return this.locks.runExclusive(activityDir, async () => {
      const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000)
      const cutoffDate = cutoff.toISOString().slice(0, 10)

      let files: string[]
      try {
        files = await readdir(activityDir)
      } catch {
        return 0
      }

      const datePattern = /^(\d{4}-\d{2}-\d{2})\.jsonl$/
      let purged = 0
      for (const file of files) {
        const match = datePattern.exec(file)
        const fileDate = match?.[1]
        if (!fileDate) continue
        if (fileDate >= cutoffDate) continue
        try {
          await unlink(path.join(activityDir, file))
          purged++
        } catch (err) {
          this.logger.warn('activity purge: could not remove day-file', { vaultId, file, err: this.errText(err) })
        }
      }
      return purged
    })
  }

  // ─── Recording helpers ──────────────────────────────────────────────────

  /**
   * Append a brand-new event, assigning id/timestamp/lastModified.
   * Returns the day-file date string it was written to.
   */
  private async appendNew(activityDir: string, input: ActivityEventInput): Promise<ActivityEvent> {
    await mkdir(activityDir, { recursive: true })
    const now = new Date()
    const iso = now.toISOString()
    const event: ActivityEvent = {
      id: crypto.randomBytes(6).toString('hex'),
      type: input.type,
      timestamp: iso,
      lastModified: iso,
      path: input.path,
      user: input.user,
      ...(input.oldPath !== undefined ? { oldPath: input.oldPath } : {}),
    }
    const dateStr = iso.slice(0, 10)
    await appendFile(path.join(activityDir, `${dateStr}.jsonl`), JSON.stringify(event) + '\n', 'utf-8')
    return event
  }

  /**
   * Record a `note.edited`, folding into an open 60-second window if one
   * exists for the same (vaultId, path), else opening a new one (D1).
   */
  private async recordEditCoalesced(
    vaultId: string,
    activityDir: string,
    input: ActivityEventInput,
  ): Promise<void> {
    const key = `${vaultId}\u0000${input.path}`
    const nowMs = Date.now()
    const open = this.openEditWindows.get(key)

    if (open && nowMs - open.lastEditMs <= EDIT_COALESCE_WINDOW_MS) {
      // Extend: update the event's lastModified in its day-file.
      const updated = await this.updateLastModified(activityDir, open.dateStr, open.eventId, new Date(nowMs).toISOString())
      if (updated) {
        open.lastEditMs = nowMs
        return
      }
      // The event line vanished (file purged/rotated) — fall through to a new one.
    }

    const event = await this.appendNew(activityDir, input)
    this.openEditWindows.set(key, {
      eventId: event.id,
      dateStr: event.timestamp.slice(0, 10),
      startedAtMs: nowMs,
      lastEditMs: nowMs,
    })
  }

  /**
   * Rewrite the matching event line in a day-file with a new `lastModified`.
   * Returns true if the event was found and updated. JSONL has no in-place
   * update, so the whole day-file is read, the one line swapped, and the file
   * rewritten atomically (temp → rename).
   */
  private async updateLastModified(
    activityDir: string,
    dateStr: string,
    eventId: string,
    lastModified: string,
  ): Promise<boolean> {
    const filePath = path.join(activityDir, `${dateStr}.jsonl`)
    const content = await this.readFileSafe(filePath)
    if (content === null) return false

    const lines = content.split('\n')
    let found = false
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i]?.trim()
      if (!trimmed) continue
      try {
        const evt = JSON.parse(trimmed) as ActivityEvent
        if (evt.id === eventId) {
          evt.lastModified = lastModified
          lines[i] = JSON.stringify(evt)
          found = true
          break
        }
      } catch {
        // Skip malformed line
      }
    }
    if (!found) return false

    const tmp = `${filePath}.${crypto.randomBytes(8).toString('hex')}.tmp`
    await writeFile(tmp, lines.join('\n'), 'utf-8')
    await rename(tmp, filePath)
    return true
  }

  // ─── Read helpers ────────────────────────────────────────────────────────

  private matches(
    evt: ActivityEvent,
    typeSet: Set<ActivityEventType> | null,
    from: string | undefined,
    to: string | undefined,
    cursor: { timestamp: string; id: string } | null,
  ): boolean {
    if (typeSet && !typeSet.has(evt.type)) return false
    if (from !== undefined && evt.timestamp < from) return false
    if (to !== undefined && evt.timestamp >= to) return false
    if (cursor) {
      // Only events strictly older than the cursor boundary.
      if (evt.timestamp > cursor.timestamp) return false
      if (evt.timestamp === cursor.timestamp && evt.id >= cursor.id) return false
    }
    return true
  }

  private parseCursor(cursor: string | undefined): { timestamp: string; id: string } | null {
    if (!cursor) return null
    const sep = cursor.indexOf('\u0000')
    if (sep <= 0) return null
    return { timestamp: cursor.slice(0, sep), id: cursor.slice(sep + 1) }
  }

  /**
   * Day-files overlapping [from, to], newest first (so a full page can stop early).
   */
  private async relevantFiles(activityDir: string, from?: string, to?: string): Promise<string[]> {
    let files: string[]
    try {
      files = await readdir(activityDir)
    } catch {
      return []
    }
    const datePattern = /^(\d{4}-\d{2}-\d{2})\.jsonl$/
    const start = from ? from.slice(0, 10) : ''
    const end = to ? to.slice(0, 10) : '\uffff'
    return files
      .filter(f => {
        const m = datePattern.exec(f)
        const d = m?.[1]
        return d !== undefined && d >= start && d <= end
      })
      .sort()
      .reverse()
  }

  private async readFileSafe(filePath: string): Promise<string | null> {
    try {
      return await readFile(filePath, 'utf-8')
    } catch (err) {
      if (isNodeError(err) && err.code === 'ENOENT') return null
      // A transient read failure (locked file) is not "gone" — skip this file.
      return null
    }
  }

  // ─── Path helpers ──────────────────────────────────────────────────────────

  private activityDir(vaultId: string): string {
    return path.join(this.resolveVaultPath(vaultId), ActivityStore.ACTIVITY_DIR)
  }

  /**
   * True if any path segment starts with a dot — the vault's hidden rule,
   * matching the link-index/search directory scan. These are never recorded.
   */
  private isHiddenPath(relativePath: string): boolean {
    const normalized = relativePath.replace(/\\/g, '/')
    return normalized.split('/').some(seg => seg.startsWith('.'))
  }

  private errText(err: unknown): string {
    return err instanceof Error ? err.message : String(err)
  }
}
