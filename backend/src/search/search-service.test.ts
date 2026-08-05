import { describe, it, expect } from 'vitest'
import { SearchService } from './search-service.js'
import { RegexValidationError, RegexTooLongError } from './errors.js'
import type { IVaultService, IVaultAccessControl } from '../business/index.js'
import type { ILogger } from '../logger/index.js'
import type { DirectoryTree, FileContent, VaultInfo } from '../vault/index.js'

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
  vaults?: VaultInfo[]
}

function createMockVaultService(opts: MockVaultServiceOptions = {}): IVaultService {
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
    initializeVaults: async () => {},
    getVaultList: async () => opts.vaults ?? [],
    getVaultTree: async () => tree,
    getFileContent: async (_vaultId: string, filePath: string): Promise<FileContent> => {
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
        isTruncated: false,
        encoding: 'utf-8',
        etag: 'mock-etag',
      }
    },
    resolveFilePath: (_vaultId: string, filePath: string) => `/data/vaults/test/${filePath}`,
    saveFile: async (_vaultId: string, filePath: string, content: string) => ({
      path: filePath, name: filePath.split('/').pop() ?? filePath, size: content.length, etag: 'new-etag',
    }),
    createVault: async () => ({ id: '', name: '', path: '', status: 'loaded' as const }),
    deleteVault: async () => {},
    deleteVaultWithChecks: async () => {},
    transferOwnership: async () => {},
    deleteContent: async () => {},
    moveContent: async () => ({ newPath: '' }),
    renameContent: async () => ({ newPath: '' }),
  }
}

function defaultOptions(overrides: Partial<import('./types.js').ISearchOptions> = {}): import('./types.js').ISearchOptions {
  return {
    query: 'test',
    caseSensitive: false,
    regex: false,
    contextLines: 2,
    maxResults: 500,
    ...overrides,
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('SearchService', () => {
  const logger = createMockLogger()
  const accessControl = createMockVaultAccessControl()

  describe('search() — plain-text matching', () => {
    it('finds a single hit in a single file', async () => {
      const vaultService = createMockVaultService({
        files: { 'note.md': { content: 'hello world\nsecond line' } },
      })
      const service = new SearchService(vaultService, accessControl, logger)

      const result = await service.search('vault1', defaultOptions({ query: 'world' }))

      expect(result.totalHits).toBe(1)
      expect(result.results).toHaveLength(1)
      expect(result.results[0]!.filePath).toBe('note.md')
      expect(result.results[0]!.hits[0]!.matchLine).toBe('hello world')
    })

    it('is case-insensitive by default', async () => {
      const vaultService = createMockVaultService({
        files: { 'note.md': { content: 'Hello World' } },
      })
      const service = new SearchService(vaultService, accessControl, logger)

      const result = await service.search('vault1', defaultOptions({ query: 'world', caseSensitive: false }))
      expect(result.totalHits).toBe(1)
    })

    it('respects caseSensitive: true', async () => {
      const vaultService = createMockVaultService({
        files: { 'note.md': { content: 'Hello World' } },
      })
      const service = new SearchService(vaultService, accessControl, logger)

      const result = await service.search('vault1', defaultOptions({ query: 'world', caseSensitive: true }))
      expect(result.totalHits).toBe(0)
    })

    it('skips binary files', async () => {
      const vaultService = createMockVaultService({
        files: { 'image.png': { content: 'binarydata', isBinary: true } },
      })
      const service = new SearchService(vaultService, accessControl, logger)

      const result = await service.search('vault1', defaultOptions({ query: 'binarydata' }))
      expect(result.totalHits).toBe(0)
      expect(result.skippedFiles).toContainEqual({ path: 'image.png', reason: 'binary' })
    })

    it('returns no hits for a query not present in any file', async () => {
      const vaultService = createMockVaultService({
        files: { 'note.md': { content: 'hello world' } },
      })
      const service = new SearchService(vaultService, accessControl, logger)

      const result = await service.search('vault1', defaultOptions({ query: 'nonexistent' }))
      expect(result.totalHits).toBe(0)
      expect(result.results).toHaveLength(0)
    })
  })

  describe('search() — regex matching', () => {
    it('finds hits using a regex pattern', async () => {
      const vaultService = createMockVaultService({
        files: { 'note.md': { content: 'foo123 bar456' } },
      })
      const service = new SearchService(vaultService, accessControl, logger)

      const result = await service.search('vault1', defaultOptions({ query: '\\d+', regex: true }))
      expect(result.totalHits).toBe(2)
    })

    it('throws RegexValidationError for invalid regex syntax', async () => {
      const vaultService = createMockVaultService({ files: {} })
      const service = new SearchService(vaultService, accessControl, logger)

      await expect(service.search('vault1', defaultOptions({ query: '[invalid', regex: true })))
        .rejects.toThrow(RegexValidationError)
    })

    it('throws RegexTooLongError for patterns exceeding 1000 chars', async () => {
      const vaultService = createMockVaultService({ files: {} })
      const service = new SearchService(vaultService, accessControl, logger)

      await expect(service.search('vault1', defaultOptions({ query: 'a'.repeat(1001), regex: true })))
        .rejects.toThrow(RegexTooLongError)
    })

    it('throws RegexValidationError for a catastrophic-backtracking (nested quantifier) pattern', async () => {
      // Regression test: search() and searchMultiVault() both delegate regex
      // validation to the shared validateRegexPattern(), which must reject
      // patterns like (a+)+ before they are ever compiled against real content.
      const vaultService = createMockVaultService({ files: {} })
      const service = new SearchService(vaultService, accessControl, logger)

      await expect(service.search('vault1', defaultOptions({ query: '(a+)+', regex: true })))
        .rejects.toThrow(RegexValidationError)
    })
  })

  describe('search() — file size limit', () => {
    it('skips files over 10 MB with reason too_large', async () => {
      const hugeContent = 'x'.repeat(11 * 1024 * 1024)
      const vaultService = createMockVaultService({
        files: { 'huge.md': { content: hugeContent } },
      })
      const service = new SearchService(vaultService, accessControl, logger)

      const result = await service.search('vault1', defaultOptions({ query: 'x' }))
      expect(result.skippedFiles).toContainEqual({ path: 'huge.md', reason: 'too_large' })
      expect(result.totalHits).toBe(0)
    })
  })

  describe('searchMultiVault() — regex validation', () => {
    it('throws RegexValidationError for a catastrophic-backtracking pattern before touching any vault', async () => {
      const vaultService = createMockVaultService({ files: {} })
      const service = new SearchService(vaultService, accessControl, logger)

      await expect(
        service.searchMultiVault('user-1', [], defaultOptions({ query: '(a+)+', regex: true })),
      ).rejects.toThrow(RegexValidationError)
    })
  })
})
