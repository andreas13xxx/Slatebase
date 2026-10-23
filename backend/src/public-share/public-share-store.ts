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
 */
export function createPublicShareStore(
  filePath: string,
  onError?: (error: unknown) => void,
): IPublicShareStore {
  const store = new JsonFileStore<PublicShareFile>(filePath, { shares: [] }, parseFile, onError, 0o600)
  return {
    async list() {
      return (await store.read()).shares
    },
    async mutate(fn) {
      const next = await store.mutate((current) => ({ shares: fn(current.shares) }))
      return next.shares
    },
  }
}
