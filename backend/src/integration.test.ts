// Backend Integration Tests — Tests all 3 API endpoints against a real fixture vault
// Wires the app manually without ConfigService

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

import { VaultReader, VaultManager, generateVaultId } from './vault/index.js'
import { VaultService, VaultAccessControlService } from './business/index.js'
import { VaultController, VaultRouteModule, createRouter } from './api/index.js'
import { createVaultAuthorizationMiddleware } from './api/vault-authorization-middleware.js'
import type { IConfigService, ServerConfig, VaultConfig } from './config/index.js'
import type { ILogger } from './logger/index.js'
import type { IVaultRegistry, IVaultShareRegistry, VaultRegistryEntry, VaultShareEntry } from './vault/registry.js'
import type { IUserRepository } from './user/index.js'
import type { SessionContext } from './auth/index.js'

// --- Silent logger for tests ---
const silentLogger: ILogger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
}

// --- Test fixture setup ---

let fixtureDir: string
let vaultId: string
let app: Hono

// --- Test users for authorization coverage ---
// OWNER_USER_ID matches the pre-existing 'test-user-id' every test above already assumes.
const OWNER_USER_ID = 'test-user-id'
const READER_USER_ID = 'reader-user-id'
const STRANGER_USER_ID = 'stranger-user-id'

let currentSession: SessionContext = { userId: OWNER_USER_ID, username: 'testuser', role: 'admin', sessionId: 'sess-owner' }

beforeAll(async () => {
  // Create a temp fixture vault directory
  fixtureDir = await fs.mkdtemp(path.join(os.tmpdir(), 'slatebase-integration-'))

  // Create fixture files and directories
  await fs.mkdir(path.join(fixtureDir, 'notes'), { recursive: true })
  await fs.writeFile(path.join(fixtureDir, 'readme.md'), '# Hello Slatebase\n\nThis is a test vault.')
  await fs.writeFile(path.join(fixtureDir, 'notes', 'todo.md'), '- Buy milk\n- Write tests')

  // Compute the vault ID the same way the system does
  vaultId = generateVaultId(path.resolve(fixtureDir))

  // Wire up the app manually (no ConfigService — just direct instantiation)
  const vaultReader = new VaultReader()
  const vaultManager = new VaultManager(silentLogger)

  // Load the fixture vault
  await vaultManager.loadVaults([{ path: fixtureDir }])

  // Set ownerId on the loaded vault for access control filtering
  const loadedVault = vaultManager.getVault(vaultId)
  if (loadedVault) {
    loadedVault.info.ownerId = 'test-user-id'
  }

  // Create a minimal IConfigService stub for VaultService
  const configStub: IConfigService = {
    getServerConfig(): ServerConfig {
      return {
        port: 3000,
        host: '127.0.0.1',
        logLevel: 'info',
        vaults: [{ path: fixtureDir }],
        maxFileSize: 5242880,
        maxDirectoryDepth: 50,
        maxVaultsPerUser: 50,
        allowedOrigins: ['http://localhost:5173'],
        dataDir: './data',
        templatesDir: './assets/templates',
        maxImportFileSize: 524288000,
        maxImportFiles: 500,
        maxImportDepth: 10,
        trustedProxies: [],
        sessionDurationHours: 24,
        sessionMaxLifetimeDays: 7,
        cookieSecure: 'auto',
        features: {},
        mcp: { maxFileSize: 16777216, rateLimit: 60 },
        transcription: { timeoutMs: 120000, maxAudioBytes: 26214400, supportedLanguages: ['de', 'en'] },
        sse: { maxConnections: 1000, maxPerUser: 3, heartbeatInterval: 30000, replayBufferSize: 100, replayTtl: 300000, batchWindow: 100, batchMax: 20 },
        trash: { retentionDays: 30 },
        versions: { maxPerFile: 20 },
        cleanup: { intervalHours: 24 },
        templates: { directory: 'Templates' },
        upload: { maxFileSizeBytes: 104857600, maxFilesPerDrop: 50, maxImagePasteSize: 10485760 },
        welcomeVault: { name: { de: 'Willkommen', en: 'Welcome' } },
      }
    },
    getVaultConfigs(): VaultConfig[] {
      return [{ path: fixtureDir }]
    },
    getFeaturesConfig() {
      return {}
    },
    getSseConfig() {
      return { maxConnections: 1000, maxPerUser: 3, heartbeatInterval: 30000, replayBufferSize: 100, replayTtl: 300000, batchWindow: 100, batchMax: 20 }
    },
    getTranscriptionConfig() {
      return { timeoutMs: 120000, maxAudioBytes: 26214400, supportedLanguages: ['de', 'en'] }
    },
    getTrashConfig() {
      return { retentionDays: 30 }
    },
    getVersionsConfig() {
      return { maxPerFile: 20 }
    },
    getCleanupConfig() {
      return { intervalHours: 24 }
    },
    getTemplatesConfig() {
      return { directory: 'Templates' }
    },
    getUploadConfig() {
      return { maxFileSizeBytes: 104857600, maxFilesPerDrop: 50, maxImagePasteSize: 10485760 }
    },
    getWelcomeVaultConfig() {
      return { name: { de: 'Willkommen', en: 'Welcome' } }
    },
    getOverrides() {
      return {}
    },
    async updateOverrides() {
      return []
    },
  }

  const vaultService = new VaultService(vaultManager, vaultReader, configStub, silentLogger)

  // Real access-control stack (in-memory) so the authorization middleware below enforces
  // actual read/write/owner decisions, not just a stub that always allows.
  const registryEntries: VaultRegistryEntry[] = [
    { id: vaultId, name: 'Integration Test Vault', storagePath: fixtureDir, createdAt: new Date().toISOString(), ownerId: OWNER_USER_ID },
  ]
  const shareEntries: VaultShareEntry[] = [
    { vaultId, userId: READER_USER_ID, permission: 'read', grantedBy: OWNER_USER_ID, grantedAt: new Date().toISOString() },
  ]
  const vaultRegistry: IVaultRegistry = {
    load: async () => [...registryEntries],
    save: async () => {},
    addEntry: async (entry) => { registryEntries.push(entry) },
    removeEntry: async (id) => {
      const idx = registryEntries.findIndex((e) => e.id === id)
      if (idx !== -1) registryEntries.splice(idx, 1)
    },
    findById: (id) => registryEntries.find((e) => e.id === id) ?? null,
    findByName: (name) => registryEntries.find((e) => e.name === name) ?? null,
    updateEntries: async (mutator) => mutator(registryEntries),
  }
  const vaultShareRegistry: IVaultShareRegistry = {
    getSharesForVault: async (id) => shareEntries.filter((s) => s.vaultId === id),
    getSharesForUser: async (userId) => shareEntries.filter((s) => s.userId === userId),
    addShare: async (share) => { shareEntries.push(share) },
    removeShare: async (id, userId) => {
      const idx = shareEntries.findIndex((s) => s.vaultId === id && s.userId === userId)
      if (idx !== -1) shareEntries.splice(idx, 1)
    },
    removeAllSharesForVault: async (id) => {
      for (let i = shareEntries.length - 1; i >= 0; i--) {
        if (shareEntries[i]?.vaultId === id) shareEntries.splice(i, 1)
      }
    },
    updatePermission: async (id, userId, permission) => {
      const share = shareEntries.find((s) => s.vaultId === id && s.userId === userId)
      if (share) share.permission = permission
    },
  }
  // Never invoked by checkReadAccess/checkWriteAccess (only createShare uses it), so a
  // never-called stub is sufficient here.
  const userRepository = {} as unknown as IUserRepository
  const accessControl = new VaultAccessControlService(vaultRegistry, vaultShareRegistry, userRepository, silentLogger)

  const vaultController = new VaultController(vaultService, silentLogger, undefined, undefined, accessControl)
  const routeModules = [new VaultRouteModule(vaultController)]
  const router = createRouter(routeModules)

  // Build the Hono app with CORS
  app = new Hono()
  app.use(
    '*',
    cors({
      origin: ['http://localhost:5173'],
      allowMethods: ['GET'],
      allowHeaders: ['Content-Type'],
    }),
  )
  // Fake session middleware for integration tests (no real auth) — reads the mutable
  // `currentSession`, so individual tests can swap in a different caller.
  app.use('*', async (c, next) => {
    ;(c as unknown as { set(key: string, value: unknown): void }).set('session', currentSession)
    await next()
  })
  // Default-deny vault authorization — registered before the route mount below, mirroring
  // production wiring (index.ts). Exercises the real middleware stack, not an isolated unit.
  app.use('/api/v1/vaults/:vaultId/*', createVaultAuthorizationMiddleware({ vaultRegistry, accessControl }))
  app.route('/api/v1', router)
})

afterAll(async () => {
  // Clean up the temp fixture directory
  await fs.rm(fixtureDir, { recursive: true, force: true })
})

// --- Tests ---

describe('Backend Integration: GET /api/v1/vaults', () => {
  it('returns 200 with vault array containing id and name', async () => {
    const res = await app.request('/api/v1/vaults')

    expect(res.status).toBe(200)
    const body = (await res.json()) as Array<Record<string, unknown>>
    expect(Array.isArray(body)).toBe(true)
    expect(body.length).toBe(1)
    expect(body[0]).toHaveProperty('id', vaultId)
    expect(body[0]).toHaveProperty('name')
    // Internal path should NOT be exposed in the API response
    expect(body[0]).not.toHaveProperty('path')
  })
})

describe('Backend Integration: GET /api/v1/vaults/:id/tree', () => {
  it('returns 200 with directory tree for a valid vault', async () => {
    const res = await app.request(`/api/v1/vaults/${vaultId}/tree`)

    expect(res.status).toBe(200)
    const body = (await res.json()) as { name: string; type: string; children: Array<{ name: string }> }
    expect(body).toHaveProperty('name')
    expect(body).toHaveProperty('type', 'directory')
    expect(body).toHaveProperty('children')
    expect(Array.isArray(body.children)).toBe(true)

    // Should contain the 'notes' directory and 'readme.md' file
    const names = body.children.map((c) => c.name)
    expect(names).toContain('notes')
    expect(names).toContain('readme.md')
  })

  it('returns 404 with VAULT_NOT_FOUND for an invalid vault ID', async () => {
    const res = await app.request('/api/v1/vaults/bad-id-12345/tree')

    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body).toHaveProperty('code', 'VAULT_NOT_FOUND')
    expect(body).toHaveProperty('message')
    expect(body).toHaveProperty('timestamp')
  })
})

describe('Backend Integration: GET /api/v1/vaults/:id/files', () => {
  it('returns 200 with file content for a valid path', async () => {
    const res = await app.request(`/api/v1/vaults/${vaultId}/files?path=readme.md`)

    expect(res.status).toBe(200)
    const body = (await res.json()) as { name: string; content: string; isBinary: boolean; isTruncated: boolean; encoding: string }
    expect(body).toHaveProperty('name', 'readme.md')
    expect(body).toHaveProperty('content')
    expect(body.content).toContain('# Hello Slatebase')
    expect(body).toHaveProperty('isBinary', false)
    expect(body).toHaveProperty('isTruncated', false)
    expect(body).toHaveProperty('encoding', 'utf-8')
  })

  it('returns 400 with PATH_TRAVERSAL for directory traversal attempt', async () => {
    const res = await app.request(
      `/api/v1/vaults/${vaultId}/files?path=../etc/passwd`,
    )

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body).toHaveProperty('code', 'PATH_TRAVERSAL')
    expect(body).toHaveProperty('message')
    expect(body).toHaveProperty('timestamp')
  })
})

describe('Backend Integration: CORS headers', () => {
  it('includes CORS headers on responses', async () => {
    const res = await app.request('/api/v1/vaults', {
      headers: { Origin: 'http://localhost:5173' },
    })

    expect(res.status).toBe(200)
    expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:5173')
  })
})

// End-to-end coverage of the default-deny vault authorization middleware, over the real
// middleware stack wired in beforeAll above (not an isolated unit) — see
// vault-authorization-middleware.test.ts for the exhaustive per-route sweep.
describe('Backend Integration: vault authorization middleware', () => {
  afterAll(() => {
    currentSession = { userId: OWNER_USER_ID, username: 'testuser', role: 'admin', sessionId: 'sess-owner' }
  })

  it('denies GET /tree to a user with no access to the vault', async () => {
    currentSession = { userId: STRANGER_USER_ID, username: 'stranger', role: 'user', sessionId: 'sess-stranger' }

    const res = await app.request(`/api/v1/vaults/${vaultId}/tree`)

    expect(res.status).toBe(403)
  })

  it('denies PUT /files to a user with only a read share', async () => {
    currentSession = { userId: READER_USER_ID, username: 'reader', role: 'user', sessionId: 'sess-reader' }

    const res = await app.request(`/api/v1/vaults/${vaultId}/files?path=readme.md`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'attempted overwrite' }),
    })

    expect(res.status).toBe(403)
  })

  it('still allows GET /tree for the read-share user (read-share must keep working)', async () => {
    currentSession = { userId: READER_USER_ID, username: 'reader', role: 'user', sessionId: 'sess-reader' }

    const res = await app.request(`/api/v1/vaults/${vaultId}/tree`)

    expect(res.status).toBe(200)
  })
})
