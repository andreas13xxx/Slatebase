// ─── Data Models ─────────────────────────────────────────────────────────────

/**
 * The type of a recorded vault activity.
 *
 * `note.*` covers Markdown/text files. `canvas.*`, `base.*` and `snippet.*`
 * use the same record mechanism and are wired incrementally once `note.*`
 * is proven (see the spec's "Verbleibende Umsetzungs-Details").
 *
 * Third-party plugins may contribute their own event types in a later
 * version; the store treats the type as an opaque string on read so an
 * unknown type from a future writer survives a round-trip.
 */
export type ActivityEventType =
  | 'note.created'
  | 'note.edited'
  | 'note.deleted'
  | 'note.moved'
  | 'note.restored'
  | 'canvas.created'
  | 'canvas.edited'
  | 'canvas.deleted'
  | 'base.created'
  | 'base.edited'
  | 'base.deleted'
  | 'snippet.created'
  | 'snippet.edited'
  | 'snippet.deleted'

/**
 * A single recorded vault activity, persisted as one JSONL line under
 * `.slatebase/activity/YYYY-MM-DD.jsonl`.
 */
export interface ActivityEvent {
  /** Short unique identifier (12-char hex). */
  id: string
  /** The kind of activity. */
  type: ActivityEventType
  /**
   * ISO 8601 timestamp of the event. For a coalesced `note.edited` this is
   * the START of the coalescing window (the first edit), not the latest.
   */
  timestamp: string
  /**
   * ISO 8601 timestamp of the most recent edit folded into this event.
   * Only differs from `timestamp` for a coalesced `note.edited`; for every
   * other event type it equals `timestamp`.
   */
  lastModified: string
  /** Affected vault-relative path. For `note.moved` this is the NEW path. */
  path: string
  /** The previous path. Present only for `note.moved`. */
  oldPath?: string
  /** Username that triggered the activity. */
  user: string
}

/**
 * A new activity to record. `id`, `timestamp` and `lastModified` are assigned
 * by the store; `oldPath` is required only for `note.moved`.
 */
export type ActivityEventInput = Omit<ActivityEvent, 'id' | 'timestamp' | 'lastModified'>

/**
 * Query parameters for reading a page of activity, newest first.
 */
export interface ActivityQuery {
  /** Restrict to these event types. Empty/undefined means all types. */
  types?: ActivityEventType[]
  /** Only events at or after this ISO 8601 timestamp. */
  from?: string
  /** Only events strictly before this ISO 8601 timestamp. */
  to?: string
  /**
   * Opaque pagination cursor from a previous page's `nextCursor`.
   * Omit for the first page.
   */
  cursor?: string
  /** Maximum number of events to return (clamped by the store). */
  limit: number
}

/**
 * One page of activity events, newest first.
 */
export interface ActivityPage {
  /** The events in this page, descending by `timestamp`. */
  items: ActivityEvent[]
  /**
   * Cursor to pass as `ActivityQuery.cursor` to fetch the next (older) page,
   * or null when there are no more events.
   */
  nextCursor: string | null
}

// ─── Service Interface ───────────────────────────────────────────────────────

/**
 * Records and reads per-vault activity events.
 *
 * Recording is a SIDE EFFECT of a vault mutation, never a precondition: a
 * failed `record` must not fail the triggering write (it is logged and
 * dropped). Reads are access-controlled at the route layer.
 */
export interface IActivityService {
  /**
   * Record one activity event. Assigns `id`/`timestamp`/`lastModified`.
   *
   * For `note.edited`, applies the 60-second trailing coalescing window
   * (frozen decision D1): a second edit of the same file within the window
   * updates the open event's `lastModified` instead of creating a new one.
   *
   * Never throws for an I/O failure — the error is logged and swallowed.
   */
  record(vaultId: string, event: ActivityEventInput): Promise<void>

  /** Read a page of events for a vault, newest first. */
  query(vaultId: string, query: ActivityQuery): Promise<ActivityPage>

  /**
   * Delete activity files older than `retentionDays` for a vault.
   * Per-file fault tolerant. Returns the number of day-files removed.
   */
  purgeExpired(vaultId: string, retentionDays: number): Promise<number>
}
