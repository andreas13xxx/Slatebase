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

  constructor(directoryTree: DirectoryTree | null) {
    this.tree = directoryTree;
  }

  /**
   * Returns the cached metadata for a given file.
   * Returns null if the file hasn't been parsed or doesn't exist in cache.
   */
  getFileCache(file: TFile): CachedMetadata | null {
    return this.cache.get(file.path) ?? null;
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
   */
  updateFileCache(file: TFile, metadata: CachedMetadata): void {
    this.cache.set(file.path, metadata);
    this.events.trigger('changed', file, metadata);
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
}

/**
 * Gets the directory portion of a file path.
 * Returns empty string for root-level files.
 */
function getDirectory(filePath: string): string {
  const lastSlash = filePath.lastIndexOf('/');
  return lastSlash > 0 ? filePath.slice(0, lastSlash) : '';
}
