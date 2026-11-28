import type {
  TFile,
  CachedMetadata,
  BlockCache,
  EventRef,
  IMetadataCacheShim,
  LinkCache,
} from '../types';
import { parseBlocks } from '../block-cache';
import { parseMetadata } from '../metadata-parser';
import { EventSystem } from '../event-system';
import type { DirectoryTree } from '../../../types';
import { resolveWikilinkTarget, collectFilesSorted } from '../../link-resolver';
import { computeLinkpath } from '../link-text';
import { recordGapRead, recordGapCall, isObjectPrototypeMember } from '../api-gap-registry';

/** The slice of the vault the metadata cache needs to index files itself. */
export interface MetadataCacheVault {
  readBinary(file: TFile): Promise<ArrayBuffer>;
  getAbstractFileByPath(path: string): unknown;
}

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
  /**
   * Forward-link targets per file as the server's link index knows them. Fills
   * `resolvedLinks` for files no plugin has read yet — otherwise a graph built
   * from it (Base Graph) shows notes without any edges.
   */
  private indexedLinks: Map<string, string[]> = new Map();

  /**
   * Obsidian's internal two-level cache: `fileCache` maps a path to `{ mtime, size, hash }`,
   * `metadataCache` maps that content hash to the parsed metadata. Plugins that teach Obsidian a
   * new file type (Advanced Canvas indexes `.canvas`) read and write these directly, so they must
   * exist as plain, mutable objects. `getFileCache()`/`getCache()` consult them first.
   */
  readonly fileCache: Record<string, { mtime: number; size: number; hash: string }> = {};
  readonly metadataCache: Record<string, CachedMetadata> = {};
  /** File-name lookup used by link resolution in Obsidian; plugins only ever `add()` to it. */
  readonly uniqueFileLookup = {
    map: new Map<string, TFile[]>(),
    add(name: string, file: TFile): void {
      const list = this.map.get(name) ?? [];
      if (!list.includes(file)) list.push(file);
      this.map.set(name, list);
    },
    remove(name: string, file: TFile): void {
      this.map.set(name, (this.map.get(name) ?? []).filter(f => f !== file));
    },
    get(name: string): TFile[] {
      return this.map.get(name) ?? [];
    },
  };
  /** Per-file link maps a plugin assigned (`resolvedLinks[path] = {...}`); win over the computed ones. */
  private resolvedOverrides: Record<string, Record<string, number>> = {};
  private unresolvedOverrides: Record<string, Record<string, number>> = {};
  /** The vault this cache indexes; set once the VaultShim exists (needed to read file bytes). */
  vault: MetadataCacheVault | null = null;

  /** Connects the vault used by `computeFileMetadataAsync()` / `resolveLinks()`. */
  setVault(vault: MetadataCacheVault): void {
    this.vault = vault;
  }

  /** Stores the `{ mtime, size, hash }` entry of a file (Obsidian-internal, used by plugins). */
  saveFileCache(path: string, entry: { mtime: number; size: number; hash: string }): void {
    this.fileCache[path] = entry;
  }

  /** Stores parsed metadata under its content hash (Obsidian-internal, used by plugins). */
  saveMetaCache(hash: string, metadata: CachedMetadata): void {
    this.metadataCache[hash] = metadata;
  }

  /** Parses raw bytes of a Markdown text into metadata (Obsidian-internal, used by plugins). */
  async computeMetadataAsync(buffer: ArrayBuffer): Promise<CachedMetadata> {
    return parseMetadata(new TextDecoder().decode(new Uint8Array(buffer)));
  }

  /** Reads a file through the vault and (re)builds its cached metadata. */
  async computeFileMetadataAsync(file: TFile): Promise<void> {
    if (!this.vault) return;
    const bytes = await this.vault.readBinary(file);
    this.refreshFileCache(file, new TextDecoder().decode(new Uint8Array(bytes)));
  }

  /** Announces that a file's links are resolved. Resolution itself is computed on read (`resolvedLinks`). */
  resolveLinks(path: string): void {
    const file = this.vault?.getAbstractFileByPath(path);
    if (typeof file === 'object' && file !== null && 'extension' in file) this.events.trigger('resolve', file);
  }

  /** Metadata a plugin stored through `saveFileCache()` + `saveMetaCache()`, if complete. */
  private hashedMetadata(path: string): CachedMetadata | null {
    const hash = this.fileCache[path]?.hash;
    return (hash && this.metadataCache[hash]) || null;
  }

  /** Records a file's forward-link targets from the server's link index. */
  setIndexedLinks(path: string, targets: string[]): void {
    if (targets.length > 0) this.indexedLinks.set(path, targets);
    else this.indexedLinks.delete(path);
  }

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
    const hashed = this.hashedMetadata(file.path);
    if (hashed) return hashed;
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
    const hashed = this.hashedMetadata(path);
    if (hashed) return hashed;
    const cached = this.cache.get(path);
    if (cached) return cached;
    // Notes read so far are parsed on demand, like getFileCache(); unread ones stay unknown (null).
    const content = this.contentStore.get(path);
    if (content === undefined) return null;
    const metadata = this.parseContentToMetadata(content);
    this.cache.set(path, metadata);
    return metadata;
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

    // Files known only from the server's link index (not parsed here yet).
    for (const [sourcePath, links] of this.indexedLinks) {
      if (this.cache.has(sourcePath)) continue;
      const targets: Record<string, number> = {};
      for (const link of links) {
        const resolvedPath = resolveWikilinkTarget(link.split('#')[0]?.trim() ?? '', this.tree);
        if (resolvedPath) targets[resolvedPath] = (targets[resolvedPath] ?? 0) + 1;
      }
      if (Object.keys(targets).length > 0) result[sourcePath] = targets;
    }

    return this.withOverrides(result, this.resolvedOverrides);
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

    return this.withOverrides(result, this.unresolvedOverrides);
  }

  /**
   * Merges per-file maps a plugin assigned and records further assignments on the returned object
   * (`metadataCache.resolvedLinks[path] = {...}` is how Obsidian plugins publish links of their own file types).
   */
  private withOverrides(
    computed: Record<string, Record<string, number>>,
    overrides: Record<string, Record<string, number>>
  ): Record<string, Record<string, number>> {
    return new Proxy({ ...computed, ...overrides }, {
      set(target, prop, value: Record<string, number>): boolean {
        if (typeof prop === 'string') overrides[prop] = value;
        return Reflect.set(target, prop, value);
      },
    });
  }

  /**
   * Returns all links in the vault that point at `file`, grouped by source path.
   *
   * Undocumented but stable internal API — the core Backlinks pane and several
   * plugins (e.g. Dataview, Juggl) call it directly instead of deriving the
   * same thing from `resolvedLinks`. Shape mirrors what those callers expect:
   * a `.data` map plus a `.count()` convenience method.
   */
  getBacklinksForFile(file: TFile): { data: Map<string, LinkCache[]>; count(): number } {
    const data = new Map<string, LinkCache[]>();

    for (const [sourcePath, metadata] of this.cache) {
      if (sourcePath === file.path) continue;
      const links = metadata.links;
      if (!links || links.length === 0) continue;

      const matches: LinkCache[] = [];
      for (const link of links) {
        const cleanedLink = link.link.split('#')[0]?.trim() ?? '';
        if (!cleanedLink) continue;
        const resolvedPath = resolveWikilinkTarget(cleanedLink, this.tree);
        if (resolvedPath === file.path) {
          matches.push(link);
        }
      }

      if (matches.length > 0) {
        data.set(sourcePath, matches);
      }
    }

    return {
      data,
      count(): number {
        let total = 0;
        for (const links of data.values()) total += links.length;
        return total;
      },
    };
  }

  /**
   * Whether `path` matches the user's configured "Excluded files" filters.
   * Slatebase has no equivalent setting yet, so nothing is ever excluded —
   * the same behavior Obsidian has by default with an empty filter list.
   */
  isUserIgnored(_path: string): boolean {
    return false;
  }

  // ─── Event methods ─────────────────────────────────────────────────────────

  /** Register an event listener. */
  on(event: string, callback: (...args: unknown[]) => void, context?: unknown): EventRef {
    return this.events.on(event, callback, context);
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
   * Re-parses a file's saved content and replaces its cached metadata, emitting 'changed'.
   *
   * Called on save so `getFileCache().sections` (and frontmatter/tags/links) reflect the
   * current document instead of the snapshot taken when the file was first opened. Without
   * this, plugins that validate cursor/selection position against live section boundaries
   * (e.g. Advanced Tables' `acceptsTableEdit`) keep using stale line numbers after any edit,
   * and start rejecting positions that are visibly correct in the editor.
   */
  refreshFileCache(file: TFile, content: string): void {
    this.contentStore.set(file.path, content);
    const metadata = this.parseContentToMetadata(content);
    this.cache.set(file.path, metadata);
    this.events.trigger('changed', file, content, metadata);
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
   * Uses the file name if it is unique in the vault, otherwise the full path
   * (Slatebase's link format is always Obsidian's default, `shortest`).
   * `omitMdExtension` defaults to `true`, as in Obsidian.
   */
  fileToLinktext(file: TFile, sourcePath: string, omitMdExtension = true): string {
    const allPaths = this.tree ? collectFilesSorted(this.tree).map((f) => f.path) : [];
    return computeLinkpath(file, sourcePath, allPaths, 'shortest', omitMdExtension);
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

  /**
   * Wraps a MetadataCacheShim instance with a Proxy for non-emulated API
   * interception. Mirrors AppShim/WorkspaceShim/VaultShim's pattern.
   */
  static wrapWithProxy(instance: MetadataCacheShim): MetadataCacheShim & Record<string, unknown> {
    const emulatedProperties = new Set<string | symbol>([
      'getFileCache',
      'populateFromContent',
      'setIndexedLinks',
      'getCache',
      'getFirstLinkpathDest',
      'getBacklinksForFile',
      'isUserIgnored',
      'on',
      'off',
      'offref',
      'trigger',
      'updateFileCache',
      'refreshFileCache',
      'buildInitialCache',
      'updateTree',
      'getTags',
      'getCachedFiles',
      'fileToLinktext',
      'resolvedLinks',
      'unresolvedLinks',
      'blockCache',
      'fileCache',
      'metadataCache',
      'uniqueFileLookup',
      'saveFileCache',
      'saveMetaCache',
      'computeMetadataAsync',
      'computeFileMetadataAsync',
      'resolveLinks',
      'setVault',
      'vault',
    ]);

    return new Proxy(instance, {
      get(target: MetadataCacheShim, prop: string | symbol): unknown {
        // `target` (not the Proxy) is passed as the receiver so getters run
        // with `this` bound to the real instance — see WorkspaceShim.wrapWithProxy
        // for why a proxy receiver here silently breaks getters that read
        // un-allowlisted private fields.
        if (emulatedProperties.has(prop)) {
          const value = Reflect.get(target, prop, target);
          if (typeof value === 'function') {
            return value.bind(target);
          }
          return value;
        }

        if (typeof prop === 'symbol') {
          return Reflect.get(target, prop, target);
        }

        // A callable `then` makes this object "thenable" — if the proxy is ever
        // returned from an async function or otherwise flows through a Promise,
        // the native Promise resolution algorithm calls it as `then(resolve,
        // reject)` instead of just settling with the proxy, and since the no-op
        // below never calls resolve/reject, that await hangs forever. Must stay
        // a plain `undefined`, not fall into the generic callable-no-op path.
        if (prop === 'then') {
          return undefined;
        }

        if (isObjectPrototypeMember(prop)) {
          const value = Reflect.get(target, prop, target);
          return typeof value === 'function' && prop !== 'constructor' ? value.bind(target) : value;
        }

        if (recordGapRead('MetadataCache', prop)) {
          console.warn(
            `[MetadataCacheShim] Access to non-emulated metadataCache method/property "${prop}". ` +
            `Slatebase returns a no-op function here, which is truthy — feature ` +
            `detection like \`if (metadataCache.${prop})\` will take the wrong branch. ` +
            `Inspect all gaps with window.__slatebasePluginApiGaps().`
          );
        }

        return (...args: unknown[]) => {
          recordGapCall('MetadataCache', prop);
          void args;
          return undefined;
        };
      },
    }) as MetadataCacheShim & Record<string, unknown>;
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
