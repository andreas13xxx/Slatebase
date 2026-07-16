/**
 * LinkIndexService — In-memory link index with JSON persistence.
 *
 * Maintains forward links (file → targets), tags (file → tags),
 * properties (file → key → values), and derived reverse maps.
 * Persists as JSON v2 schema; supports migration from v1.
 * Implements the ILinkIndex interface for abstraction.
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import type { ILogger } from '../logger/index.js'
import type { ILinkIndex, GraphData, GraphNode, GraphEdge, GraphQueryOptions, GraphMeta } from './types.js'
import { extractWikilinks } from './wikilink-parser.js'
import { extractTags } from './tag-extractor.js'
import { extractProperties } from './property-extractor.js'
import { extractCanvasFileRefs } from './canvas-parser.js'

/** JSON schema v1 for backward compatibility. */
interface LinkIndexJsonV1 {
  version: 1
  updatedAt: string
  forwardLinks: Record<string, string[]>
}

/** JSON schema v2 — includes tags and properties. */
interface LinkIndexJsonV2 {
  version: 2
  updatedAt: string
  forwardLinks: Record<string, string[]>
  tags: Record<string, string[]>
  properties: Record<string, Record<string, string[]>>
}

/** Union type for all supported persisted schemas. */
type LinkIndexJson = LinkIndexJsonV1 | LinkIndexJsonV2

/**
 * Normalizes a file path for index storage.
 * - Uses forward slashes as separator
 * - Removes leading `./`
 * - Keeps path relative to vault root
 * - Appends `.md` extension if missing (unless another known extension is present)
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

  // Append .md if no recognized extension present
  if (!normalized.includes('.') || (!normalized.endsWith('.md') && !normalized.endsWith('.canvas'))) {
    // Only append .md if the file has no extension at all
    const lastSegment = normalized.split('/').pop() ?? normalized
    if (!lastSegment.includes('.')) {
      normalized = normalized + '.md'
    }
  }

  return normalized
}

export class LinkIndexService implements ILinkIndex {
  private readonly forwardLinks: Map<string, Set<string>> = new Map()
  private readonly backlinks: Map<string, Set<string>> = new Map()
  private readonly fileTags: Map<string, Set<string>> = new Map()
  private readonly fileProperties: Map<string, Map<string, string[]>> = new Map()
  private ready = false
  private readonly persistPath: string

  constructor(
    private readonly vaultPath: string,
    private readonly vaultId: string,
    private readonly vaultName: string,
    private readonly logger: ILogger,
  ) {
    // Persistence file lives inside the vault storage directory:
    // <vaultPath>/.slatebase/link-index.json (e.g. data/vaults/<vaultId>/.slatebase/link-index.json)
    this.persistPath = path.join(vaultPath, '.slatebase', 'link-index.json')
  }

  /**
   * Rebuilds the entire index by recursively finding all .md files,
   * parsing each for wikilinks, tags, and properties.
   * Skips unreadable files (logs warning, continues).
   */
  async rebuild(): Promise<void> {
    this.forwardLinks.clear()
    this.backlinks.clear()
    this.fileTags.clear()
    this.fileProperties.clear()

    const mdFiles = await this.findMarkdownFiles(this.vaultPath)

    for (const absoluteFilePath of mdFiles) {
      const relativePath = this.toRelativePath(absoluteFilePath)
      const normalizedPath = normalizeLinkPath(relativePath)

      try {
        const content = await fs.readFile(absoluteFilePath, 'utf-8')

        if (absoluteFilePath.endsWith('.canvas')) {
          // Canvas files: extract file references only (no tags/properties)
          const fileRefs = extractCanvasFileRefs(content)
          const targets = new Set<string>()
          for (const ref of fileRefs) {
            const normalizedTarget = normalizeLinkPath(ref)
            targets.add(normalizedTarget)
          }
          this.forwardLinks.set(normalizedPath, targets)
        } else {
          // Markdown files: extract wikilinks, tags, properties
          const links = extractWikilinks(content)
          const targets = new Set<string>()
          for (const link of links) {
            if (link.target === '') continue
            const normalizedTarget = normalizeLinkPath(link.target)
            targets.add(normalizedTarget)
          }
          this.forwardLinks.set(normalizedPath, targets)

          // Extract tags
          const tags = extractTags(content)
          if (tags.length > 0) {
            this.fileTags.set(normalizedPath, new Set(tags))
          }

          // Extract properties
          const properties = extractProperties(content)
          if (Object.keys(properties).length > 0) {
            this.fileProperties.set(normalizedPath, new Map(Object.entries(properties)))
          }
        }
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

    // Persist to disk
    await this.persist()
  }

  /**
   * Updates the index for a single file (added or modified).
   * Parses the content and updates forward links, tags, properties, and reverse map.
   */
  async updateFile(filePath: string, content: string): Promise<void> {
    const normalizedPath = normalizeLinkPath(filePath)

    // Remove old forward links for this file from reverse map
    this.removeFromReverseMap(normalizedPath)

    if (filePath.endsWith('.canvas')) {
      // Canvas files: extract file references only
      const fileRefs = extractCanvasFileRefs(content)
      const targets = new Set<string>()
      for (const ref of fileRefs) {
        const normalizedTarget = normalizeLinkPath(ref)
        targets.add(normalizedTarget)
      }
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

      // Canvas files don't have tags or properties
      this.fileTags.delete(normalizedPath)
      this.fileProperties.delete(normalizedPath)
    } else {
      // Parse new content — wikilinks
      const links = extractWikilinks(content)
      const targets = new Set<string>()
      for (const link of links) {
        if (link.target === '') continue
        const normalizedTarget = normalizeLinkPath(link.target)
        targets.add(normalizedTarget)
      }
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

      // Update tags
      const tags = extractTags(content)
      if (tags.length > 0) {
        this.fileTags.set(normalizedPath, new Set(tags))
      } else {
        this.fileTags.delete(normalizedPath)
      }

      // Update properties
      const properties = extractProperties(content)
      if (Object.keys(properties).length > 0) {
        this.fileProperties.set(normalizedPath, new Map(Object.entries(properties)))
      } else {
        this.fileProperties.delete(normalizedPath)
      }
    }

    await this.persist()
  }

  /**
   * Removes all index entries for a deleted file.
   * Cleans up forward links, tags, properties, and backlink references.
   */
  async removeFile(filePath: string): Promise<void> {
    const normalizedPath = normalizeLinkPath(filePath)

    // Remove from reverse map
    this.removeFromReverseMap(normalizedPath)

    // Remove forward links entry
    this.forwardLinks.delete(normalizedPath)

    // Remove tags and properties
    this.fileTags.delete(normalizedPath)
    this.fileProperties.delete(normalizedPath)

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

    // Remove old entries
    this.forwardLinks.delete(normalizedOld)
    const oldTags = this.fileTags.get(normalizedOld)
    const oldProps = this.fileProperties.get(normalizedOld)
    this.fileTags.delete(normalizedOld)
    this.fileProperties.delete(normalizedOld)

    // Parse content for new path — wikilinks
    const links = extractWikilinks(content)
    const targets = new Set<string>()
    for (const link of links) {
      if (link.target === '') continue
      const normalizedTarget = normalizeLinkPath(link.target)
      targets.add(normalizedTarget)
    }
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

    // Transfer tags (re-extract from content for correctness)
    const tags = extractTags(content)
    if (tags.length > 0) {
      this.fileTags.set(normalizedNew, new Set(tags))
    } else if (oldTags && oldTags.size > 0) {
      this.fileTags.set(normalizedNew, oldTags)
    }

    // Transfer properties (re-extract from content for correctness)
    const properties = extractProperties(content)
    if (Object.keys(properties).length > 0) {
      this.fileProperties.set(normalizedNew, new Map(Object.entries(properties)))
    } else if (oldProps && oldProps.size > 0) {
      this.fileProperties.set(normalizedNew, oldProps)
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
   * Optionally includes tag nodes and property nodes based on query options.
   */
  getGraph(options?: GraphQueryOptions): GraphData {
    const nodeMap = new Map<string, GraphNode>()
    const edges: GraphEdge[] = []

    // Collect all file nodes from forward links (sources and targets)
    for (const [source, targets] of this.forwardLinks) {
      if (!nodeMap.has(source)) {
        nodeMap.set(source, {
          id: source,
          type: 'file',
          path: source,
          label: this.extractLabel(source),
          exists: true,
        })
      }
      for (const target of targets) {
        if (!nodeMap.has(target)) {
          nodeMap.set(target, {
            id: target,
            type: 'file',
            path: target,
            label: this.extractLabel(target),
            exists: this.forwardLinks.has(target),
          })
        }
        edges.push({ source, target, type: 'link' })
      }
    }

    // Include tag nodes if requested
    if (options?.includeTags) {
      for (const [filePath, tags] of this.fileTags) {
        // Ensure the file node exists
        if (!nodeMap.has(filePath)) {
          nodeMap.set(filePath, {
            id: filePath,
            type: 'file',
            path: filePath,
            label: this.extractLabel(filePath),
            exists: this.forwardLinks.has(filePath),
          })
        }

        for (const tag of tags) {
          const tagId = `tag:${tag}`
          if (!nodeMap.has(tagId)) {
            nodeMap.set(tagId, {
              id: tagId,
              type: 'tag',
              label: `#${tag}`,
              exists: true,
            })
          }
          edges.push({ source: filePath, target: tagId, type: 'tag' })
        }
      }
    }

    // Include property nodes if requested
    if (options?.includePropertyKeys && options.includePropertyKeys.length > 0) {
      const requestedKeys = new Set(options.includePropertyKeys)

      for (const [filePath, propsMap] of this.fileProperties) {
        // Ensure the file node exists
        if (!nodeMap.has(filePath)) {
          nodeMap.set(filePath, {
            id: filePath,
            type: 'file',
            path: filePath,
            label: this.extractLabel(filePath),
            exists: this.forwardLinks.has(filePath),
          })
        }

        for (const [key, values] of propsMap) {
          if (!requestedKeys.has(key)) continue

          for (const value of values) {
            const propId = `prop:${key}:${value}`
            if (!nodeMap.has(propId)) {
              nodeMap.set(propId, {
                id: propId,
                type: 'property',
                label: `${key}:${value}`,
                exists: true,
              })
            }
            edges.push({ source: filePath, target: propId, type: 'property' })
          }
        }
      }
    }

    return { nodes: Array.from(nodeMap.values()), edges }
  }

  /**
   * Returns aggregated metadata about tags and property keys in the index.
   */
  getGraphMeta(): GraphMeta {
    // Aggregate tags
    const tagCounts = new Map<string, number>()
    for (const tags of this.fileTags.values()) {
      for (const tag of tags) {
        tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1)
      }
    }

    // Aggregate property keys
    const propertyCounts = new Map<string, number>()
    for (const propsMap of this.fileProperties.values()) {
      for (const key of propsMap.keys()) {
        propertyCounts.set(key, (propertyCounts.get(key) ?? 0) + 1)
      }
    }

    // Sort descending by count
    const tags = Array.from(tagCounts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)

    const propertyKeys = Array.from(propertyCounts.entries())
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.count - a.count)

    return { tags, propertyKeys }
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
   * Handles v1 → v2 migration by loading links and triggering rebuild for tags/properties.
   */
  async loadFromDisk(): Promise<void> {
    try {
      const raw = await fs.readFile(this.persistPath, 'utf-8')
      const parsed: unknown = JSON.parse(raw)

      if (!this.validateSchema(parsed)) {
        this.logger.warn('Link index file has invalid schema, triggering rebuild', {
          vaultId: this.vaultId,
          vaultName: this.vaultName,
        })
        await this.rebuild()
        return
      }

      const data = parsed as LinkIndexJson

      // Clear all maps
      this.forwardLinks.clear()
      this.backlinks.clear()
      this.fileTags.clear()
      this.fileProperties.clear()

      if (data.version === 1) {
        // v1 → v2 migration: load forward links, then trigger full rebuild
        // for tags and properties
        this.logger.info('Link index v1 detected, triggering rebuild for v2 migration', {
          vaultId: this.vaultId,
          vaultName: this.vaultName,
        })
        await this.rebuild()
        return
      }

      // v2: Load forward links, tags, and properties
      for (const [filePath, targets] of Object.entries(data.forwardLinks)) {
        this.forwardLinks.set(filePath, new Set(targets))
      }

      for (const [filePath, tags] of Object.entries(data.tags)) {
        if (tags.length > 0) {
          this.fileTags.set(filePath, new Set(tags))
        }
      }

      for (const [filePath, properties] of Object.entries(data.properties)) {
        const propsMap = new Map<string, string[]>()
        for (const [key, values] of Object.entries(properties)) {
          propsMap.set(key, values)
        }
        if (propsMap.size > 0) {
          this.fileProperties.set(filePath, propsMap)
        }
      }

      // Rebuild reverse map from forward links
      this.rebuildReverseMap()

      this.ready = true
      this.logger.info('Link index loaded from disk', {
        vaultId: this.vaultId,
        vaultName: this.vaultName,
        fileCount: this.forwardLinks.size,
        version: 2,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.logger.warn('Failed to load link index from disk, triggering rebuild', {
        vaultId: this.vaultId,
        vaultName: this.vaultName,
        error: message,
      })
      await this.rebuild()
    }
  }

  // ─── Private Helpers ─────────────────────────────────────────────────────────

  /**
   * Recursively finds all .md and .canvas files in the given directory.
   * Skips unreadable directories (logs warning, continues).
   */
  private async findMarkdownFiles(dirPath: string): Promise<string[]> {
    const results: string[] = []

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true })

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name)

        if (entry.isDirectory()) {
          // Skip hidden directories (.obsidian, .slatebase, etc.) — like Obsidian
          if (entry.name.startsWith('.')) continue
          const subFiles = await this.findMarkdownFiles(fullPath)
          results.push(...subFiles)
        } else if (entry.isFile() && (entry.name.endsWith('.md') || entry.name.endsWith('.canvas'))) {
          // Skip hidden files (dot-prefixed)
          if (entry.name.startsWith('.')) continue
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
   * Persists the index to disk as JSON v2 using atomic write (temp → rename).
   * On failure, logs error and keeps in-memory index intact.
   */
  private async persist(): Promise<void> {
    try {
      const data: LinkIndexJsonV2 = {
        version: 2,
        updatedAt: new Date().toISOString(),
        forwardLinks: this.serializeForwardLinks(),
        tags: this.serializeTags(),
        properties: this.serializeProperties(),
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
        vaultName: this.vaultName,
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
   * Serializes the file tags map to a plain object for JSON persistence.
   */
  private serializeTags(): Record<string, string[]> {
    const result: Record<string, string[]> = {}
    for (const [filePath, tags] of this.fileTags) {
      result[filePath] = Array.from(tags)
    }
    return result
  }

  /**
   * Serializes the file properties map to a plain object for JSON persistence.
   */
  private serializeProperties(): Record<string, Record<string, string[]>> {
    const result: Record<string, Record<string, string[]>> = {}
    for (const [filePath, propsMap] of this.fileProperties) {
      const props: Record<string, string[]> = {}
      for (const [key, values] of propsMap) {
        props[key] = values
      }
      result[filePath] = props
    }
    return result
  }

  /**
   * Validates that a parsed JSON value conforms to a supported schema (v1 or v2).
   */
  private validateSchema(data: unknown): data is LinkIndexJson {
    if (data === null || typeof data !== 'object') return false

    const obj = data as Record<string, unknown>

    // Check version field
    if (typeof obj['version'] !== 'number') return false
    if (obj['version'] !== 1 && obj['version'] !== 2) return false

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

    // v2 specific validation
    if (obj['version'] === 2) {
      if (obj['tags'] === null || typeof obj['tags'] !== 'object') return false
      if (obj['properties'] === null || typeof obj['properties'] !== 'object') return false
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
