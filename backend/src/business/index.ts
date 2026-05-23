// Business Logic Layer — VaultService

import fs from 'node:fs/promises'
import path from 'node:path'
import type { IConfigService } from '../config/index.js'
import type { ILogger } from '../logger/index.js'
import type {
  IVaultManager,
  IVaultReader,
  VaultInfo,
  DirectoryTree,
  FileContent,
} from '../vault/index.js'
import { validateFilePath, generateVaultId } from '../vault/index.js'
import type { IVaultRegistry } from '../vault/registry.js'
import { validateVaultName } from './validation.js'

// --- Custom Errors ---

/**
 * Thrown when a vault with the given ID cannot be found.
 */
export class VaultNotFoundError extends Error {
  constructor(public readonly vaultId: string) {
    super(`Vault not found: ${vaultId}`)
    this.name = 'VaultNotFoundError'
  }
}

/**
 * Thrown when vault name validation fails.
 */
export class VaultValidationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'VaultValidationError'
  }
}

/**
 * Thrown when a filesystem/storage operation fails.
 */
export class StorageError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'StorageError'
  }
}

/**
 * Thrown when file content exceeds the configured maximum file size.
 */
export class FileTooLargeError extends Error {
  constructor(
    public readonly actualSize: number,
    public readonly maxSize: number,
  ) {
    super(`File content exceeds maximum size: ${actualSize} bytes (max: ${maxSize} bytes)`)
    this.name = 'FileTooLargeError'
  }
}

// --- Types ---

export interface FileSaveResult {
  path: string    // relative path from vault root
  name: string    // filename
  size: number    // written file size in bytes
}

// --- Interface ---

export interface IVaultService {
  initializeVaults(): Promise<void>
  getVaultList(): VaultInfo[]
  getVaultTree(vaultId: string): DirectoryTree
  getFileContent(vaultId: string, filePath: string): Promise<FileContent>
  resolveFilePath(vaultId: string, filePath: string): string
  saveFile(vaultId: string, filePath: string, content: string): Promise<FileSaveResult>
  createVault(name: string): Promise<VaultInfo>
  deleteVault(vaultId: string): Promise<void>
  deleteContent(vaultId: string, relativePath: string): Promise<void>
}

// --- Implementation ---

export class VaultService implements IVaultService {
  constructor(
    private readonly vaultManager: IVaultManager,
    private readonly vaultReader: IVaultReader,
    private readonly configService: IConfigService,
    private readonly logger: ILogger,
    private readonly registry?: IVaultRegistry,
  ) {}

  /**
   * Initializes vaults on startup.
   *
   * If a VaultRegistry is configured, loads vault entries from the registry,
   * verifies each storage directory exists, reads the directory tree, and adds
   * valid vaults to VaultManager's in-memory map. Missing directories are
   * skipped with a warning log.
   *
   * Falls back to static config loading (via IVaultManager.loadVaults) when
   * no registry is configured, maintaining backward compatibility.
   */
  async initializeVaults(): Promise<void> {
    if (!this.registry) {
      // Backward compatibility: no registry configured, use static config
      const configs = this.configService.getVaultConfigs()
      await this.vaultManager.loadVaults(configs)
      return
    }

    const entries = await this.registry.load()

    if (entries.length === 0) {
      this.logger.info('Vault registry is empty, no vaults to load')
      return
    }

    const maxDepth = this.configService.getServerConfig().maxDirectoryDepth

    for (const entry of entries) {
      try {
        await fs.access(entry.storagePath)
      } catch {
        this.logger.warn('Vault storage directory not found, skipping vault', {
          vaultId: entry.id,
          name: entry.name,
          storagePath: entry.storagePath,
        })
        continue
      }

      try {
        const tree = await this.vaultReader.readDirectory(entry.storagePath, maxDepth)

        const vaultInfo: VaultInfo = {
          id: entry.id,
          name: entry.name,
          path: entry.storagePath,
          status: 'loaded',
        }

        this.vaultManager.addVault({ info: vaultInfo, tree })

        this.logger.info('Vault loaded from registry', {
          vaultId: entry.id,
          name: entry.name,
          path: entry.storagePath,
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        this.logger.error('Failed to load vault from registry', {
          vaultId: entry.id,
          name: entry.name,
          path: entry.storagePath,
          error: message,
        })
      }
    }
  }

  /**
   * Returns VaultInfo[] from all loaded vaults.
   */
  getVaultList(): VaultInfo[] {
    return this.vaultManager.getAllVaults().map((vault) => vault.info)
  }

  /**
   * Retrieves the cached directory tree for a vault.
   * Throws VaultNotFoundError if the vault does not exist.
   */
  getVaultTree(vaultId: string): DirectoryTree {
    const vault = this.vaultManager.getVault(vaultId)
    if (!vault) {
      throw new VaultNotFoundError(vaultId)
    }
    return vault.tree
  }

  /**
   * Resolves and validates a file path within a vault.
   * Returns the absolute path to the file on disk.
   * Throws VaultNotFoundError if vault doesn't exist.
   * Throws PathTraversalError if path traversal is detected.
   */
  resolveFilePath(vaultId: string, filePath: string): string {
    const vault = this.vaultManager.getVault(vaultId)
    if (!vault) {
      throw new VaultNotFoundError(vaultId)
    }
    return validateFilePath(vault.info.path, filePath)
  }

  /**
   * Reads file content from a vault.
   * Validates the vault exists, validates the file path against traversal,
   * then reads the file via IVaultReader.
   */
  async getFileContent(vaultId: string, filePath: string): Promise<FileContent> {
    const vault = this.vaultManager.getVault(vaultId)
    if (!vault) {
      throw new VaultNotFoundError(vaultId)
    }

    const resolvedPath = validateFilePath(vault.info.path, filePath)
    const maxFileSize = this.configService.getServerConfig().maxFileSize

    this.logger.debug('Reading file', { vaultId, filePath, resolvedPath })

    const fileContent = await this.vaultReader.readFile(resolvedPath, maxFileSize)

    // Override path with the relative path from vault root
    fileContent.path = filePath

    return fileContent
  }

  /**
   * Saves file content to a vault.
   * 1. Validates vault exists (throws VaultNotFoundError if not)
   * 2. Validates file path with validateFilePath (throws PathTraversalError if traversal detected)
   * 3. Checks content size against maxFileSize (throws FileTooLargeError if exceeded)
   * 4. Creates intermediate directories with fs.mkdir(recursive: true)
   * 5. Writes content atomically: write to temp file, then rename
   * 6. Refreshes the vault's in-memory directory tree
   * 7. Returns { path, name, size }
   */
  async saveFile(vaultId: string, filePath: string, content: string): Promise<FileSaveResult> {
    // 1. Validate vault exists
    const vault = this.vaultManager.getVault(vaultId)
    if (!vault) {
      throw new VaultNotFoundError(vaultId)
    }

    // 2. Validate file path (path traversal protection)
    const resolvedPath = validateFilePath(vault.info.path, filePath)

    // 3. Check content size against maxFileSize
    const contentBytes = Buffer.byteLength(content, 'utf-8')
    const maxFileSize = this.configService.getServerConfig().maxFileSize
    if (contentBytes > maxFileSize) {
      throw new FileTooLargeError(contentBytes, maxFileSize)
    }

    // 4. Create intermediate directories
    const dir = path.dirname(resolvedPath)
    await fs.mkdir(dir, { recursive: true })

    // 5. Atomic write: write to temp file, then rename
    const tempPath = `${resolvedPath}.${Date.now()}.tmp`
    try {
      await fs.writeFile(tempPath, content, 'utf-8')
      await fs.rename(tempPath, resolvedPath)
    } catch (error) {
      // Clean up temp file on failure
      try {
        await fs.unlink(tempPath)
      } catch {
        // Temp file may not exist if writeFile failed
      }
      const message = error instanceof Error ? error.message : String(error)
      this.logger.error('Failed to save file', { vaultId, filePath, error: message })
      throw new StorageError(`Failed to write file: ${message}`)
    }

    // 6. Refresh the vault's in-memory directory tree
    const updatedTree = await this.vaultReader.readDirectory(
      vault.info.path,
      this.configService.getServerConfig().maxDirectoryDepth,
    )
    this.vaultManager.addVault({
      info: vault.info,
      tree: updatedTree,
    })

    this.logger.info('File saved', { vaultId, filePath, size: contentBytes })

    // 7. Return result
    return {
      path: filePath,
      name: path.basename(filePath),
      size: contentBytes,
    }
  }

  /**
   * Creates a new vault with the given name.
   * 1. Validates the name using the validation module
   * 2. Generates a vault ID from the storage path
   * 3. Creates the vault storage directory
   * 4. Adds entry to VaultRegistry
   * 5. Loads the vault into VaultManager's in-memory map
   *
   * Atomicity guarantees:
   * - On filesystem failure: do not add to registry
   * - On registry failure after mkdir: remove the created directory
   */
  async createVault(name: string): Promise<VaultInfo> {
    if (!this.registry) {
      throw new StorageError('VaultRegistry is not configured')
    }

    // 1. Validate name
    const existingNames = this.vaultManager.getAllVaults().map((v) => v.info.name)
    const validationResult = validateVaultName(name, existingNames)

    if (!validationResult.valid) {
      throw new VaultValidationError(validationResult.code, validationResult.message)
    }

    // 2. Compute storage path and generate vault ID
    const dataDir = this.configService.getServerConfig().dataDir
    const resolvedDataDir = path.resolve(dataDir)
    const vaultsDir = path.join(resolvedDataDir, 'vaults')

    // Generate a unique storage path using timestamp + random, then derive the vault ID from it.
    // Per design: directory is named by vault ID (<dataDir>/vaults/<vaultId>/)
    const tempDirName = `${Date.now()}-${Math.random().toString(36).substring(2, 10)}`
    const tempPath = path.join(vaultsDir, tempDirName)
    const vaultId = generateVaultId(tempPath)

    // Use the vault ID as the directory name (per design: <dataDir>/vaults/<vaultId>/)
    const finalStoragePath = path.join(vaultsDir, vaultId)

    // 3. Create vault storage directory
    try {
      await fs.mkdir(finalStoragePath, { recursive: true })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.logger.error('Failed to create vault directory', { path: finalStoragePath, error: message })
      throw new StorageError(`Failed to create vault storage directory: ${message}`)
    }

    // 4. Add entry to VaultRegistry
    const registryEntry = {
      id: vaultId,
      name,
      storagePath: finalStoragePath,
      createdAt: new Date().toISOString(),
    }

    try {
      await this.registry.addEntry(registryEntry)
    } catch (error) {
      // Atomicity: remove the created directory on registry failure
      this.logger.error('Failed to add vault to registry, rolling back directory creation', {
        vaultId,
        error: error instanceof Error ? error.message : String(error),
      })
      try {
        await fs.rm(finalStoragePath, { recursive: true, force: true })
      } catch (cleanupError) {
        this.logger.error('Failed to clean up vault directory after registry failure', {
          path: finalStoragePath,
          error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
        })
      }
      throw new StorageError('Failed to persist vault metadata')
    }

    // 5. Load vault into VaultManager's in-memory map
    const tree = await this.vaultReader.readDirectory(finalStoragePath, this.configService.getServerConfig().maxDirectoryDepth)

    const vaultInfo: VaultInfo = {
      id: vaultId,
      name,
      path: finalStoragePath,
      status: 'loaded',
    }

    this.vaultManager.addVault({
      info: vaultInfo,
      tree,
    })

    this.logger.info('Vault created', { vaultId, name, path: finalStoragePath })

    return vaultInfo
  }

  /**
   * Deletes a vault by its ID.
   * 1. Verifies the vault exists (throws VaultNotFoundError if not)
   * 2. Removes the vault storage directory recursively
   * 3. Only after successful directory removal: removes entry from VaultRegistry and VaultManager
   *
   * Atomicity guarantees:
   * - On filesystem failure: do NOT remove from registry, throw error
   */
  async deleteVault(vaultId: string): Promise<void> {
    if (!this.registry) {
      throw new StorageError('VaultRegistry is not configured')
    }

    // 1. Verify vault exists
    const vault = this.vaultManager.getVault(vaultId)
    if (!vault) {
      throw new VaultNotFoundError(vaultId)
    }

    const storagePath = vault.info.path

    // 2. Remove vault storage directory recursively
    try {
      await fs.rm(storagePath, { recursive: true, force: true })
    } catch (error) {
      // On filesystem failure: do NOT remove from registry
      const message = error instanceof Error ? error.message : String(error)
      this.logger.error('Failed to remove vault directory', { vaultId, path: storagePath, error: message })
      throw new StorageError(`Failed to remove vault storage directory: ${message}`)
    }

    // 3. Only after successful directory removal: remove from registry and manager
    try {
      await this.registry.removeEntry(vaultId)
    } catch (error) {
      // Log but don't throw — directory is already gone, best-effort registry cleanup
      this.logger.error('Failed to remove vault from registry after directory deletion', {
        vaultId,
        error: error instanceof Error ? error.message : String(error),
      })
    }

    this.vaultManager.removeVault(vaultId)

    this.logger.info('Vault deleted', { vaultId, path: storagePath })
  }

  /**
   * Deletes a file or folder within a vault.
   * 1. Verifies the vault exists (throws VaultNotFoundError if not)
   * 2. Validates the path using validateFilePath (path traversal protection)
   * 3. Checks if the path exists on the filesystem (throws ENOENT error if not)
   * 4. Removes the file or folder recursively
   * 5. Refreshes the vault's in-memory directory tree
   */
  async deleteContent(vaultId: string, relativePath: string): Promise<void> {
    // 1. Verify vault exists
    const vault = this.vaultManager.getVault(vaultId)
    if (!vault) {
      throw new VaultNotFoundError(vaultId)
    }

    // 2. Validate path (path traversal protection)
    const resolvedPath = validateFilePath(vault.info.path, relativePath)

    // 3. Check if path exists on filesystem
    try {
      await fs.access(resolvedPath)
    } catch {
      const error = new Error(`File or folder not found at path: ${relativePath}`)
      ;(error as NodeJS.ErrnoException).code = 'ENOENT'
      throw error
    }

    // 4. Remove the file or folder recursively
    await fs.rm(resolvedPath, { recursive: true })

    // 5. Refresh the vault's in-memory directory tree
    const updatedTree = await this.vaultReader.readDirectory(
      vault.info.path,
      this.configService.getServerConfig().maxDirectoryDepth,
    )

    this.vaultManager.addVault({
      info: vault.info,
      tree: updatedTree,
    })

    this.logger.info('Content deleted', { vaultId, path: relativePath, resolvedPath })
  }
}
