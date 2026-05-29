/**
 * Property-Based Tests for SyncEngine Analysis Categorization
 *
 * Property 16: Analysis Categorization Correctness
 * Property 17: Analysis Summary Aggregation
 *
 * **Validates: Requirements 6.2, 6.3**
 */
import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { categorizeDocument, buildAnalysisSummary } from './sync-engine.js'
import type { AnalysisDetail } from './types.js'

// ─── Arbitraries ─────────────────────────────────────────────────────────────

/** Arbitrary for a valid file path (non-empty, no leading slash). */
const filePathArb = fc.stringMatching(/^[a-z][a-z0-9/._-]{0,50}$/)

/** Arbitrary for a positive mtime (milliseconds since epoch). */
const mtimeArb = fc.integer({ min: 1, max: 2_000_000_000_000 })

/** Arbitrary for a positive file size in bytes. */
const fileSizeArb = fc.integer({ min: 0, max: 100_000_000 })

/** Arbitrary for a CouchDB revision string. */
const revisionArb = fc.tuple(
  fc.integer({ min: 1, max: 999 }),
  fc.hexaString({ minLength: 8, maxLength: 8 })
).map(([num, hash]) => `${num}-${hash}`)

/** Arbitrary for local file state (exists). */
const localStateArb = fc.record({
  mtime: mtimeArb,
  size: fileSizeArb,
})

/** Arbitrary for remote document state (exists, not deleted). */
const remoteStateArb = fc.record({
  rev: revisionArb,
  mtime: mtimeArb,
  size: fileSizeArb,
  deleted: fc.constant(false),
})

/** Valid categories for analysis. */
const ALL_CATEGORIES = ['remote_newer', 'local_newer', 'remote_only', 'local_only', 'conflict', 'identical'] as const

// ─── Property 16: Analysis Categorization Correctness ────────────────────────
// For any pair of local file state (exists, mtime, size) and remote document
// state (exists, revision, mtime, size), the categorization function SHALL
// assign exactly one correct category.
// **Validates: Requirements 6.2**

describe('Property 16: Analysis Categorization Correctness', () => {
  it('assigns exactly one valid category for any local/remote state combination', () => {
    // Generate all possible combinations of local/remote presence
    const stateArb = fc.tuple(
      filePathArb,
      fc.option(localStateArb, { nil: undefined }),
      fc.option(remoteStateArb, { nil: undefined }),
      fc.option(mtimeArb, { nil: undefined }),
    )

    fc.assert(
      fc.property(stateArb, ([path, local, remote, checkpointMtime]) => {
        const result = categorizeDocument(path, local, remote, checkpointMtime)

        // Must return a valid AnalysisDetail
        expect(result).toBeDefined()
        expect(result.path).toBe(path)

        // Must assign exactly one category from the valid set
        expect(ALL_CATEGORIES).toContain(result.category)
      }),
      { numRuns: 50 }
    )
  })

  it('assigns remote_only when remote exists but local does not', () => {
    fc.assert(
      fc.property(filePathArb, remoteStateArb, fc.option(mtimeArb, { nil: undefined }), (path, remote, checkpointMtime) => {
        const result = categorizeDocument(path, undefined, remote, checkpointMtime)

        expect(result.category).toBe('remote_only')
        expect(result.remoteRevision).toBe(remote.rev)
        expect(result.remoteSize).toBe(remote.size)
      }),
      { numRuns: 50 }
    )
  })

  it('assigns local_only when local exists but remote does not', () => {
    fc.assert(
      fc.property(filePathArb, localStateArb, fc.option(mtimeArb, { nil: undefined }), (path, local, checkpointMtime) => {
        const result = categorizeDocument(path, local, undefined, checkpointMtime)

        expect(result.category).toBe('local_only')
        expect(result.localSize).toBe(local.size)
      }),
      { numRuns: 50 }
    )
  })

  it('assigns remote_newer when remote mtime > local mtime (no conflict condition)', () => {
    // Generate states where remote mtime > local mtime and no conflict condition
    const arb = fc.tuple(filePathArb, fileSizeArb, fileSizeArb, revisionArb).chain(
      ([path, localSize, remoteSize, rev]) =>
        fc.tuple(
          fc.constant(path),
          mtimeArb,
          fc.constant(localSize),
          fc.constant(remoteSize),
          fc.constant(rev),
        )
    ).chain(([path, localMtime, localSize, remoteSize, rev]) =>
      fc.tuple(
        fc.constant(path),
        fc.constant({ mtime: localMtime, size: localSize }),
        // Remote mtime must be > local mtime
        fc.integer({ min: localMtime + 1, max: localMtime + 1_000_000 }).map(remoteMtime => ({
          rev,
          mtime: remoteMtime,
          size: remoteSize,
          deleted: false as const,
        })),
        // Checkpoint mtime >= local mtime (so local is NOT changed since checkpoint)
        fc.constant(localMtime),
      )
    )

    fc.assert(
      fc.property(arb, ([path, local, remote, checkpointMtime]) => {
        const result = categorizeDocument(path, local, remote, checkpointMtime)

        expect(result.category).toBe('remote_newer')
      }),
      { numRuns: 50 }
    )
  })

  it('assigns local_newer when local mtime > remote mtime (no conflict condition)', () => {
    const arb = fc.tuple(filePathArb, fileSizeArb, fileSizeArb, revisionArb).chain(
      ([path, localSize, remoteSize, rev]) =>
        fc.tuple(
          fc.constant(path),
          fc.constant(localSize),
          fc.constant(remoteSize),
          fc.constant(rev),
          mtimeArb,
        )
    ).chain(([path, localSize, remoteSize, rev, remoteMtime]) =>
      fc.tuple(
        fc.constant(path),
        // Local mtime must be > remote mtime
        fc.integer({ min: remoteMtime + 1, max: remoteMtime + 1_000_000 }).map(localMtime => ({
          mtime: localMtime,
          size: localSize,
        })),
        fc.constant({
          rev,
          mtime: remoteMtime,
          size: remoteSize,
          deleted: false as const,
        }),
        // No checkpoint or checkpoint >= local mtime (so local is NOT changed since checkpoint)
        fc.constant(undefined),
      )
    )

    fc.assert(
      fc.property(arb, ([path, local, remote, checkpointMtime]) => {
        const result = categorizeDocument(path, local, remote, checkpointMtime)

        expect(result.category).toBe('local_newer')
      }),
      { numRuns: 50 }
    )
  })

  it('assigns identical when both exist with same mtime', () => {
    const arb = fc.tuple(filePathArb, mtimeArb, fileSizeArb, fileSizeArb, revisionArb).map(
      ([path, mtime, localSize, remoteSize, rev]) => ({
        path,
        local: { mtime, size: localSize },
        remote: { rev, mtime, size: remoteSize, deleted: false as const },
        checkpointMtime: mtime, // checkpoint matches local mtime (no local change)
      })
    )

    fc.assert(
      fc.property(arb, ({ path, local, remote, checkpointMtime }) => {
        const result = categorizeDocument(path, local, remote, checkpointMtime)

        expect(result.category).toBe('identical')
      }),
      { numRuns: 50 }
    )
  })

  it('assigns conflict when both modified since checkpoint', () => {
    // Both local and remote must have mtime > checkpointMtime
    const arb = fc.tuple(filePathArb, fileSizeArb, fileSizeArb, revisionArb, mtimeArb).chain(
      ([path, localSize, remoteSize, rev, checkpointMtime]) =>
        fc.tuple(
          fc.constant(path),
          // Local mtime > checkpoint
          fc.integer({ min: checkpointMtime + 1, max: checkpointMtime + 1_000_000 }).map(localMtime => ({
            mtime: localMtime,
            size: localSize,
          })),
          // Remote mtime > checkpoint
          fc.integer({ min: checkpointMtime + 1, max: checkpointMtime + 1_000_000 }).map(remoteMtime => ({
            rev,
            mtime: remoteMtime,
            size: remoteSize,
            deleted: false as const,
          })),
          fc.constant(checkpointMtime),
        )
    )

    fc.assert(
      fc.property(arb, ([path, local, remote, checkpointMtime]) => {
        const result = categorizeDocument(path, local, remote, checkpointMtime)

        expect(result.category).toBe('conflict')
      }),
      { numRuns: 50 }
    )
  })
})

// ─── Property 17: Analysis Summary Aggregation ───────────────────────────────
// For any analysis result, the summary counts and byte totals per category
// SHALL exactly match the count and sum of sizes of documents in the detail
// list for that category.
// **Validates: Requirements 6.3**

/** Arbitrary for a single AnalysisDetail entry. */
const analysisDetailArb: fc.Arbitrary<AnalysisDetail> = fc.tuple(
  filePathArb,
  fc.constantFrom(...ALL_CATEGORIES),
  fc.option(revisionArb, { nil: undefined }),
  fc.option(fileSizeArb, { nil: undefined }),
  fc.option(fileSizeArb, { nil: undefined }),
).map(([path, category, remoteRevision, localSize, remoteSize]) => {
  const detail: AnalysisDetail = { path, category }
  if (remoteRevision !== undefined) detail.remoteRevision = remoteRevision
  if (localSize !== undefined) detail.localSize = localSize
  if (remoteSize !== undefined) detail.remoteSize = remoteSize
  return detail
})

/** Arbitrary for a list of AnalysisDetail entries. */
const analysisDetailsArb = fc.array(analysisDetailArb, { minLength: 0, maxLength: 100 })

describe('Property 17: Analysis Summary Aggregation', () => {
  it('summary counts match the number of details per category', () => {
    fc.assert(
      fc.property(analysisDetailsArb, (details) => {
        const summary = buildAnalysisSummary(details)

        // Count details per category manually
        for (const category of ALL_CATEGORIES) {
          const expectedCount = details.filter(d => d.category === category).length
          expect(summary[category].count).toBe(expectedCount)
        }
      }),
      { numRuns: 50 }
    )
  })

  it('summary totalBytes matches the sum of max(localSize, remoteSize) per category', () => {
    fc.assert(
      fc.property(analysisDetailsArb, (details) => {
        const summary = buildAnalysisSummary(details)

        // Compute expected byte totals per category
        for (const category of ALL_CATEGORIES) {
          const categoryDetails = details.filter(d => d.category === category)
          const expectedBytes = categoryDetails.reduce((sum, d) => {
            const size = Math.max(d.localSize ?? 0, d.remoteSize ?? 0)
            return sum + size
          }, 0)
          expect(summary[category].totalBytes).toBe(expectedBytes)
        }
      }),
      { numRuns: 50 }
    )
  })

  it('total count across all categories equals the total number of details', () => {
    fc.assert(
      fc.property(analysisDetailsArb, (details) => {
        const summary = buildAnalysisSummary(details)

        const totalCount = ALL_CATEGORIES.reduce((sum, cat) => sum + summary[cat].count, 0)
        expect(totalCount).toBe(details.length)
      }),
      { numRuns: 50 }
    )
  })

  it('empty details list produces all-zero summary', () => {
    const summary = buildAnalysisSummary([])

    for (const category of ALL_CATEGORIES) {
      expect(summary[category].count).toBe(0)
      expect(summary[category].totalBytes).toBe(0)
    }
  })
})
