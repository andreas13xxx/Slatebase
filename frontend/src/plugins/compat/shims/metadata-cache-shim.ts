import type {
  TFile,
  CachedMetadata,
  BlockCache,
  EventRef,
  IMetadataCacheShim,
} from '../types';
import { parseBlocks } from '../block-cache';
import { parseMetadata } from '../metadata-parser';
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

  /**
   * Remove a listener by the ref `on()` returned.
   *
   * Part of Obsidian's `Events` base class, which MetadataCache extends. Without
   * it, `metadataCache.offref(ref)` was a TypeError.
   */
  offref(ref: EventRef): void {
    this.events.offref(ref);
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
   * Parses markdown content into full Obsidian-shaped CachedMetadata.
   * Used for on-demand metadata generation when explicit cache hasn't been populated.
   * See {@link parseMetadata} for the field-by-field extraction logic.
   */
  private parseContentToMetadata(content: string): CachedMetadata {
    return parseMetadata(content);
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
   * Block cache — Obsidian-internal counterpart to `CachedMetadata.blocks`.
   *
   * Not part of the public API, so its exact shape is undocumented; plugins that
   * reach for it are reading Obsidian's internals. It is backed by the same
   * parse as `getFileCache(file).blocks`, which is the supported way to get at
   * this data.
   *
   * Obsidian calls it as `getForFile(cancelContext, file)`. Both that form and a
   * plain file argument are accepted, since callers vary by Obsidian version.
   */
  readonly blockCache = {
    getForFile: (...args: unknown[]): { blocks: Record<string, BlockCache> } | null => {
      const file = args.find(
        (arg): arg is { path: string } =>
          typeof arg === 'object' && arg !== null && typeof (arg as { path?: unknown }).path === 'string',
      );
      if (!file) return null;

      const content = this.contentStore.get(file.path);
      if (content === undefined) return null;

      return { blocks: parseBlocks(content) };
    },
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
