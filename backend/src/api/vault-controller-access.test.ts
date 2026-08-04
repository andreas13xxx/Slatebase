// VaultController — read access control regression tests
//
// Regression coverage for: getVaultTree/getFileContent must deny access to vaults
// the requesting session does not own or hold a share for, mirroring the write-path
// checks already present on saveFile/deleteContent/moveContent/renameContent.

import { describe, it, expect, vi } from 'vitest'
import { Hono } from 'hono'
import { VaultController } from './index.js'
import { VaultAccessDeniedError, VaultNotFoundError } from '../business/index.js'
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

function createDenyingAccessControl(): IVaultAccessControl {
  return {
    checkReadAccess: vi.fn().mockRejectedValue(
      new VaultAccessDeniedError('other-vault', 'attacker-id', 'read'),
    ),
    checkWriteAccess: vi.fn().mockRejectedValue(
      new VaultAccessDeniedError('other-vault', 'attacker-id', 'write'),
    ),
  } as unknown as IVaultAccessControl
}

function createAllowingAccessControl(): IVaultAccessControl {
  return {
    checkReadAccess: vi.fn().mockResolvedValue(undefined),
    checkWriteAccess: vi.fn().mockResolvedValue(undefined),
  } as unknown as IVaultAccessControl
}

function buildApp(vaultService: IVaultService, accessControl?: IVaultAccessControl) {
  const controller = new VaultController(vaultService, createMockLogger(), undefined, undefined, accessControl)
  const app = new Hono()
  app.use('*', async (c, next) => {
    c.set('session' as never, { userId: 'attacker-id', username: 'attacker', role: 'user' } as never)
    await next()
  })
  app.get('/vaults/:vaultId/tree', (c) => controller.getVaultTree(c))
  app.get('/vaults/:vaultId/files', (c) => controller.getFileContent(c))
  return app
}

describe('VaultController read access control', () => {
  describe('GET /vaults/:vaultId/tree', () => {
    it('returns 403 when the session lacks read access to the vault', async () => {
      const vaultService = createMockVaultService()
      const app = buildApp(vaultService, createDenyingAccessControl())

      const res = await app.request('/vaults/other-vault/tree')

      expect(res.status).toBe(403)
      expect(vaultService.getVaultTree).not.toHaveBeenCalled()
    })

    it('returns 200 when the session has read access', async () => {
      const vaultService = createMockVaultService()
      const app = buildApp(vaultService, createAllowingAccessControl())

      const res = await app.request('/vaults/owned-vault/tree')

      expect(res.status).toBe(200)
      expect(vaultService.getVaultTree).toHaveBeenCalledWith('owned-vault')
    })

    it('skips the access check when no accessControl is wired (back-compat)', async () => {
      const vaultService = createMockVaultService()
      const app = buildApp(vaultService, undefined)

      const res = await app.request('/vaults/any-vault/tree')

      expect(res.status).toBe(200)
    })
  })

  describe('GET /vaults/:vaultId/files', () => {
    it('returns 403 for JSON content when the session lacks read access', async () => {
      const vaultService = createMockVaultService()
      const app = buildApp(vaultService, createDenyingAccessControl())

      const res = await app.request('/vaults/other-vault/files?path=readme.md')

      expect(res.status).toBe(403)
      expect(vaultService.getFileContent).not.toHaveBeenCalled()
    })

    it('returns 403 for raw content when the session lacks read access', async () => {
      const vaultService = createMockVaultService()
      const app = buildApp(vaultService, createDenyingAccessControl())

      const res = await app.request('/vaults/other-vault/files?path=readme.md&raw=true')

      expect(res.status).toBe(403)
    })

    it('propagates VaultNotFoundError as 404 when the vault does not exist', async () => {
      const vaultService = createMockVaultService({
        getFileContent: vi.fn().mockRejectedValue(new VaultNotFoundError('missing-vault')),
      })
      const app = buildApp(vaultService, createAllowingAccessControl())

      const res = await app.request('/vaults/missing-vault/files?path=readme.md')

      expect(res.status).toBe(404)
    })
  })
})
