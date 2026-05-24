import { describe, it, expect } from 'vitest'
import {
  VaultAccessControlService,
  VaultAccessDeniedError,
  ShareLimitError,
  InvalidShareTargetError,
  VaultNotFoundError,
  MAX_SHARES_PER_VAULT,
} from './index.js'
import type { IVaultAccessControl } from './index.js'
import type { IVaultRegistry, IVaultShareRegistry, VaultRegistryEntry, VaultShareEntry } from '../vault/registry.js'
import type { IUserRepository } from '../user/index.js'
import type { UserRecord } from '../user/index.js'
import type { ILogger } from '../logger/index.js'

// --- Test Helpers ---

function createMockLogger(): ILogger {
  return {
    debug(_message: string, _meta?: object) {},
    info(_message: string, _meta?: object) {},
    warn(_message: string, _meta?: object) {},
    error(_message: string, _meta?: object) {},
  }
}

function createMockVaultRegistry(entries: VaultRegistryEntry[] = []): IVaultRegistry {
  const entryMap = new Map(entries.map((e) => [e.id, e]))
  return {
    async load() { return [...entries] },
    async save(_entries: VaultRegistryEntry[]) {},
    async addEntry(entry: VaultRegistryEntry) { entryMap.set(entry.id, entry) },
    async removeEntry(vaultId: string) { entryMap.delete(vaultId) },
    findById(vaultId: string) { return entryMap.get(vaultId) ?? null },
    findByName(name: string) { return entries.find((e) => e.name === name) ?? null },
  }
}

function createMockShareRegistry(initialShares: VaultShareEntry[] = []): IVaultShareRegistry & { shares: VaultShareEntry[] } {
  const registry = {
    shares: [...initialShares],
    async getSharesForVault(vaultId: string) {
      return registry.shares.filter((s) => s.vaultId === vaultId)
    },
    async getSharesForUser(userId: string) {
      return registry.shares.filter((s) => s.userId === userId)
    },
    async addShare(share: VaultShareEntry) {
      registry.shares.push(share)
    },
    async removeShare(vaultId: string, userId: string) {
      registry.shares = registry.shares.filter(
        (s) => !(s.vaultId === vaultId && s.userId === userId),
      )
    },
    async removeAllSharesForVault(vaultId: string) {
      registry.shares = registry.shares.filter((s) => s.vaultId !== vaultId)
    },
    async updatePermission(vaultId: string, userId: string, permission: 'read' | 'write') {
      const share = registry.shares.find(
        (s) => s.vaultId === vaultId && s.userId === userId,
      )
      if (share) {
        share.permission = permission
      }
    },
  }
  return registry
}

function createMockUserRepository(users: UserRecord[] = []): IUserRepository {
  return {
    async findById(userId: string) {
      return users.find((u) => u.userId === userId) ?? null
    },
    async findByUsername(username: string) {
      return users.find((u) => u.username === username) ?? null
    },
    async findAll() {
      return { items: users, total: users.length, page: 1, pageSize: 100, totalPages: 1 }
    },
    async save(_user: UserRecord) {},
    async delete(_userId: string) {},
    async count() { return users.length },
    async countByRole(_role: 'admin' | 'user') { return 0 },
  }
}

function createTestUser(userId: string, username: string): UserRecord {
  return {
    userId,
    username,
    passwordHash: 'hashed',
    role: 'user',
    displayName: username,
    email: '',
    avatarUrl: '',
    preferredLanguage: 'de',
    colorScheme: 'system',
    suspended: false,
    mustChangePassword: false,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  }
}

function createTestVaultEntry(id: string, ownerId: string): VaultRegistryEntry {
  return {
    id,
    name: `Vault ${id}`,
    storagePath: `/data/vaults/${id}`,
    createdAt: '2025-01-01T00:00:00.000Z',
    ownerId,
  }
}

function createTestShare(vaultId: string, userId: string, permission: 'read' | 'write', grantedBy: string): VaultShareEntry {
  return {
    vaultId,
    userId,
    permission,
    grantedBy,
    grantedAt: '2025-01-01T00:00:00.000Z',
  }
}

// --- Tests ---

describe('VaultAccessControlService', () => {
  const ownerId = 'owner-001'
  const readUserId = 'reader-001'
  const writeUserId = 'writer-001'
  const noAccessUserId = 'stranger-001'
  const vaultId = 'vault-abc123'

  function createService(options?: {
    entries?: VaultRegistryEntry[]
    shares?: VaultShareEntry[]
    users?: UserRecord[]
  }): { service: IVaultAccessControl; shareRegistry: IVaultShareRegistry & { shares: VaultShareEntry[] } } {
    const entries = options?.entries ?? [createTestVaultEntry(vaultId, ownerId)]
    const shares = options?.shares ?? []
    const users = options?.users ?? [
      createTestUser(ownerId, 'owner'),
      createTestUser(readUserId, 'reader'),
      createTestUser(writeUserId, 'writer'),
      createTestUser(noAccessUserId, 'stranger'),
    ]

    const vaultRegistry = createMockVaultRegistry(entries)
    const shareRegistry = createMockShareRegistry(shares)
    const userRepository = createMockUserRepository(users)
    const logger = createMockLogger()

    const service = new VaultAccessControlService(vaultRegistry, shareRegistry, userRepository, logger)
    return { service, shareRegistry }
  }

  describe('checkReadAccess', () => {
    it('allows owner to read their vault', async () => {
      const { service } = createService()
      await expect(service.checkReadAccess(vaultId, ownerId)).resolves.toBeUndefined()
    })

    it('allows user with read share to read', async () => {
      const { service } = createService({
        shares: [createTestShare(vaultId, readUserId, 'read', ownerId)],
      })
      await expect(service.checkReadAccess(vaultId, readUserId)).resolves.toBeUndefined()
    })

    it('allows user with write share to read', async () => {
      const { service } = createService({
        shares: [createTestShare(vaultId, writeUserId, 'write', ownerId)],
      })
      await expect(service.checkReadAccess(vaultId, writeUserId)).resolves.toBeUndefined()
    })

    it('rejects user without share or ownership', async () => {
      const { service } = createService()
      await expect(service.checkReadAccess(vaultId, noAccessUserId)).rejects.toThrow(VaultAccessDeniedError)
    })

    it('throws VaultNotFoundError for non-existent vault', async () => {
      const { service } = createService()
      await expect(service.checkReadAccess('non-existent', ownerId)).rejects.toThrow(VaultNotFoundError)
    })
  })

  describe('checkWriteAccess', () => {
    it('allows owner to write to their vault', async () => {
      const { service } = createService()
      await expect(service.checkWriteAccess(vaultId, ownerId)).resolves.toBeUndefined()
    })

    it('allows user with write share to write', async () => {
      const { service } = createService({
        shares: [createTestShare(vaultId, writeUserId, 'write', ownerId)],
      })
      await expect(service.checkWriteAccess(vaultId, writeUserId)).resolves.toBeUndefined()
    })

    it('rejects user with read share from writing', async () => {
      const { service } = createService({
        shares: [createTestShare(vaultId, readUserId, 'read', ownerId)],
      })
      await expect(service.checkWriteAccess(vaultId, readUserId)).rejects.toThrow(VaultAccessDeniedError)
    })

    it('rejects user without share or ownership', async () => {
      const { service } = createService()
      await expect(service.checkWriteAccess(vaultId, noAccessUserId)).rejects.toThrow(VaultAccessDeniedError)
    })

    it('throws VaultNotFoundError for non-existent vault', async () => {
      const { service } = createService()
      await expect(service.checkWriteAccess('non-existent', ownerId)).rejects.toThrow(VaultNotFoundError)
    })
  })

  describe('createShare', () => {
    it('creates a share with read permission', async () => {
      const { service, shareRegistry } = createService()
      await service.createShare(vaultId, ownerId, readUserId, 'read')

      const shares = await shareRegistry.getSharesForVault(vaultId)
      expect(shares).toHaveLength(1)
      expect(shares[0]?.permission).toBe('read')
      expect(shares[0]?.userId).toBe(readUserId)
      expect(shares[0]?.grantedBy).toBe(ownerId)
    })

    it('creates a share with write permission', async () => {
      const { service, shareRegistry } = createService()
      await service.createShare(vaultId, ownerId, writeUserId, 'write')

      const shares = await shareRegistry.getSharesForVault(vaultId)
      expect(shares).toHaveLength(1)
      expect(shares[0]?.permission).toBe('write')
      expect(shares[0]?.userId).toBe(writeUserId)
    })

    it('rejects sharing with self', async () => {
      const { service } = createService()
      await expect(
        service.createShare(vaultId, ownerId, ownerId, 'read'),
      ).rejects.toThrow(InvalidShareTargetError)

      try {
        await service.createShare(vaultId, ownerId, ownerId, 'read')
      } catch (error) {
        expect(error).toBeInstanceOf(InvalidShareTargetError)
        expect((error as InvalidShareTargetError).code).toBe('SELF_SHARE')
      }
    })

    it('rejects sharing with non-existent user', async () => {
      const { service } = createService()
      await expect(
        service.createShare(vaultId, ownerId, 'non-existent-user', 'read'),
      ).rejects.toThrow(InvalidShareTargetError)

      try {
        await service.createShare(vaultId, ownerId, 'non-existent-user', 'read')
      } catch (error) {
        expect(error).toBeInstanceOf(InvalidShareTargetError)
        expect((error as InvalidShareTargetError).code).toBe('USER_NOT_FOUND')
      }
    })

    it('enforces max 20 shares per vault', async () => {
      // Create 20 existing shares
      const users: UserRecord[] = [createTestUser(ownerId, 'owner')]
      const existingShares: VaultShareEntry[] = []

      for (let i = 0; i < MAX_SHARES_PER_VAULT; i++) {
        const userId = `user-${i.toString().padStart(3, '0')}`
        users.push(createTestUser(userId, `user${i}`))
        existingShares.push(createTestShare(vaultId, userId, 'read', ownerId))
      }

      // Add one more user who will be the target
      const targetUserId = 'user-target'
      users.push(createTestUser(targetUserId, 'target'))

      const { service } = createService({
        shares: existingShares,
        users,
      })

      await expect(
        service.createShare(vaultId, ownerId, targetUserId, 'read'),
      ).rejects.toThrow(ShareLimitError)
    })

    it('throws VaultNotFoundError for non-existent vault', async () => {
      const { service } = createService()
      await expect(
        service.createShare('non-existent', ownerId, readUserId, 'read'),
      ).rejects.toThrow(VaultNotFoundError)
    })
  })

  describe('revokeShare', () => {
    it('removes an existing share', async () => {
      const { service, shareRegistry } = createService({
        shares: [createTestShare(vaultId, readUserId, 'read', ownerId)],
      })

      await service.revokeShare(vaultId, ownerId, readUserId)

      const shares = await shareRegistry.getSharesForVault(vaultId)
      expect(shares).toHaveLength(0)
    })

    it('throws VaultNotFoundError for non-existent vault', async () => {
      const { service } = createService()
      await expect(
        service.revokeShare('non-existent', ownerId, readUserId),
      ).rejects.toThrow(VaultNotFoundError)
    })
  })

  describe('updateSharePermission', () => {
    it('updates permission from read to write', async () => {
      const { service, shareRegistry } = createService({
        shares: [createTestShare(vaultId, readUserId, 'read', ownerId)],
      })

      await service.updateSharePermission(vaultId, ownerId, readUserId, 'write')

      const shares = await shareRegistry.getSharesForVault(vaultId)
      expect(shares[0]?.permission).toBe('write')
    })

    it('updates permission from write to read', async () => {
      const { service, shareRegistry } = createService({
        shares: [createTestShare(vaultId, writeUserId, 'write', ownerId)],
      })

      await service.updateSharePermission(vaultId, ownerId, writeUserId, 'read')

      const shares = await shareRegistry.getSharesForVault(vaultId)
      expect(shares[0]?.permission).toBe('read')
    })

    it('throws VaultNotFoundError for non-existent vault', async () => {
      const { service } = createService()
      await expect(
        service.updateSharePermission('non-existent', ownerId, readUserId, 'write'),
      ).rejects.toThrow(VaultNotFoundError)
    })
  })
})
