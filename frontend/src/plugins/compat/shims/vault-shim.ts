/**
 * VaultShim — Obsidian-compatible Vault interface implementation.
 *
 * Provides read/modify/create/delete operations on vault files via the Slatebase API.
 * Emits events (create, modify, delete) on successful operations.
 * Validates paths to reject traversal attacks (../, null bytes, absolute paths).
 */

import type { IApiClient } from '../../../api/index';
import type { DirectoryTree } from '../../../types';
import type { EventRef, IVaultShim, TAbstractFile, TFile, TFolder } from '../types';
import { EventSystem } from '../event-system';
import { dispatchRealtimeVaultChange } from '../../../state/realtimeVaultBridge';
import { markPluginWrite } from '../plugin-event-bridge';
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
   * @throws Error if the file does not exist in the tree or the API call fails.
   */
  async read(file: TFile): Promise<string> {
    validatePath(file.path);

    const node = findNodeByPath(this.directoryTree, file.path);
    if (!node || node.type !== 'file') {
      throw new Error(`File not found: "${file.path}"`);
    }

    try {
      const result = await this.apiClient.fetchFileContent(this.vaultId, file.path);
      // Notify MetadataCache so it can parse frontmatter/tags on demand
      if (this.onFileRead) {
        this.onFileRead(file.path, result.content);
      }
      return result.content;
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
   */
  async modify(file: TFile, content: string): Promise<void> {
    validatePath(file.path);

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
      const dotIndex = name.lastIndexOf('.');
      const basename = dotIndex > 0 ? name.slice(0, dotIndex) : name;
      const extension = dotIndex > 0 ? name.slice(dotIndex + 1) : '';

      const parent = findParentNode(this.directoryTree, path);

      const tFile: TFile = {
        path,
        name,
        basename,
        extension,
        stat: {
          mtime: Date.now(),
          ctime: Date.now(),
          size: (content ?? '').length,
        },
        parent,
      };

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
      const parent = findParentNode(this.directoryTree, path);

      const tFolder: TFolder = {
        path,
        name,
        children: [],
        parent,
        isRoot: () => false,
      };

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
   * @throws Error if the file does not exist or the API call fails.
   */
  async rename(file: TAbstractFile, newPath: string): Promise<void> {
    validatePath(file.path);
    validatePath(newPath);

    const node = findNodeByPath(this.directoryTree, file.path);
    if (!node) {
      throw new Error(`File not found: "${file.path}"`);
    }

    try {
      await this.apiClient.moveContent(this.vaultId, file.path, newPath);
      const oldPath = file.path;

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
   * @throws Error if the file does not exist in the tree or the API call fails.
   */
  async delete(file: TAbstractFile): Promise<void> {
    validatePath(file.path);

    const node = findNodeByPath(this.directoryTree, file.path);
    if (!node) {
      throw new Error(`File not found: "${file.path}"`);
    }

    try {
      await this.apiClient.deleteContent(this.vaultId, file.path);
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
  on(event: string, callback: (...args: unknown[]) => void): EventRef {
    return this.events.on(event, callback);
  }

  /**
   * Remove an event listener.
   */
  off(event: string, callback: (...args: unknown[]) => void): void {
    this.events.off(event, callback);
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
          'X-CSRF-Token': localStorage.getItem('slatebase_csrf') ?? '',
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
   * Helper: get auth token from localStorage.
   */
  private getToken(): string {
    return localStorage.getItem('slatebase_token') ?? '';
  }

  async createBinary(path: string, data: ArrayBuffer): Promise<TFile> {
    validatePath(path);

    try {
      const name = path.includes('/') ? path.slice(path.lastIndexOf('/') + 1) : path;
      const targetDir = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
      const dotIndex = name.lastIndexOf('.');
      const basename = dotIndex > 0 ? name.slice(0, dotIndex) : name;
      const extension = dotIndex > 0 ? name.slice(dotIndex + 1) : '';

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
          'X-CSRF-Token': localStorage.getItem('slatebase_csrf') ?? '',
        },
        body: formData,
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const tFile: TFile = {
        path,
        name,
        basename,
        extension,
        stat: { mtime: Date.now(), ctime: Date.now(), size: data.byteLength },
        parent: null,
      };

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
}
