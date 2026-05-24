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
import { validateFilePath, generateVaultId, computeEtag } from '../vault/index.js'
import type { IVaultRegistry, IVaultShareRegistry, VaultShareEntry } from '../vault/registry.js'
import type { IUserRepository } from '../user/index.js'
import type { IAuditService } from '../audit/index.js'
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

/**
 * Thrown when an ETag-based conflict is detected during file save.
 * The client's If-Match header does not match the current file's ETag.
 */
export class ConflictError extends Error {
  constructor(
    public readonly currentEtag: string,
    public readonly providedEtag: string,
  ) {
    super('File has been modified by another session')
    this.name = 'ConflictError'
  }
}

/**
 * Thrown when trying to delete a vault that has active shares.
 */
export class VaultHasActiveSharesError extends Error {
  constructor(
    public readonly vaultId: string,
    public readonly activeShares: VaultShareEntry[],
  ) {
    super(`Vault ${vaultId} has ${activeShares.length} active share(s) and cannot be deleted`)
    this.name = 'VaultHasActiveSharesError'
  }
}

/**
 * Thrown when trying to transfer ownership but other shares still exist.
 */
export class SharesNotRevokedError extends Error {
  constructor(
    public readonly vaultId: string,
    public readonly remainingShares: VaultShareEntry[],
  ) {
    super(`Cannot transfer ownership of vault ${vaultId}: ${remainingShares.length} share(s) must be revoked first`)
    this.name = 'SharesNotRevokedError'
  }
}

/**
 * Thrown when a user does not have the required access to a vault.
 */
export class VaultAccessDeniedError extends Error {
  constructor(
    public readonly vaultId: string,
    public readonly userId: string,
    public readonly requiredPermission: 'read' | 'write',
  ) {
    super(`Access denied: user ${userId} does not have ${requiredPermission} access to vault ${vaultId}`)
    this.name = 'VaultAccessDeniedError'
  }
}

/**
 * Thrown when the maximum number of shares per vault has been reached.
 */
export class ShareLimitError extends Error {
  constructor(
    public readonly vaultId: string,
    public readonly maxShares: number,
  ) {
    super(`Share limit reached: vault ${vaultId} already has ${maxShares} shares`)
    this.name = 'ShareLimitError'
  }
}

/**
 * Thrown when a share target is invalid (non-existent user or self-share).
 */
export class InvalidShareTargetError extends Error {
  constructor(
    public readonly code: 'USER_NOT_FOUND' | 'SELF_SHARE',
    message: string,
  ) {
    super(message)
    this.name = 'InvalidShareTargetError'
  }
}

// --- Types ---

export interface FileSaveResult {
  path: string    // relative path from vault root
  name: string    // filename
  size: number    // written file size in bytes
  etag: string    // SHA-256 first 16 hex chars of saved content
}

// --- Interface ---

export interface IVaultService {
  initializeVaults(): Promise<void>
  getVaultList(): VaultInfo[]
  getVaultTree(vaultId: string): DirectoryTree
  getFileContent(vaultId: string, filePath: string): Promise<FileContent>
  resolveFilePath(vaultId: string, filePath: string): string
  saveFile(vaultId: string, filePath: string, content: string, ifMatch?: string): Promise<FileSaveResult>
  createVault(name: string): Promise<VaultInfo>
  deleteVault(vaultId: string): Promise<void>
  deleteVaultWithChecks(vaultId: string, ownerId: string, force?: boolean): Promise<void>
  transferOwnership(vaultId: string, currentOwnerId: string, newOwnerId: string): Promise<void>
  deleteContent(vaultId: string, relativePath: string): Promise<void>
}

/** Maximum number of shares allowed per vault. */
export const MAX_SHARES_PER_VAULT = 20

/**
 * Interface for vault access control operations.
 * Manages ownership checks, share-based permissions, and share lifecycle.
 */
export interface IVaultAccessControl {
  /** Checks if the user has read access to the vault. Throws VaultAccessDeniedError if denied. */
  checkReadAccess(vaultId: string, userId: string): Promise<void>

  /** Checks if the user has write access to the vault. Throws VaultAccessDeniedError if denied. */
  checkWriteAccess(vaultId: string, userId: string): Promise<void>

  /** Creates a share for a target user on a vault owned by ownerId. */
  createShare(vaultId: string, ownerId: string, targetUserId: string, permission: 'read' | 'write'): Promise<void>

  /** Revokes a share for a target user on a vault owned by ownerId. */
  revokeShare(vaultId: string, ownerId: string, targetUserId: string): Promise<void>

  /** Updates the permission level of an existing share. */
  updateSharePermission(vaultId: string, ownerId: string, targetUserId: string, permission: 'read' | 'write'): Promise<void>
}

// --- Implementation ---

export class VaultService implements IVaultService {
  constructor(
    private readonly vaultManager: IVaultManager,
    private readonly vaultReader: IVaultReader,
    private readonly configService: IConfigService,
    private readonly logger: ILogger,
    private readonly registry?: IVaultRegistry,
    private readonly shareRegistry?: IVaultShareRegistry,
    private readonly userRepository?: IUserRepository,
    private readonly auditService?: IAuditService,
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
   * 3. If ifMatch is provided, checks current file's ETag (throws ConflictError on mismatch)
   * 4. Checks content size against maxFileSize (throws FileTooLargeError if exceeded)
   * 5. Creates intermediate directories with fs.mkdir(recursive: true)
   * 6. Writes content atomically: write to temp file, then rename
   * 7. Refreshes the vault's in-memory directory tree
   * 8. Returns { path, name, size, etag }
   */
  async saveFile(vaultId: string, filePath: string, content: string, ifMatch?: string): Promise<FileSaveResult> {
    // 1. Validate vault exists
    const vault = this.vaultManager.getVault(vaultId)
    if (!vault) {
      throw new VaultNotFoundError(vaultId)
    }

    // 2. Validate file path (path traversal protection)
    const resolvedPath = validateFilePath(vault.info.path, filePath)

    // 3. ETag conflict detection (only if If-Match header was provided)
    if (ifMatch !== undefined) {
      try {
        const existingContent = await fs.readFile(resolvedPath)
        const currentEtag = computeEtag(existingContent)
        if (ifMatch !== currentEtag) {
          throw new ConflictError(currentEtag, ifMatch)
        }
      } catch (error) {
        if (error instanceof ConflictError) {
          throw error
        }
        // File doesn't exist yet — no conflict possible, proceed with save
      }
    }

    // 4. Check content size against maxFileSize
    const contentBytes = Buffer.byteLength(content, 'utf-8')
    const maxFileSize = this.configService.getServerConfig().maxFileSize
    if (contentBytes > maxFileSize) {
      throw new FileTooLargeError(contentBytes, maxFileSize)
    }

    // 5. Create intermediate directories
    const dir = path.dirname(resolvedPath)
    await fs.mkdir(dir, { recursive: true })

    // 6. Atomic write: write to temp file, then rename
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

    // 7. Refresh the vault's in-memory directory tree
    const updatedTree = await this.vaultReader.readDirectory(
      vault.info.path,
      this.configService.getServerConfig().maxDirectoryDepth,
    )
    this.vaultManager.addVault({
      info: vault.info,
      tree: updatedTree,
    })

    // 8. Compute ETag of saved content
    const savedBuffer = Buffer.from(content, 'utf-8')
    const etag = computeEtag(savedBuffer)

    this.logger.info('File saved', { vaultId, filePath, size: contentBytes })

    return {
      path: filePath,
      name: path.basename(filePath),
      size: contentBytes,
      etag,
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
   * Deletes a vault with ownership and share checks.
   *
   * If force=false (default) and the vault has active shares, throws
   * VaultHasActiveSharesError with the list of active shares.
   *
   * If force=true, revokes all shares first, then deletes the vault.
   *
   * Validates that the caller is the vault owner before proceeding.
   */
  async deleteVaultWithChecks(vaultId: string, ownerId: string, force?: boolean): Promise<void> {
    if (!this.registry) {
      throw new StorageError('VaultRegistry is not configured')
    }
    if (!this.shareRegistry) {
      throw new StorageError('VaultShareRegistry is not configured')
    }

    // Verify vault exists
    const vault = this.vaultManager.getVault(vaultId)
    if (!vault) {
      throw new VaultNotFoundError(vaultId)
    }

    // Verify ownership via registry
    await this.registry.load()
    const entry = this.registry.findById(vaultId)
    if (!entry || entry.ownerId !== ownerId) {
      throw new VaultNotFoundError(vaultId)
    }

    // Check for active shares
    const shares = await this.shareRegistry.getSharesForVault(vaultId)

    if (shares.length > 0 && !force) {
      throw new VaultHasActiveSharesError(vaultId, shares)
    }

    // If force=true, revoke all shares first
    if (shares.length > 0 && force) {
      await this.shareRegistry.removeAllSharesForVault(vaultId)
      this.logger.info('All shares revoked for forced vault deletion', { vaultId, revokedCount: shares.length })
    }

    // Proceed with actual deletion
    await this.deleteVault(vaultId)
  }

  /**
   * Transfers ownership of a vault to a new owner.
   *
   * Preconditions:
   * - Caller must be the current owner
   * - All shares except to the new owner must be revoked first
   * - New owner must exist
   *
   * After transfer:
   * - Registry entry ownerId is updated to newOwnerId
   * - Old owner loses all access (any share to old owner is removed)
   * - New owner gets full control as the vault owner
   */
  async transferOwnership(vaultId: string, currentOwnerId: string, newOwnerId: string): Promise<void> {
    if (!this.registry) {
      throw new StorageError('VaultRegistry is not configured')
    }
    if (!this.shareRegistry) {
      throw new StorageError('VaultShareRegistry is not configured')
    }
    if (!this.userRepository) {
      throw new StorageError('UserRepository is not configured')
    }

    // Verify vault exists
    const vault = this.vaultManager.getVault(vaultId)
    if (!vault) {
      throw new VaultNotFoundError(vaultId)
    }

    // Verify current ownership via registry
    const entries = await this.registry.load()
    const entry = entries.find((e) => e.id === vaultId)
    if (!entry || entry.ownerId !== currentOwnerId) {
      throw new VaultNotFoundError(vaultId)
    }

    // Verify new owner exists
    const newOwner = await this.userRepository.findById(newOwnerId)
    if (!newOwner) {
      throw new VaultValidationError('USER_NOT_FOUND', `Target user not found: ${newOwnerId}`)
    }

    // Check that all shares except to the new owner are revoked
    const shares = await this.shareRegistry.getSharesForVault(vaultId)
    const remainingShares = shares.filter((s) => s.userId !== newOwnerId)
    if (remainingShares.length > 0) {
      throw new SharesNotRevokedError(vaultId, remainingShares)
    }

    // Transfer ownership: update registry entry
    entry.ownerId = newOwnerId
    await this.registry.save(entries)

    // Remove any share the new owner had (they are now the owner, no share needed)
    const newOwnerShare = shares.find((s) => s.userId === newOwnerId)
    if (newOwnerShare) {
      await this.shareRegistry.removeShare(vaultId, newOwnerId)
    }

    // Revoke old owner access (remove any share that might exist for old owner)
    await this.shareRegistry.removeShare(vaultId, currentOwnerId)

    this.logger.info('Vault ownership transferred', {
      vaultId,
      fromOwner: currentOwnerId,
      toOwner: newOwnerId,
    })

    await this.auditService?.log({
      userId: currentOwnerId,
      action: 'VAULT_OWNERSHIP_TRANSFERRED',
      target: vaultId,
      ipAddress: '0.0.0.0',
      success: true,
      details: JSON.stringify({ fromOwner: currentOwnerId, toOwner: newOwnerId }),
    })
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


// --- Vault Access Control Implementation ---

/**
 * Service that enforces vault access control based on ownership and share permissions.
 *
 * Access rules:
 * - Owner has full read/write access to their vault.
 * - Users with a "read" share can only read; write attempts are rejected.
 * - Users with a "write" share can read and write.
 * - Users without ownership or a share are rejected for any access.
 *
 * Share rules:
 * - Max 20 shares per vault.
 * - Cannot share with self.
 * - Cannot share with non-existent users.
 */
export class VaultAccessControlService implements IVaultAccessControl {
  constructor(
    private readonly vaultRegistry: IVaultRegistry,
    private readonly shareRegistry: IVaultShareRegistry,
    private readonly userRepository: IUserRepository,
    private readonly logger: ILogger,
    private readonly auditService?: IAuditService,
  ) {}

  /**
   * Checks if the user has read access to the vault.
   * Owner always has read access. Users with "read" or "write" shares have read access.
   * Throws VaultAccessDeniedError if the user has no access.
   * Throws VaultNotFoundError if the vault does not exist in the registry.
   */
  async checkReadAccess(vaultId: string, userId: string): Promise<void> {
    const entry = this.vaultRegistry.findById(vaultId)
    if (entry === null) {
      throw new VaultNotFoundError(vaultId)
    }

    // Owner has full access
    if (entry.ownerId === userId) {
      return
    }

    // Check shares
    const shares = await this.shareRegistry.getSharesForVault(vaultId)
    const userShare = shares.find((s) => s.userId === userId)

    if (userShare === undefined) {
      throw new VaultAccessDeniedError(vaultId, userId, 'read')
    }

    // Both "read" and "write" shares grant read access
    return
  }

  /**
   * Checks if the user has write access to the vault.
   * Owner always has write access. Only users with "write" shares have write access.
   * Throws VaultAccessDeniedError if the user lacks write permission.
   * Throws VaultNotFoundError if the vault does not exist in the registry.
   */
  async checkWriteAccess(vaultId: string, userId: string): Promise<void> {
    const entry = this.vaultRegistry.findById(vaultId)
    if (entry === null) {
      throw new VaultNotFoundError(vaultId)
    }

    // Owner has full access
    if (entry.ownerId === userId) {
      return
    }

    // Check shares
    const shares = await this.shareRegistry.getSharesForVault(vaultId)
    const userShare = shares.find((s) => s.userId === userId)

    if (userShare === undefined) {
      throw new VaultAccessDeniedError(vaultId, userId, 'write')
    }

    if (userShare.permission !== 'write') {
      throw new VaultAccessDeniedError(vaultId, userId, 'write')
    }

    return
  }

  /**
   * Creates a share for a target user on a vault.
   * Validates:
   * - Target user is not the owner (no self-share).
   * - Target user exists in the user repository.
   * - Vault has not exceeded the maximum share limit (20).
   *
   * Throws InvalidShareTargetError if target is self or non-existent.
   * Throws ShareLimitError if the vault already has 20 shares.
   * Throws VaultNotFoundError if the vault does not exist in the registry.
   */
  async createShare(vaultId: string, ownerId: string, targetUserId: string, permission: 'read' | 'write'): Promise<void> {
    // Validate vault exists
    const entry = this.vaultRegistry.findById(vaultId)
    if (entry === null) {
      throw new VaultNotFoundError(vaultId)
    }

    // Reject self-share
    if (ownerId === targetUserId) {
      throw new InvalidShareTargetError('SELF_SHARE', 'Cannot share a vault with yourself')
    }

    // Validate target user exists
    const targetUser = await this.userRepository.findById(targetUserId)
    if (targetUser === null) {
      throw new InvalidShareTargetError('USER_NOT_FOUND', `Target user not found: ${targetUserId}`)
    }

    // Check share limit
    const existingShares = await this.shareRegistry.getSharesForVault(vaultId)
    if (existingShares.length >= MAX_SHARES_PER_VAULT) {
      throw new ShareLimitError(vaultId, MAX_SHARES_PER_VAULT)
    }

    // Create the share entry
    const shareEntry: VaultShareEntry = {
      vaultId,
      userId: targetUserId,
      permission,
      grantedBy: ownerId,
      grantedAt: new Date().toISOString(),
    }

    await this.shareRegistry.addShare(shareEntry)

    this.logger.info('Vault share created', {
      vaultId,
      ownerId,
      targetUserId,
      permission,
    })

    await this.auditService?.log({
      userId: ownerId,
      action: 'VAULT_SHARE_CREATED',
      target: vaultId,
      ipAddress: '0.0.0.0',
      success: true,
      details: JSON.stringify({ targetUserId, permission }),
    })
  }

  /**
   * Revokes a share for a target user on a vault.
   * Throws VaultNotFoundError if the vault does not exist in the registry.
   */
  async revokeShare(vaultId: string, ownerId: string, targetUserId: string): Promise<void> {
    const entry = this.vaultRegistry.findById(vaultId)
    if (entry === null) {
      throw new VaultNotFoundError(vaultId)
    }

    await this.shareRegistry.removeShare(vaultId, targetUserId)

    this.logger.info('Vault share revoked', {
      vaultId,
      ownerId,
      targetUserId,
    })

    await this.auditService?.log({
      userId: ownerId,
      action: 'VAULT_SHARE_REVOKED',
      target: vaultId,
      ipAddress: '0.0.0.0',
      success: true,
      details: JSON.stringify({ targetUserId }),
    })
  }

  /**
   * Updates the permission level of an existing share.
   * Throws VaultNotFoundError if the vault does not exist in the registry.
   */
  async updateSharePermission(vaultId: string, ownerId: string, targetUserId: string, permission: 'read' | 'write'): Promise<void> {
    const entry = this.vaultRegistry.findById(vaultId)
    if (entry === null) {
      throw new VaultNotFoundError(vaultId)
    }

    await this.shareRegistry.updatePermission(vaultId, targetUserId, permission)

    this.logger.info('Vault share permission updated', {
      vaultId,
      ownerId,
      targetUserId,
      permission,
    })

    await this.auditService?.log({
      userId: ownerId,
      action: 'VAULT_SHARE_UPDATED',
      target: vaultId,
      ipAddress: '0.0.0.0',
      success: true,
      details: JSON.stringify({ targetUserId, permission }),
    })
  }
}
