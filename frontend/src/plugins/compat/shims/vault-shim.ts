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
   * @throws Error if the file does not exist in the tree or the API call fails.
   */
  async modify(file: TFile, content: string): Promise<void> {
    validatePath(file.path);

    const node = findNodeByPath(this.directoryTree, file.path);
    if (!node || node.type !== 'file') {
      throw new Error(`File not found: "${file.path}"`);
    }

    try {
      await this.apiClient.saveFile(this.vaultId, file.path, content);
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
   * Get the vault name.
   */
  getName(): string {
    return this.vaultName;
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
}
