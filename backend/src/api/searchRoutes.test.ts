// Unit tests for searchRoutes — HTTP integration tests

import { describe, it, expect } from 'vitest'
import { Hono } from 'hono'
import type { SessionContext } from '../auth/index.js'
import type { ILogger } from '../logger/index.js'
import type { IVaultAccessControl } from '../business/index.js'
import { VaultNotFoundError, VaultAccessDeniedError } from '../business/index.js'
import type { ISearchService, IReplaceService, ISearchOptions, SearchResponse, MultiVaultSearchResponse, IReplaceOptions, ReplaceResponse } from '../search/index.js'
import { SearchQueryValidationError, RegexValidationError, RegexTooLongError, ReplaceValidationError } from '../search/index.js'
import { createSearchRoutes } from './searchRoutes.js'

// ─── Mock Factories ──────────────────────────────────────────────────────────

function createMockLogger(): ILogger {
  return {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  }
}

function createMockSearchService(overrides: Partial<ISearchService> = {}): ISearchService {
  return {
    search: async (): Promise<SearchResponse> => ({
      results: [],
      totalHits: 0,
      filesSearched: 0,
      truncated: false,
      skippedFiles: [],
      durationMs: 10,
    }),
    searchMultiVault: async (): Promise<MultiVaultSearchResponse> => ({
      vaults: [],
      totalHits: 0,
      filesSearched: 0,
      truncated: false,
      failedVaults: [],
      durationMs: 10,
    }),
    ...overrides,
  }
}

function createMockReplaceService(overrides: Partial<IReplaceService> = {}): IReplaceService {
  return {
    replace: async (): Promise<ReplaceResponse> => ({
      totalReplacements: 0,
      fileCount: 0,
      files: [],
      failed: [],
    }),
    ...overrides,
  }
}

function createMockVaultAccessControl(overrides: Partial<IVaultAccessControl> = {}): IVaultAccessControl {
  return {
    checkReadAccess: async () => {},
    checkWriteAccess: async () => {},
    createShare: async () => {},
    revokeShare: async () => {},
    updateSharePermission: async () => {},
    ...overrides,
  }
}

// ─── Test App Factory ────────────────────────────────────────────────────────

function createTestApp(options: {
  searchService?: ISearchService
  replaceService?: IReplaceService
  vaultAccessControl?: IVaultAccessControl
  session?: SessionContext | null
} = {}) {
  const logger = createMockLogger()
  const searchService = options.searchService ?? createMockSearchService()
  const replaceService = options.replaceService ?? createMockReplaceService()
  const vaultAccessControl = options.vaultAccessControl ?? createMockVaultAccessControl()

  const app = new Hono()

  // Simulate auth middleware setting session context
  if (options.session !== null) {
    const session = options.session ?? defaultSession
    app.use('*', async (c, next) => {
      c.set('session' as never, session as never)
      return next()
    })
  }

  const routes = createSearchRoutes({ searchService, replaceService, vaultAccessControl, logger })
  app.route('/api/v1', routes)
  return app
}

const defaultSession: SessionContext = {
  userId: 'user-1',
  username: 'testuser',
  role: 'user',
  sessionId: 'session-1',
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Search Routes', () => {
  describe('GET /vaults/:vaultId/search', () => {
    it('returns 401 if not authenticated', async () => {
      const app = createTestApp({ session: null })

      const res = await app.request('/api/v1/vaults/vault-1/search?query=hello')
      expect(res.status).toBe(401)

      const body = await res.json() as { code: string }
      expect(body.code).toBe('UNAUTHORIZED')
    })

    it('returns 400 if query parameter is missing', async () => {
      const app = createTestApp()

      const res = await app.request('/api/v1/vaults/vault-1/search')
      expect(res.status).toBe(400)

      const body = await res.json() as { code: string }
      expect(body.code).toBe('INVALID_QUERY')
    })

    it('returns 400 if query is empty string', async () => {
      const app = createTestApp()

      const res = await app.request('/api/v1/vaults/vault-1/search?query=')
      expect(res.status).toBe(400)

      const body = await res.json() as { code: string }
      expect(body.code).toBe('INVALID_QUERY')
    })

    it('returns 403 if user has no read access', async () => {
      const vaultAccessControl = createMockVaultAccessControl({
        checkReadAccess: async (vaultId, userId) => {
          throw new VaultAccessDeniedError(vaultId, userId, 'read')
        },
      })
      const app = createTestApp({ vaultAccessControl })

      const res = await app.request('/api/v1/vaults/vault-1/search?query=hello')
      expect(res.status).toBe(403)

      const body = await res.json() as { code: string }
      expect(body.code).toBe('ACCESS_DENIED')
    })

    it('returns 404 if vault not found', async () => {
      const searchService = createMockSearchService({
        search: async () => { throw new VaultNotFoundError('vault-1') },
      })
      const app = createTestApp({ searchService })

      const res = await app.request('/api/v1/vaults/vault-1/search?query=hello')
      expect(res.status).toBe(404)

      const body = await res.json() as { code: string }
      expect(body.code).toBe('VAULT_NOT_FOUND')
    })

    it('returns 200 with search results on success', async () => {
      const expectedResponse: SearchResponse = {
        results: [
          {
            filePath: 'notes/test.md',
            fileName: 'test.md',
            hits: [{ line: 1, matchText: 'hello', contextBefore: [], contextAfter: [], matchLine: 'hello world' }],
            hitCount: 1,
          },
        ],
        totalHits: 1,
        filesSearched: 5,
        truncated: false,
        skippedFiles: [],
        durationMs: 15,
      }
      const searchService = createMockSearchService({
        search: async () => expectedResponse,
      })
      const app = createTestApp({ searchService })

      const res = await app.request('/api/v1/vaults/vault-1/search?query=hello')
      expect(res.status).toBe(200)

      const body = await res.json() as SearchResponse
      expect(body.totalHits).toBe(1)
      expect(body.results).toHaveLength(1)
      expect(body.results[0]?.filePath).toBe('notes/test.md')
    })

    it('passes validated query parameters to search service', async () => {
      let capturedOptions: ISearchOptions | undefined
      const searchService = createMockSearchService({
        search: async (_vaultId, options) => {
          capturedOptions = options
          return { results: [], totalHits: 0, filesSearched: 0, truncated: false, skippedFiles: [], durationMs: 5 }
        },
      })
      const app = createTestApp({ searchService })

      await app.request('/api/v1/vaults/vault-1/search?query=test&caseSensitive=true&regex=true&contextLines=5&maxResults=100')

      expect(capturedOptions).toBeDefined()
      expect(capturedOptions!.query).toBe('test')
      expect(capturedOptions!.caseSensitive).toBe(true)
      expect(capturedOptions!.regex).toBe(true)
      expect(capturedOptions!.contextLines).toBe(5)
      expect(capturedOptions!.maxResults).toBe(100)
    })

    it('uses default values for optional parameters', async () => {
      let capturedOptions: ISearchOptions | undefined
      const searchService = createMockSearchService({
        search: async (_vaultId, options) => {
          capturedOptions = options
          return { results: [], totalHits: 0, filesSearched: 0, truncated: false, skippedFiles: [], durationMs: 5 }
        },
      })
      const app = createTestApp({ searchService })

      await app.request('/api/v1/vaults/vault-1/search?query=hello')

      expect(capturedOptions).toBeDefined()
      expect(capturedOptions!.caseSensitive).toBe(false)
      expect(capturedOptions!.regex).toBe(false)
      expect(capturedOptions!.contextLines).toBe(2)
      expect(capturedOptions!.maxResults).toBe(500)
    })

    it('returns 400 for invalid regex from SearchService', async () => {
      const searchService = createMockSearchService({
        search: async () => { throw new RegexValidationError('[invalid', 'Unterminated character class') },
      })
      const app = createTestApp({ searchService })

      const res = await app.request('/api/v1/vaults/vault-1/search?query=%5Binvalid&regex=true')
      expect(res.status).toBe(400)

      const body = await res.json() as { code: string }
      expect(body.code).toBe('INVALID_REGEX')
    })

    it('returns 400 for regex too long from SearchService', async () => {
      const searchService = createMockSearchService({
        search: async () => { throw new RegexTooLongError(1500) },
      })
      const app = createTestApp({ searchService })

      const res = await app.request('/api/v1/vaults/vault-1/search?query=x&regex=true')
      expect(res.status).toBe(400)

      const body = await res.json() as { code: string }
      expect(body.code).toBe('REGEX_TOO_LONG')
    })
  })

  describe('GET /search (multi-vault)', () => {
    it('returns 401 if not authenticated', async () => {
      const app = createTestApp({ session: null })

      const res = await app.request('/api/v1/search?query=hello')
      expect(res.status).toBe(401)

      const body = await res.json() as { code: string }
      expect(body.code).toBe('UNAUTHORIZED')
    })

    it('returns 400 if query parameter is missing', async () => {
      const app = createTestApp()

      const res = await app.request('/api/v1/search')
      expect(res.status).toBe(400)

      const body = await res.json() as { code: string }
      expect(body.code).toBe('INVALID_QUERY')
    })

    it('returns 200 with multi-vault results on success', async () => {
      const expectedResponse: MultiVaultSearchResponse = {
        vaults: [
          { vaultId: 'v1', vaultName: 'Vault 1', results: [], totalHits: 3 },
        ],
        totalHits: 3,
        filesSearched: 10,
        truncated: false,
        failedVaults: [],
        durationMs: 50,
      }
      const searchService = createMockSearchService({
        searchMultiVault: async () => expectedResponse,
      })
      const app = createTestApp({ searchService })

      const res = await app.request('/api/v1/search?query=hello&vaultIds=v1,v2')
      expect(res.status).toBe(200)

      const body = await res.json() as MultiVaultSearchResponse
      expect(body.totalHits).toBe(3)
      expect(body.vaults).toHaveLength(1)
    })

    it('parses comma-separated vaultIds', async () => {
      let capturedVaultIds: string[] | undefined
      const searchService = createMockSearchService({
        searchMultiVault: async (_userId, vaultIds) => {
          capturedVaultIds = vaultIds
          return { vaults: [], totalHits: 0, filesSearched: 0, truncated: false, failedVaults: [], durationMs: 5 }
        },
      })
      const app = createTestApp({ searchService })

      await app.request('/api/v1/search?query=test&vaultIds=abc,def,ghi')

      expect(capturedVaultIds).toEqual(['abc', 'def', 'ghi'])
    })

    it('passes empty vaultIds array when no vaultIds parameter', async () => {
      let capturedVaultIds: string[] | undefined
      const searchService = createMockSearchService({
        searchMultiVault: async (_userId, vaultIds) => {
          capturedVaultIds = vaultIds
          return { vaults: [], totalHits: 0, filesSearched: 0, truncated: false, failedVaults: [], durationMs: 5 }
        },
      })
      const app = createTestApp({ searchService })

      await app.request('/api/v1/search?query=test')

      expect(capturedVaultIds).toEqual([])
    })

    it('passes userId from session to searchMultiVault', async () => {
      let capturedUserId: string | undefined
      const searchService = createMockSearchService({
        searchMultiVault: async (userId) => {
          capturedUserId = userId
          return { vaults: [], totalHits: 0, filesSearched: 0, truncated: false, failedVaults: [], durationMs: 5 }
        },
      })
      const app = createTestApp({ searchService })

      await app.request('/api/v1/search?query=test')

      expect(capturedUserId).toBe('user-1')
    })
  })

  describe('POST /vaults/:vaultId/replace', () => {
    it('returns 401 if not authenticated', async () => {
      const app = createTestApp({ session: null })

      const res = await app.request('/api/v1/vaults/vault-1/replace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'old', replacement: 'new', caseSensitive: false, regex: false }),
      })
      expect(res.status).toBe(401)

      const body = await res.json() as { code: string }
      expect(body.code).toBe('UNAUTHORIZED')
    })

    it('returns 400 if body is not valid JSON', async () => {
      const app = createTestApp()

      const res = await app.request('/api/v1/vaults/vault-1/replace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not valid json',
      })
      expect(res.status).toBe(400)

      const body = await res.json() as { code: string }
      expect(body.code).toBe('INVALID_REPLACE')
    })

    it('returns 400 if query is missing in body', async () => {
      const app = createTestApp()

      const res = await app.request('/api/v1/vaults/vault-1/replace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ replacement: 'new', caseSensitive: false, regex: false }),
      })
      expect(res.status).toBe(400)

      const body = await res.json() as { code: string }
      expect(body.code).toBe('INVALID_REPLACE')
    })

    it('returns 403 if user has no write access', async () => {
      const vaultAccessControl = createMockVaultAccessControl({
        checkWriteAccess: async (vaultId, userId) => {
          throw new VaultAccessDeniedError(vaultId, userId, 'write')
        },
      })
      const app = createTestApp({ vaultAccessControl })

      const res = await app.request('/api/v1/vaults/vault-1/replace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'old', replacement: 'new', caseSensitive: false, regex: false }),
      })
      expect(res.status).toBe(403)

      const body = await res.json() as { code: string }
      expect(body.code).toBe('ACCESS_DENIED')
    })

    it('returns 404 if vault not found', async () => {
      const replaceService = createMockReplaceService({
        replace: async () => { throw new VaultNotFoundError('vault-1') },
      })
      const app = createTestApp({ replaceService })

      const res = await app.request('/api/v1/vaults/vault-1/replace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'old', replacement: 'new', caseSensitive: false, regex: false }),
      })
      expect(res.status).toBe(404)

      const body = await res.json() as { code: string }
      expect(body.code).toBe('VAULT_NOT_FOUND')
    })

    it('returns 200 with replace results on success', async () => {
      const expectedResponse: ReplaceResponse = {
        totalReplacements: 5,
        fileCount: 2,
        files: [
          { path: 'notes/a.md', replacements: 3 },
          { path: 'notes/b.md', replacements: 2 },
        ],
        failed: [],
      }
      const replaceService = createMockReplaceService({
        replace: async () => expectedResponse,
      })
      const app = createTestApp({ replaceService })

      const res = await app.request('/api/v1/vaults/vault-1/replace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'old', replacement: 'new', caseSensitive: false, regex: false }),
      })
      expect(res.status).toBe(200)

      const body = await res.json() as ReplaceResponse
      expect(body.totalReplacements).toBe(5)
      expect(body.fileCount).toBe(2)
      expect(body.files).toHaveLength(2)
    })

    it('passes validated body to replace service', async () => {
      let capturedOptions: IReplaceOptions | undefined
      const replaceService = createMockReplaceService({
        replace: async (_vaultId, options) => {
          capturedOptions = options
          return { totalReplacements: 0, fileCount: 0, files: [], failed: [] }
        },
      })
      const app = createTestApp({ replaceService })

      await app.request('/api/v1/vaults/vault-1/replace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: 'find-me',
          replacement: 'replace-with',
          caseSensitive: true,
          regex: true,
          paths: ['notes/a.md', 'notes/b.md'],
        }),
      })

      expect(capturedOptions).toBeDefined()
      expect(capturedOptions!.query).toBe('find-me')
      expect(capturedOptions!.replacement).toBe('replace-with')
      expect(capturedOptions!.caseSensitive).toBe(true)
      expect(capturedOptions!.regex).toBe(true)
      expect(capturedOptions!.paths).toEqual(['notes/a.md', 'notes/b.md'])
    })

    it('returns 400 for ReplaceValidationError from service', async () => {
      const replaceService = createMockReplaceService({
        replace: async () => { throw new ReplaceValidationError('Invalid replace request') },
      })
      const app = createTestApp({ replaceService })

      const res = await app.request('/api/v1/vaults/vault-1/replace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'old', replacement: 'new', caseSensitive: false, regex: false }),
      })
      expect(res.status).toBe(400)

      const body = await res.json() as { code: string }
      expect(body.code).toBe('INVALID_REPLACE')
    })

    it('returns 400 for SearchQueryValidationError from service', async () => {
      const replaceService = createMockReplaceService({
        replace: async () => { throw new SearchQueryValidationError('Query is invalid') },
      })
      const app = createTestApp({ replaceService })

      const res = await app.request('/api/v1/vaults/vault-1/replace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'x', replacement: 'y', caseSensitive: false, regex: false }),
      })
      expect(res.status).toBe(400)

      const body = await res.json() as { code: string }
      expect(body.code).toBe('INVALID_QUERY')
    })
  })
})
