// Unit tests for uploadRoutes — HTTP integration tests

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Hono } from 'hono'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import type { SessionContext } from '../auth/index.js'
import type { ILogger } from '../logger/index.js'
import type { IVaultAccessControl } from '../business/index.js'
import { VaultAccessDeniedError } from '../business/index.js'
import type { IVaultRegistry, VaultRegistryEntry } from '../vault/registry.js'
import type { IEventBus, PublishOptions } from '../realtime/types.js'
import type { UploadConfig } from '../config/index.js'
import { createUploadRoutes } from './uploadRoutes.js'

// ─── Mock Factories ──────────────────────────────────────────────────────────

function createMockLogger(): ILogger {
  return {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
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

function createMockVaultRegistry(entry: VaultRegistryEntry | null = null): IVaultRegistry {
  return {
    load: async () => entry ? [entry] : [],
    save: async () => {},
    addEntry: async () => {},
    removeEntry: async () => {},
    findById: () => entry,
    findByName: () => entry,
  }
}

function createMockEventBus(): IEventBus & { publishCalls: PublishOptions[] } {
  const publishCalls: PublishOptions[] = []
  return {
    publishCalls,
    publish: (options: PublishOptions) => { publishCalls.push(options) },
    nextEventId: () => '1',
    getEventsSince: () => [],
  }
}

const defaultUploadConfig: UploadConfig = {
  maxFileSizeBytes: 104857600, // 100 MB
  maxFilesPerDrop: 50,
  maxImagePasteSize: 10485760, // 10 MB
}

const defaultSession: SessionContext = {
  userId: 'user-1',
  username: 'testuser',
  role: 'user',
  sessionId: 'session-1',
}

// ─── Test App Factory ────────────────────────────────────────────────────────

function createTestApp(options: {
  vaultAccessControl?: IVaultAccessControl
  vaultRegistry?: IVaultRegistry
  uploadConfig?: UploadConfig
  eventBus?: IEventBus
  session?: SessionContext | null
  storagePath?: string
} = {}) {
  const logger = createMockLogger()
  const storagePath = options.storagePath ?? '/tmp/test-vault'
  const vaultEntry: VaultRegistryEntry = {
    id: 'vault-1',
    name: 'Test Vault',
    storagePath,
    createdAt: '2024-01-01T00:00:00.000Z',
    ownerId: 'user-1',
  }
  const vaultAccessControl = options.vaultAccessControl ?? createMockVaultAccessControl()
  const vaultRegistry = options.vaultRegistry ?? createMockVaultRegistry(vaultEntry)
  const uploadConfig = options.uploadConfig ?? defaultUploadConfig
  const eventBus = options.eventBus ?? createMockEventBus()

  const app = new Hono()

  // Simulate auth middleware setting session context
  if (options.session !== null) {
    const session = options.session ?? defaultSession
    app.use('*', async (c, next) => {
      c.set('session' as never, session as never)
      return next()
    })
  }

  const routes = createUploadRoutes({ accessControl: vaultAccessControl, vaultRegistry, uploadConfig, eventBus, logger })
  app.route('/api/v1', routes)
  return { app, eventBus }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Upload Routes', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'slatebase-upload-test-'))
  })

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true })
  })

  describe('POST /vaults/:vaultId/upload', () => {
    it('returns 401 if not authenticated', async () => {
      const { app } = createTestApp({ session: null })

      const formData = new FormData()
      formData.append('file', new File(['hello'], 'test.txt'))

      const res = await app.request('/api/v1/vaults/vault-1/upload', {
        method: 'POST',
        body: formData,
      })
      expect(res.status).toBe(401)

      const body = await res.json() as { code: string }
      expect(body.code).toBe('UNAUTHORIZED')
    })

    it('returns 404 if vault does not exist', async () => {
      const vaultRegistry = createMockVaultRegistry(null)
      const { app } = createTestApp({ vaultRegistry })

      const formData = new FormData()
      formData.append('file', new File(['hello'], 'test.txt'))

      const res = await app.request('/api/v1/vaults/nonexistent/upload', {
        method: 'POST',
        body: formData,
      })
      expect(res.status).toBe(404)

      const body = await res.json() as { code: string }
      expect(body.code).toBe('VAULT_NOT_FOUND')
    })

    it('returns 403 if user has no write access', async () => {
      const vaultAccessControl = createMockVaultAccessControl({
        checkWriteAccess: async (vaultId, userId) => {
          throw new VaultAccessDeniedError(vaultId, userId, 'write')
        },
      })
      const { app } = createTestApp({ vaultAccessControl })

      const formData = new FormData()
      formData.append('file', new File(['hello'], 'test.txt'))

      const res = await app.request('/api/v1/vaults/vault-1/upload', {
        method: 'POST',
        body: formData,
      })
      expect(res.status).toBe(403)

      const body = await res.json() as { code: string }
      expect(body.code).toBe('FORBIDDEN')
    })

    it('returns 400 if no files provided', async () => {
      const { app } = createTestApp({ storagePath: tempDir })

      const formData = new FormData()
      formData.append('targetDir', 'notes')

      const res = await app.request('/api/v1/vaults/vault-1/upload', {
        method: 'POST',
        body: formData,
      })
      expect(res.status).toBe(400)

      const body = await res.json() as { code: string }
      expect(body.code).toBe('VALIDATION_ERROR')
    })

    it('returns 413 if file count exceeds limit', async () => {
      const uploadConfig: UploadConfig = { ...defaultUploadConfig, maxFilesPerDrop: 2 }
      const { app } = createTestApp({ storagePath: tempDir, uploadConfig })

      const formData = new FormData()
      formData.append('file1', new File(['a'], '1.txt'))
      formData.append('file2', new File(['b'], '2.txt'))
      formData.append('file3', new File(['c'], '3.txt'))

      const res = await app.request('/api/v1/vaults/vault-1/upload', {
        method: 'POST',
        body: formData,
      })
      expect(res.status).toBe(413)

      const body = await res.json() as { code: string }
      expect(body.code).toBe('UPLOAD_LIMIT_EXCEEDED')
    })

    it('returns 413 if file size exceeds max', async () => {
      const uploadConfig: UploadConfig = { ...defaultUploadConfig, maxFileSizeBytes: 5 }
      const { app } = createTestApp({ storagePath: tempDir, uploadConfig })

      const formData = new FormData()
      formData.append('file', new File(['this is too large'], 'big.txt'))

      const res = await app.request('/api/v1/vaults/vault-1/upload', {
        method: 'POST',
        body: formData,
      })
      expect(res.status).toBe(413)

      const body = await res.json() as { code: string }
      expect(body.code).toBe('UPLOAD_TOO_LARGE')
    })

    it('returns 413 if paste file exceeds image paste limit', async () => {
      const uploadConfig: UploadConfig = { ...defaultUploadConfig, maxImagePasteSize: 5 }
      const { app } = createTestApp({ storagePath: tempDir, uploadConfig })

      const formData = new FormData()
      formData.append('file', new File(['this is too large'], 'image.png'))

      const res = await app.request('/api/v1/vaults/vault-1/upload?paste=true', {
        method: 'POST',
        body: formData,
      })
      expect(res.status).toBe(413)

      const body = await res.json() as { code: string }
      expect(body.code).toBe('UPLOAD_TOO_LARGE')
    })

    it('uploads a single file successfully', async () => {
      const { app, eventBus } = createTestApp({ storagePath: tempDir })
      const mockBus = eventBus as IEventBus & { publishCalls: PublishOptions[] }

      const formData = new FormData()
      formData.append('file', new File(['hello world'], 'test.txt'))

      const res = await app.request('/api/v1/vaults/vault-1/upload', {
        method: 'POST',
        body: formData,
      })
      expect(res.status).toBe(201)

      const body = await res.json() as { uploaded: Array<{ fileName: string; path: string }> }
      expect(body.uploaded).toHaveLength(1)
      expect(body.uploaded[0]!.fileName).toBe('test.txt')
      expect(body.uploaded[0]!.path).toBe('test.txt')

      // Verify file was actually written
      const content = await fs.readFile(path.join(tempDir, 'test.txt'), 'utf-8')
      expect(content).toBe('hello world')

      // Verify vault:change event was published
      expect(mockBus.publishCalls).toHaveLength(1)
      expect(mockBus.publishCalls[0]!.type).toBe('vault:change')
    })

    it('uploads to a target directory', async () => {
      // Create the target directory
      await fs.mkdir(path.join(tempDir, 'notes'), { recursive: true })

      const { app } = createTestApp({ storagePath: tempDir })

      const formData = new FormData()
      formData.append('file', new File(['content'], 'note.md'))
      formData.append('targetDir', 'notes')

      const res = await app.request('/api/v1/vaults/vault-1/upload', {
        method: 'POST',
        body: formData,
      })
      expect(res.status).toBe(201)

      const body = await res.json() as { uploaded: Array<{ fileName: string; path: string }> }
      expect(body.uploaded[0]!.path).toBe('notes/note.md')

      // Verify file was written in the correct directory
      const content = await fs.readFile(path.join(tempDir, 'notes', 'note.md'), 'utf-8')
      expect(content).toBe('content')
    })

    it('applies unique filename logic for conflicts', async () => {
      // Create a conflicting file
      await fs.writeFile(path.join(tempDir, 'test.txt'), 'existing')

      const { app } = createTestApp({ storagePath: tempDir })

      const formData = new FormData()
      formData.append('file', new File(['new content'], 'test.txt'))

      const res = await app.request('/api/v1/vaults/vault-1/upload', {
        method: 'POST',
        body: formData,
      })
      expect(res.status).toBe(201)

      const body = await res.json() as { uploaded: Array<{ fileName: string; path: string }> }
      expect(body.uploaded[0]!.fileName).toBe('test-1.txt')

      // Verify both files exist
      const existing = await fs.readFile(path.join(tempDir, 'test.txt'), 'utf-8')
      expect(existing).toBe('existing')
      const newFile = await fs.readFile(path.join(tempDir, 'test-1.txt'), 'utf-8')
      expect(newFile).toBe('new content')
    })

    it('generates paste filename in paste mode', async () => {
      const { app } = createTestApp({ storagePath: tempDir })

      const formData = new FormData()
      formData.append('file', new File(['image data'], 'clipboard.png'))

      const res = await app.request('/api/v1/vaults/vault-1/upload?paste=true', {
        method: 'POST',
        body: formData,
      })
      expect(res.status).toBe(201)

      const body = await res.json() as { uploaded: Array<{ fileName: string; path: string }> }
      // Filename should match paste-YYYY-MM-DD-HHmmss.png pattern
      expect(body.uploaded[0]!.fileName).toMatch(/^paste-\d{4}-\d{2}-\d{2}-\d{6}\.png$/)
    })

    it('uploads multiple files successfully', async () => {
      const { app } = createTestApp({ storagePath: tempDir })

      const formData = new FormData()
      formData.append('file1', new File(['content 1'], 'a.txt'))
      formData.append('file2', new File(['content 2'], 'b.txt'))

      const res = await app.request('/api/v1/vaults/vault-1/upload', {
        method: 'POST',
        body: formData,
      })
      expect(res.status).toBe(201)

      const body = await res.json() as { uploaded: Array<{ fileName: string; path: string }> }
      expect(body.uploaded).toHaveLength(2)
      expect(body.uploaded[0]!.fileName).toBe('a.txt')
      expect(body.uploaded[1]!.fileName).toBe('b.txt')
    })

    it('returns 400 for path traversal in targetDir', async () => {
      const { app } = createTestApp({ storagePath: tempDir })

      const formData = new FormData()
      formData.append('file', new File(['bad'], 'evil.txt'))
      formData.append('targetDir', '../../../etc')

      const res = await app.request('/api/v1/vaults/vault-1/upload', {
        method: 'POST',
        body: formData,
      })
      expect(res.status).toBe(400)

      const body = await res.json() as { code: string }
      expect(body.code).toBe('PATH_TRAVERSAL')
    })

    it('creates target directory if it does not exist', async () => {
      const { app } = createTestApp({ storagePath: tempDir })

      const formData = new FormData()
      formData.append('file', new File(['content'], 'doc.md'))
      formData.append('targetDir', 'new-folder')

      const res = await app.request('/api/v1/vaults/vault-1/upload', {
        method: 'POST',
        body: formData,
      })
      expect(res.status).toBe(201)

      const body = await res.json() as { uploaded: Array<{ fileName: string; path: string }> }
      expect(body.uploaded[0]!.path).toBe('new-folder/doc.md')

      // Verify file exists
      const content = await fs.readFile(path.join(tempDir, 'new-folder', 'doc.md'), 'utf-8')
      expect(content).toBe('content')
    })

    it('handles duplicate filenames in same batch upload', async () => {
      const { app } = createTestApp({ storagePath: tempDir })

      const formData = new FormData()
      formData.append('file1', new File(['first'], 'doc.txt'))
      formData.append('file2', new File(['second'], 'doc.txt'))

      const res = await app.request('/api/v1/vaults/vault-1/upload', {
        method: 'POST',
        body: formData,
      })
      expect(res.status).toBe(201)

      const body = await res.json() as { uploaded: Array<{ fileName: string; path: string }> }
      expect(body.uploaded).toHaveLength(2)
      expect(body.uploaded[0]!.fileName).toBe('doc.txt')
      expect(body.uploaded[1]!.fileName).toBe('doc-1.txt')
    })
  })
})
