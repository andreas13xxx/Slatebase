// Statistics Routes — Unit tests

import { describe, it, expect, vi } from 'vitest'
import { Hono } from 'hono'
import { createStatisticsRoutes } from './statisticsRoutes.js'
import type { StatisticsRouteDependencies } from './statisticsRoutes.js'
import { VaultAccessDeniedError } from '../business/index.js'
import { StatisticsTimeoutError } from '../statistics/index.js'
import type { IVaultStatisticsService } from '../statistics/index.js'
import type { IVaultAccessControl } from '../business/index.js'
import type { IVaultRegistry } from '../vault/registry.js'
import type { ILogger } from '../logger/index.js'

// --- Mock Factories ---

function createMockLogger(): ILogger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnThis(),
  } as unknown as ILogger
}

function createMockVaultRegistry(): IVaultRegistry {
  return {
    findById: vi.fn(),
    findByName: vi.fn(),
    getAll: vi.fn(),
    addEntry: vi.fn(),
    removeEntry: vi.fn(),
  } as unknown as IVaultRegistry
}

function createMockAccessControl(): IVaultAccessControl {
  return {
    checkReadAccess: vi.fn(),
    checkWriteAccess: vi.fn(),
  } as unknown as IVaultAccessControl
}

function createMockStatisticsService(): IVaultStatisticsService {
  return {
    getStatistics: vi.fn(),
    invalidateCache: vi.fn(),
  }
}

// --- Test Setup ---

function createAppWithSession(
  session: { userId: string; username: string } | undefined,
  overrides: Partial<StatisticsRouteDependencies> = {},
) {
  const deps: StatisticsRouteDependencies = {
    accessControl: createMockAccessControl(),
    vaultRegistry: createMockVaultRegistry(),
    statisticsService: createMockStatisticsService(),
    logger: createMockLogger(),
    ...overrides,
  }

  const routes = createStatisticsRoutes(deps)

  const app = new Hono()
  // Middleware that sets session
  app.use('*', async (c, next) => {
    if (session) {
      c.set('session' as never, session as never)
    }
    await next()
  })
  app.route('/', routes)

  return { app, deps }
}

// --- Tests ---

describe('GET /vaults/:vaultId/statistics', () => {
  it('returns 401 when no session is present', async () => {
    const { app } = createAppWithSession(undefined)

    const res = await app.request('/vaults/abc123/statistics')

    expect(res.status).toBe(401)
    const body = await res.json() as { code: string; message: string; timestamp: string }
    expect(body.code).toBe('UNAUTHORIZED')
    expect(body.message).toBe('Missing session context')
    expect(body.timestamp).toBeDefined()
  })

  it('returns 404 when vault does not exist', async () => {
    const vaultRegistry = createMockVaultRegistry()
    ;(vaultRegistry.findById as ReturnType<typeof vi.fn>).mockReturnValue(null)

    const { app } = createAppWithSession(
      { userId: 'user1', username: 'testuser' },
      { vaultRegistry },
    )

    const res = await app.request('/vaults/nonexist/statistics')

    expect(res.status).toBe(404)
    const body = await res.json() as { code: string }
    expect(body.code).toBe('VAULT_NOT_FOUND')
  })

  it('returns 403 when read access is denied', async () => {
    const vaultRegistry = createMockVaultRegistry()
    ;(vaultRegistry.findById as ReturnType<typeof vi.fn>).mockReturnValue({
      id: 'vault1',
      name: 'Test Vault',
      storagePath: '/data/vaults/vault1',
      createdAt: '2024-01-01T00:00:00.000Z',
    })

    const accessControl = createMockAccessControl()
    ;(accessControl.checkReadAccess as ReturnType<typeof vi.fn>).mockRejectedValue(
      new VaultAccessDeniedError('vault1', 'user1', 'read'),
    )

    const { app } = createAppWithSession(
      { userId: 'user1', username: 'testuser' },
      { vaultRegistry, accessControl },
    )

    const res = await app.request('/vaults/vault1/statistics')

    expect(res.status).toBe(403)
    const body = await res.json() as { code: string }
    expect(body.code).toBe('FORBIDDEN')
  })

  it('returns 200 with statistics on success', async () => {
    const vaultRegistry = createMockVaultRegistry()
    ;(vaultRegistry.findById as ReturnType<typeof vi.fn>).mockReturnValue({
      id: 'vault1',
      name: 'Test Vault',
      storagePath: '/data/vaults/vault1',
      createdAt: '2024-01-01T00:00:00.000Z',
    })

    const accessControl = createMockAccessControl()
    ;(accessControl.checkReadAccess as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)

    const statisticsService = createMockStatisticsService()
    ;(statisticsService.getStatistics as ReturnType<typeof vi.fn>).mockResolvedValue({
      fileCount: 42,
      folderCount: 5,
      totalSizeBytes: 1_048_576,
    })

    const { app } = createAppWithSession(
      { userId: 'user1', username: 'testuser' },
      { vaultRegistry, accessControl, statisticsService },
    )

    const res = await app.request('/vaults/vault1/statistics')

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({
      fileCount: 42,
      folderCount: 5,
      totalSizeBytes: 1_048_576,
      formattedSize: '1 MB',
    })
  })

  it('returns 408 when statistics computation times out', async () => {
    const vaultRegistry = createMockVaultRegistry()
    ;(vaultRegistry.findById as ReturnType<typeof vi.fn>).mockReturnValue({
      id: 'vault1',
      name: 'Test Vault',
      storagePath: '/data/vaults/vault1',
      createdAt: '2024-01-01T00:00:00.000Z',
    })

    const accessControl = createMockAccessControl()
    ;(accessControl.checkReadAccess as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)

    const statisticsService = createMockStatisticsService()
    ;(statisticsService.getStatistics as ReturnType<typeof vi.fn>).mockRejectedValue(
      new StatisticsTimeoutError('vault1'),
    )

    const { app } = createAppWithSession(
      { userId: 'user1', username: 'testuser' },
      { vaultRegistry, accessControl, statisticsService },
    )

    const res = await app.request('/vaults/vault1/statistics')

    expect(res.status).toBe(408)
    const body = await res.json() as { code: string; message: string; timestamp: string }
    expect(body.code).toBe('STATISTICS_TIMEOUT')
    expect(body.message).toContain('vault1')
    expect(body.timestamp).toBeDefined()
  })

  it('returns 500 on unexpected errors', async () => {
    const vaultRegistry = createMockVaultRegistry()
    ;(vaultRegistry.findById as ReturnType<typeof vi.fn>).mockReturnValue({
      id: 'vault1',
      name: 'Test Vault',
      storagePath: '/data/vaults/vault1',
      createdAt: '2024-01-01T00:00:00.000Z',
    })

    const accessControl = createMockAccessControl()
    ;(accessControl.checkReadAccess as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)

    const statisticsService = createMockStatisticsService()
    ;(statisticsService.getStatistics as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Disk failure'),
    )

    const { app } = createAppWithSession(
      { userId: 'user1', username: 'testuser' },
      { vaultRegistry, accessControl, statisticsService },
    )

    const res = await app.request('/vaults/vault1/statistics')

    expect(res.status).toBe(500)
    const body = await res.json() as { code: string }
    expect(body.code).toBe('INTERNAL_ERROR')
  })
})
