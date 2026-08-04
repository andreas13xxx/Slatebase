import type {
  TFile,
  CachedMetadata,
  EventRef,
  IMetadataCacheShim,
} from '../types';
import { EventSystem } from '../event-system';
import type { DirectoryTree } from '../../../types';
import { resolveWikilinkTarget, collectFilesSorted } from '../../link-resolver';

/**
 * MetadataCacheShim — Obsidian-compatible MetadataCache emulation.
 *
 * Provides:
 * - getFileCache(file): Returns CachedMetadata for a given file
 * - getFirstLinkpathDest(linkpath, sourcePath): Resolves link to target TFile
 * - resolvedLinks: Map of source-path → target-path → link count
 * - Event emission: 'changed' when file cache updates, 'resolved' after initial build
 *
 * External methods to update cache state:
 * - updateFileCache(file, metadata): Updates cache for a file and emits 'changed'
 * - buildInitialCache(entries): Sets initial cache and emits 'resolved'
 * - updateTree(tree): Updates directory tree for link resolution
 */
export class MetadataCacheShim implements IMetadataCacheShim {
  private events = new EventSystem();
  private cache: Map<string, CachedMetadata> = new Map();
  private tree: DirectoryTree | null;
  /** Content store for on-demand metadata parsing when explicit cache is empty */
  private contentStore: Map<string, string> = new Map();

  constructor(directoryTree: DirectoryTree | null) {
    this.tree = directoryTree;
  }

  /**
   * Returns the cached metadata for a given file.
   * Returns null if the file hasn't been parsed or doesn't exist in cache.
   *
   * For files that exist in the vault but haven't been explicitly cached yet,
   * returns parsed metadata from the content store (populated by vault reads).
   * This is critical because plugins like Dataview get tags and frontmatter
   * exclusively from the MetadataCache, not from raw file content.
   */
  getFileCache(file: TFile): CachedMetadata | null {
    const cached = this.cache.get(file.path);
    if (cached) return cached;

    // If we have file content available, parse and cache metadata on demand
    const content = this.contentStore.get(file.path);
    if (content !== undefined) {
      const metadata = this.parseContentToMetadata(content);
      this.cache.set(file.path, metadata);
      return metadata;
    }

    // If the file exists in the vault tree, return a minimal empty metadata object.
    // Dataview's reload() checks `getFileCache(file) != null` before importing —
    // without this, all files are skipped and the index stays empty.
    if (this.tree && this.fileExistsInTree(file.path)) {
      return {};
    }

    return null;
  }

  /**
   * Registers file content for on-demand metadata parsing.
   * Called by VaultShim after reading a file, so that getFileCache() can
   * return meaningful metadata (frontmatter, tags, links) without needing
   * a separate async cache-building step.
   */
  populateFromContent(path: string, content: string): void {
    this.contentStore.set(path, content);
    // If this path was already in the explicit cache with empty metadata,
    // re-parse it now with the actual content.
    const existing = this.cache.get(path);
    if (existing && !existing.frontmatter && !existing.tags) {
      const metadata = this.parseContentToMetadata(content);
      this.cache.set(path, metadata);
    }
  }

  /**
   * Returns the cached metadata for a file path (string variant of getFileCache).
   * Used by plugins like Kanban that look up metadata by path string.
   * Returns null if the path hasn't been parsed or doesn't exist in cache.
   */
  getCache(path: string): CachedMetadata | null {
    if (!path) return null;
    return this.cache.get(path) ?? null;
  }

  /**
   * Resolves a link path against the directory tree and returns the target TFile.
   * Uses the same link-resolver logic as the main Slatebase application:
   * - Case-insensitive search
   * - Try with and without .md extension
   * - Resolve relative to source path
   *
   * Returns null if the link can't be resolved to an existing file.
   */
  getFirstLinkpathDest(linkpath: string, sourcePath: string): TFile | null {
    if (!this.tree || !linkpath.trim()) return null;

    // Strip heading/block references from the link path (e.g. "note#heading" → "note")
    const cleanedLink = linkpath.split('#')[0]?.trim() ?? '';
    if (!cleanedLink) return null;

    // Try resolving relative to source path directory
    const sourceDir = getDirectory(sourcePath);
    const relativePath = sourceDir ? `${sourceDir}/${cleanedLink}` : cleanedLink;

    // Try relative resolution first
    let resolvedPath = resolveWikilinkTarget(relativePath, this.tree);

    // Fall back to vault-wide resolution
    if (!resolvedPath) {
      resolvedPath = resolveWikilinkTarget(cleanedLink, this.tree);
    }

    if (!resolvedPath) return null;

    // Build a TFile from the resolved path
    return this.buildTFileFromPath(resolvedPath);
  }

  /**
   * Returns a map of all resolved links in the vault.
   * Structure: source-path → { target-path → link count }
   */
  get resolvedLinks(): Record<string, Record<string, number>> {
    const result: Record<string, Record<string, number>> = {};

    for (const [sourcePath, metadata] of this.cache) {
      const links = metadata.links;
      if (!links || links.length === 0) continue;

      const targets: Record<string, number> = {};

      for (const link of links) {
        const cleanedLink = link.link.split('#')[0]?.trim() ?? '';
        if (!cleanedLink) continue;

        // Resolve the link against the tree
        const resolvedPath = resolveWikilinkTarget(cleanedLink, this.tree);
        if (resolvedPath) {
          targets[resolvedPath] = (targets[resolvedPath] ?? 0) + 1;
        }
      }

      if (Object.keys(targets).length > 0) {
        result[sourcePath] = targets;
      }
    }

    return result;
  }

  /**
   * Contains all unresolved links. This object maps each source file to an object
   * of unknown destinations with count. Source paths are vault absolute paths.
   */
  get unresolvedLinks(): Record<string, Record<string, number>> {
    const result: Record<string, Record<string, number>> = {};

    for (const [sourcePath, metadata] of this.cache) {
      const links = metadata.links;
      if (!links || links.length === 0) continue;

      const unresolved: Record<string, number> = {};

      for (const link of links) {
        const cleanedLink = link.link.split('#')[0]?.trim() ?? '';
        if (!cleanedLink) continue;

        // Try to resolve — if it fails, it's unresolved
        const resolvedPath = resolveWikilinkTarget(cleanedLink, this.tree);
        if (!resolvedPath) {
          unresolved[cleanedLink] = (unresolved[cleanedLink] ?? 0) + 1;
        }
      }

      if (Object.keys(unresolved).length > 0) {
        result[sourcePath] = unresolved;
      }
    }

    return result;
  }

  // ─── Event methods ─────────────────────────────────────────────────────────

  /** Register an event listener. */
  on(event: string, callback: (...args: unknown[]) => void): EventRef {
    return this.events.on(event, callback);
  }

  /** Remove an event listener. */
  off(event: string, callback: (...args: unknown[]) => void): void {
    this.events.off(event, callback);
  }

  /** Trigger an event. */
  trigger(event: string, ...args: unknown[]): void {
    this.events.trigger(event, ...args);
  }

  // ─── External update methods ───────────────────────────────────────────────

  /**
   * Updates the cache for a single file and emits 'changed' event.
   * Called when a file is saved or synced externally.
   * Also emits 'resolve' for the specific file (Obsidian emits this after link resolution).
   */
  updateFileCache(file: TFile, metadata: CachedMetadata): void {
    this.cache.set(file.path, metadata);
    this.events.trigger('changed', file, '', metadata);
    // Emit per-file resolve event (Obsidian fires this after resolvedLinks is updated for the file)
    this.events.trigger('resolve', file);
  }

  /**
   * Sets the initial cache for all files and emits 'resolved' event once.
   * Called after the initial cache build for all markdown files.
   */
  buildInitialCache(entries: Map<string, CachedMetadata>): void {
    this.cache = new Map(entries);
    this.events.trigger('resolved');
  }

  /**
   * Updates the directory tree used for link resolution.
   */
  updateTree(tree: DirectoryTree | null): void {
    this.tree = tree;
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  /**
   * Checks if a file path exists in the current directory tree.
   * Used by getFileCache() to return minimal metadata for existing files
   * that haven't been explicitly cached yet.
   */
  private fileExistsInTree(path: string): boolean {
    if (!this.tree) return false;
    const files = collectFilesSorted(this.tree);
    return files.some(f => f.path === path);
  }

  /**
   * Parses markdown content to extract CachedMetadata (frontmatter, tags, links).
   * Used for on-demand metadata generation when explicit cache hasn't been populated.
   *
   * Extracts:
   * - frontmatter: YAML between --- delimiters
   * - tags: inline #tags in text (outside code blocks) + frontmatter tags
   * - links: [[wikilinks]] in text
   * - headings: # headings
   */
  private parseContentToMetadata(content: string): CachedMetadata {
    const metadata: CachedMetadata = {};

    // Normalize CRLF to LF (lessons-learned #25: JS regex `.` doesn't match `\r`)
    const normalizedContent = content.replace(/\r\n/g, '\n')

    // Parse frontmatter (YAML between --- delimiters)
    const fmMatch = normalizedContent.match(/^---\n([\s\S]*?)\n---/)
    if (fmMatch) {
      const fmText = fmMatch[1] ?? ''
      const frontmatter: Record<string, unknown> = {}

      // Simple YAML parsing for common fields
      for (const line of fmText.split('\n')) {
        const kvMatch = line.match(/^(\w[\w-]*)\s*:\s*(.+)$/)
        if (kvMatch) {
          const key = kvMatch[1]!
          let value: unknown = kvMatch[2]!.trim()

          // Parse array values: [item1, item2] or - item
          if (typeof value === 'string' && value.startsWith('[') && value.endsWith(']')) {
            value = value.slice(1, -1).split(',').map(s => s.trim()).filter(Boolean)
          }

          frontmatter[key] = value
        }
      }

      if (Object.keys(frontmatter).length > 0) {
        metadata.frontmatter = frontmatter
      }

      // Add frontmatter tags as tag objects in metadata.tags
      // Dataview reads both metadata.tags (for tag objects) and metadata.frontmatter.tags
      const fmTags = frontmatter['tags'] ?? frontmatter['tag']
      if (fmTags) {
        const tagArray = Array.isArray(fmTags) ? fmTags : [fmTags]
        const fmTagObjects = tagArray.map((t: unknown) => {
          const tagStr = String(t).trim()
          return {
            tag: tagStr.startsWith('#') ? tagStr : '#' + tagStr,
            position: { start: { line: 0, col: 0, offset: 0 }, end: { line: 0, col: 0, offset: 0 } },
          }
        })
        // Will be merged with inline tags below
        metadata.tags = fmTagObjects
      }
    }

    // Extract inline tags (outside code blocks)
    const tags: Array<{ tag: string; position: { start: { line: number; col: number; offset: number }; end: { line: number; col: number; offset: number } } }> = []
    const lines = normalizedContent.split('\n')
    let codeBlockFenceLength = 0  // 0 = not in code block, >0 = min backticks needed to close
    let inFrontmatter = false
    let offset = 0

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum]!
      if (lineNum === 0 && line.trim() === '---') {
        inFrontmatter = true
        offset += line.length + 1
        continue
      }
      if (inFrontmatter) {
        if (line.trim() === '---') inFrontmatter = false
        offset += line.length + 1
        continue
      }
      // Code fence detection: track opening fence length, close only with same or longer fence
      const fenceMatch = line.match(/^(`{3,}|~{3,})/)
      if (fenceMatch) {
        const fenceLen = fenceMatch[1]!.length
        if (codeBlockFenceLength === 0) {
          // Opening a code block
          codeBlockFenceLength = fenceLen
        } else if (fenceLen >= codeBlockFenceLength && line.trim() === fenceMatch[1]) {
          // Closing the code block (must be at least as long, no info string)
          codeBlockFenceLength = 0
        }
        offset += line.length + 1
        continue
      }
      if (codeBlockFenceLength === 0) {
        // Find inline tags: #tag (not in code spans, not preceded by &)
        const tagRegex = /(?:^|(?<=\s))#([a-zA-Z\u00C0-\u024F][\w\u00C0-\u024F/-]*)/g
        let match
        while ((match = tagRegex.exec(line)) !== null) {
          // Skip if inside inline code
          const beforeTag = line.substring(0, match.index)
          const backtickCount = (beforeTag.match(/`/g) ?? []).length
          if (backtickCount % 2 !== 0) continue

          tags.push({
            tag: '#' + match[1],
            position: {
              start: { line: lineNum, col: match.index, offset: offset + match.index },
              end: { line: lineNum, col: match.index + match[0].length, offset: offset + match.index + match[0].length },
            },
          })
        }
      }
      offset += line.length + 1
    }

    if (tags.length > 0) {
      // Merge with any frontmatter tags already set above
      metadata.tags = [...(metadata.tags ?? []), ...tags]
    }

    // Extract wikilinks [[target|display]]
    const links: Array<{ link: string; displayText?: string; original: string; position: { start: { line: number; col: number; offset: number }; end: { line: number; col: number; offset: number } } }> = []
    offset = 0
    let linkCodeBlockFenceLength = 0
    inFrontmatter = false

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum]!
      if (lineNum === 0 && line.trim() === '---') {
        inFrontmatter = true
        offset += line.length + 1
        continue
      }
      if (inFrontmatter) {
        if (line.trim() === '---') inFrontmatter = false
        offset += line.length + 1
        continue
      }
      const linkFenceMatch = line.match(/^(`{3,}|~{3,})/)
      if (linkFenceMatch) {
        const fenceLen = linkFenceMatch[1]!.length
        if (linkCodeBlockFenceLength === 0) {
          linkCodeBlockFenceLength = fenceLen
        } else if (fenceLen >= linkCodeBlockFenceLength && line.trim() === linkFenceMatch[1]) {
          linkCodeBlockFenceLength = 0
        }
        offset += line.length + 1
        continue
      }
      if (linkCodeBlockFenceLength === 0) {
        const linkRegex = /\[\[([^\]]+)\]\]/g
        let match
        while ((match = linkRegex.exec(line)) !== null) {
          const inner = match[1]!
          const pipeIdx = inner.indexOf('|')
          const link = pipeIdx >= 0 ? inner.substring(0, pipeIdx) : inner
          const displayText = pipeIdx >= 0 ? inner.substring(pipeIdx + 1) : undefined
          links.push({
            link,
            displayText,
            original: match[0],
            position: {
              start: { line: lineNum, col: match.index, offset: offset + match.index },
              end: { line: lineNum, col: match.index + match[0].length, offset: offset + match.index + match[0].length },
            },
          })
        }
      }
      offset += line.length + 1
    }

    if (links.length > 0) {
      metadata.links = links
    }

    return metadata
  }

  /**
   * Builds a TFile object from a resolved path and the current directory tree.
   */
  private buildTFileFromPath(resolvedPath: string): TFile | null {
    if (!this.tree) return null;

    const files = collectFilesSorted(this.tree);
    const fileEntry = files.find(f => f.path === resolvedPath);
    if (!fileEntry) return null;

    const name = fileEntry.name;
    const lastDot = name.lastIndexOf('.');
    const basename = lastDot > 0 ? name.slice(0, lastDot) : name;
    const extension = lastDot > 0 ? name.slice(lastDot + 1) : '';

    return {
      path: resolvedPath,
      name,
      basename,
      extension,
      stat: { mtime: 0, ctime: 0, size: 0 },
      parent: null,
    };
  }

  /**
   * Get all tags in the vault with their occurrence counts.
   * Returns a Record<tag, count> (e.g. { '#todo': 5, '#project': 3 }).
   */
  getTags(): Record<string, number> {
    const tags: Record<string, number> = {};
    for (const metadata of this.cache.values()) {
      if (metadata.tags) {
        for (const t of metadata.tags) {
          tags[t.tag] = (tags[t.tag] ?? 0) + 1;
        }
      }
    }
    return tags;
  }

  /**
   * Get all file paths that have cached metadata.
   * Used by Excalidraw and other plugins for file lookups.
   */
  getCachedFiles(): string[] {
    return [...this.cache.keys()];
  }

  /**
   * Generate a linktext for a file relative to a source path.
   * Uses the shortest unique basename if possible, otherwise full path.
   */
  fileToLinktext(file: TFile, _sourcePath: string, omitMdExtension?: boolean): string {
    const name = omitMdExtension && file.extension === 'md' ? file.basename : file.name;
    return name;
  }

  /**
   * Block cache — stub object for plugins that access block IDs.
   * Returns an empty object with a getForFile stub.
   */
  readonly blockCache = {
    getForFile: (_sourcePath: unknown): unknown => null,
  };
}

/**
 * Gets the directory portion of a file path.
 * Returns empty string for root-level files.
 */
function getDirectory(filePath: string): string {
  const lastSlash = filePath.lastIndexOf('/');
  return lastSlash > 0 ? filePath.slice(0, lastSlash) : '';
}
