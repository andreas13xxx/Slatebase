import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IApiClient } from '../../../api/index';
import type { DirectoryTree } from '../../../types';
import type { TFile, TAbstractFile } from '../types';
import { VaultShim, validatePath, treeNodeToTFile, treeNodeToTFolder } from './vault-shim';

/**
 * Creates a minimal mock API client for testing VaultShim.
 */
function createMockApiClient(overrides: Partial<IApiClient> = {}): IApiClient {
  return {
    setToken: vi.fn(),
    getToken: vi.fn(() => 'test-token'),
    setCsrfToken: vi.fn(),
    getCsrfToken: vi.fn(() => 'test-csrf'),
    setOnSessionExpired: vi.fn(),
    fetchVaults: vi.fn(),
    fetchAllVaults: vi.fn(),
    fetchVaultTree: vi.fn(),
    fetchFileContent: vi.fn().mockResolvedValue({ content: 'file content', path: '', name: '', size: 0, encoding: 'utf-8', isBinary: false, isTruncated: false }),
    createVault: vi.fn(),
    deleteVault: vi.fn(),
    importFile: vi.fn(),
    importFolder: vi.fn(),
    deleteContent: vi.fn().mockResolvedValue(undefined),
    saveFile: vi.fn().mockResolvedValue({ path: '', name: '', size: 0 }),
    moveContent: vi.fn(),
    renameContent: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    getSessions: vi.fn(),
    invalidateSession: vi.fn(),
    invalidateAllOtherSessions: vi.fn(),
    getProfile: vi.fn(),
    updateProfile: vi.fn(),
    changePassword: vi.fn(),
    deleteSelf: vi.fn(),
    searchUsers: vi.fn(),
    createConversation: vi.fn(),
    listConversations: vi.fn(),
    getMessages: vi.fn(),
    sendMessage: vi.fn(),
    leaveConversation: vi.fn(),
    getUnreadTotal: vi.fn(),
    listMcpTokens: vi.fn(),
    createMcpToken: vi.fn(),
    revokeMcpToken: vi.fn(),
    getGraph: vi.fn(),
    getBacklinks: vi.fn(),
    getVaultTags: vi.fn(),
    ...overrides,
  } as unknown as IApiClient;
}

/** Sample directory tree for testing */
function createSampleTree(): DirectoryTree {
  return {
    name: 'test-vault',
    type: 'directory',
    path: '',
    children: [
      {
        name: 'notes',
        type: 'directory',
        path: 'notes',
        children: [
          { name: 'hello.md', type: 'file', path: 'notes/hello.md', size: 42 },
          { name: 'world.md', type: 'file', path: 'notes/world.md', size: 100 },
        ],
      },
      { name: 'readme.md', type: 'file', path: 'readme.md', size: 200 },
      { name: 'image.png', type: 'file', path: 'image.png', size: 5000 },
      {
        name: 'docs',
        type: 'directory',
        path: 'docs',
        children: [
          { name: 'guide.txt', type: 'file', path: 'docs/guide.txt', size: 50 },
        ],
      },
    ],
  };
}

describe('validatePath', () => {
  it('accepts valid relative paths', () => {
    expect(() => validatePath('notes/hello.md')).not.toThrow();
    expect(() => validatePath('readme.md')).not.toThrow();
    expect(() => validatePath('a/b/c/d.txt')).not.toThrow();
  });

  it('rejects paths with null bytes', () => {
    expect(() => validatePath('hello\0.md')).toThrow('contains null bytes');
  });

  it('rejects paths with ../', () => {
    expect(() => validatePath('../secret.md')).toThrow('path traversal');
    expect(() => validatePath('notes/../secret.md')).toThrow('path traversal');
  });

  it('rejects paths with ..\\', () => {
    expect(() => validatePath('notes\\..\\secret.md')).toThrow('path traversal');
  });

  it('rejects absolute paths starting with /', () => {
    expect(() => validatePath('/etc/passwd')).toThrow('absolute paths');
  });

  it('rejects absolute paths starting with \\', () => {
    expect(() => validatePath('\\Windows\\System32')).toThrow('absolute paths');
  });

  it('rejects empty paths', () => {
    expect(() => validatePath('')).toThrow('must not be empty');
    expect(() => validatePath('   ')).toThrow('must not be empty');
  });
});

describe('treeNodeToTFile', () => {
  it('creates a TFile with correct basename and extension', () => {
    const node: DirectoryTree = { name: 'hello.md', type: 'file', path: 'notes/hello.md', size: 42 };
    const file = treeNodeToTFile(node, null);
    expect(file.path).toBe('notes/hello.md');
    expect(file.name).toBe('hello.md');
    expect(file.basename).toBe('hello');
    expect(file.extension).toBe('md');
    expect(file.stat.size).toBe(42);
    expect(file.parent).toBeNull();
  });

  it('handles files without extension', () => {
    const node: DirectoryTree = { name: 'Makefile', type: 'file', path: 'Makefile' };
    const file = treeNodeToTFile(node, null);
    expect(file.basename).toBe('Makefile');
    expect(file.extension).toBe('');
  });

  it('handles files with multiple dots', () => {
    const node: DirectoryTree = { name: 'file.test.ts', type: 'file', path: 'file.test.ts' };
    const file = treeNodeToTFile(node, null);
    expect(file.basename).toBe('file.test');
    expect(file.extension).toBe('ts');
  });
});

describe('treeNodeToTFolder', () => {
  it('creates a TFolder with correct properties', () => {
    const node: DirectoryTree = { name: 'notes', type: 'directory', path: 'notes' };
    const folder = treeNodeToTFolder(node, null);
    expect(folder.path).toBe('notes');
    expect(folder.name).toBe('notes');
    expect(folder.children).toEqual([]);
    expect(folder.parent).toBeNull();
    expect(folder.isRoot()).toBe(false);
  });

  it('identifies root folder', () => {
    const node: DirectoryTree = { name: '', type: 'directory', path: '' };
    const folder = treeNodeToTFolder(node, null);
    expect(folder.isRoot()).toBe(true);
  });
});

describe('VaultShim', () => {
  let apiClient: IApiClient;
  let tree: DirectoryTree;
  let vault: VaultShim;

  beforeEach(() => {
    apiClient = createMockApiClient();
    tree = createSampleTree();
    vault = new VaultShim('vault-123', 'Test Vault', apiClient, tree);
  });

  describe('getName()', () => {
    it('returns the vault name with vault id for unique IndexedDB naming', () => {
      expect(vault.getName()).toBe('Test Vault-vault-123');
    });
  });

  describe('getConfig()', () => {
    it("returns true for 'updateInternalLinks' — the rewrite always runs server-side", () => {
      expect(vault.getConfig('updateInternalLinks')).toBe(true);
    });

    it('returns null for an unknown key', () => {
      expect(vault.getConfig('someUnknownKey')).toBeNull();
    });
  });

  describe('getAbstractFileByPath()', () => {
    it('returns TFile for existing file', () => {
      const result = vault.getAbstractFileByPath('notes/hello.md');
      expect(result).not.toBeNull();
      expect(result!.path).toBe('notes/hello.md');
      expect((result as TFile).extension).toBe('md');
    });

    it('returns TFolder for existing directory', () => {
      const result = vault.getAbstractFileByPath('notes');
      expect(result).not.toBeNull();
      expect(result!.path).toBe('notes');
      expect('children' in result!).toBe(true);
    });

    it('returns null for non-existent path', () => {
      const result = vault.getAbstractFileByPath('does/not/exist.md');
      expect(result).toBeNull();
    });

    it('returns root folder for empty path (Obsidian compat)', () => {
      const root = vault.getAbstractFileByPath('');
      expect(root).not.toBeNull();
      expect(root!.name).toBeDefined();
      expect((root as { children?: unknown[] }).children).toBeDefined();
    });

    it('returns null for whitespace-only path', () => {
      expect(vault.getAbstractFileByPath('   ')).toBeNull();
    });
  });

  describe('getMarkdownFiles()', () => {
    it('returns only .md files', () => {
      const mdFiles = vault.getMarkdownFiles();
      expect(mdFiles.length).toBe(3); // hello.md, world.md, readme.md
      for (const file of mdFiles) {
        expect(file.extension).toBe('md');
      }
    });

    it('does not include non-md files', () => {
      const mdFiles = vault.getMarkdownFiles();
      const paths = mdFiles.map(f => f.path);
      expect(paths).not.toContain('image.png');
      expect(paths).not.toContain('docs/guide.txt');
    });
  });

  describe('getFiles()', () => {
    it('returns all files', () => {
      const allFiles = vault.getFiles();
      expect(allFiles.length).toBe(5); // hello.md, world.md, readme.md, image.png, guide.txt
    });

    it('does not include directories', () => {
      const allFiles = vault.getFiles();
      const paths = allFiles.map(f => f.path);
      expect(paths).not.toContain('notes');
      expect(paths).not.toContain('docs');
    });
  });

  describe('read()', () => {
    it('reads file content via API', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        content: '# Hello World',
        path: 'notes/hello.md',
        name: 'hello.md',
        size: 13,
        encoding: 'utf-8',
        isBinary: false,
        isTruncated: false,
      });
      apiClient = createMockApiClient({ fetchFileContent: mockFetch });
      vault = new VaultShim('vault-123', 'Test Vault', apiClient, tree);

      const file: TFile = {
        path: 'notes/hello.md',
        name: 'hello.md',
        basename: 'hello',
        extension: 'md',
        stat: { mtime: 0, ctime: 0, size: 42 },
        parent: null,
      };

      const content = await vault.read(file);
      expect(content).toBe('# Hello World');
      expect(mockFetch).toHaveBeenCalledWith('vault-123', 'notes/hello.md');
    });

    it('normalizes CRLF to LF, matching MetadataCacheShim\'s position offsets', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        content: '# Heading\r\n\r\n- one\r\n- two\r\n',
        path: 'notes/hello.md',
        name: 'hello.md',
        size: 13,
        encoding: 'utf-8',
        isBinary: false,
        isTruncated: false,
      });
      apiClient = createMockApiClient({ fetchFileContent: mockFetch });
      vault = new VaultShim('vault-123', 'Test Vault', apiClient, tree);

      const file: TFile = {
        path: 'notes/hello.md',
        name: 'hello.md',
        basename: 'hello',
        extension: 'md',
        stat: { mtime: 0, ctime: 0, size: 42 },
        parent: null,
      };

      const content = await vault.read(file);
      expect(content).toBe('# Heading\n\n- one\n- two\n');
    });

    it('rejects read when the backend reports the file missing', async () => {
      const mockFetch = vi.fn().mockRejectedValue({ code: 'NOT_FOUND', message: 'File not found' });
      apiClient = createMockApiClient({ fetchFileContent: mockFetch });
      vault = new VaultShim('vault-123', 'Test Vault', apiClient, tree);

      const file: TFile = {
        path: 'does-not-exist.md',
        name: 'does-not-exist.md',
        basename: 'does-not-exist',
        extension: 'md',
        stat: { mtime: 0, ctime: 0, size: 0 },
        parent: null,
      };

      await expect(vault.read(file)).rejects.toThrow('Failed to read "does-not-exist.md"');
    });

    it('reads a file the local tree cache does not know about yet', async () => {
      // Mirrors create() then immediate read() (e.g. Templater reading back a
      // note it just created to run template parsing) before the tree has been
      // refreshed — the local cache must not gate the call.
      const mockFetch = vi.fn().mockResolvedValue({
        content: 'fresh content',
        path: 'Untitled 2.md',
        name: 'Untitled 2.md',
        size: 13,
        encoding: 'utf-8',
        isBinary: false,
        isTruncated: false,
      });
      apiClient = createMockApiClient({ fetchFileContent: mockFetch });
      vault = new VaultShim('vault-123', 'Test Vault', apiClient, tree);

      const file: TFile = {
        path: 'Untitled 2.md',
        name: 'Untitled 2.md',
        basename: 'Untitled 2',
        extension: 'md',
        stat: { mtime: 0, ctime: 0, size: 0 },
        parent: null,
      };

      await expect(vault.read(file)).resolves.toBe('fresh content');
    });

    it('rejects read with path traversal', async () => {
      const file: TFile = {
        path: '../secret.md',
        name: 'secret.md',
        basename: 'secret',
        extension: 'md',
        stat: { mtime: 0, ctime: 0, size: 0 },
        parent: null,
      };

      await expect(vault.read(file)).rejects.toThrow('path traversal');
    });

    it('propagates API errors with message', async () => {
      const mockFetch = vi.fn().mockRejectedValue({ code: 'NOT_FOUND', message: 'File not found' });
      apiClient = createMockApiClient({ fetchFileContent: mockFetch });
      vault = new VaultShim('vault-123', 'Test Vault', apiClient, tree);

      const file: TFile = {
        path: 'notes/hello.md',
        name: 'hello.md',
        basename: 'hello',
        extension: 'md',
        stat: { mtime: 0, ctime: 0, size: 42 },
        parent: null,
      };

      await expect(vault.read(file)).rejects.toThrow('Failed to read "notes/hello.md"');
    });
  });

  describe('modify()', () => {
    it('saves content via API and emits modify event', async () => {
      const mockSave = vi.fn().mockResolvedValue({ path: 'notes/hello.md', name: 'hello.md', size: 10 });
      apiClient = createMockApiClient({ saveFile: mockSave });
      vault = new VaultShim('vault-123', 'Test Vault', apiClient, tree);

      const eventCallback = vi.fn();
      vault.on('modify', eventCallback);

      const file: TFile = {
        path: 'notes/hello.md',
        name: 'hello.md',
        basename: 'hello',
        extension: 'md',
        stat: { mtime: 0, ctime: 0, size: 42 },
        parent: null,
      };

      await vault.modify(file, 'new content');
      expect(mockSave).toHaveBeenCalledWith('vault-123', 'notes/hello.md', 'new content');
      expect(eventCallback).toHaveBeenCalledWith(file);
    });

    it('rejects modify on non-existent file', async () => {
      const file: TFile = {
        path: 'nonexistent.md',
        name: 'nonexistent.md',
        basename: 'nonexistent',
        extension: 'md',
        stat: { mtime: 0, ctime: 0, size: 0 },
        parent: null,
      };

      // modify() no longer checks the local tree — it sends to backend directly
      // (fixes race condition: create → modify before tree refreshes)
      await expect(vault.modify(file, 'content')).resolves.not.toThrow();
    });

    it('does not emit event on API failure', async () => {
      const mockSave = vi.fn().mockRejectedValue({ code: 'ERROR', message: 'server error' });
      apiClient = createMockApiClient({ saveFile: mockSave });
      vault = new VaultShim('vault-123', 'Test Vault', apiClient, tree);

      const eventCallback = vi.fn();
      vault.on('modify', eventCallback);

      const file: TFile = {
        path: 'notes/hello.md',
        name: 'hello.md',
        basename: 'hello',
        extension: 'md',
        stat: { mtime: 0, ctime: 0, size: 42 },
        parent: null,
      };

      await expect(vault.modify(file, 'content')).rejects.toThrow();
      expect(eventCallback).not.toHaveBeenCalled();
    });
  });

  describe('create()', () => {
    it('creates a file via API and emits create event', async () => {
      const mockSave = vi.fn().mockResolvedValue({ path: 'new-file.md', name: 'new-file.md', size: 5 });
      apiClient = createMockApiClient({ saveFile: mockSave });
      vault = new VaultShim('vault-123', 'Test Vault', apiClient, tree);

      const eventCallback = vi.fn();
      vault.on('create', eventCallback);

      const result = await vault.create('new-file.md', 'hello');
      expect(result.path).toBe('new-file.md');
      expect(result.name).toBe('new-file.md');
      expect(result.basename).toBe('new-file');
      expect(result.extension).toBe('md');
      expect(mockSave).toHaveBeenCalledWith('vault-123', 'new-file.md', 'hello');
      expect(eventCallback).toHaveBeenCalledWith(result);
    });

    it('creates with empty content when none provided', async () => {
      const mockSave = vi.fn().mockResolvedValue({ path: 'empty.md', name: 'empty.md', size: 0 });
      apiClient = createMockApiClient({ saveFile: mockSave });
      vault = new VaultShim('vault-123', 'Test Vault', apiClient, tree);

      await vault.create('empty.md');
      expect(mockSave).toHaveBeenCalledWith('vault-123', 'empty.md', '');
    });

    it('returns existing file without API call if file already exists', async () => {
      const mockSave = vi.fn().mockResolvedValue({ path: 'notes/hello.md', name: 'hello.md', size: 42 });
      apiClient = createMockApiClient({ saveFile: mockSave });
      vault = new VaultShim('vault-123', 'Test Vault', apiClient, tree);

      const result = await vault.create('notes/hello.md', 'content');
      expect(result.path).toBe('notes/hello.md');
      expect(mockSave).not.toHaveBeenCalled();
    });

    it('rejects create with path traversal', async () => {
      await expect(vault.create('../hack.md', 'evil')).rejects.toThrow('path traversal');
    });

    it('makes the new file visible to synchronous cache lookups immediately', async () => {
      // Regression test: Templater (and other plugins) create a note and then
      // synchronously call getAbstractFileByPath()/exists()/getFileByPath() on
      // it before the tree has been refreshed via updateTree(). Those lookups
      // are sync and can't await a network round-trip, so create() must splice
      // the new node into the local tree itself.
      const mockSave = vi.fn().mockResolvedValue({ path: 'Untitled.md', name: 'Untitled.md', size: 0 });
      apiClient = createMockApiClient({ saveFile: mockSave });
      vault = new VaultShim('vault-123', 'Test Vault', apiClient, tree);

      await vault.create('Untitled.md', '');

      expect(vault.getAbstractFileByPath('Untitled.md')).not.toBeNull();
      expect(vault.getFileByPath('Untitled.md')).not.toBeNull();
      await expect(vault.exists('Untitled.md')).resolves.toBe(true);
      // Now that 'Untitled.md' is in the cache, the next available name must skip it.
      expect(vault.getAvailablePath('Untitled', 'md')).toBe('Untitled 1.md');
    });

    it('creates missing intermediate directories in the local cache', async () => {
      const mockSave = vi.fn().mockResolvedValue({ path: 'a/b/c.md', name: 'c.md', size: 0 });
      apiClient = createMockApiClient({ saveFile: mockSave });
      vault = new VaultShim('vault-123', 'Test Vault', apiClient, tree);

      await vault.create('a/b/c.md', '');

      expect(vault.getFolderByPath('a')).not.toBeNull();
      expect(vault.getFolderByPath('a/b')).not.toBeNull();
      expect(vault.getFileByPath('a/b/c.md')).not.toBeNull();
    });

    it('returns a TFile that passes `instanceof obsidian.TFile` (plugins like LiveSync check this on create events)', async () => {
      class FakeTFile {}
      (window as unknown as { obsidian: { TFile: typeof FakeTFile } }).obsidian = { TFile: FakeTFile };
      try {
        const mockSave = vi.fn().mockResolvedValue({ path: 'drawing.excalidraw.md', name: 'drawing.excalidraw.md', size: 5 });
        apiClient = createMockApiClient({ saveFile: mockSave });
        vault = new VaultShim('vault-123', 'Test Vault', apiClient, tree);

        const result = await vault.create('drawing.excalidraw.md', 'content');
        expect(result).toBeInstanceOf(FakeTFile);
      } finally {
        delete (window as unknown as { obsidian?: unknown }).obsidian;
      }
    });

    it('opens a tab for a newly created file', async () => {
      const openFileDirectly = vi.fn();
      (window as unknown as { app: { workspace: { openFileDirectly: typeof openFileDirectly } } }).app = {
        workspace: { openFileDirectly },
      };
      try {
        const mockSave = vi.fn().mockResolvedValue({ path: 'new-file.md', name: 'new-file.md', size: 5 });
        apiClient = createMockApiClient({ saveFile: mockSave });
        vault = new VaultShim('vault-123', 'Test Vault', apiClient, tree);

        await vault.create('new-file.md', 'hello');
        expect(openFileDirectly).toHaveBeenCalledWith('new-file.md');
      } finally {
        delete (window as unknown as { app?: unknown }).app;
      }
    });

    it('opens a tab for a file that already existed', async () => {
      const openFileDirectly = vi.fn();
      (window as unknown as { app: { workspace: { openFileDirectly: typeof openFileDirectly } } }).app = {
        workspace: { openFileDirectly },
      };
      try {
        apiClient = createMockApiClient();
        vault = new VaultShim('vault-123', 'Test Vault', apiClient, tree);

        await vault.create('notes/hello.md', 'content');
        expect(openFileDirectly).toHaveBeenCalledWith('notes/hello.md');
      } finally {
        delete (window as unknown as { app?: unknown }).app;
      }
    });
  });

  describe('createFolder()', () => {
    it('returns a TFolder that passes `instanceof obsidian.TFolder`', async () => {
      class FakeTFolder {}
      (window as unknown as { obsidian: { TFolder: typeof FakeTFolder } }).obsidian = { TFolder: FakeTFolder };
      try {
        apiClient = createMockApiClient({
          saveFile: vi.fn().mockResolvedValue({ path: '', name: '', size: 0 }),
          deleteContent: vi.fn().mockResolvedValue(undefined),
        });
        vault = new VaultShim('vault-123', 'Test Vault', apiClient, tree);

        const result = await vault.createFolder('new-folder');
        expect(result).toBeInstanceOf(FakeTFolder);
      } finally {
        delete (window as unknown as { obsidian?: unknown }).obsidian;
      }
    });
  });

  describe('delete()', () => {
    it('deletes via API and emits delete event', async () => {
      const mockDelete = vi.fn().mockResolvedValue(undefined);
      apiClient = createMockApiClient({ deleteContent: mockDelete });
      vault = new VaultShim('vault-123', 'Test Vault', apiClient, tree);

      const eventCallback = vi.fn();
      vault.on('delete', eventCallback);

      const file: TAbstractFile = {
        path: 'notes/hello.md',
        name: 'hello.md',
        basename: 'hello',
        extension: 'md',
        stat: { mtime: 0, ctime: 0, size: 42 },
        parent: null,
      };

      await vault.delete(file);
      expect(mockDelete).toHaveBeenCalledWith('vault-123', 'notes/hello.md');
      expect(eventCallback).toHaveBeenCalledWith(file);
    });

    it('rejects delete when the backend reports the file missing', async () => {
      const mockDelete = vi.fn().mockRejectedValue({ code: 'NOT_FOUND', message: 'File not found' });
      apiClient = createMockApiClient({ deleteContent: mockDelete });
      vault = new VaultShim('vault-123', 'Test Vault', apiClient, tree);

      const file: TAbstractFile = {
        path: 'ghost.md',
        name: 'ghost.md',
        basename: 'ghost',
        extension: 'md',
        stat: { mtime: 0, ctime: 0, size: 0 },
        parent: null,
      };

      await expect(vault.delete(file)).rejects.toThrow('Failed to delete "ghost.md"');
    });

    it('deletes a file the local tree cache does not know about yet', async () => {
      // Mirrors create() then immediate delete() (e.g. Templater deleting a
      // just-created placeholder note) before the tree has been refreshed —
      // the local cache must not gate the call, the backend is authoritative.
      const mockDelete = vi.fn().mockResolvedValue(undefined);
      apiClient = createMockApiClient({ deleteContent: mockDelete });
      vault = new VaultShim('vault-123', 'Test Vault', apiClient, tree);

      const file: TAbstractFile = {
        path: 'Untitled 1.md',
        name: 'Untitled 1.md',
        basename: 'Untitled 1',
        extension: 'md',
        stat: { mtime: 0, ctime: 0, size: 0 },
        parent: null,
      };

      await expect(vault.delete(file)).resolves.toBeUndefined();
      expect(mockDelete).toHaveBeenCalledWith('vault-123', 'Untitled 1.md');
    });

    it('removes the file from synchronous cache lookups immediately', async () => {
      const mockDelete = vi.fn().mockResolvedValue(undefined);
      apiClient = createMockApiClient({ deleteContent: mockDelete });
      vault = new VaultShim('vault-123', 'Test Vault', apiClient, tree);

      const file: TAbstractFile = {
        path: 'notes/hello.md',
        name: 'hello.md',
        basename: 'hello',
        extension: 'md',
        stat: { mtime: 0, ctime: 0, size: 42 },
        parent: null,
      };

      expect(vault.getAbstractFileByPath('notes/hello.md')).not.toBeNull();
      await vault.delete(file);
      expect(vault.getAbstractFileByPath('notes/hello.md')).toBeNull();
      await expect(vault.exists('notes/hello.md')).resolves.toBe(false);
    });
  });

  describe('rename()', () => {
    it('renames via API and emits rename event', async () => {
      const mockMove = vi.fn().mockResolvedValue({ newPath: 'notes/renamed.md' });
      apiClient = createMockApiClient({ moveContent: mockMove });
      vault = new VaultShim('vault-123', 'Test Vault', apiClient, tree);

      const eventCallback = vi.fn();
      vault.on('rename', eventCallback);

      const file: TAbstractFile = {
        path: 'notes/hello.md',
        name: 'hello.md',
        basename: 'hello',
        extension: 'md',
        stat: { mtime: 0, ctime: 0, size: 42 },
        parent: null,
      };

      await vault.rename(file, 'notes/renamed.md');
      expect(mockMove).toHaveBeenCalledWith('vault-123', 'notes/hello.md', 'notes/renamed.md');
      expect(file.path).toBe('notes/renamed.md');
      expect(eventCallback).toHaveBeenCalledWith(file, 'notes/hello.md');
    });

    it('moves the file between synchronous cache lookups immediately', async () => {
      const mockMove = vi.fn().mockResolvedValue({ newPath: 'notes/renamed.md' });
      apiClient = createMockApiClient({ moveContent: mockMove });
      vault = new VaultShim('vault-123', 'Test Vault', apiClient, tree);

      const file: TAbstractFile = {
        path: 'notes/hello.md',
        name: 'hello.md',
        basename: 'hello',
        extension: 'md',
        stat: { mtime: 0, ctime: 0, size: 42 },
        parent: null,
      };

      await vault.rename(file, 'notes/renamed.md');

      expect(vault.getAbstractFileByPath('notes/hello.md')).toBeNull();
      expect(vault.getAbstractFileByPath('notes/renamed.md')).not.toBeNull();
    });

    it('moves a whole directory subtree in the local cache', async () => {
      const mockMove = vi.fn().mockResolvedValue({ newPath: 'archive' });
      apiClient = createMockApiClient({ moveContent: mockMove });
      vault = new VaultShim('vault-123', 'Test Vault', apiClient, tree);

      const folder: TAbstractFile = {
        path: 'notes',
        name: 'notes',
        stat: { mtime: 0, ctime: 0, size: 0 },
        parent: null,
      };

      await vault.rename(folder, 'archive');

      expect(vault.getFolderByPath('notes')).toBeNull();
      expect(vault.getFolderByPath('archive')).not.toBeNull();
      expect(vault.getFileByPath('archive/hello.md')).not.toBeNull();
      expect(vault.getFileByPath('archive/world.md')).not.toBeNull();
      expect(vault.getFileByPath('notes/hello.md')).toBeNull();
    });

    it('is a no-op on the local cache when the file is not in it yet', async () => {
      // Mirrors create() then immediate rename() before the tree has refreshed.
      const mockMove = vi.fn().mockResolvedValue({ newPath: 'Renamed.md' });
      apiClient = createMockApiClient({ moveContent: mockMove });
      vault = new VaultShim('vault-123', 'Test Vault', apiClient, tree);

      const file: TAbstractFile = {
        path: 'Untitled 1.md',
        name: 'Untitled 1.md',
        basename: 'Untitled 1',
        extension: 'md',
        stat: { mtime: 0, ctime: 0, size: 0 },
        parent: null,
      };

      await expect(vault.rename(file, 'Renamed.md')).resolves.toBeUndefined();
      expect(mockMove).toHaveBeenCalledWith('vault-123', 'Untitled 1.md', 'Renamed.md');
      expect(file.path).toBe('Renamed.md');
    });
  });

  describe('updateTree()', () => {
    it('updates the directory tree for subsequent lookups', () => {
      const newTree: DirectoryTree = {
        name: 'vault',
        type: 'directory',
        path: '',
        children: [
          { name: 'added.md', type: 'file', path: 'added.md', size: 10 },
        ],
      };

      vault.updateTree(newTree);

      expect(vault.getAbstractFileByPath('added.md')).not.toBeNull();
      expect(vault.getAbstractFileByPath('notes/hello.md')).toBeNull();
    });
  });

  describe('event system delegation', () => {
    it('on/off/trigger work correctly', () => {
      const cb = vi.fn();
      vault.on('custom-event', cb);
      vault.trigger('custom-event', 'arg1', 'arg2');
      expect(cb).toHaveBeenCalledWith('arg1', 'arg2');

      vault.off('custom-event', cb);
      vault.trigger('custom-event', 'arg3');
      expect(cb).toHaveBeenCalledTimes(1);
    });

    it('forwards the optional callback context', () => {
      const context = { received: '' };
      function callback(this: typeof context, value: string): void {
        this.received = value;
      }
      vault.on('custom-event', callback, context);

      vault.trigger('custom-event', 'bound value');

      expect(context.received).toBe('bound value');
    });
  });
});
