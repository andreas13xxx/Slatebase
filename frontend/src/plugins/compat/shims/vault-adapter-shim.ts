/**
 * VaultAdapterShim — Obsidian-compatible DataAdapter API emulation.
 *
 * In Obsidian, `app.vault.adapter` provides raw filesystem access.
 * Plugins use it for:
 * - `adapter.exists(path)`: Check if a file/folder exists
 * - `adapter.read(path)`: Read file content as string
 * - `adapter.write(path, data)`: Write string content to a file
 * - `adapter.list(path)`: List directory contents
 * - `adapter.stat(path)`: Get file/folder metadata
 * - `adapter.mkdir(path)`: Create a directory
 * - `adapter.remove(path)`: Delete a file
 * - `adapter.rename(oldPath, newPath)`: Rename/move a file
 *
 * This shim delegates to the VaultShim and IApiClient for actual operations.
 *
 * @module vault-adapter-shim
 */

import type { IApiClient } from '../../../api/index'
import { getStoredAuthToken, getStoredCsrfToken } from '../../../state/authContext'
import type { DirectoryTree } from '../../../types'
import { markPluginWrite } from '../plugin-event-bridge'
import { recordGapRead, recordGapCall } from '../api-gap-registry'

/**
 * Stat result for a file or folder.
 */
export interface DataAdapterStat {
  /** 'file' or 'folder' */
  type: 'file' | 'folder'
  /** File size in bytes (0 for folders) */
  size: number
  /** Last modified time (epoch ms) */
  mtime: number
  /** Creation time (epoch ms) */
  ctime: number
}

/**
 * ListResult from adapter.list().
 */
export interface ListResult {
  /** File paths in the directory */
  files: string[]
  /** Subfolder paths in the directory */
  folders: string[]
}

/**
 * IVaultAdapter — Obsidian DataAdapter interface subset.
 */
export interface IVaultAdapter {
  /** Whether path lookups are case-insensitive. Slatebase's backend storage is case-sensitive. */
  insensitive: boolean
  exists(path: string): Promise<boolean>
  read(path: string): Promise<string>
  readBinary(path: string): Promise<ArrayBuffer>
  write(path: string, data: string): Promise<void>
  writeBinary(path: string, data: ArrayBuffer): Promise<void>
  list(path: string): Promise<ListResult>
  stat(path: string): Promise<DataAdapterStat | null>
  mkdir(path: string): Promise<void>
  remove(path: string): Promise<void>
  rename(oldPath: string, newPath: string): Promise<void>
}

/**
 * VaultAdapterShim — Implements Obsidian's DataAdapter via Slatebase API.
 */
export class VaultAdapterShim implements IVaultAdapter {
  /** Slatebase's backend storage is case-sensitive, regardless of the host OS. */
  readonly insensitive: boolean = false

  private readonly vaultId: string
  private readonly apiClient: IApiClient
  private getTree: () => DirectoryTree

  constructor(vaultId: string, apiClient: IApiClient, getTree: () => DirectoryTree) {
    this.vaultId = vaultId
    this.apiClient = apiClient
    this.getTree = getTree
  }

  /**
   * Check if a file or folder exists at the given path.
   */
  async exists(path: string): Promise<boolean> {
    if (!path || path === '/' || path === '') return true
    const node = findNodeByPath(this.getTree(), path)
    return node !== null
  }

  /**
   * Read a file's content as a string.
   * @throws Error if the file doesn't exist
   */
  async read(path: string): Promise<string> {
    try {
      const result = await this.apiClient.fetchFileContent(this.vaultId, path)
      return result.content
    } catch (err: unknown) {
      const appErr = err as { message?: string }
      throw new Error(`adapter.read failed for "${path}": ${appErr.message ?? 'unknown error'}`, { cause: err })
    }
  }

  /**
   * Write string content to a file (creates if not exists, overwrites if exists).
   */
  async write(path: string, data: string): Promise<void> {
    try {
      await this.apiClient.saveFile(this.vaultId, path, data)
      markPluginWrite(path)
    } catch (err: unknown) {
      const appErr = err as { message?: string }
      throw new Error(`adapter.write failed for "${path}": ${appErr.message ?? 'unknown error'}`, { cause: err })
    }
  }

  /**
   * List the contents of a directory.
   * Returns { files: string[], folders: string[] } with full paths.
   */
  async list(path: string): Promise<ListResult> {
    const tree = this.getTree()
    const targetNode = path === '' || path === '/' || path === '.' ? tree : findNodeByPath(tree, path)

    if (!targetNode || targetNode.type !== 'directory') {
      return { files: [], folders: [] }
    }

    const files: string[] = []
    const folders: string[] = []

    if (targetNode.children) {
      for (const child of targetNode.children) {
        if (child.type === 'file') {
          files.push(child.path)
        } else {
          folders.push(child.path)
        }
      }
    }

    return { files, folders }
  }

  /**
   * Get metadata (stat) for a file or folder.
   * Returns null if the path doesn't exist.
   */
  async stat(path: string): Promise<DataAdapterStat | null> {
    if (!path || path === '/' || path === '') {
      return { type: 'folder', size: 0, mtime: Date.now(), ctime: Date.now() }
    }

    const node = findNodeByPath(this.getTree(), path)
    if (!node) return null

    return {
      type: node.type === 'file' ? 'file' : 'folder',
      size: node.size ?? 0,
      mtime: node.mtime ?? Date.now(),
      ctime: node.ctime ?? Date.now(),
    }
  }

  /**
   * Create a directory at the given path.
   * No-op: the Slatebase backend creates parent directories automatically
   * when files are written via saveFile (fs.mkdir with recursive: true).
   * LiveSync calls mkdir as a preparation step before writing files into it.
   */
  async mkdir(_path: string): Promise<void> {
    // Intentional no-op — backend creates directories on file write
  }

  /**
   * Remove a file at the given path.
   */
  async remove(path: string): Promise<void> {
    try {
      await this.apiClient.deleteContent(this.vaultId, path)
      markPluginWrite(path)
    } catch (err: unknown) {
      const appErr = err as { message?: string }
      throw new Error(`adapter.remove failed for "${path}": ${appErr.message ?? 'unknown error'}`, { cause: err })
    }
  }

  /**
   * Rename/move a file or folder.
   */
  async rename(oldPath: string, newPath: string): Promise<void> {
    try {
      await this.apiClient.moveContent(this.vaultId, oldPath, newPath)
      markPluginWrite(newPath)
    } catch (err: unknown) {
      const appErr = err as { message?: string }
      throw new Error(`adapter.rename failed "${oldPath}" → "${newPath}": ${appErr.message ?? 'unknown error'}`, { cause: err })
    }
  }

  /**
   * Read a file's content as an ArrayBuffer (binary).
   * @throws Error if the file doesn't exist
   */
  async readBinary(path: string): Promise<ArrayBuffer> {
    try {
      const token = getStoredAuthToken() ?? ''
      const response = await fetch(`/api/v1/vaults/${this.vaultId}/files?path=${encodeURIComponent(path)}&raw=true`, {
        headers: { 'Authorization': `Bearer ${token}` },
      })
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      return await response.arrayBuffer()
    } catch (err: unknown) {
      const appErr = err as { message?: string }
      throw new Error(`adapter.readBinary failed for "${path}": ${appErr.message ?? 'unknown error'}`, { cause: err })
    }
  }

  /**
   * Write binary content (ArrayBuffer) to a file.
   * Uses the upload endpoint with multipart form data.
   */
  async writeBinary(path: string, data: ArrayBuffer): Promise<void> {
    try {
      const name = path.includes('/') ? path.slice(path.lastIndexOf('/') + 1) : path
      const targetDir = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''

      const blob = new Blob([data])
      const file = new File([blob], name)
      const formData = new FormData()
      formData.append('file', file, name)
      formData.append('targetDir', targetDir)

      const token = getStoredAuthToken() ?? ''
      const csrf = getStoredCsrfToken() ?? ''
      const response = await fetch(`/api/v1/vaults/${this.vaultId}/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-CSRF-Token': csrf,
        },
        body: formData,
      })
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      markPluginWrite(path)
    } catch (err: unknown) {
      const appErr = err as { message?: string }
      throw new Error(`adapter.writeBinary failed for "${path}": ${appErr.message ?? 'unknown error'}`, { cause: err })
    }
  }

  /**
   * Wraps a VaultAdapterShim instance with a Proxy for non-emulated API
   * interception. Real Obsidian's DataAdapter has methods this class doesn't
   * implement (`copy`, `trashSystem`, `trashLocal`, `getResourcePath`,
   * `process`, `append`, `getFullPath`, ...) — without this, reading one of
   * those off the raw instance is `undefined`, and calling `undefined()` is
   * an uncaught TypeError. Mirrors VaultShim/WorkspaceShim's pattern: a
   * non-emulated method/property gets a warned no-op instead.
   */
  static wrapWithProxy(instance: VaultAdapterShim): VaultAdapterShim & Record<string, unknown> {
    const emulatedProperties = new Set<string | symbol>([
      'insensitive',
      'exists',
      'read',
      'readBinary',
      'write',
      'writeBinary',
      'list',
      'stat',
      'mkdir',
      'remove',
      'rename',
    ])

    return new Proxy(instance, {
      get(target: VaultAdapterShim, prop: string | symbol): unknown {
        if (emulatedProperties.has(prop)) {
          const value = Reflect.get(target, prop, target)
          if (typeof value === 'function') {
            return value.bind(target)
          }
          return value
        }

        if (typeof prop === 'symbol') {
          return Reflect.get(target, prop, target)
        }

        if (prop === 'then') {
          return undefined
        }

        if (recordGapRead('VaultAdapter', prop)) {
          console.warn(
            `[VaultAdapterShim] Access to non-emulated adapter method/property "${prop}". ` +
            `Slatebase returns a no-op function here, which is truthy — feature ` +
            `detection like \`if (adapter.${prop})\` will take the wrong branch. ` +
            `Inspect all gaps with window.__slatebasePluginApiGaps().`
          )
        }

        return (...args: unknown[]) => {
          recordGapCall('VaultAdapter', prop)
          void args
          return undefined
        }
      },
    }) as VaultAdapterShim & Record<string, unknown>
  }
}

// ─── Internal Helpers ──────────────────────────────────────────────────────────

/**
 * Find a node in the DirectoryTree by its path.
 */
function findNodeByPath(tree: DirectoryTree, targetPath: string): DirectoryTree | null {
  if (tree.path === targetPath) return tree
  if (tree.children) {
    for (const child of tree.children) {
      const found = findNodeByPath(child, targetPath)
      if (found) return found
    }
  }
  return null
}
