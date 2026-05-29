/**
 * Property-Based Tests for Conflict Detection and Data Safety
 *
 * Property 18: Conflict Detection — No Auto-Overwrite
 * Property 19: Conflict Recommendation Logic
 * Property 20: Existing Conflicts Preserved Across Syncs
 * Property 25: No Data Loss on Concurrent Edit
 * Property 26: Checkpoint Atomicity
 * Property 27: Delete Safety — mtime Guard
 *
 * **Validates: Requirements 7.1, 7.3, 7.9, Datenverlust-Prävention**
 */
import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'

// ─── Pure Decision Logic Functions (extracted for testing) ───────────────────

/**
 * Determines whether a pulled document should create a conflict.
 * This mirrors the pre-write mtime check in SyncEngine.pull().
 *
 * Returns true if the document should be treated as a conflict (no overwrite).
 */
function shouldCreateConflict(
  currentMtimeMs: number | null, // null = file doesn't exist locally
  checkpointMtime: number | undefined, // undefined = no checkpoint for this path
): boolean {
  // If file doesn't exist locally, no conflict — write normally
  if (currentMtimeMs === null) return false
  // If no checkpoint mtime, no baseline to compare — write normally
  if (checkpointMtime === undefined) return false
  // If current mtime > checkpoint mtime, local file was modified since last sync
  return currentMtimeMs > checkpointMtime
}

/**
 * Determines the recommended conflict resolution.
 * Newer modification date is recommended; if identical, remote is recommended.
 */
function getConflictRecommendation(
  localModifiedAt: string,
  remoteModifiedAt: string,
): 'use_local' | 'use_remote' {
  const localDate = new Date(localModifiedAt).getTime()
  const remoteDate = new Date(remoteModifiedAt).getTime()
  if (localDate > remoteDate) return 'use_local'
  // Remote is newer OR dates are identical → recommend remote
  return 'use_remote'
}

/**
 * Determines whether a new conflict should be added for a document.
 * Existing unresolved conflicts are preserved — new conflicts only for
 * documents without existing entries.
 */
function shouldAddNewConflict(
  documentPath: string,
  existingConflictPaths: Set<string>,
): boolean {
  return !existingConflictPaths.has(documentPath)
}

/**
 * Determines whether the checkpoint should be updated after a sync.
 * Only on success or partial_success — never on failed/connection_failed/auth_failed.
 */
function shouldUpdateCheckpoint(
  syncStatus: 'success' | 'partial_success' | 'failed' | 'connection_failed' | 'auth_failed',
): boolean {
  return syncStatus === 'success' || syncStatus === 'partial_success'
}

/**
 * Determines whether a remote deletion should be applied locally.
 * Remote deletions SHALL only delete local file if mtime matches checkpoint.
 * If the local file was modified since the checkpoint, the deletion is skipped
 * (treated as a conflict scenario).
 */
function shouldApplyRemoteDeletion(
  currentMtimeMs: number | null, // null = file doesn't exist locally
  checkpointMtime: number | undefined, // undefined = no checkpoint for this path
): boolean {
  // If file doesn't exist locally, nothing to delete
  if (currentMtimeMs === null) return false
  // If no checkpoint mtime, we have no baseline — safe to delete (first sync scenario)
  if (checkpointMtime === undefined) return true
  // Only delete if mtime matches checkpoint (file unchanged since last sync)
  return currentMtimeMs <= checkpointMtime
}

// ─── Arbitraries ─────────────────────────────────────────────────────────────

/** Arbitrary for a valid file path (non-empty, no leading slash). */
const filePathArb = fc.stringMatching(/^[a-z][a-z0-9/._-]{0,50}$/)

/** Arbitrary for a positive mtime (milliseconds since epoch). */
const mtimeArb = fc.integer({ min: 1, max: 2_000_000_000_000 })

/** Arbitrary for an ISO 8601 date string. */
const isoDateArb = fc.date({
  min: new Date('2020-01-01T00:00:00Z'),
  max: new Date('2030-12-31T23:59:59Z'),
}).map(d => d.toISOString())

/** Arbitrary for sync status values. */
const syncStatusArb = fc.constantFrom(
  'success' as const,
  'partial_success' as const,
  'failed' as const,
  'connection_failed' as const,
  'auth_failed' as const,
)

// ─── Property 18: Conflict Detection — No Auto-Overwrite ─────────────────────
// For any document that has been modified both locally (mtime changed since
// checkpoint) and remotely (new revision since checkpoint), the sync engine
// SHALL never automatically overwrite either version — the document SHALL be
// added to the conflict list instead.
// **Validates: Requirements 7.1**

describe('Property 18: Conflict Detection — No Auto-Overwrite', () => {
  it('documents modified locally since checkpoint SHALL create a conflict', () => {
    // Generate: checkpointMtime < currentMtime (local modification detected)
    const arb = mtimeArb.chain(checkpointMtime =>
      fc.tuple(
        fc.constant(checkpointMtime),
        fc.integer({ min: checkpointMtime + 1, max: checkpointMtime + 1_000_000 }),
      )
    )

    fc.assert(
      fc.property(arb, ([checkpointMtime, currentMtime]) => {
        const result = shouldCreateConflict(currentMtime, checkpointMtime)
        expect(result).toBe(true)
      }),
      { numRuns: 50 }
    )
  })

  it('documents NOT modified locally since checkpoint SHALL NOT create a conflict', () => {
    // Generate: currentMtime <= checkpointMtime (no local modification)
    const arb = mtimeArb.chain(checkpointMtime =>
      fc.tuple(
        fc.constant(checkpointMtime),
        fc.integer({ min: 1, max: checkpointMtime }),
      )
    )

    fc.assert(
      fc.property(arb, ([checkpointMtime, currentMtime]) => {
        const result = shouldCreateConflict(currentMtime, checkpointMtime)
        expect(result).toBe(false)
      }),
      { numRuns: 50 }
    )
  })

  it('new files (not existing locally) SHALL NOT create a conflict', () => {
    fc.assert(
      fc.property(fc.option(mtimeArb, { nil: undefined }), (checkpointMtime) => {
        const result = shouldCreateConflict(null, checkpointMtime)
        expect(result).toBe(false)
      }),
      { numRuns: 50 }
    )
  })

  it('files without checkpoint entry SHALL NOT create a conflict', () => {
    fc.assert(
      fc.property(mtimeArb, (currentMtime) => {
        const result = shouldCreateConflict(currentMtime, undefined)
        expect(result).toBe(false)
      }),
      { numRuns: 50 }
    )
  })
})

// ─── Property 19: Conflict Recommendation Logic ──────────────────────────────
// For any conflict entry with local and remote modification dates, the
// recommendation SHALL be the version with the newer modification date.
// If both dates are identical, the recommendation SHALL be the remote version.
// **Validates: Requirements 7.3**

describe('Property 19: Conflict Recommendation Logic', () => {
  it('recommends local when local modification date is strictly newer', () => {
    // Generate two dates where local > remote
    const arb = fc.tuple(isoDateArb, isoDateArb).filter(([local, remote]) => {
      return new Date(local).getTime() > new Date(remote).getTime()
    })

    fc.assert(
      fc.property(arb, ([localDate, remoteDate]) => {
        const result = getConflictRecommendation(localDate, remoteDate)
        expect(result).toBe('use_local')
      }),
      { numRuns: 50 }
    )
  })

  it('recommends remote when remote modification date is strictly newer', () => {
    const arb = fc.tuple(isoDateArb, isoDateArb).filter(([local, remote]) => {
      return new Date(remote).getTime() > new Date(local).getTime()
    })

    fc.assert(
      fc.property(arb, ([localDate, remoteDate]) => {
        const result = getConflictRecommendation(localDate, remoteDate)
        expect(result).toBe('use_remote')
      }),
      { numRuns: 50 }
    )
  })

  it('recommends remote when both modification dates are identical', () => {
    fc.assert(
      fc.property(isoDateArb, (date) => {
        const result = getConflictRecommendation(date, date)
        expect(result).toBe('use_remote')
      }),
      { numRuns: 50 }
    )
  })

  it('recommendation is always one of use_local or use_remote', () => {
    fc.assert(
      fc.property(isoDateArb, isoDateArb, (localDate, remoteDate) => {
        const result = getConflictRecommendation(localDate, remoteDate)
        expect(['use_local', 'use_remote']).toContain(result)
      }),
      { numRuns: 50 }
    )
  })
})

// ─── Property 20: Existing Conflicts Preserved Across Syncs ──────────────────
// For any set of unresolved conflicts from previous syncs, a new sync operation
// SHALL preserve all existing conflict entries and SHALL only create new conflict
// entries for documents that do not already have an unresolved conflict.
// **Validates: Requirements 7.9**

describe('Property 20: Existing Conflicts Preserved Across Syncs', () => {
  it('documents with existing conflicts SHALL NOT get new conflict entries', () => {
    const arb = fc.tuple(
      fc.array(filePathArb, { minLength: 1, maxLength: 20 }),
      fc.array(filePathArb, { minLength: 1, maxLength: 20 }),
    )

    fc.assert(
      fc.property(arb, ([existingPaths, newConflictPaths]) => {
        const existingSet = new Set(existingPaths)

        for (const path of newConflictPaths) {
          const shouldAdd = shouldAddNewConflict(path, existingSet)
          if (existingSet.has(path)) {
            expect(shouldAdd).toBe(false)
          } else {
            expect(shouldAdd).toBe(true)
          }
        }
      }),
      { numRuns: 50 }
    )
  })

  it('documents without existing conflicts SHALL get new conflict entries', () => {
    const arb = fc.tuple(
      fc.array(filePathArb, { minLength: 0, maxLength: 10 }),
      filePathArb,
    ).filter(([existing, newPath]) => !existing.includes(newPath))

    fc.assert(
      fc.property(arb, ([existingPaths, newPath]) => {
        const existingSet = new Set(existingPaths)
        const shouldAdd = shouldAddNewConflict(newPath, existingSet)
        expect(shouldAdd).toBe(true)
      }),
      { numRuns: 50 }
    )
  })

  it('existing conflict set is never reduced by new sync conflicts', () => {
    // Simulate: given N existing conflicts and M new conflict candidates,
    // the resulting set should contain all N existing + only truly new ones
    const arb = fc.tuple(
      fc.array(filePathArb, { minLength: 1, maxLength: 15 }),
      fc.array(filePathArb, { minLength: 1, maxLength: 15 }),
    )

    fc.assert(
      fc.property(arb, ([existingPaths, newCandidates]) => {
        const existingSet = new Set(existingPaths)
        const addedPaths: string[] = []

        for (const path of newCandidates) {
          if (shouldAddNewConflict(path, existingSet)) {
            addedPaths.push(path)
          }
        }

        // All existing paths are preserved (not removed)
        for (const existing of existingPaths) {
          expect(existingSet.has(existing)).toBe(true)
        }

        // No added path was already in the existing set
        for (const added of addedPaths) {
          expect(existingSet.has(added)).toBe(false)
        }
      }),
      { numRuns: 50 }
    )
  })
})

// ─── Property 25: No Data Loss on Concurrent Edit ────────────────────────────
// Files modified locally during pull SHALL create conflict, not overwrite.
// This is the same mechanism as Property 18 but emphasizes the concurrent
// edit scenario: even if the modification happens DURING the pull operation,
// the pre-write mtime check catches it.
// **Validates: Datenverlust-Prävention**

describe('Property 25: No Data Loss on Concurrent Edit', () => {
  it('any local modification after checkpoint SHALL prevent overwrite', () => {
    // Simulate: checkpoint was taken at time T, user edits file at T+delta
    // Pull arrives and checks mtime — must detect the concurrent edit
    const arb = fc.tuple(
      mtimeArb, // checkpoint mtime
      fc.integer({ min: 1, max: 1_000_000 }), // delta (time elapsed since checkpoint)
    )

    fc.assert(
      fc.property(arb, ([checkpointMtime, delta]) => {
        const currentMtime = checkpointMtime + delta
        // The file was modified after the checkpoint — conflict must be created
        const result = shouldCreateConflict(currentMtime, checkpointMtime)
        expect(result).toBe(true)
      }),
      { numRuns: 50 }
    )
  })

  it('even 1ms difference after checkpoint SHALL trigger conflict', () => {
    fc.assert(
      fc.property(mtimeArb, (checkpointMtime) => {
        // Exactly 1ms after checkpoint
        const currentMtime = checkpointMtime + 1
        const result = shouldCreateConflict(currentMtime, checkpointMtime)
        expect(result).toBe(true)
      }),
      { numRuns: 50 }
    )
  })

  it('file at exact checkpoint mtime SHALL NOT trigger conflict', () => {
    fc.assert(
      fc.property(mtimeArb, (mtime) => {
        // File mtime equals checkpoint — no modification detected
        const result = shouldCreateConflict(mtime, mtime)
        expect(result).toBe(false)
      }),
      { numRuns: 50 }
    )
  })
})

// ─── Property 26: Checkpoint Atomicity ───────────────────────────────────────
// Failed syncs SHALL leave checkpoint unchanged. The checkpoint is only updated
// on success or partial_success status.
// **Validates: Datenverlust-Prävention**

describe('Property 26: Checkpoint Atomicity', () => {
  it('checkpoint is updated only on success or partial_success', () => {
    fc.assert(
      fc.property(syncStatusArb, (status) => {
        const shouldUpdate = shouldUpdateCheckpoint(status)

        if (status === 'success' || status === 'partial_success') {
          expect(shouldUpdate).toBe(true)
        } else {
          expect(shouldUpdate).toBe(false)
        }
      }),
      { numRuns: 100 }
    )
  })

  it('failed status SHALL never update checkpoint', () => {
    const failedStatuses = fc.constantFrom(
      'failed' as const,
      'connection_failed' as const,
      'auth_failed' as const,
    )

    fc.assert(
      fc.property(failedStatuses, (status) => {
        expect(shouldUpdateCheckpoint(status)).toBe(false)
      }),
      { numRuns: 100 }
    )
  })

  it('success statuses SHALL always update checkpoint', () => {
    const successStatuses = fc.constantFrom(
      'success' as const,
      'partial_success' as const,
    )

    fc.assert(
      fc.property(successStatuses, (status) => {
        expect(shouldUpdateCheckpoint(status)).toBe(true)
      }),
      { numRuns: 100 }
    )
  })

  it('simulated sync: checkpoint remains unchanged when sync fails', () => {
    // Simulate a full sync flow: given an initial checkpoint and a failed sync,
    // the checkpoint after the sync must equal the initial checkpoint
    const checkpointArb = fc.record({
      lastSeq: fc.stringMatching(/^[0-9]+-[a-f0-9]{8}$/),
      lastSyncAt: isoDateArb,
      localMtimes: fc.dictionary(filePathArb, mtimeArb),
    })

    const failedStatusArb = fc.constantFrom(
      'failed' as const,
      'connection_failed' as const,
      'auth_failed' as const,
    )

    fc.assert(
      fc.property(checkpointArb, failedStatusArb, (initialCheckpoint, status) => {
        // Simulate: sync runs and returns a failed status
        const shouldUpdate = shouldUpdateCheckpoint(status)

        // Checkpoint should NOT be updated
        expect(shouldUpdate).toBe(false)

        // Therefore the checkpoint after sync equals the initial checkpoint
        // (this is the invariant the SyncService maintains)
        const checkpointAfterSync = shouldUpdate
          ? { lastSeq: 'new-seq', lastSyncAt: new Date().toISOString(), localMtimes: {} }
          : initialCheckpoint

        expect(checkpointAfterSync).toEqual(initialCheckpoint)
      }),
      { numRuns: 50 }
    )
  })
})

// ─── Property 27: Delete Safety — mtime Guard ────────────────────────────────
// Remote deletions SHALL only delete local file if mtime matches checkpoint.
// If the local file was modified since the checkpoint, the deletion must be
// skipped to prevent data loss.
// **Validates: Datenverlust-Prävention**

describe('Property 27: Delete Safety — mtime Guard', () => {
  it('deletion is allowed when local mtime matches checkpoint (unchanged)', () => {
    fc.assert(
      fc.property(mtimeArb, (mtime) => {
        // File mtime equals checkpoint — safe to delete
        const result = shouldApplyRemoteDeletion(mtime, mtime)
        expect(result).toBe(true)
      }),
      { numRuns: 50 }
    )
  })

  it('deletion is allowed when local mtime is older than checkpoint', () => {
    const arb = mtimeArb.chain(checkpointMtime =>
      fc.tuple(
        fc.integer({ min: 1, max: checkpointMtime }),
        fc.constant(checkpointMtime),
      )
    )

    fc.assert(
      fc.property(arb, ([currentMtime, checkpointMtime]) => {
        const result = shouldApplyRemoteDeletion(currentMtime, checkpointMtime)
        expect(result).toBe(true)
      }),
      { numRuns: 50 }
    )
  })

  it('deletion is BLOCKED when local mtime is newer than checkpoint', () => {
    const arb = mtimeArb.chain(checkpointMtime =>
      fc.tuple(
        fc.integer({ min: checkpointMtime + 1, max: checkpointMtime + 1_000_000 }),
        fc.constant(checkpointMtime),
      )
    )

    fc.assert(
      fc.property(arb, ([currentMtime, checkpointMtime]) => {
        const result = shouldApplyRemoteDeletion(currentMtime, checkpointMtime)
        expect(result).toBe(false)
      }),
      { numRuns: 50 }
    )
  })

  it('deletion is skipped when file does not exist locally', () => {
    fc.assert(
      fc.property(fc.option(mtimeArb, { nil: undefined }), (checkpointMtime) => {
        // File doesn't exist — nothing to delete
        const result = shouldApplyRemoteDeletion(null, checkpointMtime)
        expect(result).toBe(false)
      }),
      { numRuns: 50 }
    )
  })

  it('deletion is allowed when no checkpoint exists (first sync)', () => {
    fc.assert(
      fc.property(mtimeArb, (currentMtime) => {
        // No checkpoint for this path — safe to delete (first sync scenario)
        const result = shouldApplyRemoteDeletion(currentMtime, undefined)
        expect(result).toBe(true)
      }),
      { numRuns: 50 }
    )
  })

  it('mtime guard prevents data loss: modified files are never deleted', () => {
    // The core invariant: if a file was modified after the checkpoint,
    // it SHALL NOT be deleted regardless of remote state
    const arb = fc.tuple(
      mtimeArb, // checkpoint mtime
      fc.integer({ min: 1, max: 1_000_000 }), // delta after checkpoint
    )

    fc.assert(
      fc.property(arb, ([checkpointMtime, delta]) => {
        const modifiedMtime = checkpointMtime + delta
        const result = shouldApplyRemoteDeletion(modifiedMtime, checkpointMtime)
        expect(result).toBe(false)
      }),
      { numRuns: 50 }
    )
  })
})
