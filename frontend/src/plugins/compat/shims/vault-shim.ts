/**
 * VaultShim — Obsidian-compatible Vault interface implementation.
 *
 * Provides read/modify/create/delete operations on vault files via the Slatebase API.
 * Emits events (create, modify, delete) on successful operations.
 * Validates paths to reject traversal attacks (../, null bytes, absolute paths).
 */

import type { IApiClient } from '../../../api/index';
import type { DirectoryTree } from '../../../types';
import type { DataWriteOptions, EventRef, IVaultShim, TAbstractFile, TFile, TFolder } from '../types';
import { EventSystem } from '../event-system';
import { dispatchRealtimeVaultChange } from '../../../state/realtimeVaultBridge';
import { getStoredAuthToken, getStoredCsrfToken } from '../../../state/authContext';
import { markPluginWrite } from '../plugin-event-bridge';
import { warnNoOp } from '../log';
import { recordGapRead, recordGapCall } from '../api-gap-registry';
import { VaultAdapterShim } from './vault-adapter-shim';
import type { IVaultAdapter } from './vault-adapter-shim';

// ─── Module-Level Active Vault Reference ─────────────────────────────────────

/**
 * Reference to the currently active VaultShim instance.
 * Used by treeNodeToTFile/treeNodeToTFolder to set the `vault` property
 * on created TFile/TFolder objects (Obsidian's TAbstractFile.vault).
 */
let activeVaultShimRef: IVaultShim | null = null;

/**
 * Set the active vault shim reference. Called by VaultShim constructor
 * and when the active vault changes.
 */
export function setActiveVaultShimRef(vault: IVaultShim | null): void {
  activeVaultShimRef = vault;
}

/**
 * Validates a file path for safety.
 * Rejects paths containing ../, null bytes, or starting with / (absolute paths).
 * @throws Error if path is invalid
 */
export function validatePath(path: string): void {
  if (path.includes('\0')) {
    throw new Error(`Invalid path "${path}": contains null bytes`);
  }
  if (path.includes('../') || path.includes('..\\')) {
    throw new Error(`Invalid path "${path}": contains path traversal sequence`);
  }
  if (path.startsWith('/') || path.startsWith('\\')) {
    throw new Error(`Invalid path "${path}": absolute paths are not allowed`);
  }
  if (path === '' || path.trim() === '') {
    throw new Error(`Invalid path "${path}": path must not be empty`);
  }
}

/**
 * Creates a TFile object from a DirectoryTree node.
 * Uses the global obsidian.TFile prototype if available (for instanceof checks).
 */
export function treeNodeToTFile(node: DirectoryTree, parent: TFolder | null): TFile {
  const name = node.name;
  const dotIndex = name.lastIndexOf('.');
  const basename = dotIndex > 0 ? name.slice(0, dotIndex) : name;
  const extension = dotIndex > 0 ? name.slice(dotIndex + 1) : '';

  const file: TFile = {
    path: node.path,
    name,
    basename,
    extension,
    stat: {
      mtime: Date.now(),
      ctime: Date.now(),
      size: node.size ?? 0,
    },
    parent,
  };

  // Set prototype to global obsidian.TFile so `instanceof` checks work
  const globalTFile = (window as unknown as { obsidian?: { TFile?: { prototype: object } } }).obsidian?.TFile?.prototype;
  if (globalTFile) {
    Object.setPrototypeOf(file, globalTFile);
  }

  // Set vault reference (Obsidian's TAbstractFile.vault)
  if (activeVaultShimRef) {
    (file as unknown as { vault: IVaultShim }).vault = activeVaultShimRef;
  }

  return file;
}

/**
 * Creates a TFolder object from a DirectoryTree node.
 * Uses the global obsidian.TFolder prototype if available (for instanceof checks).
 */
export function treeNodeToTFolder(node: DirectoryTree, parent: TFolder | null): TFolder {
  const folder: TFolder = {
    path: node.path,
    name: node.name,
    children: [],
    parent,
    isRoot() {
      return this.path === '' || this.path === '/';
    },
  };

  // Populate children from the DirectoryTree node so that
  // Vault.recurseChildren() (used by Calendar etc.) can traverse them.
  if (node.children) {
    for (const child of node.children) {
      if (child.type === 'file') {
        folder.children.push(treeNodeToTFile(child, folder));
      } else {
        folder.children.push(treeNodeToTFolder(child, folder));
      }
    }
  }

  // Set prototype to global obsidian.TFolder so `instanceof` checks work
  const globalTFolder = (window as unknown as { obsidian?: { TFolder?: { prototype: object } } }).obsidian?.TFolder?.prototype;
  if (globalTFolder) {
    Object.setPrototypeOf(folder, globalTFolder);
  }

  // Set vault reference (Obsidian's TAbstractFile.vault)
  if (activeVaultShimRef) {
    (folder as unknown as { vault: IVaultShim }).vault = activeVaultShimRef;
  }

  return folder;
}

/**
 * Recursively collects all TFile entries from a DirectoryTree.
 */
function collectFiles(node: DirectoryTree, parent: TFolder | null, files: TFile[]): void {
  if (node.type === 'file') {
    files.push(treeNodeToTFile(node, parent));
  } else if (node.children) {
    const folder = treeNodeToTFolder(node, parent);
    for (const child of node.children) {
      collectFiles(child, folder, files);
    }
  }
}

/**
 * Recursively collects all TFile and TFolder entries from a DirectoryTree.
 */
function collectAll(node: DirectoryTree, parent: TFolder | null, result: TAbstractFile[]): void {
  if (node.type === 'file') {
    result.push(treeNodeToTFile(node, parent));
  } else {
    const folder = treeNodeToTFolder(node, parent);
    result.push(folder);
    if (node.children) {
      for (const child of node.children) {
        collectAll(child, folder, result);
      }
    }
  }
}

/**
 * Searches a DirectoryTree for a node at the given path (case-insensitive).
 * Returns the matching DirectoryTree node or null.
 */
function findNodeByPathInsensitive(tree: DirectoryTree, lowerPath: string): DirectoryTree | null {
  if (tree.path.toLowerCase() === lowerPath) {
    return tree;
  }
  if (tree.children) {
    for (const child of tree.children) {
      const found = findNodeByPathInsensitive(child, lowerPath);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Recursively collects all TFolder entries from a DirectoryTree.
 */
function collectFolders(node: DirectoryTree, parent: TFolder | null, folders: TFolder[]): void {
  if (node.type === 'directory' && node.children) {
    const folder = treeNodeToTFolder(node, parent);
    folders.push(folder);
    for (const child of node.children) {
      collectFolders(child, folder, folders);
    }
  }
}

/**
 * Searches a DirectoryTree for a node at the given path.
 * Returns the matching DirectoryTree node or null.
 */
function findNodeByPath(tree: DirectoryTree, targetPath: string): DirectoryTree | null {
  if (tree.path === targetPath) {
    return tree;
  }
  if (tree.children) {
    for (const child of tree.children) {
      const found = findNodeByPath(child, targetPath);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Finds the parent directory node for a given path.
 */
function findParentNode(tree: DirectoryTree, targetPath: string): TFolder | null {
  const lastSlash = targetPath.lastIndexOf('/');
  if (lastSlash === -1) {
    // Parent is root
    return treeNodeToTFolder(tree, null);
  }
  const parentPath = targetPath.slice(0, lastSlash);
  const parentNode = findNodeByPath(tree, parentPath);
  if (parentNode && parentNode.type === 'directory') {
    return treeNodeToTFolder(parentNode, null);
  }
  return null;
}

// ─── Local Tree Mutation Helpers ──────────────────────────────────────────────
//
// create()/delete()/rename()/createFolder() call the backend and then want the
// local `directoryTree` snapshot to reflect the change immediately, rather than
// waiting for the next `updateTree()` call (which only arrives after a realtime
// sync round-trip). That gap is what let plugins like Templater — which create a
// file and then synchronously look it up via getAbstractFileByPath()/exists()/
// getFileByPath() (all synchronous, cache-only APIs — they can't await a network
// call the way read()/delete()/rename() do) — see a stale, wrong answer.
//
// These helpers return a *new* tree (structural sharing elsewhere) rather than
// mutating in place, since `directoryTree` may be the same object a pending
// `updateTree()` snapshot was derived from.

/**
 * Returns a tree with `child` inserted (or replaced, matched by path) under the
 * directory at `parentPath`, creating any missing intermediate directories.
 */
function withNodeInserted(tree: DirectoryTree, parentPath: string, child: DirectoryTree): DirectoryTree {
  if (tree.path === parentPath) {
    const children = (tree.children ?? []).filter((c) => c.path !== child.path);
    children.push(child);
    return { ...tree, type: 'directory', children };
  }

  const rest = tree.path ? parentPath.slice(tree.path.length + 1) : parentPath;
  const nextSlash = rest.indexOf('/');
  const segmentName = nextSlash === -1 ? rest : rest.slice(0, nextSlash);
  const segmentPath = tree.path ? `${tree.path}/${segmentName}` : segmentName;

  const existingChildren = tree.children ?? [];
  const existingIdx = existingChildren.findIndex((c) => c.path === segmentPath);
  const segmentDir: DirectoryTree =
    existingIdx !== -1 && existingChildren[existingIdx].type === 'directory'
      ? existingChildren[existingIdx]
      : { name: segmentName, type: 'directory', path: segmentPath, children: [] };

  const updatedSegmentDir = withNodeInserted(segmentDir, parentPath, child);

  const children = [...existingChildren];
  if (existingIdx !== -1) {
    children[existingIdx] = updatedSegmentDir;
  } else {
    children.push(updatedSegmentDir);
  }
  return { ...tree, children };
}

/**
 * Returns a tree with the node at `path` removed, wherever it is.
 */
function withNodeRemoved(tree: DirectoryTree, path: string): DirectoryTree {
  if (!tree.children) return tree;
  let changed = false;
  const children: DirectoryTree[] = [];
  for (const child of tree.children) {
    if (child.path === path) {
      changed = true;
      continue;
    }
    const updatedChild = withNodeRemoved(child, path);
    if (updatedChild !== child) changed = true;
    children.push(updatedChild);
  }
  return changed ? { ...tree, children } : tree;
}

/**
 * Returns a copy of `node` with its path (and, for directories, every
 * descendant's path) rewritten from the `oldPrefix` to `newPrefix`.
 */
function withPathPrefixReplaced(node: DirectoryTree, oldPrefix: string, newPrefix: string): DirectoryTree {
  const newPath = newPrefix + node.path.slice(oldPrefix.length);
  const name = newPath.includes('/') ? newPath.slice(newPath.lastIndexOf('/') + 1) : newPath;
  const updated: DirectoryTree = { ...node, path: newPath, name };
  if (node.children) {
    updated.children = node.children.map((c) => withPathPrefixReplaced(c, oldPrefix, newPrefix));
  }
  return updated;
}

/**
 * VaultShim implementation.
 *
 * Wraps the Slatebase API client to provide an Obsidian-compatible Vault interface.
 * Requires a vaultId, vaultName, API client reference, and a DirectoryTree.
 */
export class VaultShim implements IVaultShim {
  private readonly vaultId: string;
  private readonly vaultName: string;
  private readonly apiClient: IApiClient;
  private directoryTree: DirectoryTree;
  private readonly events: EventSystem;

  /** Obsidian-compatible DataAdapter for raw filesystem access. */
  readonly adapter: IVaultAdapter;

  /** Optional callback invoked after a file is read, with path and content. */
  onFileRead: ((path: string, content: string) => void) | null = null;

  constructor(
    vaultId: string,
    vaultName: string,
    apiClient: IApiClient,
    directoryTree: DirectoryTree
  ) {
    this.vaultId = vaultId;
    this.vaultName = vaultName;
    this.apiClient = apiClient;
    this.directoryTree = directoryTree;
    this.events = new EventSystem();
    this.adapter = new VaultAdapterShim(vaultId, apiClient, () => this.directoryTree);
    // Set as active vault so treeNodeToTFile/treeNodeToTFolder can assign .vault
    setActiveVaultShimRef(this);
  }

  /**
   * Update the directory tree when it changes (e.g. after a file operation or sync).
   */
  updateTree(tree: DirectoryTree): void {
    this.directoryTree = tree;
  }

  /**
   * Read the text content of a file.
   * Does not gate on the local directory tree cache — see delete() below for why
   * (a file created via create() moments earlier, e.g. Templater reading back a
   * note it just created, won't be in the tree yet). The backend call is the
   * authoritative existence check.
   * @throws Error if the file does not exist or the API call fails.
   */
  async read(file: TFile): Promise<string> {
    validatePath(file.path);

    try {
      const result = await this.apiClient.fetchFileContent(this.vaultId, file.path);
      // Real Obsidian's Vault.read() always normalizes CRLF to LF — plugins get
      // consistent `\n`-only content regardless of how the file was saved.
      // This must match what MetadataCacheShim's parser normalizes internally
      // (see metadata-parser.ts): getFileCache() positions are computed against
      // LF-only offsets, and a CRLF file (e.g. saved from Windows) returned here
      // unnormalized would be longer than that by one byte per line break —
      // every position after the first line would point at the wrong character,
      // silently corrupting anything a plugin slices out by cached position
      // (e.g. obsidian-day-planner's list-item parser, which then fails to
      // match its own line-format regex on the shifted substring).
      const content = result.content.replace(/\r\n/g, '\n');
      // Notify MetadataCache so it can parse frontmatter/tags on demand
      if (this.onFileRead) {
        this.onFileRead(file.path, content);
      }
      return content;
    } catch (err: unknown) {
      const appErr = err as { code?: string; message?: string };
      throw new Error(
        `Failed to read "${file.path}": ${appErr.message ?? 'unknown error'} (code: ${appErr.code ?? 'UNKNOWN'})`,
        { cause: err }
      );
    }
  }

  /**
   * Modify the content of an existing file.
   * If the file is not yet in the local directory tree (e.g. just created),
   * we still send the write to the backend which validates independently.
   *
   * `options` (Obsidian 1.4.4+) is accepted for signature compatibility but
   * mtime/ctime are not persisted — the backend always stamps the actual
   * write time.
   */
  async modify(file: TFile, content: string, options?: DataWriteOptions): Promise<void> {
    validatePath(file.path);
    if (options?.mtime !== undefined || options?.ctime !== undefined) {
      warnNoOp('Vault', 'modify(..., options)', 'Custom mtime/ctime are not persisted; the write is timestamped normally.')
    }

    try {
      await this.apiClient.saveFile(this.vaultId, file.path, content);
      markPluginWrite(file.path);
      this.events.trigger('modify', file);
    } catch (err: unknown) {
      const appErr = err as { code?: string; message?: string };
      throw new Error(
        `Failed to modify "${file.path}": ${appErr.message ?? 'unknown error'} (code: ${appErr.code ?? 'UNKNOWN'})`,
        { cause: err }
      );
    }
  }

  /**
   * Create a new file at the given path.
   * If the file already exists, returns the existing TFile without modifying it.
   * This matches the behavior expected by many Obsidian plugins (e.g. Calendar)
   * that use vault.create() as a "create or get" operation.
   */
  async create(path: string, content?: string): Promise<TFile> {
    validatePath(path);

    const existing = findNodeByPath(this.directoryTree, path);
    if (existing && existing.type === 'file') {
      const parent = findParentNode(this.directoryTree, path);
      const tFile = treeNodeToTFile(existing, parent);

      // Open the existing file as a tab (plugins expect create-or-open behavior)
      const workspace = (window as unknown as { app?: { workspace?: { openFileDirectly?: (filePath: string) => void } } }).app?.workspace;
      if (workspace?.openFileDirectly) {
        workspace.openFileDirectly(path);
      }

      return tFile;
    }

    try {
      await this.apiClient.saveFile(this.vaultId, path, content ?? '');

      const name = path.includes('/') ? path.slice(path.lastIndexOf('/') + 1) : path;
      const parentPath = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
      const newNode: DirectoryTree = { name, type: 'file', path, size: (content ?? '').length };

      // Splice the new file into the local tree immediately so synchronous,
      // cache-only lookups (getAbstractFileByPath, exists, getFileByPath,
      // getAvailablePath) see it right away — they can't await the realtime
      // sync round-trip the way read()/delete()/rename() await the backend.
      this.directoryTree = withNodeInserted(this.directoryTree, parentPath, newNode);
      const parent = findParentNode(this.directoryTree, path);

      // Build via treeNodeToTFile so the result gets the same instanceof-TFile
      // prototype patch and vault reference as files loaded from the tree —
      // plugins (e.g. LiveSync's sync watcher) do `instanceof TFile` checks
      // on the objects passed to 'create' event listeners.
      const tFile = treeNodeToTFile(newNode, parent);

      markPluginWrite(path);
      this.events.trigger('create', tFile);

      // Notify the app to refresh the file explorer tree
      dispatchRealtimeVaultChange({
        vaultId: this.vaultId,
        action: 'saved',
        path,
        userId: '',
        username: '',
      });

      // Open a tab for the newly created file — mirrors the "already exists" branch
      // above so vault.create() always surfaces the file to the user, whether it's
      // brand new or already there (matches Slatebase's own "new file" behavior).
      const workspace = (window as unknown as { app?: { workspace?: { openFileDirectly?: (filePath: string) => void } } }).app?.workspace;
      if (workspace?.openFileDirectly) {
        workspace.openFileDirectly(path);
      }

      return tFile;
    } catch (err: unknown) {
      const appErr = err as { code?: string; message?: string };
      throw new Error(
        `Failed to create "${path}": ${appErr.message ?? 'unknown error'} (code: ${appErr.code ?? 'UNKNOWN'})`,
        { cause: err }
      );
    }
  }

  /**
   * Create a folder at the given path.
   * Leverages the backend's automatic intermediate directory creation by writing
   * and immediately deleting a placeholder file.
   * @throws Error if the folder already exists or the API call fails.
   */
  async createFolder(path: string): Promise<TFolder> {
    validatePath(path);

    const existing = findNodeByPath(this.directoryTree, path);
    if (existing) {
      throw new Error(`Folder already exists: "${path}"`);
    }

    try {
      // Create the folder by writing a temporary placeholder file, then deleting it.
      // This leverages the backend's automatic intermediate directory creation.
      const placeholderPath = `${path}/.slatebase-mkdir-placeholder`;
      await this.apiClient.saveFile(this.vaultId, placeholderPath, '');
      await this.apiClient.deleteContent(this.vaultId, placeholderPath);

      const name = path.includes('/') ? path.slice(path.lastIndexOf('/') + 1) : path;
      const parentPath = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
      const newNode: DirectoryTree = { name, type: 'directory', path, children: [] };

      // See create() above — splice into the local tree immediately for
      // synchronous cache-only lookups.
      this.directoryTree = withNodeInserted(this.directoryTree, parentPath, newNode);
      const parent = findParentNode(this.directoryTree, path);

      // Build via treeNodeToTFolder for the same instanceof-TFolder prototype
      // patch and vault reference applied to folders loaded from the tree.
      const tFolder = treeNodeToTFolder(newNode, parent);

      markPluginWrite(path);
      this.events.trigger('create', tFolder);

      // Notify the app to refresh the file explorer tree
      dispatchRealtimeVaultChange({
        vaultId: this.vaultId,
        action: 'saved',
        path,
        userId: '',
        username: '',
      });

      return tFolder;
    } catch (err: unknown) {
      const appErr = err as { code?: string; message?: string };
      throw new Error(
        `Failed to create folder "${path}": ${appErr.message ?? 'unknown error'} (code: ${appErr.code ?? 'UNKNOWN'})`,
        { cause: err }
      );
    }
  }

  /**
   * Rename or move a file/folder to a new path.
   * Obsidian signature: vault.rename(file, newPath)
   * Uses the backend moveContent API (source → destination).
   * Emits 'rename' event with (file, oldPath) on success.
   * Does not gate on the local directory tree cache — see delete() above for why.
   * @throws Error if the file does not exist or the API call fails.
   */
  async rename(file: TAbstractFile, newPath: string): Promise<void> {
    validatePath(file.path);
    validatePath(newPath);

    try {
      await this.apiClient.moveContent(this.vaultId, file.path, newPath);
      const oldPath = file.path;

      // Move the node (and, for directories, its whole subtree) in the local
      // tree immediately — see create() above for why. If the node isn't in
      // the tree yet (e.g. renaming a file moments after creating it) there's
      // nothing to move locally; the next sync will bring it in already renamed.
      const existingNode = findNodeByPath(this.directoryTree, oldPath);
      if (existingNode) {
        const renamedNode = withPathPrefixReplaced(existingNode, oldPath, newPath);
        const newParentPath = newPath.includes('/') ? newPath.slice(0, newPath.lastIndexOf('/')) : '';
        this.directoryTree = withNodeInserted(withNodeRemoved(this.directoryTree, oldPath), newParentPath, renamedNode);
      }

      // Update the file object's path (Obsidian mutates the TFile in place)
      (file as { path: string }).path = newPath;
      const newName = newPath.includes('/') ? newPath.slice(newPath.lastIndexOf('/') + 1) : newPath;
      (file as { name: string }).name = newName;
      if ('basename' in file) {
        const dotIndex = newName.lastIndexOf('.');
        (file as { basename: string }).basename = dotIndex > 0 ? newName.slice(0, dotIndex) : newName;
        (file as { extension: string }).extension = dotIndex > 0 ? newName.slice(dotIndex + 1) : '';
      }

      this.events.trigger('rename', file, oldPath);
      markPluginWrite(newPath);

      // Notify the app to refresh the file explorer tree
      dispatchRealtimeVaultChange({
        vaultId: this.vaultId,
        action: 'saved',
        path: newPath,
        userId: '',
        username: '',
      });
    } catch (err: unknown) {
      const appErr = err as { code?: string; message?: string };
      throw new Error(
        `Failed to rename "${file.path}" to "${newPath}": ${appErr.message ?? 'unknown error'} (code: ${appErr.code ?? 'UNKNOWN'})`,
        { cause: err }
      );
    }
  }

  /**
   * Move a file/folder to the trash (soft-delete).
   * In Slatebase, deleteContent already soft-deletes (moves to .slatebase/trash/).
   * The `system` parameter is ignored — Slatebase always uses its own trash.
   * Emits 'delete' event on success.
   * @throws Error if the file does not exist or the API call fails.
   */
  async trash(file: TAbstractFile, _system?: boolean): Promise<void> {
    // Delegate to delete() which already uses the trash service on the backend
    return this.delete(file);
  }

  /**
   * Delete a file or folder.
   * Does not gate on the local directory tree cache: a file created via create()
   * moments earlier (e.g. Templater's create-then-delete-placeholder flow) won't
   * be in the tree yet, since it's only refreshed by a subsequent realtime sync
   * round-trip. The backend call below is the authoritative existence check.
   * @throws Error if the file does not exist or the API call fails.
   */
  async delete(file: TAbstractFile): Promise<void> {
    validatePath(file.path);

    try {
      await this.apiClient.deleteContent(this.vaultId, file.path);

      // Prune the node from the local tree immediately — see create() above.
      this.directoryTree = withNodeRemoved(this.directoryTree, file.path);

      markPluginWrite(file.path);
      this.events.trigger('delete', file);

      // Notify the app to refresh the file explorer tree
      dispatchRealtimeVaultChange({
        vaultId: this.vaultId,
        action: 'deleted',
        path: file.path,
        userId: '',
        username: '',
      });
    } catch (err: unknown) {
      const appErr = err as { code?: string; message?: string };
      throw new Error(
        `Failed to delete "${file.path}": ${appErr.message ?? 'unknown error'} (code: ${appErr.code ?? 'UNKNOWN'})`,
        { cause: err }
      );
    }
  }

  /**
   * Look up a file or folder by its path in the directory tree.
   * Returns a TFile, TFolder, or null if not found.
   */
  getAbstractFileByPath(path: string): TAbstractFile | null {
    // Root folder: Dataview's PrefixIndex queries "/" or "" for the vault root
    if (path === '/' || path === '') {
      return treeNodeToTFolder(this.directoryTree, null);
    }
    if (!path || path.trim() === '') return null;

    const node = findNodeByPath(this.directoryTree, path);
    if (!node) return null;

    if (node.type === 'file') {
      const parent = findParentNode(this.directoryTree, path);
      return treeNodeToTFile(node, parent);
    } else {
      const parent = findParentNode(this.directoryTree, path);
      return treeNodeToTFolder(node, parent);
    }
  }

  /**
   * Get all markdown (.md) files in the vault.
   */
  getMarkdownFiles(): TFile[] {
    const files: TFile[] = [];
    collectFiles(this.directoryTree, null, files);
    return files.filter(f => f.extension === 'md');
  }

  /**
   * Read a file from the vault (cached version — in Obsidian, uses in-memory cache).
   * Our implementation delegates to the regular read() method.
   */
  async cachedRead(file: TFile): Promise<string> {
    return this.read(file);
  }

  /**
   * Get all files in the vault.
   */
  getFiles(): TFile[] {
    const files: TFile[] = [];
    collectFiles(this.directoryTree, null, files);
    return files;
  }

  /**
   * Get all loaded files and folders in the vault as a flat array.
   * Returns TFile and TFolder objects for all entries in the directory tree.
   */
  getAllLoadedFiles(): TAbstractFile[] {
    const result: TAbstractFile[] = [];
    collectAll(this.directoryTree, null, result);
    return result;
  }

  /**
   * Get the root folder of the vault.
   */
  getRoot(): TFolder {
    return treeNodeToTFolder(this.directoryTree, null);
  }

  /**
   * Get the vault name.
   * Returns a combination of name and vault-ID to ensure IndexedDB isolation
   * across vaults (even if they share the same display name).
   */
  getName(): string {
    return `${this.vaultName}-${this.vaultId}`;
  }

  /**
   * Get an Obsidian vault configuration value.
   * Returns sensible defaults for known config keys since Slatebase
   * does not have an equivalent per-vault config system for these values.
   *
   * Known keys:
   * - "defaultViewMode": "source" | "preview" (default: "source")
   * - "showLineNumber": boolean (default: false)
   * - "spellcheck": boolean (default: false)
   * - "readableLineLength": boolean (default: true)
   */
  getConfig(key: string): unknown {
    const defaults: Record<string, unknown> = {
      defaultViewMode: 'source',
      showLineNumber: false,
      spellcheck: false,
      readableLineLength: true,
      livePreview: true,
      strictLineBreaks: false,
      showFrontmatter: false,
      foldHeading: true,
      foldIndent: true,
      newFileLocation: 'root',
      newLinkFormat: 'shortest',
      useMarkdownLinks: false,
      attachmentFolderPath: './',
    };
    return defaults[key] ?? null;
  }

  /**
   * Register an event listener.
   */
  on(event: string, callback: (...args: unknown[]) => void, context?: unknown): EventRef {
    return this.events.on(event, callback, context);
  }

  /**
   * Remove an event listener.
   */
  off(event: string, callback: (...args: unknown[]) => void): void {
    this.events.off(event, callback);
  }

  /**
   * Remove a listener by the ref `on()` returned.
   *
   * Part of Obsidian's `Events` base class, which Vault extends. Without it,
   * `vault.offref(ref)` — the documented way to unsubscribe — was a TypeError.
   */
  offref(ref: EventRef): void {
    this.events.offref(ref);
  }

  /**
   * Trigger an event.
   */
  trigger(event: string, ...args: unknown[]): void {
    this.events.trigger(event, ...args);
  }

  /**
   * Vault configuration object.
   * In Obsidian this holds settings like attachmentFolderPath, newFileLocation, etc.
   * Kanban accesses `vault.config` directly for attachment path resolution.
   */
  readonly config: Record<string, unknown> = {
    attachmentFolderPath: './',
    newFileLocation: 'root',
    newLinkFormat: 'shortest',
    useMarkdownLinks: false,
  }

  /**
   * Get an available (non-conflicting) path for saving an attachment.
   * Returns a path that doesn't conflict with existing files.
   *
   * @param filename - Desired filename (e.g. "image.png")
   * @param sourcePath - Path of the source note (for relative attachment folders)
   * @returns A vault-relative path for the attachment
   */
  getAvailablePathForAttachments(filename: string, sourcePath?: string): string {
    // Default behavior: place attachments next to the source file
    const dir = sourcePath?.includes('/') ? sourcePath.slice(0, sourcePath.lastIndexOf('/')) : '';
    const basePath = dir ? `${dir}/${filename}` : filename;

    // Check if file exists and append number if needed
    let candidate = basePath;
    let attempt = 0;
    while (findNodeByPath(this.directoryTree, candidate) !== null) {
      attempt++;
      const dotIdx = filename.lastIndexOf('.');
      const name = dotIdx > 0 ? filename.slice(0, dotIdx) : filename;
      const ext = dotIdx > 0 ? filename.slice(dotIdx) : '';
      candidate = dir ? `${dir}/${name} ${attempt}${ext}` : `${name} ${attempt}${ext}`;
    }
    return candidate;
  }

  /**
   * Create a binary file (e.g. image, PDF) at the given path.
   * Kanban uses this for pasting images into cards.
   *
   * @param path - Vault-relative path for the new file
   * @param data - Binary content as ArrayBuffer
   * @returns The created TFile
   */
  /**
   * The path to the vault config folder (`.obsidian` in Obsidian).
   * LiveSync and other plugins access this for configuration file paths.
   */
  get configDir(): string {
    return '.obsidian';
  }

  /**
   * Check if a file or folder exists at the given path.
   */
  async exists(path: string): Promise<boolean> {
    if (!path || path.trim() === '') return false;
    return findNodeByPath(this.directoryTree, path) !== null;
  }

  /**
   * Get an available (non-conflicting) file path.
   * Appends a number suffix if the path already exists.
   */
  getAvailablePath(basename: string, extension: string): string {
    let candidate = extension ? `${basename}.${extension}` : basename;
    let attempt = 0;
    while (findNodeByPath(this.directoryTree, candidate) !== null) {
      attempt++;
      candidate = extension ? `${basename} ${attempt}.${extension}` : `${basename} ${attempt}`;
    }
    return candidate;
  }

  /**
   * Get a resource URL for a file (for embedding images, etc.).
   * Returns a data URL path that can be used in the browser.
   */
  getResourcePath(file: TFile): string {
    return `/api/v1/vaults/${this.vaultId}/files?path=${encodeURIComponent(file.path)}&raw=true`;
  }

  /**
   * Get a file by path. Returns null if path does not point to a file.
   * Convenience wrapper introduced in Obsidian 1.5.7.
   */
  getFileByPath(path: string): TFile | null {
    if (!path || path.trim() === '') return null;
    const node = findNodeByPath(this.directoryTree, path);
    if (!node || node.type !== 'file') return null;
    const parent = findParentNode(this.directoryTree, path);
    return treeNodeToTFile(node, parent);
  }

  /**
   * Get a folder by path. Returns null if path does not point to a folder.
   * Convenience wrapper introduced in Obsidian 1.5.7.
   */
  getFolderByPath(path: string): TFolder | null {
    if (!path || path.trim() === '') return null;
    const node = findNodeByPath(this.directoryTree, path);
    if (!node || node.type !== 'directory') return null;
    const parent = findParentNode(this.directoryTree, path);
    return treeNodeToTFolder(node, parent);
  }

  /**
   * Case-insensitive variant of getAbstractFileByPath.
   * Used by LiveSync for case-insensitive file matching.
   */
  getAbstractFileByPathInsensitive(path: string): TAbstractFile | null {
    if (!path || path.trim() === '') return null;
    const lower = path.toLowerCase();
    const node = findNodeByPathInsensitive(this.directoryTree, lower);
    if (!node) return null;
    if (node.type === 'file') {
      const parent = findParentNode(this.directoryTree, node.path);
      return treeNodeToTFile(node, parent);
    } else {
      const parent = findParentNode(this.directoryTree, node.path);
      return treeNodeToTFolder(node, parent);
    }
  }

  /**
   * Get all folders in the vault.
   */
  getAllFolders(includeRoot?: boolean): TFolder[] {
    const folders: TFolder[] = [];
    collectFolders(this.directoryTree, null, folders);
    if (includeRoot) {
      folders.unshift(treeNodeToTFolder(this.directoryTree, null));
    }
    return folders;
  }

  /**
   * Read a binary file from the vault.
   * Fetches the raw content as ArrayBuffer from the backend.
   */
  async readBinary(file: TFile): Promise<ArrayBuffer> {
    validatePath(file.path);
    try {
      const response = await fetch(`/api/v1/vaults/${this.vaultId}/files?path=${encodeURIComponent(file.path)}&raw=true`, {
        headers: {
          'Authorization': `Bearer ${this.getToken()}`,
        },
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return await response.arrayBuffer();
    } catch (err: unknown) {
      const appErr = err as { message?: string };
      throw new Error(
        `Failed to read binary "${file.path}": ${appErr.message ?? 'unknown error'}`,
        { cause: err }
      );
    }
  }

  /**
   * Modify a binary file in the vault.
   * Writes binary data to the backend via upload endpoint.
   */
  async modifyBinary(file: TFile, data: ArrayBuffer): Promise<void> {
    validatePath(file.path);
    try {
      const name = file.name;
      const targetDir = file.path.includes('/') ? file.path.slice(0, file.path.lastIndexOf('/')) : '';

      const blob = new Blob([data]);
      const uploadFile = new File([blob], name);
      const formData = new FormData();
      formData.append('file', uploadFile, name);
      formData.append('targetDir', targetDir);

      const response = await fetch(`/api/v1/vaults/${this.vaultId}/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.getToken()}`,
          'X-CSRF-Token': getStoredCsrfToken() ?? '',
        },
        body: formData,
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      markPluginWrite(file.path);
      this.events.trigger('modify', file);
    } catch (err: unknown) {
      const appErr = err as { message?: string };
      throw new Error(
        `Failed to modify binary "${file.path}": ${appErr.message ?? 'unknown error'}`,
        { cause: err }
      );
    }
  }

  /**
   * Atomically read, modify, and save the contents of a plaintext file.
   */
  async process(file: TFile, fn: (data: string) => string): Promise<string> {
    const content = await this.read(file);
    const modified = fn(content);
    await this.modify(file, modified);
    return modified;
  }

  /**
   * Append text to the end of a file.
   */
  async append(file: TFile, data: string): Promise<void> {
    const content = await this.read(file);
    await this.modify(file, content + data);
  }

  /**
   * Append binary data to the end of a file. Mirrors `append()` but for binary
   * files (audio recordings, attachment logs, etc.) — read the existing bytes,
   * concatenate, and write back via modifyBinary.
   *
   * `options` (Obsidian API since 1.12.3) is accepted for arity compatibility,
   * same simplification as `modify()`'s: the backend always stamps writes with
   * the actual write time, so a custom mtime/ctime is accepted but not persisted.
   */
  async appendBinary(file: TFile, data: ArrayBuffer, _options?: DataWriteOptions): Promise<void> {
    const existing = await this.readBinary(file);
    const combined = new Uint8Array(existing.byteLength + data.byteLength);
    combined.set(new Uint8Array(existing), 0);
    combined.set(new Uint8Array(data), existing.byteLength);
    await this.modifyBinary(file, combined.buffer);
  }

  /**
   * Helper: get auth token from localStorage.
   */
  private getToken(): string {
    return getStoredAuthToken() ?? '';
  }

  async createBinary(path: string, data: ArrayBuffer): Promise<TFile> {
    validatePath(path);

    try {
      const name = path.includes('/') ? path.slice(path.lastIndexOf('/') + 1) : path;
      const targetDir = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';

      // Upload via multipart form (same approach as modifyBinary)
      const blob = new Blob([data]);
      const file = new File([blob], name);
      const formData = new FormData();
      formData.append('file', file, name);
      formData.append('targetDir', targetDir);

      const response = await fetch(`/api/v1/vaults/${this.vaultId}/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.getToken()}`,
          'X-CSRF-Token': getStoredCsrfToken() ?? '',
        },
        body: formData,
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const parentPath = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
      const newNode: DirectoryTree = { name, type: 'file', path, size: data.byteLength };

      // See create() above — splice into the local tree immediately for
      // synchronous cache-only lookups.
      this.directoryTree = withNodeInserted(this.directoryTree, parentPath, newNode);
      const parent = findParentNode(this.directoryTree, path);
      const tFile = treeNodeToTFile(newNode, parent);

      markPluginWrite(path);
      this.events.trigger('create', tFile);
      return tFile;
    } catch (err: unknown) {
      const appErr = err as { code?: string; message?: string };
      throw new Error(
        `Failed to create binary "${path}": ${appErr.message ?? 'unknown error'}`,
        { cause: err }
      );
    }
  }

  /**
   * Create a copy of a file at a new path.
   * Reads the source file content and writes it to the new path.
   *
   * @param file - The source file to copy
   * @param newPath - The destination path for the copy
   * @returns The new TFile representing the copy
   */
  async copy(file: TFile, newPath: string): Promise<TFile> {
    validatePath(file.path);
    validatePath(newPath);

    try {
      // Read the source file content
      const content = await this.read(file);
      // Create the copy at the new path
      return await this.create(newPath, content);
    } catch (err: unknown) {
      const appErr = err as { code?: string; message?: string };
      throw new Error(
        `Failed to copy "${file.path}" to "${newPath}": ${appErr.message ?? 'unknown error'}`,
        { cause: err }
      );
    }
  }

  /**
   * Wraps a VaultShim instance with a Proxy for non-emulated API interception.
   * Mirrors AppShim/WorkspaceShim's pattern: a plugin calling a non-emulated
   * vault method/property gets a warned no-op instead of a hard crash.
   *
   * `getToken()` is deliberately excluded from the whitelist below — it's a
   * private implementation detail (returns the raw auth token from
   * localStorage) that TypeScript's `private` doesn't actually hide at
   * runtime; a plugin reaching `vault.getToken()` through this proxy must get
   * the same no-op as any other non-emulated method, not the real token.
   */
  static wrapWithProxy(instance: VaultShim): VaultShim & Record<string, unknown> {
    const emulatedProperties = new Set<string | symbol>([
      'adapter',
      'onFileRead',
      'updateTree',
      'read',
      'modify',
      'create',
      'createFolder',
      'rename',
      'trash',
      'delete',
      'getAbstractFileByPath',
      'getAbstractFileByPathInsensitive',
      'getMarkdownFiles',
      'cachedRead',
      'getFiles',
      'getAllLoadedFiles',
      'getAllFolders',
      'getRoot',
      'getName',
      'getConfig',
      'on',
      'off',
      'offref',
      'trigger',
      'config',
      'getAvailablePathForAttachments',
      'exists',
      'getAvailablePath',
      'getResourcePath',
      'getFileByPath',
      'getFolderByPath',
      'readBinary',
      'modifyBinary',
      'process',
      'append',
      'appendBinary',
      'createBinary',
      'copy',
    ]);

    return new Proxy(instance, {
      get(target: VaultShim, prop: string | symbol): unknown {
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

        if (recordGapRead('Vault', prop)) {
          console.warn(
            `[VaultShim] Access to non-emulated vault method/property "${prop}". ` +
            `Slatebase returns a no-op function here, which is truthy — feature ` +
            `detection like \`if (vault.${prop})\` will take the wrong branch. ` +
            `Inspect all gaps with window.__slatebasePluginApiGaps().`
          );
        }

        return (...args: unknown[]) => {
          recordGapCall('Vault', prop);
          void args;
          return undefined;
        };
      },
    }) as VaultShim & Record<string, unknown>;
  }
}
