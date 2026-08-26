import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FileManagerShim } from './file-manager-shim';
import type { IVaultShim, TFile, TFolder } from '../types';

function makeFolder(path: string): TFolder {
  const name = path.includes('/') ? path.slice(path.lastIndexOf('/') + 1) : path;
  return { path, name, children: [], parent: null, isRoot: () => path === '' };
}

function makeFile(path: string): TFile {
  const name = path.includes('/') ? path.slice(path.lastIndexOf('/') + 1) : path;
  return { path, name, basename: name, extension: '', stat: { mtime: 0, ctime: 0, size: 0 }, parent: null };
}

/**
 * Minimal in-memory IVaultShim fake — only implements what FileManagerShim's
 * new folder/create/delete methods actually call.
 */
function createFakeVault(existingPaths: string[] = []): IVaultShim {
  const paths = new Set(existingPaths);
  const deleted: string[] = [];
  const created: string[] = [];

  return {
    read: vi.fn(),
    modify: vi.fn(),
    async create(path: string) {
      paths.add(path);
      created.push(path);
      return makeFile(path);
    },
    async createFolder(path: string) {
      if (paths.has(path)) throw new Error(`Folder already exists: "${path}"`);
      paths.add(path);
      created.push(path);
      return makeFolder(path);
    },
    async delete(file) {
      paths.delete(file.path);
      deleted.push(file.path);
    },
    rename: vi.fn(),
    async trash(file) {
      paths.delete(file.path);
      deleted.push(file.path);
    },
    getAbstractFileByPath(path: string) {
      return paths.has(path) ? makeFolder(path) : null;
    },
    getMarkdownFiles: () => [],
    getFiles: () => [],
    getAllLoadedFiles: () => [],
    getRoot: () => makeFolder(''),
    getName: () => 'test-vault',
    getConfig: () => null,
    on: vi.fn(() => ({}) as never),
    off: vi.fn(),
    trigger: vi.fn(),
    // Test-only inspection hooks, not part of IVaultShim.
    __deleted: deleted,
    __created: created,
  } as IVaultShim & { __deleted: string[]; __created: string[] };
}

describe('FileManagerShim', () => {
  let confirmSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    confirmSpy = vi.spyOn(window, 'confirm');
  });

  describe('createNewFolder()', () => {
    it('creates a folder with the default name inside the parent', async () => {
      const vault = createFakeVault();
      const fileManager = new FileManagerShim(vault);

      const folder = await fileManager.createNewFolder(makeFolder('notes'));

      expect(folder.path).toBe('notes/Untitled');
    });

    it('generates a unique name when the default name already exists', async () => {
      const vault = createFakeVault(['notes/Untitled', 'notes/Untitled 1']);
      const fileManager = new FileManagerShim(vault);

      const folder = await fileManager.createNewFolder(makeFolder('notes'));

      expect(folder.path).toBe('notes/Untitled 2');
    });

    it('creates directly under the vault root when the parent is root', async () => {
      const vault = createFakeVault();
      const fileManager = new FileManagerShim(vault);

      const folder = await fileManager.createNewFolder(makeFolder(''), 'Projects');

      expect(folder.path).toBe('Projects');
    });
  });

  describe('createAndOpenMarkdownFile()', () => {
    it('creates the file at the vault root via vault.create()', async () => {
      const vault = createFakeVault();
      const fileManager = new FileManagerShim(vault);

      const file = await fileManager.createAndOpenMarkdownFile('New note');

      expect(file.path).toBe('New note.md');
    });
  });

  describe('promptForFolderDeletion()', () => {
    it('deletes the folder and resolves true when the user confirms', async () => {
      confirmSpy.mockReturnValue(true);
      const vault = createFakeVault(['notes']);
      const fileManager = new FileManagerShim(vault);

      const result = await fileManager.promptForFolderDeletion(makeFolder('notes'));

      expect(result).toBe(true);
      expect((vault as unknown as { __deleted: string[] }).__deleted).toContain('notes');
    });

    it('leaves the folder untouched and resolves false when the user cancels', async () => {
      confirmSpy.mockReturnValue(false);
      const vault = createFakeVault(['notes']);
      const fileManager = new FileManagerShim(vault);

      const result = await fileManager.promptForFolderDeletion(makeFolder('notes'));

      expect(result).toBe(false);
      expect((vault as unknown as { __deleted: string[] }).__deleted).not.toContain('notes');
    });
  });
});
