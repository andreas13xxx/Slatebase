import { describe, it, expect } from 'vitest'
import path from 'node:path'
import fs from 'node:fs/promises'
import {
  VaultService,
  VaultNotFoundError,
  VaultHasActiveSharesError,
  SharesNotRevokedError,
  StorageError,
  VaultValidationError,
} from './index.js'
import type { IVaultManager, IVaultReader, Vault, DirectoryTree, FileContent } from '../vault/index.js'
import type { IConfigService, ServerConfig, VaultConfig } from '../config/index.js'
import type { ILogger } from '../logger/index.js'
import type { IVaultRegistry, IVaultShareRegistry, VaultRegistryEntry, VaultShareEntry } from '../vault/registry.js'
import type { IUserRepository, UserRecord, UserRole, PaginationOptions, PaginatedResult } from '../user/index.js'

// --- Test Helpers ---

function createMockLogger(): ILogger {
  return {
    debug(_message: string, _meta?: object) {},
    info(_message: string, _meta?: object) {},
    warn(_message: string, _meta?: object) {},
    error(_message: string, _meta?: object) {},
  }
}

function createMockConfigService(overrides?: Partial<ServerConfig>): IConfigService {
  const config: ServerConfig = {
    port: 3000,
    host: '127.0.0.1',
    logLevel: 'info',
    vaults: [{ path: '/test/vault' }],
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
    trash: { retentionDays: 30 },
    versions: { maxPerFile: 20 },
    cleanup: { intervalHours: 24 },
    templates: { directory: '_templates' },
    upload: { maxFileSizeBytes: 104857600, maxFilesPerDrop: 50, maxImagePasteSize: 10485760 },
    welcomeVault: { name: 'Willkommen' },
    ...overrides,
  }
  return {
    getServerConfig: () => config,
    getVaultConfigs: () => config.vaults,
    getFeaturesConfig: () => config.features,
    getSseConfig: () => config.sse,
    getTrashConfig: () => config.trash,
    getVersionsConfig: () => config.versions,
    getCleanupConfig: () => config.cleanup,
    getTemplatesConfig: () => config.templates,
    getUploadConfig: () => config.upload,
    getWelcomeVaultConfig: () => config.welcomeVault,
  }
}

function createMockTree(): DirectoryTree {
  return {
    name: 'vault',
    type: 'directory',
    path: '',
    children: [],
    itemCount: 0,
  }
}

function createMockVault(id: string, name: string, vaultPath: string): Vault {
  return {
    info: { id, name, path: vaultPath, status: 'loaded' },
    tree: createMockTree(),
  }
}

function createMockVaultManager(vaults: Vault[] = []): IVaultManager & { addedVaults: Vault[]; removedVaultIds: string[] } {
  const vaultMap = new Map(vaults.map(v => [v.info.id, v]))
  return {
    addedVaults: [],
    removedVaultIds: [],
    async loadVaults(_configs: VaultConfig[]) {},
    getVault(vaultId: string) {
      return vaultMap.get(vaultId) ?? null
    },
    getAllVaults() {
      return Array.from(vaultMap.values())
    },
    addVault(vault: Vault) {
      vaultMap.set(vault.info.id, vault)
      this.addedVaults.push(vault)
    },
    removeVault(vaultId: string) {
      vaultMap.delete(vaultId)
      this.removedVaultIds.push(vaultId)
    },
  }
}

function createMockVaultReader(): IVaultReader {
  return {
    async readDirectory(_absolutePath: string, _maxDepth: number): Promise<DirectoryTree> {
      return createMockTree()
    },
    async readFile(_absolutePath: string, _maxSize: number): Promise<FileContent> {
      return {
        path: 'test.md',
        name: 'test.md',
        content: '# Hello',
        size: 7,
        encoding: 'utf-8',
        isBinary: false,
        isTruncated: false,
        etag: 'abc123',
      }
    },
  }
}

function createMockRegistry(entries: VaultRegistryEntry[] = []): IVaultRegistry & {
  addedEntries: VaultRegistryEntry[]
  removedIds: string[]
  savedEntries: VaultRegistryEntry[][] 
} {
  let entryList = [...entries]
  return {
    addedEntries: [],
    removedIds: [],
    savedEntries: [],
    async load() {
      return [...entryList]
    },
    async save(newEntries: VaultRegistryEntry[]) {
      entryList = [...newEntries]
      this.savedEntries.push([...newEntries])
    },
    async addEntry(entry: VaultRegistryEntry) {
      entryList.push(entry)
      this.addedEntries.push(entry)
    },
    async removeEntry(vaultId: string) {
      entryList = entryList.filter(e => e.id !== vaultId)
      this.removedIds.push(vaultId)
    },
    findById(vaultId: string) {
      return entryList.find(e => e.id === vaultId) ?? null
    },
    findByName(name: string) {
      return entryList.find(e => e.name === name) ?? null
    },
  }
}

function createMockShareRegistry(shares: VaultShareEntry[] = []): IVaultShareRegistry & {
  removedShares: Array<{ vaultId: string; userId: string }>
  removedAllForVault: string[]
} {
  let shareList = [...shares]
  return {
    removedShares: [],
    removedAllForVault: [],
    async getSharesForVault(vaultId: string) {
      return shareList.filter(s => s.vaultId === vaultId)
    },
    async getSharesForUser(userId: string) {
      return shareList.filter(s => s.userId === userId)
    },
    async addShare(share: VaultShareEntry) {
      shareList.push(share)
    },
    async removeShare(vaultId: string, userId: string) {
      shareList = shareList.filter(s => !(s.vaultId === vaultId && s.userId === userId))
      this.removedShares.push({ vaultId, userId })
    },
    async removeAllSharesForVault(vaultId: string) {
      shareList = shareList.filter(s => s.vaultId !== vaultId)
      this.removedAllForVault.push(vaultId)
    },
    async updatePermission(vaultId: string, userId: string, permission: 'read' | 'write') {
      const share = shareList.find(s => s.vaultId === vaultId && s.userId === userId)
      if (share) {
        share.permission = permission
      }
    },
  }
}

function createMockUserRepository(users: UserRecord[] = []): IUserRepository {
  return {
    async findById(userId: string) {
      return users.find(u => u.userId === userId) ?? null
    },
    async findByUsername(username: string) {
      return users.find(u => u.username === username) ?? null
    },
    async searchByUsernamePrefix(prefix: string, limit: number = 10) {
      return users.filter(u => u.username.toLowerCase().startsWith(prefix.toLowerCase())).slice(0, limit)
    },
    async findAll(_options?: PaginationOptions): Promise<PaginatedResult<UserRecord>> {
      return { items: users, total: users.length, page: 1, pageSize: 100, totalPages: 1 }
    },
    async save(_user: UserRecord) {},
    async delete(_userId: string) {},
    async count() { return users.length },
    async countByRole(_role: UserRole) { return users.length },
  }
}

function createTestUser(userId: string, username: string): UserRecord {
  return {
    userId,
    username,
    passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$hash',
    role: 'user',
    displayName: username,
    email: `${username}@test.com`,
    avatarUrl: '',
    preferredLanguage: 'en',
    colorScheme: 'system',
    suspended: false,
    mustChangePassword: false,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  }
}

function createTestShare(vaultId: string, userId: string, permission: 'read' | 'write' = 'read'): VaultShareEntry {
  return {
    vaultId,
    userId,
    permission,
    grantedBy: 'owner-123',
    grantedAt: '2025-01-01T00:00:00.000Z',
  }
}

// --- Tests ---

describe('VaultService — deleteVaultWithChecks', () => {
  const vaultId = 'abc123def456'
  const ownerId = 'owner-123'

  function createServiceWithDeps(options: {
    vaults?: Vault[]
    registryEntries?: VaultRegistryEntry[]
    shares?: VaultShareEntry[]
  } = {}) {
    const tmpDir = path.join(process.env['TEMP'] || '/tmp', `slatebase-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    const vaultDir = path.join(tmpDir, 'vault')

    const vaults = options.vaults ?? [createMockVault(vaultId, 'Test Vault', vaultDir)]
    const registryEntries = options.registryEntries ?? [
      { id: vaultId, name: 'Test Vault', storagePath: vaultDir, createdAt: '2025-01-01T00:00:00.000Z', ownerId },
    ]

    const vaultManager = createMockVaultManager(vaults)
    const vaultReader = createMockVaultReader()
    const configService = createMockConfigService({ dataDir: tmpDir })
    const logger = createMockLogger()
    const registry = createMockRegistry(registryEntries)
    const shareRegistry = createMockShareRegistry(options.shares ?? [])
    const userRepository = createMockUserRepository()

    const service = new VaultService(
      vaultManager, vaultReader, configService, logger,
      registry, shareRegistry, userRepository,
    )

    return { service, vaultManager, registry, shareRegistry, vaultDir, tmpDir }
  }

  it('throws StorageError when registry is not configured', async () => {
    const vaultManager = createMockVaultManager([createMockVault(vaultId, 'Test', '/path')])
    const service = new VaultService(
      vaultManager, createMockVaultReader(), createMockConfigService(), createMockLogger(),
    )

    await expect(service.deleteVaultWithChecks(vaultId, ownerId))
      .rejects.toThrow(StorageError)
  })

  it('throws StorageError when share registry is not configured', async () => {
    const vaultManager = createMockVaultManager([createMockVault(vaultId, 'Test', '/path')])
    const registry = createMockRegistry([
      { id: vaultId, name: 'Test', storagePath: '/path', createdAt: '2025-01-01T00:00:00.000Z', ownerId },
    ])
    const service = new VaultService(
      vaultManager, createMockVaultReader(), createMockConfigService(), createMockLogger(),
      registry,
    )

    await expect(service.deleteVaultWithChecks(vaultId, ownerId))
      .rejects.toThrow(StorageError)
  })

  it('throws VaultNotFoundError when vault does not exist', async () => {
    const { service } = createServiceWithDeps({ vaults: [] })

    await expect(service.deleteVaultWithChecks('nonexistent', ownerId))
      .rejects.toThrow(VaultNotFoundError)
  })

  it('throws VaultNotFoundError when caller is not the owner', async () => {
    const { service } = createServiceWithDeps()

    await expect(service.deleteVaultWithChecks(vaultId, 'not-the-owner'))
      .rejects.toThrow(VaultNotFoundError)
  })

  it('throws VaultHasActiveSharesError when vault has shares and force=false', async () => {
    const shares = [
      createTestShare(vaultId, 'user-1', 'read'),
      createTestShare(vaultId, 'user-2', 'write'),
    ]
    const { service } = createServiceWithDeps({ shares })

    try {
      await service.deleteVaultWithChecks(vaultId, ownerId, false)
      expect.fail('Should have thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(VaultHasActiveSharesError)
      const err = error as VaultHasActiveSharesError
      expect(err.vaultId).toBe(vaultId)
      expect(err.activeShares).toHaveLength(2)
      expect(err.activeShares[0]!.userId).toBe('user-1')
      expect(err.activeShares[1]!.userId).toBe('user-2')
    }
  })

  it('throws VaultHasActiveSharesError when vault has shares and force is undefined (default)', async () => {
    const shares = [createTestShare(vaultId, 'user-1', 'read')]
    const { service } = createServiceWithDeps({ shares })

    await expect(service.deleteVaultWithChecks(vaultId, ownerId))
      .rejects.toThrow(VaultHasActiveSharesError)
  })

  it('revokes all shares and deletes vault when force=true', async () => {
    const shares = [
      createTestShare(vaultId, 'user-1', 'read'),
      createTestShare(vaultId, 'user-2', 'write'),
    ]
    const { service, shareRegistry, vaultManager, registry, vaultDir } = createServiceWithDeps({ shares })

    // Create the vault directory so deleteVault can remove it
    await fs.mkdir(vaultDir, { recursive: true })

    await service.deleteVaultWithChecks(vaultId, ownerId, true)

    // Shares should have been revoked
    expect(shareRegistry.removedAllForVault).toContain(vaultId)
    // Vault should have been deleted from manager
    expect(vaultManager.removedVaultIds).toContain(vaultId)
    // Vault should have been removed from registry
    expect(registry.removedIds).toContain(vaultId)
  })

  it('deletes vault without shares when force=false', async () => {
    const { service, vaultManager, registry, vaultDir } = createServiceWithDeps({ shares: [] })

    // Create the vault directory so deleteVault can remove it
    await fs.mkdir(vaultDir, { recursive: true })

    await service.deleteVaultWithChecks(vaultId, ownerId, false)

    // Vault should have been deleted
    expect(vaultManager.removedVaultIds).toContain(vaultId)
    expect(registry.removedIds).toContain(vaultId)
  })

  it('deletes vault without shares when force=true', async () => {
    const { service, vaultManager, registry, shareRegistry, vaultDir } = createServiceWithDeps({ shares: [] })

    await fs.mkdir(vaultDir, { recursive: true })

    await service.deleteVaultWithChecks(vaultId, ownerId, true)

    // No shares to revoke
    expect(shareRegistry.removedAllForVault).toHaveLength(0)
    // Vault should have been deleted
    expect(vaultManager.removedVaultIds).toContain(vaultId)
    expect(registry.removedIds).toContain(vaultId)
  })
})

describe('VaultService — transferOwnership', () => {
  const vaultId = 'abc123def456'
  const currentOwnerId = 'owner-123'
  const newOwnerId = 'new-owner-456'

  function createServiceWithDeps(options: {
    vaults?: Vault[]
    registryEntries?: VaultRegistryEntry[]
    shares?: VaultShareEntry[]
    users?: UserRecord[]
  } = {}) {
    const vaultDir = '/test/vault/path'
    const vaults = options.vaults ?? [createMockVault(vaultId, 'Test Vault', vaultDir)]
    const registryEntries = options.registryEntries ?? [
      { id: vaultId, name: 'Test Vault', storagePath: vaultDir, createdAt: '2025-01-01T00:00:00.000Z', ownerId: currentOwnerId },
    ]
    const users = options.users ?? [
      createTestUser(currentOwnerId, 'current-owner'),
      createTestUser(newOwnerId, 'new-owner'),
    ]

    const vaultManager = createMockVaultManager(vaults)
    const vaultReader = createMockVaultReader()
    const configService = createMockConfigService()
    const logger = createMockLogger()
    const registry = createMockRegistry(registryEntries)
    const shareRegistry = createMockShareRegistry(options.shares ?? [])
    const userRepository = createMockUserRepository(users)

    const service = new VaultService(
      vaultManager, vaultReader, configService, logger,
      registry, shareRegistry, userRepository,
    )

    return { service, vaultManager, registry, shareRegistry }
  }

  it('throws StorageError when registry is not configured', async () => {
    const service = new VaultService(
      createMockVaultManager(), createMockVaultReader(), createMockConfigService(), createMockLogger(),
    )

    await expect(service.transferOwnership(vaultId, currentOwnerId, newOwnerId))
      .rejects.toThrow(StorageError)
  })

  it('throws StorageError when share registry is not configured', async () => {
    const registry = createMockRegistry([
      { id: vaultId, name: 'Test', storagePath: '/path', createdAt: '2025-01-01T00:00:00.000Z', ownerId: currentOwnerId },
    ])
    const service = new VaultService(
      createMockVaultManager([createMockVault(vaultId, 'Test', '/path')]),
      createMockVaultReader(), createMockConfigService(), createMockLogger(),
      registry,
    )

    await expect(service.transferOwnership(vaultId, currentOwnerId, newOwnerId))
      .rejects.toThrow(StorageError)
  })

  it('throws StorageError when user repository is not configured', async () => {
    const registry = createMockRegistry([
      { id: vaultId, name: 'Test', storagePath: '/path', createdAt: '2025-01-01T00:00:00.000Z', ownerId: currentOwnerId },
    ])
    const shareRegistry = createMockShareRegistry()
    const service = new VaultService(
      createMockVaultManager([createMockVault(vaultId, 'Test', '/path')]),
      createMockVaultReader(), createMockConfigService(), createMockLogger(),
      registry, shareRegistry,
    )

    await expect(service.transferOwnership(vaultId, currentOwnerId, newOwnerId))
      .rejects.toThrow(StorageError)
  })

  it('throws VaultNotFoundError when vault does not exist', async () => {
    const { service } = createServiceWithDeps({ vaults: [] })

    await expect(service.transferOwnership('nonexistent', currentOwnerId, newOwnerId))
      .rejects.toThrow(VaultNotFoundError)
  })

  it('throws VaultNotFoundError when caller is not the current owner', async () => {
    const { service } = createServiceWithDeps()

    await expect(service.transferOwnership(vaultId, 'not-the-owner', newOwnerId))
      .rejects.toThrow(VaultNotFoundError)
  })

  it('throws VaultValidationError when new owner does not exist', async () => {
    const { service } = createServiceWithDeps({ users: [createTestUser(currentOwnerId, 'owner')] })

    try {
      await service.transferOwnership(vaultId, currentOwnerId, 'nonexistent-user')
      expect.fail('Should have thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(VaultValidationError)
      expect((error as VaultValidationError).code).toBe('USER_NOT_FOUND')
    }
  })

  it('throws SharesNotRevokedError when other shares exist besides new owner', async () => {
    const shares = [
      createTestShare(vaultId, newOwnerId, 'write'),
      createTestShare(vaultId, 'other-user-789', 'read'),
    ]
    const users = [
      createTestUser(currentOwnerId, 'owner'),
      createTestUser(newOwnerId, 'new-owner'),
      createTestUser('other-user-789', 'other'),
    ]
    const { service } = createServiceWithDeps({ shares, users })

    try {
      await service.transferOwnership(vaultId, currentOwnerId, newOwnerId)
      expect.fail('Should have thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(SharesNotRevokedError)
      const err = error as SharesNotRevokedError
      expect(err.vaultId).toBe(vaultId)
      expect(err.remainingShares).toHaveLength(1)
      expect(err.remainingShares[0]!.userId).toBe('other-user-789')
    }
  })

  it('transfers ownership when no other shares exist', async () => {
    const { service, registry } = createServiceWithDeps({ shares: [] })

    await service.transferOwnership(vaultId, currentOwnerId, newOwnerId)

    // Registry should have been saved with updated ownerId
    expect(registry.savedEntries).toHaveLength(1)
    const savedEntry = registry.savedEntries[0]!.find(e => e.id === vaultId)
    expect(savedEntry).toBeDefined()
    expect(savedEntry!.ownerId).toBe(newOwnerId)
  })

  it('transfers ownership when only new owner has a share (removes their share)', async () => {
    const shares = [createTestShare(vaultId, newOwnerId, 'write')]
    const { service, registry, shareRegistry } = createServiceWithDeps({ shares })

    await service.transferOwnership(vaultId, currentOwnerId, newOwnerId)

    // Registry should have been saved with updated ownerId
    expect(registry.savedEntries).toHaveLength(1)
    const savedEntry = registry.savedEntries[0]!.find(e => e.id === vaultId)
    expect(savedEntry!.ownerId).toBe(newOwnerId)

    // New owner's share should have been removed (they are now the owner)
    expect(shareRegistry.removedShares).toContainEqual({ vaultId, userId: newOwnerId })
  })

  it('revokes old owner access after transfer', async () => {
    const { service, shareRegistry } = createServiceWithDeps({ shares: [] })

    await service.transferOwnership(vaultId, currentOwnerId, newOwnerId)

    // Old owner's access should be revoked
    expect(shareRegistry.removedShares).toContainEqual({ vaultId, userId: currentOwnerId })
  })
})

describe('VaultHasActiveSharesError', () => {
  it('has correct name, message, and properties', () => {
    const shares: VaultShareEntry[] = [
      { vaultId: 'v1', userId: 'u1', permission: 'read', grantedBy: 'owner', grantedAt: '2025-01-01T00:00:00.000Z' },
    ]
    const error = new VaultHasActiveSharesError('v1', shares)

    expect(error.name).toBe('VaultHasActiveSharesError')
    expect(error.vaultId).toBe('v1')
    expect(error.activeShares).toEqual(shares)
    expect(error.message).toContain('v1')
    expect(error.message).toContain('1 active share')
    expect(error).toBeInstanceOf(Error)
  })
})

describe('SharesNotRevokedError', () => {
  it('has correct name, message, and properties', () => {
    const shares: VaultShareEntry[] = [
      { vaultId: 'v1', userId: 'u1', permission: 'read', grantedBy: 'owner', grantedAt: '2025-01-01T00:00:00.000Z' },
      { vaultId: 'v1', userId: 'u2', permission: 'write', grantedBy: 'owner', grantedAt: '2025-01-01T00:00:00.000Z' },
    ]
    const error = new SharesNotRevokedError('v1', shares)

    expect(error.name).toBe('SharesNotRevokedError')
    expect(error.vaultId).toBe('v1')
    expect(error.remainingShares).toEqual(shares)
    expect(error.message).toContain('v1')
    expect(error.message).toContain('2 share(s)')
    expect(error).toBeInstanceOf(Error)
  })
})
