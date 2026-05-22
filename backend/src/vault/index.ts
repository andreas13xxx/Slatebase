// Vault Access Layer — VaultReader, VaultManager, utilities

import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import type { ILogger } from '../logger/index.js'
import type { VaultConfig } from '../config/index.js'

/**
 * Generates a stable vault ID from an absolute path using SHA-256.
 * Returns the first 12 hex characters of the hash of the normalized path.
 */
export function generateVaultId(absolutePath: string): string {
  return crypto.createHash('sha256')
    .update(path.normalize(absolutePath))
    .digest('hex')
    .substring(0, 12)
}

/**
 * Resolves a unique vault name from a directory name.
 * Truncates to 128 characters and appends a numeric suffix if the name
 * already exists in the provided set (e.g. "Vault", "Vault-2", "Vault-3").
 */
export function resolveVaultName(dirName: string, existingNames: Set<string>): string {
  const baseName = dirName.substring(0, 128)
  let candidate = baseName
  let counter = 2
  while (existingNames.has(candidate)) {
    candidate = `${baseName}-${counter++}`
  }
  return candidate
}

/**
 * Custom error thrown when a path traversal attempt is detected.
 */
export class PathTraversalError extends Error {
  constructor(public readonly rawPath: string) {
    super(`Path traversal detected: ${rawPath}`)
    this.name = 'PathTraversalError'
  }
}

/**
 * Checks whether a buffer contains binary content by scanning the first 8 KB for null bytes.
 * Returns true if any null byte is found within the sample window.
 */
export function isBinaryContent(buffer: Buffer): boolean {
  const sampleSize = Math.min(buffer.length, 8192)
  for (let i = 0; i < sampleSize; i++) {
    if (buffer[i] === 0) return true
  }
  return false
}

/**
 * Validates and resolves a raw file path against a vault root directory.
 * URL-decodes the path, normalizes it, rejects absolute paths and null bytes,
 * and ensures the resolved path stays within the vault root.
 * Throws PathTraversalError on any violation.
 */
export function validateFilePath(vaultAbsolutePath: string, rawFilePath: string): string {
  const decoded = decodeURIComponent(rawFilePath)
  const normalized = path.normalize(decoded)

  // Reject absolute paths and null bytes
  if (path.isAbsolute(normalized) || normalized.includes('\0')) {
    throw new PathTraversalError(rawFilePath)
  }

  const resolved = path.resolve(vaultAbsolutePath, normalized)

  // Ensure the resolved path is within the vault root (prefix check with separator)
  if (!resolved.startsWith(vaultAbsolutePath + path.sep)) {
    throw new PathTraversalError(rawFilePath)
  }

  return resolved
}

// --- Data Models ---

export interface DirectoryTree {
  name: string
  type: 'directory' | 'file'
  path: string         // Relative path from vault root
  children?: DirectoryTree[]
  size?: number        // For type === 'file': file size in bytes
  itemCount?: number   // For type === 'directory': count of direct children
}

export interface FileContent {
  path: string         // Relative path from vault root
  name: string
  content: string      // UTF-8 decoded text (empty when isBinary === true)
  size: number         // Original file size in bytes
  encoding: 'utf-8'
  isBinary: boolean
  isTruncated: boolean
}

// --- IVaultReader Interface ---

export interface IVaultReader {
  readDirectory(absolutePath: string, maxDepth: number): Promise<DirectoryTree>
  readFile(absolutePath: string, maxSize: number): Promise<FileContent>
}

// --- VaultReader Implementation ---

export class VaultReader implements IVaultReader {
  /**
   * Recursively reads a directory structure from the filesystem.
   * Sorts entries: directories first, then files, case-insensitive alphabetical.
   * Populates `itemCount` for directories and `size` for files.
   * Stops recursion at `maxDepth` (0 = only the root directory itself, no children).
   */
  async readDirectory(absolutePath: string, maxDepth: number): Promise<DirectoryTree> {
    const rootTree = await this.scanDirectory(absolutePath, absolutePath, maxDepth, 0)
    return rootTree
  }

  /**
   * Reads a file up to `maxSize` bytes.
   * Detects binary content via `isBinaryContent`.
   * Sets `isTruncated` if the file exceeds `maxSize`.
   * Decodes content as UTF-8 (empty string for binary files).
   */
  async readFile(absolutePath: string, maxSize: number): Promise<FileContent> {
    const stat = await fs.stat(absolutePath)
    const fileSize = stat.size
    const isTruncated = fileSize > maxSize
    const bytesToRead = isTruncated ? maxSize : fileSize

    let buffer: Buffer

    if (bytesToRead === 0) {
      buffer = Buffer.alloc(0)
    } else {
      const fileHandle = await fs.open(absolutePath, 'r')
      try {
        buffer = Buffer.alloc(bytesToRead)
        await fileHandle.read(buffer, 0, bytesToRead, 0)
      } finally {
        await fileHandle.close()
      }
    }

    const isBinary = isBinaryContent(buffer)

    return {
      path: path.basename(absolutePath), // Will be overridden by caller with relative path
      name: path.basename(absolutePath),
      content: isBinary ? '' : buffer.toString('utf-8'),
      size: fileSize,
      encoding: 'utf-8',
      isBinary,
      isTruncated,
    }
  }

  private async scanDirectory(
    dirPath: string,
    rootPath: string,
    maxDepth: number,
    currentDepth: number,
  ): Promise<DirectoryTree> {
    const dirName = path.basename(dirPath)
    const relativePath = path.relative(rootPath, dirPath)

    const node: DirectoryTree = {
      name: dirName,
      type: 'directory',
      path: relativePath || '',
    }

    // If we've reached maxDepth, don't recurse into children
    if (currentDepth >= maxDepth) {
      // Still read the directory to get itemCount
      try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true })
        node.itemCount = entries.length
      } catch {
        node.itemCount = 0
      }
      return node
    }

    const entries = await fs.readdir(dirPath, { withFileTypes: true })
    const children: DirectoryTree[] = []

    // Separate directories and files
    const directories: { name: string; dirent: import('node:fs').Dirent }[] = []
    const files: { name: string; dirent: import('node:fs').Dirent }[] = []

    for (const entry of entries) {
      if (entry.isDirectory()) {
        directories.push({ name: entry.name, dirent: entry })
      } else if (entry.isFile()) {
        files.push({ name: entry.name, dirent: entry })
      }
    }

    // Sort: case-insensitive alphabetical
    const caseInsensitiveSort = (a: { name: string }, b: { name: string }) =>
      a.name.toLowerCase().localeCompare(b.name.toLowerCase())

    directories.sort(caseInsensitiveSort)
    files.sort(caseInsensitiveSort)

    // Process directories first
    for (const dir of directories) {
      const childPath = path.join(dirPath, dir.name)
      const childTree = await this.scanDirectory(childPath, rootPath, maxDepth, currentDepth + 1)
      children.push(childTree)
    }

    // Then process files
    for (const file of files) {
      const filePath = path.join(dirPath, file.name)
      const relativFilePath = path.relative(rootPath, filePath)
      try {
        const stat = await fs.stat(filePath)
        children.push({
          name: file.name,
          type: 'file',
          path: relativFilePath,
          size: stat.size,
        })
      } catch {
        // Skip files that can't be stat'd
        children.push({
          name: file.name,
          type: 'file',
          path: relativFilePath,
          size: 0,
        })
      }
    }

    node.children = children
    node.itemCount = entries.length

    return node
  }
}

// --- Vault Data Models ---

export interface VaultInfo {
  id: string           // SHA-256-Hash (12 Hex-Zeichen) des normalisierten Pfades
  name: string         // Aus Verzeichnisname abgeleitet, max. 128 Zeichen, eindeutig
  path: string         // Absoluter Pfad (nur intern, nicht in API-Response)
  status: 'loaded' | 'error'
  errorMessage?: string
}

export interface Vault {
  info: VaultInfo
  tree: DirectoryTree  // In-Memory-Cache der Verzeichnisstruktur
}

// --- IVaultManager Interface ---

export interface IVaultManager {
  loadVaults(configs: VaultConfig[]): Promise<void>
  getVault(vaultId: string): Vault | null
  getAllVaults(): Vault[]
  addVault(vault: Vault): void
  removeVault(vaultId: string): void
}

// --- VaultManager Implementation ---

export class VaultManager implements IVaultManager {
  private readonly vaults: Map<string, Vault> = new Map()

  constructor(
    private readonly vaultReader: IVaultReader,
    private readonly logger: ILogger,
    private readonly maxDepth: number,
  ) {}

  /**
   * Loads vaults from the provided configurations.
   * For each config: validates path exists, generates ID, resolves name (deduplication),
   * reads directory tree, and stores the Vault in memory.
   * On error: logs and skips (graceful degradation).
   * Logs a warning if no vaults are configured.
   */
  async loadVaults(configs: VaultConfig[]): Promise<void> {
    if (configs.length === 0) {
      this.logger.warn('No vaults configured')
      return
    }

    const existingNames = new Set<string>()

    for (const config of configs) {
      const absolutePath = path.resolve(config.path)

      try {
        // 1. Validate path exists
        await fs.access(absolutePath)

        // 2. Generate stable vault ID
        const id = generateVaultId(absolutePath)

        // 3. Resolve unique name (use config.name override or directory basename)
        const dirName = config.name ?? path.basename(absolutePath)
        const name = resolveVaultName(dirName, existingNames)
        existingNames.add(name)

        // 4. Read directory tree
        const tree = await this.vaultReader.readDirectory(absolutePath, this.maxDepth)

        // 5. Store vault
        const vault: Vault = {
          info: {
            id,
            name,
            path: absolutePath,
            status: 'loaded',
          },
          tree,
        }

        this.vaults.set(id, vault)
        this.logger.info('Vault loaded', { vaultId: id, name, path: absolutePath })
      } catch (error) {
        // Graceful degradation: log error and skip this vault
        const message = error instanceof Error ? error.message : String(error)
        this.logger.error('Failed to load vault', { path: absolutePath, error: message })
      }
    }
  }

  /**
   * Adds a vault to the in-memory map.
   * Used by VaultService when creating new vaults dynamically.
   */
  addVault(vault: Vault): void {
    this.vaults.set(vault.info.id, vault)
    this.logger.info('Vault added to manager', { vaultId: vault.info.id, name: vault.info.name })
  }

  /**
   * Removes a vault from the in-memory map.
   * Used by VaultService when deleting vaults.
   */
  removeVault(vaultId: string): void {
    this.vaults.delete(vaultId)
    this.logger.info('Vault removed from manager', { vaultId })
  }

  /**
   * Returns a vault by its ID, or null if not found.
   */
  getVault(vaultId: string): Vault | null {
    return this.vaults.get(vaultId) ?? null
  }

  /**
   * Returns all successfully loaded vaults.
   */
  getAllVaults(): Vault[] {
    return Array.from(this.vaults.values())
  }
}
