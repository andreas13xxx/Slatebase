// Backend Integration Tests — Tests all 3 API endpoints against a real fixture vault
// Wires the app manually without ConfigService

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

import { VaultReader, VaultManager, generateVaultId } from './vault/index.js'
import { VaultService } from './business/index.js'
import { VaultController, VaultRouteModule, createRouter } from './api/index.js'
import type { IConfigService, ServerConfig, VaultConfig } from './config/index.js'
import type { ILogger } from './logger/index.js'

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
  const vaultManager = new VaultManager(vaultReader, silentLogger, 50)

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
        maxVaults: 20,
        allowedOrigins: ['http://localhost:5173'],
        dataDir: './data',
        maxImportFileSize: 524288000,
        maxImportFiles: 500,
        maxImportDepth: 10,
        trustedProxies: [],
        sessionDurationHours: 24,
        sessionMaxLifetimeDays: 7,
        features: {},
        sse: { maxConnections: 1000, maxPerUser: 3, heartbeatInterval: 30000, replayBufferSize: 100, replayTtl: 300000, batchWindow: 100, batchMax: 20 },
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
  }

  const vaultService = new VaultService(vaultManager, vaultReader, configStub, silentLogger)
  const vaultController = new VaultController(vaultService, silentLogger)
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
  // Fake session middleware for integration tests (no real auth)
  app.use('*', async (c, next) => {
    ;(c as unknown as { set(key: string, value: unknown): void }).set('session', { userId: 'test-user-id', username: 'testuser', role: 'admin' })
    await next()
  })
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
