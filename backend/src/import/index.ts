// Import Service — handles file and folder import into vaults

import fs from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { createWriteStream } from 'node:fs'
import type { ILogger } from '../logger/index.js'
import type { IConfigService } from '../config/index.js'
import type { IVaultManager, IVaultReader } from '../vault/index.js'
import { VaultNotFoundError } from '../business/index.js'

// --- Custom Errors ---

/**
 * Thrown when a filename is invalid (empty, too long, or contains path separators).
 */
export class InvalidFilenameError extends Error {
  public readonly code = 'INVALID_FILENAME'

  constructor(message: string) {
    super(message)
    this.name = 'InvalidFilenameError'
  }
}

/**
 * Thrown when a file exceeds the maximum allowed size.
 */
export class FileTooLargeError extends Error {
  public readonly code = 'FILE_TOO_LARGE'

  constructor(message: string) {
    super(message)
    this.name = 'FileTooLargeError'
  }
}

/**
 * Thrown when a file or folder with the same name already exists at the target location.
 */
export class FileConflictError extends Error {
  public readonly code = 'FILE_CONFLICT'

  constructor(message: string) {
    super(message)
    this.name = 'FileConflictError'
  }
}

/**
 * Thrown when a folder import exceeds the maximum nesting depth.
 */
export class DepthExceededError extends Error {
  public readonly code = 'DEPTH_EXCEEDED'

  constructor(message: string) {
    super(message)
    this.name = 'DepthExceededError'
  }
}

/**
 * Thrown when a folder import exceeds the maximum number of files.
 */
export class FileCountExceededError extends Error {
  public readonly code = 'FILE_COUNT_EXCEEDED'

  constructor(message: string) {
    super(message)
    this.name = 'FileCountExceededError'
  }
}

// --- Interfaces ---

export interface UploadedFile {
  name: string           // Original filename
  relativePath: string   // Relative path (for folder imports)
  size: number           // File size in bytes
  stream: ReadableStream // File content stream
}

export interface IImportService {
  importFile(vaultId: string, file: UploadedFile): Promise<void>
  importFolder(vaultId: string, files: UploadedFile[]): Promise<void>
}

// --- Implementation ---

export class ImportService implements IImportService {
  constructor(
    private readonly vaultManager: IVaultManager,
    private readonly vaultReader: IVaultReader,
    private readonly configService: IConfigService,
    private readonly logger: ILogger,
  ) {}

  /**
   * Imports a single file into a vault at the root level.
   *
   * Steps:
   * 1. Validate vault exists
   * 2. Validate filename (1-255 chars, no path separators)
   * 3. Validate file size (≤ maxImportFileSize from config)
   * 4. Check for name conflict at root level
   * 5. Write file to vault storage; on failure, clean up partial file
   * 6. Refresh the vault's directory tree
   */
  async importFile(vaultId: string, file: UploadedFile): Promise<void> {
    // 1. Validate vault exists
    const vault = this.vaultManager.getVault(vaultId)
    if (!vault) {
      throw new VaultNotFoundError(vaultId)
    }

    // 2. Validate filename
    this.validateFilename(file.name)

    // 3. Validate file size
    const maxFileSize = this.configService.getServerConfig().maxImportFileSize
    if (file.size > maxFileSize) {
      throw new FileTooLargeError(
        `File exceeds maximum size of ${Math.floor(maxFileSize / (1024 * 1024))} MB`,
      )
    }

    // 4. Check for name conflict at root level
    const targetPath = path.join(vault.info.path, file.name)
    try {
      await fs.access(targetPath)
      // If access succeeds, the file already exists
      throw new FileConflictError(
        `A file named '${file.name}' already exists at the target location`,
      )
    } catch (error) {
      // If the error is our FileConflictError, re-throw it
      if (error instanceof FileConflictError) {
        throw error
      }
      // Otherwise, the file doesn't exist — this is the expected case
    }

    // 5. Write file to vault storage
    this.logger.debug('Importing file', { vaultId, filename: file.name, size: file.size })

    try {
      const nodeReadable = Readable.fromWeb(file.stream as import('node:stream/web').ReadableStream)
      const writeStream = createWriteStream(targetPath)
      await pipeline(nodeReadable, writeStream)
    } catch (error) {
      // Clean up partial file on failure
      this.logger.error('File import failed, cleaning up partial file', {
        vaultId,
        filename: file.name,
        error: error instanceof Error ? error.message : String(error),
      })
      try {
        await fs.unlink(targetPath)
      } catch {
        // Ignore cleanup errors — file may not have been created
      }
      throw error
    }

    // 6. Refresh the vault's directory tree
    const maxDepth = this.configService.getServerConfig().maxDirectoryDepth
    const updatedTree = await this.vaultReader.readDirectory(vault.info.path, maxDepth)
    this.vaultManager.addVault({
      info: vault.info,
      tree: updatedTree,
    })

    this.logger.info('File imported successfully', { vaultId, filename: file.name, size: file.size })
  }

  /**
   * Imports a folder (multiple files with relative paths) into a vault.
   *
   * Steps:
   * 1. Validate vault exists
   * 2. Validate file count (≤ maxImportFiles from config)
   * 3. Validate depth (≤ maxImportDepth levels) for each file's relativePath
   * 4. Check for name conflicts at all target paths before writing
   * 5. Create directory structure preserving relative paths, including empty subfolders
   * 6. Track all created paths; on failure, remove them in reverse order (files first, then directories)
   * 7. Refresh the vault's directory tree
   */
  async importFolder(vaultId: string, files: UploadedFile[]): Promise<void> {
    // 1. Validate vault exists
    const vault = this.vaultManager.getVault(vaultId)
    if (!vault) {
      throw new VaultNotFoundError(vaultId)
    }

    const config = this.configService.getServerConfig()
    const maxFiles = config.maxImportFiles
    const maxDepth = config.maxImportDepth

    // 2. Validate file count
    if (files.length > maxFiles) {
      throw new FileCountExceededError(
        `Folder contains ${files.length} files, exceeding the maximum of ${maxFiles} files`,
      )
    }

    // 3. Validate depth for each file's relativePath
    for (const file of files) {
      const segments = file.relativePath.split('/').filter((s) => s.length > 0)
      if (segments.length > maxDepth) {
        throw new DepthExceededError(
          `Folder exceeds maximum nesting depth of ${maxDepth} levels`,
        )
      }
    }

    // 4. Check for name conflicts at all target paths before writing
    for (const file of files) {
      const targetPath = path.join(vault.info.path, file.relativePath)
      try {
        await fs.access(targetPath)
        // If access succeeds, there's a conflict
        throw new FileConflictError(
          `A file or folder already exists at '${file.relativePath}'`,
        )
      } catch (error) {
        if (error instanceof FileConflictError) {
          throw error
        }
        // Otherwise, the path doesn't exist — expected
      }
    }

    // Also check if any intermediate directories conflict with existing files
    const allDirs = this.extractDirectories(files)
    for (const dir of allDirs) {
      const dirPath = path.join(vault.info.path, dir)
      try {
        const stat = await fs.stat(dirPath)
        if (!stat.isDirectory()) {
          throw new FileConflictError(
            `A file already exists at '${dir}' where a directory is needed`,
          )
        }
      } catch (error) {
        if (error instanceof FileConflictError) {
          throw error
        }
        // Path doesn't exist — expected
      }
    }

    // 5. Create directory structure and write files, tracking all created paths
    const createdFiles: string[] = []
    const createdDirs: string[] = []

    try {
      // Create all needed directories first
      const dirsToCreate = this.extractDirectories(files)
      for (const dir of dirsToCreate) {
        const dirPath = path.join(vault.info.path, dir)
        // Check if directory already exists before tracking it as created
        let existed = false
        try {
          await fs.access(dirPath)
          existed = true
        } catch {
          // Doesn't exist yet
        }

        await fs.mkdir(dirPath, { recursive: true })

        if (!existed) {
          createdDirs.push(dirPath)
        }
      }

      // Write all files
      for (const file of files) {
        const targetPath = path.join(vault.info.path, file.relativePath)

        const nodeReadable = Readable.fromWeb(file.stream as import('node:stream/web').ReadableStream)
        const writeStream = createWriteStream(targetPath)
        await pipeline(nodeReadable, writeStream)

        createdFiles.push(targetPath)
      }
    } catch (error) {
      // 6. On failure, remove all created items in reverse order (files first, then directories)
      this.logger.error('Folder import failed, rolling back', {
        vaultId,
        filesCreated: createdFiles.length,
        dirsCreated: createdDirs.length,
        error: error instanceof Error ? error.message : String(error),
      })

      // Remove files first (in reverse order)
      for (let i = createdFiles.length - 1; i >= 0; i--) {
        try {
          await fs.unlink(createdFiles[i]!)
        } catch {
          // Ignore cleanup errors
        }
      }

      // Remove directories in reverse order (deepest first)
      const sortedDirs = [...createdDirs].sort((a, b) => b.length - a.length)
      for (const dir of sortedDirs) {
        try {
          await fs.rmdir(dir)
        } catch {
          // Ignore cleanup errors — directory may not be empty or may not exist
        }
      }

      throw error
    }

    // 7. Refresh the vault's directory tree
    const treeDepth = config.maxDirectoryDepth
    const updatedTree = await this.vaultReader.readDirectory(vault.info.path, treeDepth)
    this.vaultManager.addVault({
      info: vault.info,
      tree: updatedTree,
    })

    this.logger.info('Folder imported successfully', {
      vaultId,
      filesImported: files.length,
      dirsCreated: createdDirs.length,
    })
  }

  /**
   * Extracts all unique directory paths from the files' relative paths.
   * Returns them sorted by depth (shallowest first) to ensure parent dirs are created first.
   */
  private extractDirectories(files: UploadedFile[]): string[] {
    const dirs = new Set<string>()

    for (const file of files) {
      const segments = file.relativePath.split('/').filter((s) => s.length > 0)
      // All segments except the last one (which is the filename) form directory paths
      for (let i = 1; i < segments.length; i++) {
        dirs.add(segments.slice(0, i).join('/'))
      }
    }

    // Sort by depth (shallowest first)
    return Array.from(dirs).sort((a, b) => {
      const depthA = a.split('/').length
      const depthB = b.split('/').length
      if (depthA !== depthB) return depthA - depthB
      return a.localeCompare(b)
    })
  }

  /**
   * Validates a filename:
   * - Must be 1-255 characters
   * - Must not contain path separators (/ or \)
   */
  private validateFilename(name: string): void {
    if (!name || name.length === 0) {
      throw new InvalidFilenameError('Filename must not be empty')
    }

    if (name.length > 255) {
      throw new InvalidFilenameError('Filename must not exceed 255 characters')
    }

    if (name.includes('/') || name.includes('\\')) {
      throw new InvalidFilenameError('Filename must not contain path separators')
    }
  }
}
