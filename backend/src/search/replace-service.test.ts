import { describe, it, expect, beforeEach } from 'vitest'
import { ReplaceService } from './replace-service.js'
import { RegexValidationError, RegexTooLongError } from './errors.js'
import type { IVaultService, IVaultAccessControl } from '../business/index.js'
import type { ILogger } from '../logger/index.js'
import type { DirectoryTree, FileContent } from '../vault/index.js'

// ─── Mock Factories ──────────────────────────────────────────────────────────

function createMockLogger(): ILogger {
  return {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  }
}

function createMockVaultAccessControl(): IVaultAccessControl {
  return {
    checkReadAccess: async () => {},
    checkWriteAccess: async () => {},
    createShare: async () => {},
    revokeShare: async () => {},
    updateSharePermission: async () => {},
  }
}

interface MockVaultServiceOptions {
  files?: Record<string, { content: string; isBinary?: boolean }>
  tree?: DirectoryTree
  saveFileError?: Record<string, Error>
  readFileError?: Record<string, Error>
}

function createMockVaultService(opts: MockVaultServiceOptions = {}): IVaultService & { savedFiles: Array<{ vaultId: string; path: string; content: string }> } {
  const savedFiles: Array<{ vaultId: string; path: string; content: string }> = []

  const tree: DirectoryTree = opts.tree ?? {
    name: 'root',
    path: '',
    type: 'directory',
    children: Object.keys(opts.files ?? {}).map((filePath) => ({
      name: filePath.split('/').pop() ?? filePath,
      path: filePath,
      type: 'file' as const,
      children: [],
    })),
  }

  return {
    savedFiles,
    initializeVaults: async () => {},
    getVaultList: async () => [],
    getVaultTree: async () => tree,
    getFileContent: async (_vaultId: string, filePath: string) => {
      if (opts.readFileError?.[filePath]) {
        throw opts.readFileError[filePath]
      }
      const file = opts.files?.[filePath]
      if (!file) {
        throw new Error(`File not found: ${filePath}`)
      }
      return {
        content: file.content,
        path: filePath,
        name: filePath.split('/').pop() ?? filePath,
        size: Buffer.byteLength(file.content, 'utf-8'),
        isBinary: file.isBinary ?? false,
        etag: 'mock-etag',
      } as FileContent
    },
    resolveFilePath: (_vaultId: string, filePath: string) => `/data/vaults/test/${filePath}`,
    saveFile: async (vaultId: string, filePath: string, content: string) => {
      if (opts.saveFileError?.[filePath]) {
        throw opts.saveFileError[filePath]
      }
      savedFiles.push({ vaultId, path: filePath, content })
      return { path: filePath, name: filePath.split('/').pop() ?? filePath, size: content.length, etag: 'new-etag' }
    },
    createVault: async () => ({ id: '', name: '', path: '', status: 'loaded' as const }),
    deleteVault: async () => {},
    deleteVaultWithChecks: async () => {},
    transferOwnership: async () => {},
    deleteContent: async () => {},
    moveContent: async () => ({ newPath: '' }),
    renameContent: async () => ({ newPath: '' }),
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('ReplaceService', () => {
  let logger: ILogger
  let accessControl: IVaultAccessControl

  beforeEach(() => {
    logger = createMockLogger()
    accessControl = createMockVaultAccessControl()
  })

  describe('replace() — basic plain-text replacement', () => {
    it('replaces all occurrences in a single file', async () => {
      const vaultService = createMockVaultService({
        files: {
          'notes/hello.md': { content: 'Hello World. Hello again.' },
        },
      })
      const service = new ReplaceService(vaultService, accessControl, logger)

      const result = await service.replace('vault1', {
        query: 'Hello',
        replacement: 'Hi',
        caseSensitive: true,
        regex: false,
        paths: ['notes/hello.md'],
      })

      expect(result.totalReplacements).toBe(2)
      expect(result.fileCount).toBe(1)
      expect(result.files).toEqual([{ path: 'notes/hello.md', replacements: 2 }])
      expect(result.failed).toEqual([])
      expect(vaultService.savedFiles[0]?.content).toBe('Hi World. Hi again.')
    })

    it('replaces case-insensitively when caseSensitive is false', async () => {
      const vaultService = createMockVaultService({
        files: {
          'notes/test.md': { content: 'Hello HELLO hello' },
        },
      })
      const service = new ReplaceService(vaultService, accessControl, logger)

      const result = await service.replace('vault1', {
        query: 'hello',
        replacement: 'hi',
        caseSensitive: false,
        regex: false,
        paths: ['notes/test.md'],
      })

      expect(result.totalReplacements).toBe(3)
      expect(vaultService.savedFiles[0]?.content).toBe('hi hi hi')
    })

    it('does not replace when no matches are found', async () => {
      const vaultService = createMockVaultService({
        files: {
          'notes/test.md': { content: 'No matches here' },
        },
      })
      const service = new ReplaceService(vaultService, accessControl, logger)

      const result = await service.replace('vault1', {
        query: 'xyz',
        replacement: 'abc',
        caseSensitive: true,
        regex: false,
        paths: ['notes/test.md'],
      })

      expect(result.totalReplacements).toBe(0)
      expect(result.fileCount).toBe(0)
      expect(result.files).toEqual([])
      expect(vaultService.savedFiles).toEqual([])
    })

    it('replaces across multiple files', async () => {
      const vaultService = createMockVaultService({
        files: {
          'file1.md': { content: 'old text here' },
          'file2.md': { content: 'another old value old' },
          'file3.md': { content: 'no match' },
        },
      })
      const service = new ReplaceService(vaultService, accessControl, logger)

      const result = await service.replace('vault1', {
        query: 'old',
        replacement: 'new',
        caseSensitive: true,
        regex: false,
        paths: ['file1.md', 'file2.md', 'file3.md'],
      })

      expect(result.totalReplacements).toBe(3)
      expect(result.fileCount).toBe(2)
      expect(result.files).toHaveLength(2)
      expect(result.files[0]).toEqual({ path: 'file1.md', replacements: 1 })
      expect(result.files[1]).toEqual({ path: 'file2.md', replacements: 2 })
    })
  })

  describe('replace() — regex replacement', () => {
    it('replaces using a regex pattern', async () => {
      const vaultService = createMockVaultService({
        files: {
          'test.md': { content: 'foo123 bar456 baz789' },
        },
      })
      const service = new ReplaceService(vaultService, accessControl, logger)

      const result = await service.replace('vault1', {
        query: '\\d+',
        replacement: 'NUM',
        caseSensitive: true,
        regex: true,
        paths: ['test.md'],
      })

      expect(result.totalReplacements).toBe(3)
      expect(vaultService.savedFiles[0]?.content).toBe('fooNUM barNUM bazNUM')
    })

    it('supports case-insensitive regex', async () => {
      const vaultService = createMockVaultService({
        files: {
          'test.md': { content: 'Foo FOO foo' },
        },
      })
      const service = new ReplaceService(vaultService, accessControl, logger)

      const result = await service.replace('vault1', {
        query: 'foo',
        replacement: 'bar',
        caseSensitive: false,
        regex: true,
        paths: ['test.md'],
      })

      expect(result.totalReplacements).toBe(3)
      expect(vaultService.savedFiles[0]?.content).toBe('bar bar bar')
    })

    it('supports regex group references in replacement ($1)', async () => {
      const vaultService = createMockVaultService({
        files: {
          'test.md': { content: 'hello-world foo-bar' },
        },
      })
      const service = new ReplaceService(vaultService, accessControl, logger)

      const result = await service.replace('vault1', {
        query: '(\\w+)-(\\w+)',
        replacement: '$2-$1',
        caseSensitive: true,
        regex: true,
        paths: ['test.md'],
      })

      expect(result.totalReplacements).toBe(2)
      expect(vaultService.savedFiles[0]?.content).toBe('world-hello bar-foo')
    })

    it('throws RegexValidationError for invalid regex', async () => {
      const vaultService = createMockVaultService({ files: {} })
      const service = new ReplaceService(vaultService, accessControl, logger)

      await expect(
        service.replace('vault1', {
          query: '[invalid',
          replacement: 'x',
          caseSensitive: true,
          regex: true,
        }),
      ).rejects.toThrow(RegexValidationError)
    })

    it('throws RegexTooLongError for patterns exceeding 1000 chars', async () => {
      const vaultService = createMockVaultService({ files: {} })
      const service = new ReplaceService(vaultService, accessControl, logger)

      await expect(
        service.replace('vault1', {
          query: 'a'.repeat(1001),
          replacement: 'x',
          caseSensitive: true,
          regex: true,
        }),
      ).rejects.toThrow(RegexTooLongError)
    })
  })

  describe('replace() — file limit (max 100)', () => {
    it('processes at most 100 files even when more paths are provided', async () => {
      const files: Record<string, { content: string }> = {}
      const paths: string[] = []
      for (let i = 0; i < 150; i++) {
        const filePath = `file${i.toString().padStart(3, '0')}.md`
        files[filePath] = { content: 'target text' }
        paths.push(filePath)
      }

      const vaultService = createMockVaultService({ files })
      const service = new ReplaceService(vaultService, accessControl, logger)

      const result = await service.replace('vault1', {
        query: 'target',
        replacement: 'replaced',
        caseSensitive: true,
        regex: false,
        paths,
      })

      expect(result.fileCount).toBeLessThanOrEqual(100)
      expect(vaultService.savedFiles.length).toBeLessThanOrEqual(100)
    })

    it('processes at most 100 files from vault tree when no paths provided', async () => {
      const files: Record<string, { content: string }> = {}
      for (let i = 0; i < 150; i++) {
        const filePath = `file${i.toString().padStart(3, '0')}.md`
        files[filePath] = { content: 'target text' }
      }

      const vaultService = createMockVaultService({ files })
      const service = new ReplaceService(vaultService, accessControl, logger)

      const result = await service.replace('vault1', {
        query: 'target',
        replacement: 'replaced',
        caseSensitive: true,
        regex: false,
      })

      expect(result.fileCount).toBeLessThanOrEqual(100)
      expect(vaultService.savedFiles.length).toBeLessThanOrEqual(100)
    })
  })

  describe('replace() — partial failure handling', () => {
    it('continues processing after a file write failure', async () => {
      const vaultService = createMockVaultService({
        files: {
          'file1.md': { content: 'replace me' },
          'file2.md': { content: 'replace me' },
          'file3.md': { content: 'replace me' },
        },
        saveFileError: {
          'file2.md': new Error('Permission denied'),
        },
      })
      const service = new ReplaceService(vaultService, accessControl, logger)

      const result = await service.replace('vault1', {
        query: 'replace me',
        replacement: 'done',
        caseSensitive: true,
        regex: false,
        paths: ['file1.md', 'file2.md', 'file3.md'],
      })

      expect(result.totalReplacements).toBe(2)
      expect(result.fileCount).toBe(2)
      expect(result.files).toHaveLength(2)
      expect(result.failed).toHaveLength(1)
      expect(result.failed[0]).toEqual({ path: 'file2.md', reason: 'Permission denied' })
    })

    it('continues processing after a file read failure', async () => {
      const vaultService = createMockVaultService({
        files: {
          'file1.md': { content: 'replace me' },
          'file2.md': { content: 'replace me' },
        },
        readFileError: {
          'file1.md': new Error('File not accessible'),
        },
      })
      const service = new ReplaceService(vaultService, accessControl, logger)

      const result = await service.replace('vault1', {
        query: 'replace me',
        replacement: 'done',
        caseSensitive: true,
        regex: false,
        paths: ['file1.md', 'file2.md'],
      })

      expect(result.totalReplacements).toBe(1)
      expect(result.fileCount).toBe(1)
      expect(result.failed).toHaveLength(1)
      expect(result.failed[0]?.path).toBe('file1.md')
    })

    it('does not roll back successful replacements when later files fail', async () => {
      const vaultService = createMockVaultService({
        files: {
          'file1.md': { content: 'old text' },
          'file2.md': { content: 'old text' },
          'file3.md': { content: 'old text' },
        },
        saveFileError: {
          'file3.md': new Error('Disk full'),
        },
      })
      const service = new ReplaceService(vaultService, accessControl, logger)

      const result = await service.replace('vault1', {
        query: 'old',
        replacement: 'new',
        caseSensitive: true,
        regex: false,
        paths: ['file1.md', 'file2.md', 'file3.md'],
      })

      // First two files were saved successfully
      expect(vaultService.savedFiles).toHaveLength(2)
      expect(result.files).toHaveLength(2)
      expect(result.failed).toHaveLength(1)
    })
  })

  describe('replace() — binary file handling', () => {
    it('skips binary files without error', async () => {
      const vaultService = createMockVaultService({
        files: {
          'image.png': { content: 'binary data', isBinary: true },
          'notes.md': { content: 'find me' },
        },
      })
      const service = new ReplaceService(vaultService, accessControl, logger)

      const result = await service.replace('vault1', {
        query: 'find me',
        replacement: 'found',
        caseSensitive: true,
        regex: false,
        paths: ['image.png', 'notes.md'],
      })

      expect(result.totalReplacements).toBe(1)
      expect(result.fileCount).toBe(1)
      expect(result.failed).toEqual([])
    })
  })

  describe('replace() — internal files', () => {
    it('skips files with _ prefix when searching entire vault', async () => {
      const tree: DirectoryTree = {
        name: 'root',
        path: '',
        type: 'directory',
        children: [
          { name: '_internal.json', path: '_internal.json', type: 'file', children: [] },
          { name: 'notes.md', path: 'notes.md', type: 'file', children: [] },
        ],
      }
      const vaultService = createMockVaultService({
        files: {
          '_internal.json': { content: 'find this' },
          'notes.md': { content: 'find this' },
        },
        tree,
      })
      const service = new ReplaceService(vaultService, accessControl, logger)

      const result = await service.replace('vault1', {
        query: 'find this',
        replacement: 'replaced',
        caseSensitive: true,
        regex: false,
      })

      // Only notes.md should be processed, _internal.json should be skipped
      expect(result.fileCount).toBe(1)
      expect(result.files[0]?.path).toBe('notes.md')
    })
  })

  describe('replace() — sequential processing', () => {
    it('processes files in order', async () => {
      const vaultService = createMockVaultService({
        files: {
          'a.md': { content: 'match' },
          'b.md': { content: 'match' },
          'c.md': { content: 'match' },
        },
      })
      const service = new ReplaceService(vaultService, accessControl, logger)

      await service.replace('vault1', {
        query: 'match',
        replacement: 'done',
        caseSensitive: true,
        regex: false,
        paths: ['a.md', 'b.md', 'c.md'],
      })

      expect(vaultService.savedFiles.map((f) => f.path)).toEqual(['a.md', 'b.md', 'c.md'])
    })
  })

  describe('replace() — empty query edge case', () => {
    it('handles empty query gracefully for plain-text mode', async () => {
      const vaultService = createMockVaultService({
        files: {
          'test.md': { content: 'some content' },
        },
      })
      const service = new ReplaceService(vaultService, accessControl, logger)

      const result = await service.replace('vault1', {
        query: '',
        replacement: 'x',
        caseSensitive: true,
        regex: false,
        paths: ['test.md'],
      })

      // Empty query should not match anything
      expect(result.totalReplacements).toBe(0)
      expect(result.fileCount).toBe(0)
    })
  })
})
