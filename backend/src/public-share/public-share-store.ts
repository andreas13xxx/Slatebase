// ─── Public Share Links — Store ──────────────────────────────────────────────

import { JsonFileStore } from '../shared/json-file-store.js'
import type { PublicShare } from './types.js'

/** Persistence for public share records. */
export interface IPublicShareStore {
  /** Returns all share records. */
  list(): Promise<PublicShare[]>
  /**
   * Reads the records, applies `fn`, and writes the result back atomically.
   * Calls are serialized, so concurrent mutations cannot lose updates.
   */
  mutate(fn: (shares: PublicShare[]) => PublicShare[]): Promise<PublicShare[]>
}

interface PublicShareFile {
  shares: PublicShare[]
}

function isShare(value: unknown): value is PublicShare {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    typeof v['id'] === 'string' &&
    typeof v['tokenHash'] === 'string' &&
    typeof v['tokenHint'] === 'string' &&
    typeof v['vaultId'] === 'string' &&
    typeof v['filePath'] === 'string' &&
    typeof v['createdBy'] === 'string' &&
    typeof v['createdAt'] === 'string'
  )
}

/** Keeps only well-formed records; a malformed file falls back to "no shares". */
function parseFile(raw: unknown): PublicShareFile | null {
  if (typeof raw !== 'object' || raw === null) return null
  const shares = (raw as Record<string, unknown>)['shares']
  if (!Array.isArray(shares)) return null
  return { shares: shares.filter(isShare) }
}

/**
 * Creates a store backed by a single JSON file (`public-shares.json`).
 * The file holds token hashes and password hashes, so it is written with
 * owner-only permissions.
 *
 * The list is kept in memory after the first successful read and updated on every
 * mutation: the reader routes look a link up on every request (a page with 40 images
 * makes 41), and a single process is the only writer. A read that failed is never
 * cached, so a transient error (EPERM from antivirus, say) cannot hide every link until
 * the next restart.
 */
export function createPublicShareStore(
  filePath: string,
  onError?: (error: unknown) => void,
): IPublicShareStore {
  let readFailed = false
  const store = new JsonFileStore<PublicShareFile>(
    filePath,
    { shares: [] },
    parseFile,
    (error) => {
      readFailed = true
      onError?.(error)
    },
    0o600,
  )
  let cache: PublicShare[] | null = null

  return {
    async list() {
      if (cache !== null) return cache
      readFailed = false
      const { shares } = await store.read()
      if (!readFailed) cache = shares
      return shares
    },
    async mutate(fn) {
      const next = await store.mutate((current) => ({ shares: fn(current.shares) }))
      cache = next.shares
      return next.shares
    },
  }
}
