// VaultRegistry — Persistent vault metadata stored in a JSON file

import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import type { ILogger } from '../logger/index.js'

// --- Data Models ---

export interface VaultRegistryEntry {
  id: string           // SHA-256 hash (12 hex chars) of storage path
  name: string         // User-chosen name, 1-128 chars, unique
  storagePath: string  // Absolute path to vault directory on server
  createdAt: string    // ISO 8601 timestamp
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
}

// --- Implementation ---

export class VaultRegistry implements IVaultRegistry {
  private entries: VaultRegistryEntry[] = []
  private readonly registryPath: string
  private readonly vaultsDir: string
  private initialized = false

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
   */
  async save(entries: VaultRegistryEntry[]): Promise<void> {
    await this.ensureDirectories()

    const data: RegistryFile = {
      version: 1,
      vaults: entries,
    }

    const content = JSON.stringify(data, null, 2)
    const tempPath = this.registryPath + `.${crypto.randomBytes(8).toString('hex')}.tmp`

    await fs.writeFile(tempPath, content, 'utf-8')

    try {
      await fs.rename(tempPath, this.registryPath)
    } catch (renameError) {
      // Clean up temp file on rename failure
      try {
        await fs.unlink(tempPath)
      } catch {
        // Ignore cleanup errors
      }
      throw renameError
    }

    this.entries = [...entries]
  }

  /**
   * Adds a new entry to the registry and persists to disk.
   */
  async addEntry(entry: VaultRegistryEntry): Promise<void> {
    await this.ensureDirectories()

    // Load current state from disk to avoid stale data
    await this.load()

    this.entries.push(entry)
    await this.save(this.entries)
  }

  /**
   * Removes an entry by vault ID and persists to disk.
   */
  async removeEntry(vaultId: string): Promise<void> {
    await this.ensureDirectories()

    // Load current state from disk to avoid stale data
    await this.load()

    this.entries = this.entries.filter((e) => e.id !== vaultId)
    await this.save(this.entries)
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

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error
}
