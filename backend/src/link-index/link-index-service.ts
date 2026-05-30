/**
 * LinkIndexService — In-memory link index with JSON persistence.
 *
 * Maintains forward links (file → targets) and a derived reverse map (file → sources).
 * Persists the forward links as JSON; the reverse map is rebuilt on load.
 * Implements the ILinkIndex interface for abstraction.
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import type { ILogger } from '../logger/index.js'
import type { ILinkIndex, GraphData, GraphNode, GraphEdge } from './types.js'
import { extractWikilinks } from './wikilink-parser.js'

/** JSON schema for the persisted link index file. */
interface LinkIndexJson {
  version: number
  updatedAt: string
  forwardLinks: Record<string, string[]>
}

/**
 * Normalizes a file path for index storage.
 * - Uses forward slashes as separator
 * - Removes leading `./`
 * - Keeps path relative to vault root
 * - Appends `.md` extension if missing
 */
export function normalizeLinkPath(rawPath: string): string {
  // Replace backslashes with forward slashes
  let normalized = rawPath.replace(/\\/g, '/')

  // Remove leading `./`
  while (normalized.startsWith('./')) {
    normalized = normalized.slice(2)
  }

  // Remove leading `/`
  while (normalized.startsWith('/')) {
    normalized = normalized.slice(1)
  }

  // Append .md if no extension present
  if (!normalized.endsWith('.md')) {
    normalized = normalized + '.md'
  }

  return normalized
}

export class LinkIndexService implements ILinkIndex {
  private readonly forwardLinks: Map<string, Set<string>> = new Map()
  private readonly backlinks: Map<string, Set<string>> = new Map()
  private ready = false
  private readonly persistPath: string

  constructor(
    private readonly vaultPath: string,
    private readonly vaultId: string,
    private readonly logger: ILogger,
  ) {
    // Persistence file lives inside the vault storage directory:
    // <vaultPath>/_link-index.json (e.g. data/vaults/<vaultId>/_link-index.json)
    this.persistPath = path.join(vaultPath, '_link-index.json')
  }

  /**
   * Rebuilds the entire index by recursively finding all .md files,
   * parsing each for wikilinks, and building forward + reverse maps.
   * Skips unreadable files (logs warning, continues).
   */
  async rebuild(): Promise<void> {
    this.forwardLinks.clear()
    this.backlinks.clear()

    const mdFiles = await this.findMarkdownFiles(this.vaultPath)

    for (const absoluteFilePath of mdFiles) {
      const relativePath = this.toRelativePath(absoluteFilePath)
      const normalizedPath = normalizeLinkPath(relativePath)

      try {
        const content = await fs.readFile(absoluteFilePath, 'utf-8')
        const links = extractWikilinks(content)
        const targets = new Set<string>()

        for (const link of links) {
          // Skip heading-only links (target is empty string)
          if (link.target === '') continue
          const normalizedTarget = normalizeLinkPath(link.target)
          targets.add(normalizedTarget)
        }

        this.forwardLinks.set(normalizedPath, targets)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        this.logger.warn('Skipping unreadable file during rebuild', {
          file: normalizedPath,
          error: message,
        })
      }
    }

    // Build reverse map from forward links
    this.rebuildReverseMap()

    this.ready = true

    // Persist to disk (fire-and-forget error handling)
    await this.persist()
  }

  /**
   * Updates the index for a single file (added or modified).
   * Parses the content and updates forward links + reverse map.
   */
  async updateFile(filePath: string, content: string): Promise<void> {
    const normalizedPath = normalizeLinkPath(filePath)

    // Remove old forward links for this file from reverse map
    this.removeFromReverseMap(normalizedPath)

    // Parse new content
    const links = extractWikilinks(content)
    const targets = new Set<string>()

    for (const link of links) {
      if (link.target === '') continue
      const normalizedTarget = normalizeLinkPath(link.target)
      targets.add(normalizedTarget)
    }

    // Update forward links
    this.forwardLinks.set(normalizedPath, targets)

    // Add new entries to reverse map
    for (const target of targets) {
      const sources = this.backlinks.get(target)
      if (sources) {
        sources.add(normalizedPath)
      } else {
        this.backlinks.set(target, new Set([normalizedPath]))
      }
    }

    await this.persist()
  }

  /**
   * Removes all index entries for a deleted file.
   * Cleans up forward links and backlink references.
   */
  async removeFile(filePath: string): Promise<void> {
    const normalizedPath = normalizeLinkPath(filePath)

    // Remove from reverse map (entries where this file is a source)
    this.removeFromReverseMap(normalizedPath)

    // Remove forward links entry
    this.forwardLinks.delete(normalizedPath)

    // Also remove this file as a source from any backlink entries
    // (already handled by removeFromReverseMap above)

    await this.persist()
  }

  /**
   * Handles a file rename by removing the old path and adding the new path.
   */
  async renameFile(oldPath: string, newPath: string, content: string): Promise<void> {
    const normalizedOld = normalizeLinkPath(oldPath)
    const normalizedNew = normalizeLinkPath(newPath)

    // Remove old path from reverse map
    this.removeFromReverseMap(normalizedOld)

    // Remove old forward links entry
    this.forwardLinks.delete(normalizedOld)

    // Parse content for new path
    const links = extractWikilinks(content)
    const targets = new Set<string>()

    for (const link of links) {
      if (link.target === '') continue
      const normalizedTarget = normalizeLinkPath(link.target)
      targets.add(normalizedTarget)
    }

    // Set forward links for new path
    this.forwardLinks.set(normalizedNew, targets)

    // Add new entries to reverse map
    for (const target of targets) {
      const sources = this.backlinks.get(target)
      if (sources) {
        sources.add(normalizedNew)
      } else {
        this.backlinks.set(target, new Set([normalizedNew]))
      }
    }

    await this.persist()
  }

  /**
   * Returns forward links for a specific file.
   */
  getForwardLinks(filePath: string): string[] {
    const normalizedPath = normalizeLinkPath(filePath)
    const targets = this.forwardLinks.get(normalizedPath)
    return targets ? Array.from(targets) : []
  }

  /**
   * Returns backlinks for a specific file.
   */
  getBacklinks(filePath: string): string[] {
    const normalizedPath = normalizeLinkPath(filePath)
    const sources = this.backlinks.get(normalizedPath)
    return sources ? Array.from(sources) : []
  }

  /**
   * Returns the full graph structure for visualization.
   * Nodes include all files that exist on disk OR are referenced as link targets.
   * Edges are a 1:1 mapping of forward links.
   */
  getGraph(): GraphData {
    const nodeSet = new Set<string>()
    const edges: GraphEdge[] = []

    // Collect all nodes from forward links (sources and targets)
    for (const [source, targets] of this.forwardLinks) {
      nodeSet.add(source)
      for (const target of targets) {
        nodeSet.add(target)
        edges.push({ source, target })
      }
    }

    // Build nodes array with existence flag
    const nodes: GraphNode[] = Array.from(nodeSet).map((filePath) => ({
      path: filePath,
      label: this.extractLabel(filePath),
      exists: this.forwardLinks.has(filePath),
    }))

    return { nodes, edges }
  }

  /**
   * Whether the index has been initialized (loaded or rebuilt).
   */
  isReady(): boolean {
    return this.ready
  }

  /**
   * Attempts to load the index from disk.
   * On success, rebuilds the reverse map from persisted forward links.
   * On failure (missing file, invalid JSON, schema mismatch), triggers a full rebuild.
   */
  async loadFromDisk(): Promise<void> {
    try {
      const raw = await fs.readFile(this.persistPath, 'utf-8')
      const parsed: unknown = JSON.parse(raw)

      if (!this.validateSchema(parsed)) {
        this.logger.warn('Link index file has invalid schema, triggering rebuild', {
          vaultId: this.vaultId,
        })
        await this.rebuild()
        return
      }

      const data = parsed as LinkIndexJson

      // Populate forward links from persisted data
      this.forwardLinks.clear()
      this.backlinks.clear()

      for (const [filePath, targets] of Object.entries(data.forwardLinks)) {
        this.forwardLinks.set(filePath, new Set(targets))
      }

      // Rebuild reverse map from forward links
      this.rebuildReverseMap()

      this.ready = true
      this.logger.info('Link index loaded from disk', {
        vaultId: this.vaultId,
        fileCount: this.forwardLinks.size,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.logger.warn('Failed to load link index from disk, triggering rebuild', {
        vaultId: this.vaultId,
        error: message,
      })
      await this.rebuild()
    }
  }

  // ─── Private Helpers ─────────────────────────────────────────────────────────

  /**
   * Recursively finds all .md files in the given directory.
   * Skips unreadable directories (logs warning, continues).
   */
  private async findMarkdownFiles(dirPath: string): Promise<string[]> {
    const results: string[] = []

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true })

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name)

        if (entry.isDirectory()) {
          const subFiles = await this.findMarkdownFiles(fullPath)
          results.push(...subFiles)
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          results.push(fullPath)
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.logger.warn('Failed to read directory during rebuild', {
        directory: dirPath,
        error: message,
      })
    }

    return results
  }

  /**
   * Converts an absolute file path to a vault-relative path with forward slashes.
   */
  private toRelativePath(absoluteFilePath: string): string {
    return path.relative(this.vaultPath, absoluteFilePath).replace(/\\/g, '/')
  }

  /**
   * Rebuilds the reverse map (backlinks) from the forward links map.
   */
  private rebuildReverseMap(): void {
    this.backlinks.clear()

    for (const [source, targets] of this.forwardLinks) {
      for (const target of targets) {
        const sources = this.backlinks.get(target)
        if (sources) {
          sources.add(source)
        } else {
          this.backlinks.set(target, new Set([source]))
        }
      }
    }
  }

  /**
   * Removes a file's entries from the reverse map.
   * Called before updating or removing a file's forward links.
   */
  private removeFromReverseMap(filePath: string): void {
    const oldTargets = this.forwardLinks.get(filePath)
    if (!oldTargets) return

    for (const target of oldTargets) {
      const sources = this.backlinks.get(target)
      if (sources) {
        sources.delete(filePath)
        if (sources.size === 0) {
          this.backlinks.delete(target)
        }
      }
    }
  }

  /**
   * Persists the forward links to disk as JSON using atomic write (temp → rename).
   * On failure, logs error and keeps in-memory index intact.
   */
  private async persist(): Promise<void> {
    try {
      const data: LinkIndexJson = {
        version: 1,
        updatedAt: new Date().toISOString(),
        forwardLinks: this.serializeForwardLinks(),
      }

      const json = JSON.stringify(data, null, 2)

      // Ensure directory exists
      const dir = path.dirname(this.persistPath)
      await fs.mkdir(dir, { recursive: true })

      // Atomic write: temp file → rename
      const tempPath = `${this.persistPath}.${crypto.randomBytes(8).toString('hex')}.tmp`
      await fs.writeFile(tempPath, json, 'utf-8')
      await fs.rename(tempPath, this.persistPath)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.logger.error('Failed to persist link index', {
        vaultId: this.vaultId,
        error: message,
      })
    }
  }

  /**
   * Serializes the forward links map to a plain object for JSON persistence.
   */
  private serializeForwardLinks(): Record<string, string[]> {
    const result: Record<string, string[]> = {}
    for (const [filePath, targets] of this.forwardLinks) {
      result[filePath] = Array.from(targets)
    }
    return result
  }

  /**
   * Validates that a parsed JSON value conforms to the expected LinkIndexJson schema.
   */
  private validateSchema(data: unknown): data is LinkIndexJson {
    if (data === null || typeof data !== 'object') return false

    const obj = data as Record<string, unknown>

    // Check version field
    if (typeof obj['version'] !== 'number' || obj['version'] !== 1) return false

    // Check updatedAt field
    if (typeof obj['updatedAt'] !== 'string') return false

    // Check forwardLinks field
    if (obj['forwardLinks'] === null || typeof obj['forwardLinks'] !== 'object') return false

    const forwardLinks = obj['forwardLinks'] as Record<string, unknown>

    // Validate each entry: key is string, value is string[]
    for (const [key, value] of Object.entries(forwardLinks)) {
      if (typeof key !== 'string') return false
      if (!Array.isArray(value)) return false
      for (const item of value) {
        if (typeof item !== 'string') return false
      }
    }

    return true
  }

  /**
   * Extracts a display label from a file path.
   * Returns the filename without path and without .md extension.
   */
  private extractLabel(filePath: string): string {
    const basename = filePath.split('/').pop() ?? filePath
    return basename.endsWith('.md') ? basename.slice(0, -3) : basename
  }
}
