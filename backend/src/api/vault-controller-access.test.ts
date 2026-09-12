// VaultController — regression tests for the read routes' non-access-control behavior
//
// Read-access enforcement for these routes now lives entirely in
// vault-authorization-middleware (see vault-authorization-middleware.test.ts and
// integration.test.ts for that coverage) — the controller no longer performs its
// own accessControl.checkReadAccess call, so this file only covers what's left:
// the success path and VaultNotFoundError -> 404 mapping.

import { describe, it, expect, vi } from 'vitest'
import { Hono } from 'hono'
import { VaultController } from './index.js'
import { VaultNotFoundError } from '../business/index.js'
import type { IVaultService } from '../business/index.js'
import type { IVaultAccessControl } from '../business/index.js'
import type { ILogger } from '../logger/index.js'
import type { DirectoryTree } from '../vault/index.js'

function createMockLogger(): ILogger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  } as unknown as ILogger
}

function createMockVaultService(overrides: Partial<IVaultService> = {}): IVaultService {
  const tree: DirectoryTree = { name: 'root', type: 'directory', path: '', children: [] }
  return {
    initializeVaults: vi.fn(),
    getVaultList: vi.fn(),
    getVaultTree: vi.fn().mockResolvedValue(tree),
    getFileContent: vi.fn().mockResolvedValue({
      path: 'readme.md',
      name: 'readme.md',
      content: 'secret',
      size: 6,
      encoding: 'utf-8',
      isBinary: false,
      isTruncated: false,
      etag: '0000000000000000',
    }),
    resolveFilePath: vi.fn(),
    saveFile: vi.fn(),
    createVault: vi.fn(),
    deleteVault: vi.fn(),
    deleteVaultWithChecks: vi.fn(),
    transferOwnership: vi.fn(),
    deleteContent: vi.fn(),
    moveContent: vi.fn(),
    renameContent: vi.fn(),
    ...overrides,
  } as unknown as IVaultService
}

function createMockAccessControl(): IVaultAccessControl {
  return {
    checkReadAccess: vi.fn().mockResolvedValue(undefined),
    checkWriteAccess: vi.fn().mockResolvedValue(undefined),
  } as unknown as IVaultAccessControl
}

function buildApp(vaultService: IVaultService) {
  const controller = new VaultController(vaultService, createMockLogger(), undefined, undefined, createMockAccessControl())
  const app = new Hono()
  app.use('*', async (c, next) => {
    c.set('session' as never, { userId: 'attacker-id', username: 'attacker', role: 'user' } as never)
    await next()
  })
  app.get('/vaults/:vaultId/tree', (c) => controller.getVaultTree(c))
  app.get('/vaults/:vaultId/files', (c) => controller.getFileContent(c))
  return app
}

describe('VaultController read routes', () => {
  describe('GET /vaults/:vaultId/tree', () => {
    it('returns 200 with the vault tree', async () => {
      const vaultService = createMockVaultService()
      const app = buildApp(vaultService)

      const res = await app.request('/vaults/owned-vault/tree')

      expect(res.status).toBe(200)
      expect(vaultService.getVaultTree).toHaveBeenCalledWith('owned-vault')
    })
  })

  describe('GET /vaults/:vaultId/files', () => {
    it('propagates VaultNotFoundError as 404 when the vault does not exist', async () => {
      const vaultService = createMockVaultService({
        getFileContent: vi.fn().mockRejectedValue(new VaultNotFoundError('missing-vault')),
      })
      const app = buildApp(vaultService)

      const res = await app.request('/vaults/missing-vault/files?path=readme.md')

      expect(res.status).toBe(404)
    })
  })
})
