import { mkdir, readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ILogger } from '../logger/index.js'
import type { TokenRecord, UserTokenIndex } from './types.js'
import { KeyedJsonFileStore } from '../shared/json-file-store.js'

// ─── Interface ───────────────────────────────────────────────────────────────

/**
 * Persistence layer for MCP API tokens.
 * Stores tokens as individual JSON files with an in-memory hash index.
 * Pattern: analogous to SessionStore.
 */
export interface ITokenStore {
  /** Load all non-revoked token hashes into the in-memory index. Called at startup. */
  loadIndex(): Promise<void>

  /** Persist a new token record. Updates both token file and user index. */
  create(record: TokenRecord): Promise<void>

  /** Find a token record by its hash. Returns null if not found. */
  findByHash(tokenHash: string): Promise<TokenRecord | null>

  /** Find a token record by its ID. Returns null if not found. */
  findById(tokenId: string): Promise<TokenRecord | null>

  /** Get all token IDs for a user. */
  getTokenIdsForUser(userId: string): Promise<string[]>

  /** Update a token record (e.g., revocation, lastUsedAt). Atomic write. */
  update(record: TokenRecord): Promise<void>

  /** Remove a token hash from the in-memory index (on revocation). */
  removeFromIndex(tokenHash: string): void

  /** Remove all tokens for a user from the index and mark them as revoked. */
  invalidateAllForUser(userId: string): Promise<void>
}

// ─── Validation ──────────────────────────────────────────────────────────────

/** Type guard / parser for a persisted TokenRecord. */
function parseTokenRecord(value: unknown): TokenRecord | null {
  if (typeof value !== 'object' || value === null) return null
  const obj = value as Record<string, unknown>
  const valid =
    typeof obj['tokenId'] === 'string' &&
    typeof obj['tokenHash'] === 'string' &&
    typeof obj['userId'] === 'string' &&
    typeof obj['name'] === 'string' &&
    typeof obj['createdAt'] === 'string' &&
    typeof obj['expiresAt'] === 'string' &&
    (obj['revokedAt'] === null || typeof obj['revokedAt'] === 'string') &&
    (obj['lastUsedAt'] === null || typeof obj['lastUsedAt'] === 'string')
  return valid ? (obj as unknown as TokenRecord) : null
}

/** Type guard / parser for a persisted UserTokenIndex. Never rejects — falls back to empty. */
function parseUserTokenIndex(value: unknown): UserTokenIndex {
  if (typeof value === 'object' && value !== null) {
    const obj = value as Record<string, unknown>
    if (Array.isArray(obj['tokenIds']) && obj['tokenIds'].every((id: unknown) => typeof id === 'string')) {
      return { tokenIds: obj['tokenIds'] as string[] }
    }
  }
  return { tokenIds: [] }
}

// ─── Implementation ──────────────────────────────────────────────────────────

/**
 * Filesystem-backed token store with in-memory hash index.
 * Tokens are persisted as individual JSON files under `data/mcp/tokens/`.
 * A `Map<tokenHash, tokenId>` is maintained in memory for O(1) lookups.
 */
export class TokenStore implements ITokenStore {
  private readonly hashIndex: Map<string, string> = new Map()
  private readonly tokensDir: string
  private readonly recordStore: KeyedJsonFileStore<TokenRecord | null>
  private readonly userIndexStore: KeyedJsonFileStore<UserTokenIndex>

  constructor(
    dataDir: string,
    private readonly logger: ILogger
  ) {
    this.tokensDir = join(dataDir, 'mcp', 'tokens')
    const byUserDir = join(this.tokensDir, '_by-user')
    this.recordStore = new KeyedJsonFileStore<TokenRecord | null>(
      (tokenId) => join(this.tokensDir, `${tokenId}.json`),
      null,
      parseTokenRecord,
    )
    this.userIndexStore = new KeyedJsonFileStore<UserTokenIndex>(
      (userId) => join(byUserDir, `${userId}.json`),
      { tokenIds: [] },
      parseUserTokenIndex,
    )
  }

  /**
   * Load all existing non-revoked token hashes from the filesystem into the in-memory index.
   * Must be called once at startup before the store is used.
   * Corrupted files are skipped with a warning.
   */
  async loadIndex(): Promise<void> {
    await mkdir(this.tokensDir, { recursive: true })
    let files: string[]
    try {
      files = await readdir(this.tokensDir)
    } catch {
      this.logger.warn('Could not read tokens directory during index load')
      return
    }

    const jsonFiles = files.filter(f => f.endsWith('.json') && !f.startsWith('_'))
    let loaded = 0

    for (const file of jsonFiles) {
      try {
        const filePath = join(this.tokensDir, file)
        const content = await readFile(filePath, 'utf-8')
        const record = parseTokenRecord(JSON.parse(content))
        if (record !== null && record.revokedAt === null) {
          this.hashIndex.set(record.tokenHash, record.tokenId)
          loaded++
        }
      } catch {
        this.logger.warn('Failed to load token file during index load, skipping', { file })
      }
    }

    this.logger.info('Token index loaded', { count: loaded })
  }

  /**
   * Persist a new token record. Updates both token file and user index.
   * The user index update is serialized per-user, so two tokens created for
   * the same user in quick succession can no longer race and drop one
   * tokenId from the index (which would make it un-revocable via "revoke all").
   */
  async create(record: TokenRecord): Promise<void> {
    await this.recordStore.write(record.tokenId, record)

    if (record.revokedAt === null) {
      this.hashIndex.set(record.tokenHash, record.tokenId)
    }

    await this.addToUserIndex(record.userId, record.tokenId)
  }

  /**
   * Find a token record by its hash. O(1) lookup in hashIndex Map, then load from disk.
   * Returns null if not found in the index.
   */
  async findByHash(tokenHash: string): Promise<TokenRecord | null> {
    const tokenId = this.hashIndex.get(tokenHash)
    if (tokenId === undefined) {
      return null
    }
    return this.findById(tokenId)
  }

  /**
   * Find a token record by its ID. Reads the token JSON file from disk.
   * Returns null if the file does not exist or is corrupted.
   */
  async findById(tokenId: string): Promise<TokenRecord | null> {
    return this.recordStore.read(tokenId)
  }

  /**
   * Get all token IDs for a user by reading the user index file.
   * Returns an empty array if the user has no tokens or the index file doesn't exist.
   */
  async getTokenIdsForUser(userId: string): Promise<string[]> {
    const index = await this.userIndexStore.read(userId)
    return index.tokenIds
  }

  /**
   * Update a token record (e.g., revocation, lastUsedAt). Atomic write.
   */
  async update(record: TokenRecord): Promise<void> {
    await this.recordStore.write(record.tokenId, record)
  }

  /**
   * Remove a token hash from the in-memory index (on revocation).
   */
  removeFromIndex(tokenHash: string): void {
    this.hashIndex.delete(tokenHash)
  }

  /**
   * Revoke all tokens for a user, update the in-memory index, and persist changes.
   */
  async invalidateAllForUser(userId: string): Promise<void> {
    const tokenIds = await this.getTokenIdsForUser(userId)
    const now = new Date().toISOString()

    for (const tokenId of tokenIds) {
      const record = await this.findById(tokenId)
      if (record !== null && record.revokedAt === null) {
        // Remove from in-memory index
        this.hashIndex.delete(record.tokenHash)

        // Update record with revocation timestamp
        const updatedRecord: TokenRecord = {
          ...record,
          revokedAt: now,
        }
        await this.update(updatedRecord)
      }
    }
  }

  // ─── Private Helpers ─────────────────────────────────────────────────────────

  /**
   * Add a token ID to the user's index file, creating it if needed.
   * Runs inside the per-user mutex (via `mutate`) so the read-then-append
   * can't race against a concurrent token creation for the same user.
   */
  private async addToUserIndex(userId: string, tokenId: string): Promise<void> {
    await this.userIndexStore.mutate(userId, (current) => {
      if (current.tokenIds.includes(tokenId)) {
        return current
      }
      return { tokenIds: [...current.tokenIds, tokenId] }
    })
  }
}
