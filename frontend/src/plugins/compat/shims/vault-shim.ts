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
 */
export function treeNodeToTFile(node: DirectoryTree, parent: TFolder | null): TFile {
  const name = node.name;
  const dotIndex = name.lastIndexOf('.');
  const basename = dotIndex > 0 ? name.slice(0, dotIndex) : name;
  const extension = dotIndex > 0 ? name.slice(dotIndex + 1) : '';

  return {
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
}

/**
 * Creates a TFolder object from a DirectoryTree node.
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
        `Failed to read "${file.path}": ${appErr.message ?? 'unknown error'} (code: ${appErr.code ?? 'UNKNOWN'})`
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
        `Failed to modify "${file.path}": ${appErr.message ?? 'unknown error'} (code: ${appErr.code ?? 'UNKNOWN'})`
      );
    }
  }

  /**
   * Create a new file at the given path.
   * @throws Error if a file already exists at the path or the API call fails.
   */
  async create(path: string, content?: string): Promise<TFile> {
    validatePath(path);

    const existing = findNodeByPath(this.directoryTree, path);
    if (existing) {
      throw new Error(`File already exists: "${path}"`);
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
      return tFile;
    } catch (err: unknown) {
      const appErr = err as { code?: string; message?: string };
      throw new Error(
        `Failed to create "${path}": ${appErr.message ?? 'unknown error'} (code: ${appErr.code ?? 'UNKNOWN'})`
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
    } catch (err: unknown) {
      const appErr = err as { code?: string; message?: string };
      throw new Error(
        `Failed to delete "${file.path}": ${appErr.message ?? 'unknown error'} (code: ${appErr.code ?? 'UNKNOWN'})`
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
