// VaultRegistry — Persistent vault metadata stored in a JSON file

import fs from 'node:fs/promises'
import path from 'node:path'
import type { ILogger } from '../logger/index.js'
import { AsyncMutex } from '../shared/async-mutex.js'
import { isNodeError } from '../shared/fs-utils.js'
import { atomicWriteFile } from '../shared/atomic-write.js'

// --- Data Models ---

export interface VaultRegistryEntry {
  id: string           // SHA-256 hash (12 hex chars) of storage path
  name: string         // User-chosen name, 1-128 chars, unique
  storagePath: string  // Absolute path to vault directory on server
  createdAt: string    // ISO 8601 timestamp
  ownerId?: string     // User ID of the vault owner (added by auth feature)
}

export interface VaultShareEntry {
  vaultId: string
  userId: string          // Recipient of the share
  permission: 'read' | 'write'
  grantedBy: string       // userId of the owner
  grantedAt: string       // ISO 8601
}

export interface IVaultShareRegistry {
  /** Returns all shares for a given vault. */
  getSharesForVault(vaultId: string): Promise<VaultShareEntry[]>
  /** Returns all shares granted to a given user. */
  getSharesForUser(userId: string): Promise<VaultShareEntry[]>
  /** Adds a new share entry. */
  addShare(share: VaultShareEntry): Promise<void>
  /** Removes a specific share for a user on a vault. */
  removeShare(vaultId: string, userId: string): Promise<void>
  /** Removes all shares for a given vault. */
  removeAllSharesForVault(vaultId: string): Promise<void>
  /** Updates the permission level of an existing share. */
  updatePermission(vaultId: string, userId: string, permission: 'read' | 'write'): Promise<void>
}

interface RegistryFile {
  version: number
  vaults: VaultRegistryEntry[]
}

// --- Interface ---

export interface IVaultRegistry {
  load(): Promise<VaultRegistryEntry[]>
  save(entries: VaultRegistryEntry[]): Promise<void>
  addEntry(entry: VaultRegistryEntry): Promise<void>
  removeEntry(vaultId: string): Promise<void>
  findById(vaultId: string): VaultRegistryEntry | null
  findByName(name: string): VaultRegistryEntry | null

  /**
   * Loads the freshest entries, applies `mutator` to them, and persists the
   * result — all while holding the same mutex as addEntry/removeEntry, so the
   * whole read-modify-write cycle is atomic with respect to concurrent
   * registry mutations. `mutator` may throw to abort without persisting
   * (e.g. if a precondition no longer holds against the freshly-loaded data).
   */
  updateEntries<T>(mutator: (entries: VaultRegistryEntry[]) => T): Promise<T>
}

// --- Implementation ---

export class VaultRegistry implements IVaultRegistry {
  private entries: VaultRegistryEntry[] = []
  private readonly registryPath: string
  private readonly vaultsDir: string
  private initialized = false
  private readonly mutex = new AsyncMutex()

  constructor(
    private readonly dataDir: string,
    private readonly logger: ILogger,
  ) {
    this.registryPath = path.join(dataDir, 'vaults.json')
    this.vaultsDir = path.join(dataDir, 'vaults')
  }

  /**
   * Ensures the dataDir and vaults/ subdirectory exist.
   * Called lazily on first access.
   */
  private async ensureDirectories(): Promise<void> {
    if (this.initialized) return
    await fs.mkdir(this.dataDir, { recursive: true })
    await fs.mkdir(this.vaultsDir, { recursive: true })
    this.initialized = true
  }

  /**
   * Reads and parses the registry file from disk.
   * Returns an empty array if the file doesn't exist.
   * Updates the in-memory cache.
   */
  async load(): Promise<VaultRegistryEntry[]> {
    await this.ensureDirectories()

    try {
      const raw = await fs.readFile(this.registryPath, 'utf-8')
      const data: RegistryFile = JSON.parse(raw)

      if (data.version !== 1) {
        this.logger.warn('Unknown registry version, attempting to load anyway', { version: data.version })
      }

      this.entries = Array.isArray(data.vaults) ? data.vaults : []
      return [...this.entries]
    } catch (error: unknown) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        // File doesn't exist yet — return empty array
        this.entries = []
        return []
      }
      // Re-throw unexpected errors (permission issues, corrupt JSON, etc.)
      throw error
    }
  }

  /**
   * Writes the entries to disk atomically.
   * Writes to a temp file first, then renames to prevent corruption.
   * Updates the in-memory cache.
   * Serialized via mutex (same lock as addEntry/removeEntry) to prevent a direct
   * save() call from racing with — and silently clobbering — a concurrent add/remove.
   */
  async save(entries: VaultRegistryEntry[]): Promise<void> {
    await this.mutex.runExclusive(async () => {
      await this.persistUnlocked(entries)
    })
  }

  /**
   * Writes entries to disk without acquiring the mutex.
   * Only call this from within a block already holding `this.mutex`.
   */
  private async persistUnlocked(entries: VaultRegistryEntry[]): Promise<void> {
    await this.ensureDirectories()

    const data: RegistryFile = {
      version: 1,
      vaults: entries,
    }

    await atomicWriteFile(this.registryPath, JSON.stringify(data, null, 2))

    this.entries = [...entries]
  }

  /**
   * Adds a new entry to the registry and persists to disk.
   * Serialized via mutex to prevent concurrent read-modify-write races.
   */
  async addEntry(entry: VaultRegistryEntry): Promise<void> {
    await this.mutex.runExclusive(async () => {
      await this.ensureDirectories()

      // Load current state from disk to avoid stale data
      await this.load()

      this.entries.push(entry)
      await this.persistUnlocked(this.entries)
    })
  }

  /**
   * Removes an entry by vault ID and persists to disk.
   * Serialized via mutex to prevent concurrent read-modify-write races.
   */
  async removeEntry(vaultId: string): Promise<void> {
    await this.mutex.runExclusive(async () => {
      await this.ensureDirectories()

      // Load current state from disk to avoid stale data
      await this.load()

      this.entries = this.entries.filter((e) => e.id !== vaultId)
      await this.persistUnlocked(this.entries)
    })
  }

  /**
   * Loads the freshest entries, applies `mutator`, and persists the result —
   * all within a single mutex hold. See IVaultRegistry for details.
   */
  async updateEntries<T>(mutator: (entries: VaultRegistryEntry[]) => T): Promise<T> {
    return this.mutex.runExclusive(async () => {
      await this.ensureDirectories()
      await this.load()

      const result = mutator(this.entries)
      await this.persistUnlocked(this.entries)
      return result
    })
  }

  /**
   * Finds an entry by vault ID from the in-memory cache.
   * Returns null if not found.
   */
  findById(vaultId: string): VaultRegistryEntry | null {
    return this.entries.find((e) => e.id === vaultId) ?? null
  }

  /**
   * Finds an entry by vault name (case-sensitive) from the in-memory cache.
   * Returns null if not found.
   */
  findByName(name: string): VaultRegistryEntry | null {
    return this.entries.find((e) => e.name === name) ?? null
  }
}

// --- Helpers ---


// --- VaultShareRegistry Implementation ---

export class VaultShareRegistry implements IVaultShareRegistry {
  private shares: VaultShareEntry[] = []
  private readonly sharesPath: string
  private initialized = false
  private readonly mutex = new AsyncMutex()

  constructor(private readonly dataDir: string) {
    this.sharesPath = path.join(dataDir, 'shares.json')
  }

  /**
   * Ensures the data directory exists.
   * Called lazily on first access.
   */
  private async ensureDirectory(): Promise<void> {
    if (this.initialized) return
    await fs.mkdir(this.dataDir, { recursive: true })
    this.initialized = true
  }

  /**
   * Reads and parses the shares file from disk.
   * Returns an empty array if the file doesn't exist.
   * Updates the in-memory cache.
   */
  private async load(): Promise<VaultShareEntry[]> {
    await this.ensureDirectory()

    try {
      const raw = await fs.readFile(this.sharesPath, 'utf-8')
      const data: unknown = JSON.parse(raw)
      this.shares = Array.isArray(data) ? data : []
      return [...this.shares]
    } catch (error: unknown) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        this.shares = []
        return []
      }
      throw error
    }
  }

  /**
   * Writes the shares array to disk atomically.
   * Writes to a temp file first, then renames to prevent corruption.
   * Updates the in-memory cache.
   */
  private async save(shares: VaultShareEntry[]): Promise<void> {
    await this.ensureDirectory()

    await atomicWriteFile(this.sharesPath, JSON.stringify(shares, null, 2))

    this.shares = [...shares]
  }

  /**
   * Returns all shares for a given vault.
   */
  async getSharesForVault(vaultId: string): Promise<VaultShareEntry[]> {
    await this.load()
    return this.shares.filter((s) => s.vaultId === vaultId)
  }

  /**
   * Returns all shares granted to a given user.
   */
  async getSharesForUser(userId: string): Promise<VaultShareEntry[]> {
    await this.load()
    return this.shares.filter((s) => s.userId === userId)
  }

  /**
   * Adds a new share entry and persists to disk.
   * Serialized via mutex to prevent concurrent read-modify-write races.
   */
  async addShare(share: VaultShareEntry): Promise<void> {
    await this.mutex.runExclusive(async () => {
      await this.load()
      this.shares.push(share)
      await this.save(this.shares)
    })
  }

  /**
   * Removes a specific share for a user on a vault and persists to disk.
   * Serialized via mutex to prevent concurrent read-modify-write races.
   */
  async removeShare(vaultId: string, userId: string): Promise<void> {
    await this.mutex.runExclusive(async () => {
      await this.load()
      this.shares = this.shares.filter(
        (s) => !(s.vaultId === vaultId && s.userId === userId),
      )
      await this.save(this.shares)
    })
  }

  /**
   * Removes all shares for a given vault and persists to disk.
   * Serialized via mutex to prevent concurrent read-modify-write races.
   */
  async removeAllSharesForVault(vaultId: string): Promise<void> {
    await this.mutex.runExclusive(async () => {
      await this.load()
      this.shares = this.shares.filter((s) => s.vaultId !== vaultId)
      await this.save(this.shares)
    })
  }

  /**
   * Updates the permission level of an existing share and persists to disk.
   * Serialized via mutex to prevent concurrent read-modify-write races.
   */
  async updatePermission(vaultId: string, userId: string, permission: 'read' | 'write'): Promise<void> {
    await this.mutex.runExclusive(async () => {
      await this.load()
      const share = this.shares.find(
        (s) => s.vaultId === vaultId && s.userId === userId,
      )
      if (share) {
        share.permission = permission
        await this.save(this.shares)
      }
    })
  }
}
