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
import { getCsrfToken } from '../../../state/authContext'
import type { DirectoryTree } from '../../../types'
import { markPluginWrite } from '../plugin-event-bridge'
import { recordGapRead, recordGapCall, isObjectPrototypeMember } from '../api-gap-registry'

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
  /**
   * Own writes the directory-tree snapshot has not caught up with yet. `exists`/`stat` read a snapshot that only
   * refreshes after the realtime round-trip, so a plugin that writes a file and checks it right away (TaskNotes'
   * metadata staging) would see "missing". Entries expire, so a later external change is not masked for long.
   */
  private readonly overlay = new Map<string, { present: boolean; type: 'file' | 'folder'; at: number }>()

  constructor(vaultId: string, apiClient: IApiClient, getTree: () => DirectoryTree) {
    this.vaultId = vaultId
    this.apiClient = apiClient
    this.getTree = getTree
  }

  /**
   * URL under which the browser can load the file (same scheme as `VaultShim.getResourcePath`), authenticated by the
   * session cookie. Plugins on the non-desktop code path derive a stable per-vault identifier from it: Remotely Save
   * calls `getResourcePath("").split("?")[0]` when the adapter is not a `FileSystemAdapter`, and used to fail onload
   * because the proxy's no-op stub returned `undefined`.
   */
  getResourcePath(path: string): string {
    return `/api/v1/vaults/${this.vaultId}/files?path=${encodeURIComponent(path)}&raw=true`
  }

  /**
   * Check if a file or folder exists at the given path.
   */
  async exists(path: string): Promise<boolean> {
    if (!path || path === '/' || path === '') return true
    const own = this.overlayEntry(path)
    if (own) return own.present
    const node = findNodeByPath(this.getTree(), path)
    if (node) return true
    if (isHiddenPath(path)) return (await this.statHiddenFile(path)) !== null
    return false
  }

  private overlayEntry(path: string): { present: boolean; type: 'file' | 'folder' } | null {
    const entry = this.overlay.get(path)
    if (!entry) return null
    if (Date.now() - entry.at > OVERLAY_TTL_MS) {
      this.overlay.delete(path)
      return null
    }
    return entry
  }

  /** Records a local change; a present path also makes its parent folders present. */
  private markOverlay(path: string, present: boolean, type: 'file' | 'folder' = 'file'): void {
    const at = Date.now()
    this.overlay.set(path, { present, type, at })
    if (!present) return
    const parts = path.split('/')
    for (let i = 1; i < parts.length; i++) {
      const parent = parts.slice(0, i).join('/')
      if (!this.overlay.get(parent)?.present) this.overlay.set(parent, { present: true, type: 'folder', at })
    }
  }

  /**
   * Obsidian's `adapter.getBasePath()` (desktop only). Slatebase has no local vault directory,
   * so it reports the root like the other compat shims do.
   */
  getBasePath(): string {
    return '/'
  }

  /**
   * Dot-prefixed paths are hidden from the directory tree, so the tree cannot answer for them.
   * The file endpoint can read them; a failed request counts as "not found" here, never as proof
   * of absence for anything but this one lookup. Folders cannot be probed this way.
   */
  private async statHiddenFile(path: string): Promise<DataAdapterStat | null> {
    try {
      const result = await this.apiClient.fetchFileContent(this.vaultId, path)
      const now = Date.now()
      return { type: 'file', size: result.size ?? result.content.length, mtime: now, ctime: now }
    } catch {
      return null
    }
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
      this.markOverlay(path, true)
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

    const own = this.overlayEntry(path)
    if (own) {
      if (!own.present) return null
      const now = Date.now()
      return { type: own.type, size: 0, mtime: now, ctime: now }
    }

    const node = findNodeByPath(this.getTree(), path)
    if (!node) return isHiddenPath(path) ? this.statHiddenFile(path) : null

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
  async mkdir(path: string): Promise<void> {
    // The backend creates directories on file write; only remember the folder so `exists` agrees.
    this.markOverlay(path, true, 'folder')
  }

  /**
   * Remove a file at the given path.
   */
  async remove(path: string): Promise<void> {
    try {
      await this.apiClient.deleteContent(this.vaultId, path)
      this.markOverlay(path, false)
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
      this.markOverlay(oldPath, false)
      this.markOverlay(newPath, true)
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
      const response = await fetch(`/api/v1/vaults/${this.vaultId}/files?path=${encodeURIComponent(path)}&raw=true`)
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

      const csrf = getCsrfToken() ?? ''
      const response = await fetch(`/api/v1/vaults/${this.vaultId}/upload`, {
        method: 'POST',
        headers: {
          'X-CSRF-Token': csrf,
        },
        body: formData,
      })
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      this.markOverlay(path, true)
      markPluginWrite(path)
    } catch (err: unknown) {
      const appErr = err as { message?: string }
      throw new Error(`adapter.writeBinary failed for "${path}": ${appErr.message ?? 'unknown error'}`, { cause: err })
    }
  }

  /**
   * Wraps a VaultAdapterShim instance with a Proxy for non-emulated API
   * interception. Real Obsidian's DataAdapter has methods this class doesn't
   * implement (`copy`, `trashSystem`, `trashLocal`,
   * `process`, `append`, `getFullPath`, ...) — without this, reading one of
   * those off the raw instance is `undefined`, and calling `undefined()` is
   * an uncaught TypeError. Mirrors VaultShim/WorkspaceShim's pattern: a
   * non-emulated method/property gets a warned no-op instead.
   */
  static wrapWithProxy(instance: VaultAdapterShim): VaultAdapterShim & Record<string, unknown> {
    const emulatedProperties = new Set<string | symbol>([
      'insensitive',
      'getResourcePath',
      'getBasePath',
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

        if (isObjectPrototypeMember(prop)) {
          const value = Reflect.get(target, prop, target)
          return typeof value === 'function' ? value.bind(target) : value
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

/** How long an own write overrides the directory-tree snapshot. */
const OVERLAY_TTL_MS = 30_000

/** True when any path segment starts with a dot (hidden from the directory tree). */
function isHiddenPath(path: string): boolean {
  return path.split('/').some((segment) => segment.startsWith('.') && segment !== '.' && segment !== '..')
}

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
