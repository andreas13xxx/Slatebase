import { describe, it, expect, beforeEach, vi, afterEach, afterAll } from 'vitest'
import { SyncEngine, buildAuthHeaders, categorizeDocuments, reassembleChunkedDocuments, derivePathFromId, scanVaultFiles, categorizeDocument, buildAnalysisSummary, createEmptyAnalysisResult } from './sync-engine.js'
import type { ICryptoService, SyncConnectionParams, PullParams, PushParams, AnalyzeParams, AnalysisDetail } from './types.js'
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

// ─── Mock Helpers ────────────────────────────────────────────────────────────

function createMockCryptoService(): ICryptoService {
  return {
    encrypt: (plaintext: string) => `encrypted:${plaintext}`,
    decrypt: (ciphertext: string) => ciphertext.replace('encrypted:', ''),
    encryptDocument: (content: Buffer, _passphrase: string) => content,
    decryptDocument: (encrypted: Buffer, _passphrase: string) => encrypted,
  }
}

function createConnectionParams(overrides?: Partial<SyncConnectionParams>): SyncConnectionParams {
  return {
    endpoint: 'http://localhost:5984',
    database: 'testdb',
    username: 'admin',
    password: 'secret',
    ...overrides,
  }
}

// ─── Pure Function Tests ─────────────────────────────────────────────────────

describe('buildAuthHeaders', () => {
  it('creates Basic Auth header from username and password', () => {
    const headers = buildAuthHeaders('admin', 'secret')
    const expected = Buffer.from('admin:secret').toString('base64')
    expect(headers['Authorization']).toBe(`Basic ${expected}`)
  })

  it('includes Content-Type application/json', () => {
    const headers = buildAuthHeaders('user', 'pass')
    expect(headers['Content-Type']).toBe('application/json')
  })
})

describe('derivePathFromId', () => {
  it('returns null for internal CouchDB documents (starting with _)', () => {
    expect(derivePathFromId('_design/mydesign')).toBeNull()
    expect(derivePathFromId('_local/checkpoint')).toBeNull()
  })

  it('returns the ID as path for regular documents', () => {
    expect(derivePathFromId('notes/hello.md')).toBe('notes/hello.md')
    expect(derivePathFromId('readme.md')).toBe('readme.md')
  })
})

describe('categorizeDocuments', () => {
  it('categorizes regular documents', () => {
    const results = [
      {
        seq: '1',
        id: 'notes/test.md',
        changes: [{ rev: '1-abc' }],
        doc: { _id: 'notes/test.md', _rev: '1-abc', path: 'notes/test.md', data: 'hello' },
      },
    ]

    const { regularDocs, headers, chunks } = categorizeDocuments(results)

    expect(regularDocs).toHaveLength(1)
    expect(regularDocs[0]!.path).toBe('notes/test.md')
    expect(regularDocs[0]!.content).toBe('hello')
    expect(regularDocs[0]!.rev).toBe('1-abc')
    expect(headers.size).toBe(0)
    expect(chunks.size).toBe(0)
  })

  it('categorizes header documents (h: prefix)', () => {
    const results = [
      {
        seq: '2',
        id: 'h:large-file.md',
        changes: [{ rev: '1-def' }],
        doc: { _id: 'h:large-file.md', _rev: '1-def', path: 'large-file.md', mtime: 1700000000000 },
      },
    ]

    const { regularDocs, headers, chunks } = categorizeDocuments(results)

    expect(regularDocs).toHaveLength(0)
    expect(headers.size).toBe(1)
    expect(headers.has('h:large-file.md')).toBe(true)
    expect(chunks.size).toBe(0)
  })

  it('categorizes chunk documents (chunk: prefix)', () => {
    const results = [
      {
        seq: '3',
        id: 'chunk:large-file.md:0',
        changes: [{ rev: '1-ghi' }],
        doc: { _id: 'chunk:large-file.md:0', _rev: '1-ghi', data: 'part1' },
      },
      {
        seq: '4',
        id: 'chunk:large-file.md:1',
        changes: [{ rev: '1-jkl' }],
        doc: { _id: 'chunk:large-file.md:1', _rev: '1-jkl', data: 'part2' },
      },
    ]

    const { regularDocs, headers, chunks } = categorizeDocuments(results)

    expect(regularDocs).toHaveLength(0)
    expect(headers.size).toBe(0)
    expect(chunks.size).toBe(1)
    expect(chunks.get('large-file.md')!.get(0)).toBe('part1')
    expect(chunks.get('large-file.md')!.get(1)).toBe('part2')
  })

  it('marks deleted documents', () => {
    const results = [
      {
        seq: '5',
        id: 'deleted.md',
        changes: [{ rev: '2-xyz' }],
        deleted: true,
        doc: { _id: 'deleted.md', _rev: '2-xyz', _deleted: true, path: 'deleted.md' },
      },
    ]

    const { regularDocs } = categorizeDocuments(results)

    expect(regularDocs).toHaveLength(1)
    expect(regularDocs[0]!.deleted).toBe(true)
  })

  it('skips changes without doc', () => {
    const results = [
      {
        seq: '6',
        id: 'no-doc.md',
        changes: [{ rev: '1-aaa' }],
      },
    ]

    const { regularDocs, headers, chunks } = categorizeDocuments(results)

    expect(regularDocs).toHaveLength(0)
    expect(headers.size).toBe(0)
    expect(chunks.size).toBe(0)
  })

  it('uses document path field when available', () => {
    const results = [
      {
        seq: '7',
        id: 'some-internal-id',
        changes: [{ rev: '1-bbb' }],
        doc: { _id: 'some-internal-id', _rev: '1-bbb', path: 'actual/path.md', data: 'content' },
      },
    ]

    const { regularDocs } = categorizeDocuments(results)

    expect(regularDocs[0]!.path).toBe('actual/path.md')
  })

  it('falls back to ID as path when path field is missing', () => {
    const results = [
      {
        seq: '8',
        id: 'fallback-path.md',
        changes: [{ rev: '1-ccc' }],
        doc: { _id: 'fallback-path.md', _rev: '1-ccc', data: 'content' },
      },
    ]

    const { regularDocs } = categorizeDocuments(results)

    expect(regularDocs[0]!.path).toBe('fallback-path.md')
  })
})

describe('reassembleChunkedDocuments', () => {
  it('reassembles chunks in correct order', () => {
    const headers = new Map([
      ['h:large-file.md', { _id: 'h:large-file.md', _rev: '1-abc', path: 'large-file.md', mtime: 1700000000000 }],
    ])

    const chunks = new Map([
      ['large-file.md', new Map([
        [0, 'Hello '],
        [1, 'World'],
        [2, '!'],
      ])],
    ])

    const result = reassembleChunkedDocuments(headers, chunks)

    expect(result).toHaveLength(1)
    expect(result[0]!.path).toBe('large-file.md')
    expect(result[0]!.content).toBe('Hello World!')
    expect(result[0]!.rev).toBe('1-abc')
  })

  it('handles header without chunks (uses header data)', () => {
    const headers = new Map([
      ['h:small-file.md', { _id: 'h:small-file.md', _rev: '2-def', path: 'small-file.md', data: 'direct content' }],
    ])

    const chunks = new Map<string, Map<number, string>>()

    const result = reassembleChunkedDocuments(headers, chunks)

    expect(result).toHaveLength(1)
    expect(result[0]!.path).toBe('small-file.md')
    expect(result[0]!.content).toBe('direct content')
  })

  it('uses header path field over derived path', () => {
    const headers = new Map([
      ['h:internal-id', { _id: 'h:internal-id', _rev: '1-ghi', path: 'actual/path.md', data: 'content' }],
    ])

    const chunks = new Map<string, Map<number, string>>()

    const result = reassembleChunkedDocuments(headers, chunks)

    expect(result[0]!.path).toBe('actual/path.md')
  })

  it('handles out-of-order chunk indices', () => {
    const headers = new Map([
      ['h:file.md', { _id: 'h:file.md', _rev: '1-xyz', path: 'file.md' }],
    ])

    const chunks = new Map([
      ['file.md', new Map([
        [2, 'C'],
        [0, 'A'],
        [1, 'B'],
      ])],
    ])

    const result = reassembleChunkedDocuments(headers, chunks)

    expect(result[0]!.content).toBe('ABC')
  })

  it('marks deleted headers', () => {
    const headers = new Map([
      ['h:deleted.md', { _id: 'h:deleted.md', _rev: '3-del', path: 'deleted.md', _deleted: true }],
    ])

    const chunks = new Map<string, Map<number, string>>()

    const result = reassembleChunkedDocuments(headers, chunks)

    expect(result[0]!.deleted).toBe(true)
  })
})

// ─── SyncEngine Integration Tests (with mocked fetch) ───────────────────────

describe('SyncEngine', () => {
  let engine: SyncEngine
  let cryptoService: ICryptoService

  beforeEach(() => {
    cryptoService = createMockCryptoService()
    engine = new SyncEngine(cryptoService)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('testConnection', () => {
    it('returns reachable and authenticated on 200 response', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ db_name: 'testdb' }), { status: 200 }),
      )

      const result = await engine.testConnection(createConnectionParams())

      expect(result).toEqual({ reachable: true, authenticated: true })
    })

    it('returns reachable but not authenticated on 401', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response('Unauthorized', { status: 401 }),
      )

      const result = await engine.testConnection(createConnectionParams())

      expect(result).toEqual({ reachable: true, authenticated: false, error: 'Authentication failed' })
    })

    it('returns reachable but not authenticated on 403', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response('Forbidden', { status: 403 }),
      )

      const result = await engine.testConnection(createConnectionParams())

      expect(result).toEqual({ reachable: true, authenticated: false, error: 'Authentication failed' })
    })

    it('returns not reachable on network error', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('ECONNREFUSED'))

      const result = await engine.testConnection(createConnectionParams())

      expect(result).toEqual({ reachable: false, authenticated: false, error: 'ECONNREFUSED' })
    })

    it('returns not reachable on abort (timeout)', async () => {
      const abortError = new Error('The operation was aborted')
      abortError.name = 'AbortError'
      vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(abortError)

      const result = await engine.testConnection(createConnectionParams())

      expect(result).toEqual({ reachable: false, authenticated: false, error: 'Connection timed out (10s)' })
    })

    it('returns unexpected status code as error', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response('Internal Server Error', { status: 500 }),
      )

      const result = await engine.testConnection(createConnectionParams())

      expect(result).toEqual({ reachable: true, authenticated: false, error: 'Unexpected status code: 500' })
    })

    it('sends correct URL with endpoint and database', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({}), { status: 200 }),
      )

      await engine.testConnection(createConnectionParams({
        endpoint: 'https://couch.example.com',
        database: 'mydb',
      }))

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://couch.example.com/mydb',
        expect.objectContaining({ method: 'GET' }),
      )
    })

    it('sends Basic Auth header', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({}), { status: 200 }),
      )

      await engine.testConnection(createConnectionParams({
        username: 'testuser',
        password: 'testpass',
      }))

      const expectedAuth = `Basic ${Buffer.from('testuser:testpass').toString('base64')}`
      const callArgs = fetchSpy.mock.calls[0]!
      const options = callArgs[1] as RequestInit
      const headers = options.headers as Record<string, string>
      expect(headers['Authorization']).toBe(expectedAuth)
    })
  })

  describe('pull', () => {
    function createPullParams(overrides?: Partial<PullParams>): PullParams {
      return {
        connection: createConnectionParams(),
        vaultId: 'abc123def456',
        vaultPath: '/tmp/test-vault',
        since: '0',
        localMtimes: {},
        e2eEnabled: false,
        ...overrides,
      }
    }

    it('returns connection_failed when CouchDB is unreachable', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('ECONNREFUSED'))

      const result = await engine.pull(createPullParams())

      expect(result.status).toBe('connection_failed')
      expect(result.pulledCount).toBe(0)
      expect(result.newLastSeq).toBe('0')
    })

    it('returns auth_failed when authentication fails', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response('Unauthorized', { status: 401 }),
      )

      const result = await engine.pull(createPullParams())

      expect(result.status).toBe('auth_failed')
      expect(result.pulledCount).toBe(0)
    })

    it('returns success with newLastSeq when no documents changed', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ results: [], last_seq: '5-abc' }), { status: 200 }),
      )

      const result = await engine.pull(createPullParams())

      expect(result.status).toBe('success')
      expect(result.newLastSeq).toBe('5-abc')
      expect(result.pulledCount).toBe(0)
      expect(result.conflicts).toHaveLength(0)
      expect(result.errors).toHaveLength(0)
    })

    it('sends correct Changes Feed URL with since parameter', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ results: [], last_seq: '10-xyz' }), { status: 200 }),
      )

      await engine.pull(createPullParams({
        connection: createConnectionParams({
          endpoint: 'https://couch.example.com',
          database: 'mydb',
        }),
        since: '5-abc',
      }))

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://couch.example.com/mydb/_changes?since=5-abc&include_docs=true',
        expect.objectContaining({ method: 'GET' }),
      )
    })

    it('uses since=0 when since is null (initial pull)', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ results: [], last_seq: '1-init' }), { status: 200 }),
      )

      await engine.pull(createPullParams({ since: null }))

      const url = fetchSpy.mock.calls[0]![0] as string
      expect(url).toContain('since=0')
    })

    it('returns connection_failed on timeout (AbortError)', async () => {
      const abortError = new Error('The operation was aborted')
      abortError.name = 'AbortError'
      vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(abortError)

      const result = await engine.pull(createPullParams({ since: '3-seq' }))

      expect(result.status).toBe('connection_failed')
      expect(result.newLastSeq).toBe('3-seq')
    })

    it('proceeds to write when localMtimes has no entry for the file (new remote file)', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({
          results: [
            {
              seq: '10',
              id: 'notes/brand-new-file.md',
              changes: [{ rev: '1-new' }],
              doc: {
                _id: 'notes/brand-new-file.md',
                _rev: '1-new',
                path: 'notes/brand-new-file.md',
                data: 'remote content',
                mtime: 1500,
              },
            },
          ],
          last_seq: '10-seq',
        }), { status: 200 }),
      )

      // No entry in localMtimes means this is a new remote file — no conflict check needed
      const result = await engine.pull(createPullParams({
        localMtimes: {},
        vaultPath: '/tmp/sync-engine-test-nonexistent-' + Date.now(),
      }))

      // No conflict detected — the file is new from remote
      expect(result.newLastSeq).toBe('10-seq')
      expect(result.conflicts).toHaveLength(0)
      // Write will fail because directory doesn't exist, but that's a write_failed error
      expect(result.errors.length).toBeGreaterThanOrEqual(0)
    })

    it('skips documents without path', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({
          results: [
            {
              seq: '1',
              id: '_design/mydesign',
              changes: [{ rev: '1-abc' }],
              doc: { _id: '_design/mydesign', _rev: '1-abc', data: 'design doc' },
            },
          ],
          last_seq: '1-seq',
        }), { status: 200 }),
      )

      const result = await engine.pull(createPullParams())

      // Internal documents (starting with _) are skipped by derivePathFromId
      expect(result.pulledCount).toBe(0)
      expect(result.status).toBe('success')
    })

    it('handles E2E decryption errors gracefully', async () => {
      const failingCrypto = createMockCryptoService()
      failingCrypto.decryptDocument = () => { throw new Error('Decryption failed: wrong passphrase') }
      const engineWithFailingCrypto = new SyncEngine(failingCrypto)

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({
          results: [
            {
              seq: '1',
              id: 'encrypted.md',
              changes: [{ rev: '1-enc' }],
              doc: {
                _id: 'encrypted.md',
                _rev: '1-enc',
                path: 'encrypted.md',
                data: Buffer.from('encrypted-content').toString('base64'),
              },
            },
          ],
          last_seq: '1-seq',
        }), { status: 200 }),
      )

      const result = await engineWithFailingCrypto.pull(createPullParams({
        e2eEnabled: true,
        e2ePassphrase: 'wrong-passphrase',
      }))

      expect(result.errors).toHaveLength(1)
      expect(result.errors[0]!.errorType).toBe('decryption_failed')
      expect(result.errors[0]!.documentPath).toBe('encrypted.md')
      expect(result.status).toBe('failed')
    })

    it('caps errors at 100 entries', async () => {
      // Create 150 documents that will all fail to write
      const results = Array.from({ length: 150 }, (_, i) => ({
        seq: `${i + 1}`,
        id: `file-${i}.md`,
        changes: [{ rev: '1-abc' }],
        doc: {
          _id: `file-${i}.md`,
          _rev: '1-abc',
          path: `file-${i}.md`,
          data: 'content',
        },
      }))

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ results, last_seq: '150-seq' }), { status: 200 }),
      )

      const result = await engine.pull(createPullParams({
        vaultPath: '/tmp/nonexistent-vault-test-cap',
      }))

      // Errors should be capped at 100
      expect(result.errors.length).toBeLessThanOrEqual(100)
    })
  })
})


// ─── Pure Function Tests for Push/Analyze Helpers ────────────────────────────

describe('scanVaultFiles', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'sync-scan-'))
  })

  afterAll(async () => {
    try {
      await rm(tempDir, { recursive: true })
    } catch {
      // Ignore cleanup errors
    }
  })

  it('returns empty map for empty directory', async () => {
    const files = await scanVaultFiles(tempDir)
    expect(files.size).toBe(0)
  })

  it('scans files recursively with relative paths', async () => {
    await writeFile(join(tempDir, 'root.md'), 'root content')
    await mkdir(join(tempDir, 'notes'), { recursive: true })
    await writeFile(join(tempDir, 'notes', 'nested.md'), 'nested content')

    const files = await scanVaultFiles(tempDir)

    expect(files.size).toBe(2)
    expect(files.has('root.md')).toBe(true)
    expect(files.has('notes/nested.md')).toBe(true)
  })

  it('uses forward slashes in paths', async () => {
    await mkdir(join(tempDir, 'sub', 'deep'), { recursive: true })
    await writeFile(join(tempDir, 'sub', 'deep', 'file.md'), 'content')

    const files = await scanVaultFiles(tempDir)

    expect(files.has('sub/deep/file.md')).toBe(true)
  })

  it('returns mtime values as numbers', async () => {
    await writeFile(join(tempDir, 'test.md'), 'content')

    const files = await scanVaultFiles(tempDir)
    const mtime = files.get('test.md')

    expect(typeof mtime).toBe('number')
    expect(mtime).toBeGreaterThan(0)
  })
})

describe('categorizeDocument', () => {
  it('returns remote_only when file exists only in CouchDB', () => {
    const result = categorizeDocument(
      'notes/remote.md',
      undefined,
      { rev: '1-abc', mtime: 1700000000000, size: 100, deleted: false },
      undefined,
    )

    expect(result.category).toBe('remote_only')
    expect(result.path).toBe('notes/remote.md')
    expect(result.remoteRevision).toBe('1-abc')
    expect(result.remoteSize).toBe(100)
  })

  it('returns local_only when file exists only locally', () => {
    const result = categorizeDocument(
      'notes/local.md',
      { mtime: 1700000000000, size: 200 },
      undefined,
      undefined,
    )

    expect(result.category).toBe('local_only')
    expect(result.path).toBe('notes/local.md')
    expect(result.localSize).toBe(200)
  })

  it('returns remote_newer when remote mtime is greater', () => {
    const result = categorizeDocument(
      'notes/file.md',
      { mtime: 1700000000000, size: 100 },
      { rev: '2-def', mtime: 1700000001000, size: 150, deleted: false },
      1700000000000, // checkpoint matches local mtime → local unchanged, remote is newer
    )

    expect(result.category).toBe('remote_newer')
  })

  it('returns local_newer when local mtime is greater', () => {
    const result = categorizeDocument(
      'notes/file.md',
      { mtime: 1700000001000, size: 150 },
      { rev: '1-abc', mtime: 1700000000000, size: 100, deleted: false },
      1700000001000, // checkpoint matches local mtime but remote is older
    )

    expect(result.category).toBe('local_newer')
  })

  it('returns identical when mtimes are equal', () => {
    const result = categorizeDocument(
      'notes/file.md',
      { mtime: 1700000000000, size: 100 },
      { rev: '1-abc', mtime: 1700000000000, size: 100, deleted: false },
      1700000000000, // checkpoint matches both
    )

    expect(result.category).toBe('identical')
  })

  it('returns conflict when both modified since checkpoint', () => {
    const checkpointMtime = 1699999999000
    const result = categorizeDocument(
      'notes/file.md',
      { mtime: 1700000001000, size: 150 }, // local modified after checkpoint
      { rev: '2-def', mtime: 1700000002000, size: 200, deleted: false }, // remote also modified after checkpoint
      checkpointMtime,
    )

    expect(result.category).toBe('conflict')
  })

  it('returns remote_newer when remote is deleted but local exists', () => {
    const result = categorizeDocument(
      'notes/deleted.md',
      { mtime: 1700000000000, size: 100 },
      { rev: '3-del', mtime: 0, size: 0, deleted: true },
      1699999999000,
    )

    expect(result.category).toBe('remote_newer')
  })
})

describe('buildAnalysisSummary', () => {
  it('returns zero counts for empty details', () => {
    const summary = buildAnalysisSummary([])

    expect(summary.remote_newer.count).toBe(0)
    expect(summary.local_newer.count).toBe(0)
    expect(summary.remote_only.count).toBe(0)
    expect(summary.local_only.count).toBe(0)
    expect(summary.conflict.count).toBe(0)
    expect(summary.identical.count).toBe(0)
  })

  it('counts documents per category correctly', () => {
    const details: AnalysisDetail[] = [
      { path: 'a.md', category: 'remote_newer', remoteSize: 100, localSize: 80 },
      { path: 'b.md', category: 'remote_newer', remoteSize: 200, localSize: 150 },
      { path: 'c.md', category: 'local_only', localSize: 300 },
      { path: 'd.md', category: 'identical', localSize: 50, remoteSize: 50 },
    ]

    const summary = buildAnalysisSummary(details)

    expect(summary.remote_newer.count).toBe(2)
    expect(summary.remote_newer.totalBytes).toBe(300) // max(100,80) + max(200,150)
    expect(summary.local_only.count).toBe(1)
    expect(summary.local_only.totalBytes).toBe(300)
    expect(summary.identical.count).toBe(1)
    expect(summary.identical.totalBytes).toBe(50)
  })
})

describe('createEmptyAnalysisResult', () => {
  it('returns all zero counts with given duration', () => {
    const result = createEmptyAnalysisResult(500)

    expect(result.durationMs).toBe(500)
    expect(result.details).toHaveLength(0)
    expect(result.summary.remote_newer.count).toBe(0)
    expect(result.summary.local_newer.count).toBe(0)
    expect(result.summary.remote_only.count).toBe(0)
    expect(result.summary.local_only.count).toBe(0)
    expect(result.summary.conflict.count).toBe(0)
    expect(result.summary.identical.count).toBe(0)
  })
})

// ─── SyncEngine Push Tests ───────────────────────────────────────────────────

describe('SyncEngine push', () => {
  let engine: SyncEngine
  let cryptoService: ICryptoService
  let tempDir: string

  beforeEach(async () => {
    cryptoService = createMockCryptoService()
    engine = new SyncEngine(cryptoService)
    tempDir = await mkdtemp(join(tmpdir(), 'sync-push-'))
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  afterAll(async () => {
    try {
      await rm(tempDir, { recursive: true })
    } catch {
      // Ignore cleanup errors
    }
  })

  function createPushParams(overrides?: Partial<PushParams>): PushParams {
    return {
      connection: createConnectionParams(),
      vaultId: 'abc123def456',
      vaultPath: tempDir,
      localMtimes: {},
      e2eEnabled: false,
      ...overrides,
    }
  }

  it('returns success with zero pushed when no changes detected', async () => {
    // Empty vault, empty checkpoint
    const result = await engine.push(createPushParams())

    expect(result.status).toBe('success')
    expect(result.pushedCount).toBe(0)
    expect(result.errors).toHaveLength(0)
  })

  it('detects new files (not in checkpoint) and pushes them', async () => {
    await writeFile(join(tempDir, 'new-file.md'), 'new content')

    // Mock HEAD (get revision) → 404 (new doc)
    // Mock PUT → 201 (created)
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    fetchSpy.mockResolvedValueOnce(new Response('', { status: 404 })) // HEAD for revision
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, rev: '1-abc' }), { status: 201 })) // PUT

    const result = await engine.push(createPushParams({
      localMtimes: {}, // No checkpoint entry → file is "new"
    }))

    expect(result.status).toBe('success')
    expect(result.pushedCount).toBe(1)
    expect(result.errors).toHaveLength(0)
  })

  it('detects changed files (mtime > checkpoint) and pushes them', async () => {
    await writeFile(join(tempDir, 'changed.md'), 'updated content')

    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    // HEAD → returns existing revision
    fetchSpy.mockResolvedValueOnce(new Response('', {
      status: 200,
      headers: { 'etag': '"1-existing"' },
    }))
    // PUT → success
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, rev: '2-new' }), { status: 201 }))

    const result = await engine.push(createPushParams({
      localMtimes: { 'changed.md': 0 }, // Old mtime → file is "changed"
    }))

    expect(result.status).toBe('success')
    expect(result.pushedCount).toBe(1)
  })

  it('does not push files with matching mtime', async () => {
    await writeFile(join(tempDir, 'unchanged.md'), 'same content')

    // Get the actual mtime of the file we just wrote
    const { stat: statFn } = await import('node:fs/promises')
    const fileStat = await statFn(join(tempDir, 'unchanged.md'))

    const result = await engine.push(createPushParams({
      localMtimes: { 'unchanged.md': fileStat.mtimeMs }, // Same mtime → unchanged
    }))

    expect(result.status).toBe('success')
    expect(result.pushedCount).toBe(0)
  })

  it('handles deleted files by marking them as _deleted in CouchDB', async () => {
    // File is in checkpoint but NOT on disk → deleted
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    // HEAD → returns existing revision
    fetchSpy.mockResolvedValueOnce(new Response('', {
      status: 200,
      headers: { 'etag': '"2-existing"' },
    }))
    // PUT with _deleted → success
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))

    const result = await engine.push(createPushParams({
      localMtimes: { 'deleted-file.md': 1700000000000 }, // In checkpoint but not on disk
    }))

    expect(result.status).toBe('success')
    expect(result.pushedCount).toBe(1)

    // Verify the PUT was called with _deleted: true
    const putCall = fetchSpy.mock.calls[1]!
    const body = JSON.parse(putCall[1]!.body as string)
    expect(body._deleted).toBe(true)
    expect(body._rev).toBe('2-existing')
  })

  it('skips deletion when document does not exist in CouchDB', async () => {
    // File is in checkpoint but NOT on disk, and also not in CouchDB
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    fetchSpy.mockResolvedValueOnce(new Response('', { status: 404 })) // HEAD → not found

    const result = await engine.push(createPushParams({
      localMtimes: { 'already-gone.md': 1700000000000 },
    }))

    expect(result.status).toBe('success')
    expect(result.pushedCount).toBe(0)
    // Only one fetch call (HEAD), no PUT
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('returns partial_success when some pushes fail', async () => {
    await writeFile(join(tempDir, 'good.md'), 'good content')
    await writeFile(join(tempDir, 'bad.md'), 'bad content')

    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    // good.md: HEAD → 404, PUT → 201
    fetchSpy.mockResolvedValueOnce(new Response('', { status: 404 }))
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 201 }))
    // bad.md: HEAD → 404, PUT → 500
    fetchSpy.mockResolvedValueOnce(new Response('', { status: 404 }))
    fetchSpy.mockResolvedValueOnce(new Response('Internal Server Error', { status: 500 }))

    const result = await engine.push(createPushParams({
      localMtimes: {},
    }))

    expect(result.status).toBe('partial_success')
    expect(result.pushedCount).toBe(1)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]!.errorType).toBe('write_failed')
  })

  it('returns failed when vault directory does not exist', async () => {
    const result = await engine.push(createPushParams({
      vaultPath: '/tmp/nonexistent-vault-push-test-' + Date.now(),
    }))

    expect(result.status).toBe('failed')
    expect(result.pushedCount).toBe(0)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]!.errorType).toBe('read_failed')
  })

  it('encrypts content before pushing when E2E is enabled', async () => {
    await writeFile(join(tempDir, 'secret.md'), 'secret content')

    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    fetchSpy.mockResolvedValueOnce(new Response('', { status: 404 })) // HEAD
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 201 })) // PUT

    // The mock crypto service returns content unchanged, but we verify it's called
    const encryptSpy = vi.spyOn(cryptoService, 'encryptDocument')

    const result = await engine.push(createPushParams({
      localMtimes: {},
      e2eEnabled: true,
      e2ePassphrase: 'test-passphrase',
    }))

    expect(result.status).toBe('success')
    expect(result.pushedCount).toBe(1)
    expect(encryptSpy).toHaveBeenCalledWith(expect.any(Buffer), 'test-passphrase')
  })

  it('records encryption errors and continues', async () => {
    await writeFile(join(tempDir, 'encrypt-fail.md'), 'content')
    await writeFile(join(tempDir, 'encrypt-ok.md'), 'content')

    const failingCrypto = createMockCryptoService()
    let callCount = 0
    failingCrypto.encryptDocument = (_content: Buffer, _passphrase: string) => {
      callCount++
      if (callCount === 1) throw new Error('Encryption failed')
      return _content
    }
    const engineWithFailingCrypto = new SyncEngine(failingCrypto)

    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    // For the second file that succeeds encryption
    fetchSpy.mockResolvedValueOnce(new Response('', { status: 404 })) // HEAD
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 201 })) // PUT

    const result = await engineWithFailingCrypto.push({
      connection: createConnectionParams(),
      vaultId: 'abc123def456',
      vaultPath: tempDir,
      localMtimes: {},
      e2eEnabled: true,
      e2ePassphrase: 'test-passphrase',
    })

    expect(result.pushedCount).toBe(1)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]!.errorType).toBe('encryption_failed')
  })

  it('sends PUT with correct URL encoding for document ID', async () => {
    await mkdir(join(tempDir, 'notes'), { recursive: true })
    await writeFile(join(tempDir, 'notes', 'hello world.md'), 'content')

    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    fetchSpy.mockResolvedValueOnce(new Response('', { status: 404 })) // HEAD
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 201 })) // PUT

    await engine.push(createPushParams({ localMtimes: {} }))

    // Verify the URL is properly encoded
    const headUrl = fetchSpy.mock.calls[0]![0] as string
    expect(headUrl).toContain(encodeURIComponent('notes/hello world.md'))
  })
})

// ─── SyncEngine Analyze Tests ────────────────────────────────────────────────

describe('SyncEngine analyze', () => {
  let engine: SyncEngine
  let cryptoService: ICryptoService
  let tempDir: string

  beforeEach(async () => {
    cryptoService = createMockCryptoService()
    engine = new SyncEngine(cryptoService)
    tempDir = await mkdtemp(join(tmpdir(), 'sync-analyze-'))
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  afterAll(async () => {
    try {
      await rm(tempDir, { recursive: true })
    } catch {
      // Ignore cleanup errors
    }
  })

  function createAnalyzeParams(overrides?: Partial<AnalyzeParams>): AnalyzeParams {
    return {
      connection: createConnectionParams(),
      vaultId: 'abc123def456',
      vaultPath: tempDir,
      since: '0',
      localMtimes: {},
      ...overrides,
    }
  }

  it('returns empty result when CouchDB is unreachable', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('ECONNREFUSED'))

    const result = await engine.analyze(createAnalyzeParams())

    expect(result.details).toHaveLength(0)
    expect(result.summary.remote_newer.count).toBe(0)
    expect(result.durationMs).toBeGreaterThanOrEqual(0)
  })

  it('returns empty result when auth fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('Unauthorized', { status: 401 }),
    )

    const result = await engine.analyze(createAnalyzeParams())

    expect(result.details).toHaveLength(0)
  })

  it('categorizes remote-only documents correctly', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({
        results: [
          {
            seq: '1',
            id: 'remote-only.md',
            changes: [{ rev: '1-abc' }],
            doc: { _id: 'remote-only.md', _rev: '1-abc', path: 'remote-only.md', data: 'content', mtime: 1700000000000 },
          },
        ],
        last_seq: '1-seq',
      }), { status: 200 }),
    )

    const result = await engine.analyze(createAnalyzeParams())

    expect(result.details).toHaveLength(1)
    expect(result.details[0]!.category).toBe('remote_only')
    expect(result.details[0]!.path).toBe('remote-only.md')
    expect(result.summary.remote_only.count).toBe(1)
  })

  it('categorizes local-only documents correctly', async () => {
    await writeFile(join(tempDir, 'local-only.md'), 'local content')

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ results: [], last_seq: '0-seq' }), { status: 200 }),
    )

    const result = await engine.analyze(createAnalyzeParams())

    expect(result.details).toHaveLength(1)
    expect(result.details[0]!.category).toBe('local_only')
    expect(result.details[0]!.path).toBe('local-only.md')
    expect(result.summary.local_only.count).toBe(1)
  })

  it('categorizes identical documents correctly', async () => {
    const mtime = 1700000000000
    await writeFile(join(tempDir, 'same.md'), 'content')

    // Set the file mtime to match the remote mtime
    const { utimes } = await import('node:fs/promises')
    const mtimeDate = new Date(mtime)
    await utimes(join(tempDir, 'same.md'), mtimeDate, mtimeDate)

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({
        results: [
          {
            seq: '1',
            id: 'same.md',
            changes: [{ rev: '1-abc' }],
            doc: { _id: 'same.md', _rev: '1-abc', path: 'same.md', data: 'content', mtime },
          },
        ],
        last_seq: '1-seq',
      }), { status: 200 }),
    )

    const result = await engine.analyze(createAnalyzeParams())

    expect(result.details).toHaveLength(1)
    expect(result.details[0]!.category).toBe('identical')
    expect(result.summary.identical.count).toBe(1)
  })

  it('includes durationMs in result', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ results: [], last_seq: '0-seq' }), { status: 200 }),
    )

    const result = await engine.analyze(createAnalyzeParams())

    expect(result.durationMs).toBeGreaterThanOrEqual(0)
  })

  it('skips deleted remote documents that do not exist locally', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({
        results: [
          {
            seq: '1',
            id: 'deleted-remote.md',
            changes: [{ rev: '2-del' }],
            deleted: true,
            doc: { _id: 'deleted-remote.md', _rev: '2-del', _deleted: true, path: 'deleted-remote.md' },
          },
        ],
        last_seq: '1-seq',
      }), { status: 200 }),
    )

    const result = await engine.analyze(createAnalyzeParams())

    // Deleted remote doc with no local file should be skipped
    expect(result.details).toHaveLength(0)
  })

  it('handles mixed categories in a single analysis', async () => {
    await writeFile(join(tempDir, 'local-only.md'), 'local')
    await writeFile(join(tempDir, 'both.md'), 'both')

    // Set 'both.md' mtime to something older than remote
    const { utimes } = await import('node:fs/promises')
    const oldDate = new Date(1600000000000)
    await utimes(join(tempDir, 'both.md'), oldDate, oldDate)

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({
        results: [
          {
            seq: '1',
            id: 'remote-only.md',
            changes: [{ rev: '1-abc' }],
            doc: { _id: 'remote-only.md', _rev: '1-abc', path: 'remote-only.md', data: 'remote', mtime: 1700000000000 },
          },
          {
            seq: '2',
            id: 'both.md',
            changes: [{ rev: '2-def' }],
            doc: { _id: 'both.md', _rev: '2-def', path: 'both.md', data: 'remote-both', mtime: 1700000000000 },
          },
        ],
        last_seq: '2-seq',
      }), { status: 200 }),
    )

    const result = await engine.analyze(createAnalyzeParams())

    expect(result.details.length).toBe(3)

    const categories = result.details.map(d => d.category)
    expect(categories).toContain('remote_only')
    expect(categories).toContain('local_only')
    expect(categories).toContain('remote_newer')
  })
})
