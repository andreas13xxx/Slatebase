import { mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import type { ILogger } from '../logger/index.js'
import type { TokenRecord, UserTokenIndex } from './types.js'

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

// ─── Implementation ──────────────────────────────────────────────────────────

/**
 * Filesystem-backed token store with in-memory hash index.
 * Tokens are persisted as individual JSON files under `data/mcp/tokens/`.
 * A `Map<tokenHash, tokenId>` is maintained in memory for O(1) lookups.
 */
export class TokenStore implements ITokenStore {
  private readonly hashIndex: Map<string, string> = new Map()
  private readonly tokensDir: string
  private readonly byUserDir: string
  private tokensDirEnsured = false
  private byUserDirEnsured = false

  constructor(
    dataDir: string,
    private readonly logger: ILogger
  ) {
    this.tokensDir = join(dataDir, 'mcp', 'tokens')
    this.byUserDir = join(dataDir, 'mcp', 'tokens', '_by-user')
  }

  /**
   * Load all existing non-revoked token hashes from the filesystem into the in-memory index.
   * Must be called once at startup before the store is used.
   * Corrupted files are skipped with a warning.
   */
  async loadIndex(): Promise<void> {
    await this.ensureTokensDir()
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
        const record: unknown = JSON.parse(content)
        if (this.isValidTokenRecord(record) && record.revokedAt === null) {
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
   * Persist a new token record. Updates both token file and user index atomically.
   */
  async create(record: TokenRecord): Promise<void> {
    await this.ensureTokensDir()
    await this.ensureByUserDir()

    // Write token file atomically
    const tokenFilePath = join(this.tokensDir, `${record.tokenId}.json`)
    await this.atomicWrite(tokenFilePath, JSON.stringify(record, null, 2))

    // Update in-memory index
    if (record.revokedAt === null) {
      this.hashIndex.set(record.tokenHash, record.tokenId)
    }

    // Update user index
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
    const filePath = join(this.tokensDir, `${tokenId}.json`)
    try {
      const content = await readFile(filePath, 'utf-8')
      const parsed: unknown = JSON.parse(content)
      if (this.isValidTokenRecord(parsed)) {
        return parsed
      }
      return null
    } catch {
      return null
    }
  }

  /**
   * Get all token IDs for a user by reading the user index file.
   * Returns an empty array if the user has no tokens or the index file doesn't exist.
   */
  async getTokenIdsForUser(userId: string): Promise<string[]> {
    const indexPath = join(this.byUserDir, `${userId}.json`)
    try {
      const content = await readFile(indexPath, 'utf-8')
      const parsed: unknown = JSON.parse(content)
      if (this.isValidUserTokenIndex(parsed)) {
        return parsed.tokenIds
      }
      return []
    } catch {
      return []
    }
  }

  /**
   * Update a token record (e.g., revocation, lastUsedAt). Atomic write.
   */
  async update(record: TokenRecord): Promise<void> {
    await this.ensureTokensDir()
    const filePath = join(this.tokensDir, `${record.tokenId}.json`)
    await this.atomicWrite(filePath, JSON.stringify(record, null, 2))
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
   * Ensure the tokens directory exists.
   */
  private async ensureTokensDir(): Promise<void> {
    if (this.tokensDirEnsured) {
      return
    }
    await mkdir(this.tokensDir, { recursive: true })
    this.tokensDirEnsured = true
  }

  /**
   * Ensure the _by-user directory exists.
   */
  private async ensureByUserDir(): Promise<void> {
    if (this.byUserDirEnsured) {
      return
    }
    await mkdir(this.byUserDir, { recursive: true })
    this.byUserDirEnsured = true
  }

  /**
   * Write data atomically: write to a temp file with random hex suffix, then rename to target.
   * On Windows, retries with unlink-before-rename on EPERM/EACCES.
   */
  private async atomicWrite(targetPath: string, data: string): Promise<void> {
    const tempSuffix = randomBytes(8).toString('hex')
    const tempPath = `${targetPath}.${tempSuffix}.tmp`
    await writeFile(tempPath, data, 'utf-8')

    try {
      await rename(tempPath, targetPath)
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException).code
      if (code === 'EPERM' || code === 'EACCES') {
        try { await unlink(targetPath) } catch { /* may not exist */ }
        try {
          await rename(tempPath, targetPath)
        } catch {
          await writeFile(targetPath, data, 'utf-8')
          try { await unlink(tempPath) } catch { /* cleanup */ }
        }
      } else {
        try { await unlink(tempPath) } catch { /* ignore */ }
        throw err
      }
    }
  }

  /**
   * Add a token ID to the user's index file. Creates the file if it doesn't exist.
   * Atomic write to prevent corruption.
   */
  private async addToUserIndex(userId: string, tokenId: string): Promise<void> {
    await this.ensureByUserDir()
    const indexPath = join(this.byUserDir, `${userId}.json`)

    // Read existing index or start fresh
    let tokenIds: string[] = []
    try {
      const content = await readFile(indexPath, 'utf-8')
      const parsed: unknown = JSON.parse(content)
      if (this.isValidUserTokenIndex(parsed)) {
        tokenIds = parsed.tokenIds
      }
    } catch {
      // File doesn't exist yet — start with empty array
    }

    // Add new token ID if not already present
    if (!tokenIds.includes(tokenId)) {
      tokenIds.push(tokenId)
    }

    const index: UserTokenIndex = { tokenIds }
    await this.atomicWrite(indexPath, JSON.stringify(index, null, 2))
  }

  /**
   * Type guard to validate that a parsed JSON value is a valid TokenRecord.
   */
  private isValidTokenRecord(value: unknown): value is TokenRecord {
    if (typeof value !== 'object' || value === null) {
      return false
    }
    const obj = value as Record<string, unknown>
    return (
      typeof obj['tokenId'] === 'string' &&
      typeof obj['tokenHash'] === 'string' &&
      typeof obj['userId'] === 'string' &&
      typeof obj['name'] === 'string' &&
      typeof obj['createdAt'] === 'string' &&
      typeof obj['expiresAt'] === 'string' &&
      (obj['revokedAt'] === null || typeof obj['revokedAt'] === 'string') &&
      (obj['lastUsedAt'] === null || typeof obj['lastUsedAt'] === 'string')
    )
  }

  /**
   * Type guard to validate that a parsed JSON value is a valid UserTokenIndex.
   */
  private isValidUserTokenIndex(value: unknown): value is UserTokenIndex {
    if (typeof value !== 'object' || value === null) {
      return false
    }
    const obj = value as Record<string, unknown>
    return (
      Array.isArray(obj['tokenIds']) &&
      obj['tokenIds'].every((id: unknown) => typeof id === 'string')
    )
  }
}
