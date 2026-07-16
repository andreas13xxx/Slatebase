import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest'
import { mkdtemp, writeFile, readFile, rm, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createServer } from 'node:http'
import type { Server, IncomingMessage, ServerResponse } from 'node:http'
import type { IConflictStore, ISyncLock, ICryptoService, SyncConnectionParams } from './types.js'
import type { ILogger } from '../logger/index.js'
import { ConflictResolver } from './conflict-resolver.js'
import type { ResolveParams, BatchResolveParams } from './conflict-resolver.js'
import { BatchLimitExceededError } from './errors.js'

// ─── Mock Factories ──────────────────────────────────────────────────────────

function createMockLogger(): ILogger {
  return {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
    child: () => createMockLogger(),
  } as unknown as ILogger
}

function createMockConflictStore(): IConflictStore & { removedPaths: string[] } {
  const removedPaths: string[] = []
  return {
    removedPaths,
    add: async () => {},
    getAll: async () => [],
    remove: async (_vaultId: string, documentPath: string) => {
      removedPaths.push(documentPath)
    },
    exists: async () => true,
  }
}

function createMockSyncLock(): ISyncLock {
  const locks = new Map<string, boolean>()
  return {
    acquire: (vaultId: string) => {
      if (locks.get(vaultId)) return false
      locks.set(vaultId, true)
      return true
    },
    release: (vaultId: string) => {
      locks.delete(vaultId)
    },
    isLocked: (vaultId: string) => locks.get(vaultId) === true,
  }
}

function createMockCryptoService(): ICryptoService {
  return {
    encrypt: (plaintext: string) => `enc:${plaintext}`,
    decrypt: (ciphertext: string) => ciphertext.replace('enc:', ''),
    encryptDocument: (content: Buffer) => Buffer.from(`encrypted:${content.toString()}`),
    decryptDocument: (encrypted: Buffer) => Buffer.from(encrypted.toString().replace('encrypted:', '')),
  }
}

// ─── Mock CouchDB Server ─────────────────────────────────────────────────────

interface MockCouchDBOptions {
  putHandler?: (req: IncomingMessage, res: ServerResponse) => void
  headHandler?: (req: IncomingMessage, res: ServerResponse) => void
}

function createMockCouchDB(options: MockCouchDBOptions = {}): Promise<{ server: Server; port: number; url: string }> {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      if (req.method === 'HEAD') {
        if (options.headHandler) {
          options.headHandler(req, res)
        } else {
          // Default: document exists with revision
          res.setHeader('ETag', '"1-abc123"')
          res.statusCode = 200
          res.end()
        }
        return
      }

      if (req.method === 'PUT') {
        if (options.putHandler) {
          options.putHandler(req, res)
        } else {
          // Default: success
          res.statusCode = 201
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ ok: true, id: 'doc', rev: '2-def456' }))
        }
        return
      }

      res.statusCode = 404
      res.end()
    })

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      if (addr && typeof addr === 'object') {
        resolve({
          server,
          port: addr.port,
          url: `http://127.0.0.1:${addr.port}`,
        })
      }
    })
  })
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('ConflictResolver', () => {
  let tmpDir: string
  let mockCouchDB: { server: Server; port: number; url: string }
  let conflictStore: IConflictStore & { removedPaths: string[] }
  let syncLock: ISyncLock
  let cryptoService: ICryptoService
  let logger: ILogger
  let resolver: ConflictResolver

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'conflict-resolver-'))
    conflictStore = createMockConflictStore()
    syncLock = createMockSyncLock()
    cryptoService = createMockCryptoService()
    logger = createMockLogger()
    resolver = new ConflictResolver({ conflictStore, syncLock, cryptoService, logger })
  })

  afterEach(async () => {
    if (mockCouchDB) {
      mockCouchDB.server.close()
    }
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {})
  })

  afterAll(async () => {
    // Cleanup any remaining temp dirs
  })

  function createConnection(url: string): SyncConnectionParams {
    return {
      endpoint: url,
      database: 'test-db',
      username: 'user',
      password: 'pass',
    }
  }

  describe('resolve() — skip', () => {
    it('removes conflict from store without file changes', async () => {
      const filePath = join(tmpDir, 'notes', 'test.md')
      await mkdir(join(tmpDir, 'notes'), { recursive: true })
      await writeFile(filePath, 'original content')

      const params: ResolveParams = {
        vaultId: 'vault-1',
        vaultPath: tmpDir,
        documentPath: 'notes/test.md',
        resolution: { type: 'skip' },
        connection: createConnection('http://localhost:1234'),
        e2eEnabled: false,
      }

      const result = await resolver.resolve(params)

      expect(result.success).toBe(true)
      expect(conflictStore.removedPaths).toContain('notes/test.md')
      // File unchanged
      const content = await readFile(filePath, 'utf8')
      expect(content).toBe('original content')
    })
  })

  describe('resolve() — use_local', () => {
    it('reads local file, pushes to CouchDB, and removes conflict', async () => {
      mockCouchDB = await createMockCouchDB()
      const filePath = join(tmpDir, 'test.md')
      await writeFile(filePath, 'my local content')

      const params: ResolveParams = {
        vaultId: 'vault-1',
        vaultPath: tmpDir,
        documentPath: 'test.md',
        resolution: { type: 'use_local' },
        connection: createConnection(mockCouchDB.url),
        e2eEnabled: false,
      }

      const result = await resolver.resolve(params)

      expect(result.success).toBe(true)
      expect(conflictStore.removedPaths).toContain('test.md')
      // File unchanged (use_local keeps local as-is)
      const content = await readFile(filePath, 'utf8')
      expect(content).toBe('my local content')
    })

    it('returns error if CouchDB push fails', async () => {
      mockCouchDB = await createMockCouchDB({
        putHandler: (_req, res) => {
          res.statusCode = 500
          res.end('Internal Server Error')
        },
      })
      const filePath = join(tmpDir, 'test.md')
      await writeFile(filePath, 'local content')

      const params: ResolveParams = {
        vaultId: 'vault-1',
        vaultPath: tmpDir,
        documentPath: 'test.md',
        resolution: { type: 'use_local' },
        connection: createConnection(mockCouchDB.url),
        e2eEnabled: false,
      }

      const result = await resolver.resolve(params)

      expect(result.success).toBe(false)
      expect(result.error).toContain('500')
      // Conflict NOT removed on failure
      expect(conflictStore.removedPaths).not.toContain('test.md')
    })
  })

  describe('resolve() — use_remote', () => {
    it('removes conflict from store (CouchDB already has correct version)', async () => {
      const filePath = join(tmpDir, 'remote-doc.md')
      await writeFile(filePath, 'old local content')

      const params: ResolveParams = {
        vaultId: 'vault-1',
        vaultPath: tmpDir,
        documentPath: 'remote-doc.md',
        resolution: { type: 'use_remote' },
        connection: createConnection('http://localhost:1234'),
        e2eEnabled: false,
      }

      const result = await resolver.resolve(params)

      expect(result.success).toBe(true)
      expect(conflictStore.removedPaths).toContain('remote-doc.md')
    })
  })

  describe('resolve() — manual_merge', () => {
    it('writes merged content locally, pushes to CouchDB, removes conflict', async () => {
      mockCouchDB = await createMockCouchDB()
      const filePath = join(tmpDir, 'merged.md')
      await writeFile(filePath, 'original content')

      const params: ResolveParams = {
        vaultId: 'vault-1',
        vaultPath: tmpDir,
        documentPath: 'merged.md',
        resolution: { type: 'manual_merge', content: 'merged from both versions' },
        connection: createConnection(mockCouchDB.url),
        e2eEnabled: false,
      }

      const result = await resolver.resolve(params)

      expect(result.success).toBe(true)
      expect(conflictStore.removedPaths).toContain('merged.md')
      // Local file updated with merged content
      const content = await readFile(filePath, 'utf8')
      expect(content).toBe('merged from both versions')
    })

    it('rolls back local file on CouchDB push failure', async () => {
      mockCouchDB = await createMockCouchDB({
        putHandler: (_req, res) => {
          res.statusCode = 409
          res.end(JSON.stringify({ error: 'conflict', reason: 'revision conflict' }))
        },
      })
      const filePath = join(tmpDir, 'rollback.md')
      await writeFile(filePath, 'original backup content')

      const params: ResolveParams = {
        vaultId: 'vault-1',
        vaultPath: tmpDir,
        documentPath: 'rollback.md',
        resolution: { type: 'manual_merge', content: 'this should be rolled back' },
        connection: createConnection(mockCouchDB.url),
        e2eEnabled: false,
      }

      const result = await resolver.resolve(params)

      expect(result.success).toBe(false)
      expect(result.error).toContain('409')
      // Local file restored to original
      const content = await readFile(filePath, 'utf8')
      expect(content).toBe('original backup content')
      // Conflict NOT removed
      expect(conflictStore.removedPaths).not.toContain('rollback.md')
    })

    it('handles E2E encryption when pushing', async () => {
      let receivedBody = ''
      mockCouchDB = await createMockCouchDB({
        putHandler: (req, res) => {
          let data = ''
          req.on('data', chunk => { data += chunk })
          req.on('end', () => {
            receivedBody = data
            res.statusCode = 201
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ ok: true }))
          })
        },
      })
      const filePath = join(tmpDir, 'secret.md')
      await writeFile(filePath, 'old secret')

      const params: ResolveParams = {
        vaultId: 'vault-1',
        vaultPath: tmpDir,
        documentPath: 'secret.md',
        resolution: { type: 'manual_merge', content: 'merged secret' },
        connection: createConnection(mockCouchDB.url),
        e2eEnabled: true,
        e2ePassphrase: 'my-passphrase-12345',
      }

      const result = await resolver.resolve(params)

      expect(result.success).toBe(true)
      // The data field should be base64-encoded encrypted content
      const parsed = JSON.parse(receivedBody)
      expect(parsed.data).toBeDefined()
      // Encrypted content as base64 — our mock prepends "encrypted:"
      const decoded = Buffer.from(parsed.data, 'base64').toString()
      expect(decoded).toBe('encrypted:merged secret')
    })
  })

  describe('resolve() — error handling', () => {
    it('returns error when local file does not exist (use_local)', async () => {
      mockCouchDB = await createMockCouchDB()

      const params: ResolveParams = {
        vaultId: 'vault-1',
        vaultPath: tmpDir,
        documentPath: 'nonexistent.md',
        resolution: { type: 'use_local' },
        connection: createConnection(mockCouchDB.url),
        e2eEnabled: false,
      }

      const result = await resolver.resolve(params)

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })

    it('returns error when local file does not exist (manual_merge)', async () => {
      mockCouchDB = await createMockCouchDB()

      const params: ResolveParams = {
        vaultId: 'vault-1',
        vaultPath: tmpDir,
        documentPath: 'nonexistent.md',
        resolution: { type: 'manual_merge', content: 'new content' },
        connection: createConnection(mockCouchDB.url),
        e2eEnabled: false,
      }

      const result = await resolver.resolve(params)

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })
  })

  describe('resolveBatch()', () => {
    it('throws BatchLimitExceededError when conflicts exceed 100', async () => {
      const conflicts = Array.from({ length: 101 }, (_, i) => ({
        documentPath: `file-${i}.md`,
        resolution: { type: 'skip' as const },
      }))

      const params: BatchResolveParams = {
        vaultId: 'vault-1',
        vaultPath: tmpDir,
        conflicts,
        connection: createConnection('http://localhost:1234'),
        e2eEnabled: false,
      }

      await expect(resolver.resolveBatch(params)).rejects.toThrow(BatchLimitExceededError)
    })

    it('processes exactly 100 items without error', async () => {
      const conflicts = Array.from({ length: 100 }, (_, i) => ({
        documentPath: `file-${i}.md`,
        resolution: { type: 'skip' as const },
      }))

      const params: BatchResolveParams = {
        vaultId: 'vault-1',
        vaultPath: tmpDir,
        conflicts,
        connection: createConnection('http://localhost:1234'),
        e2eEnabled: false,
      }

      const result = await resolver.resolveBatch(params)

      expect(result.total).toBe(100)
      expect(result.succeeded).toBe(100)
      expect(result.failed).toBe(0)
      expect(result.errors).toHaveLength(0)
    })

    it('processes conflicts sequentially with per-item error isolation', async () => {
      mockCouchDB = await createMockCouchDB()

      // Create some files, leave some missing to cause errors
      await writeFile(join(tmpDir, 'exists.md'), 'content A')
      // 'missing.md' does not exist → will fail for use_local

      const conflicts = [
        { documentPath: 'skip-me.md', resolution: { type: 'skip' as const } },
        { documentPath: 'missing.md', resolution: { type: 'use_local' as const } },
        { documentPath: 'exists.md', resolution: { type: 'use_local' as const } },
      ]

      const params: BatchResolveParams = {
        vaultId: 'vault-1',
        vaultPath: tmpDir,
        conflicts,
        connection: createConnection(mockCouchDB.url),
        e2eEnabled: false,
      }

      const result = await resolver.resolveBatch(params)

      expect(result.total).toBe(3)
      expect(result.succeeded).toBe(2) // skip-me.md + exists.md
      expect(result.failed).toBe(1) // missing.md
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0]!.documentPath).toBe('missing.md')
    })

    it('acquires and releases the sync lock', async () => {
      const params: BatchResolveParams = {
        vaultId: 'vault-lock-test',
        vaultPath: tmpDir,
        conflicts: [{ documentPath: 'a.md', resolution: { type: 'skip' } }],
        connection: createConnection('http://localhost:1234'),
        e2eEnabled: false,
      }

      await resolver.resolveBatch(params)

      // Lock should be released after batch completes
      expect(syncLock.isLocked('vault-lock-test')).toBe(false)
    })

    it('throws error when lock cannot be acquired', async () => {
      // Pre-acquire the lock
      syncLock.acquire('locked-vault')

      const params: BatchResolveParams = {
        vaultId: 'locked-vault',
        vaultPath: tmpDir,
        conflicts: [{ documentPath: 'a.md', resolution: { type: 'skip' } }],
        connection: createConnection('http://localhost:1234'),
        e2eEnabled: false,
      }

      await expect(resolver.resolveBatch(params)).rejects.toThrow('sync operation is already in progress')
    })

    it('releases lock even when processing throws', async () => {
      // This shouldn't happen normally, but ensures lock is released in finally
      const params: BatchResolveParams = {
        vaultId: 'finally-test',
        vaultPath: tmpDir,
        conflicts: [],
        connection: createConnection('http://localhost:1234'),
        e2eEnabled: false,
      }

      const result = await resolver.resolveBatch(params)

      expect(result.total).toBe(0)
      expect(result.succeeded).toBe(0)
      expect(syncLock.isLocked('finally-test')).toBe(false)
    })
  })
})
