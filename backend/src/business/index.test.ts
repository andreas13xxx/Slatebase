import { describe, it, expect } from 'vitest'
import path from 'node:path'
import fs from 'node:fs/promises'
import os from 'node:os'
import { VaultService, VaultNotFoundError, VaultValidationError, StorageError, ConflictError, FileConflictError, InvalidMoveError, FileTooLargeError } from './index'
import type { IVaultService } from './index'
import type { IVaultManager, IVaultReader, Vault, DirectoryTree, FileContent } from '../vault/index'
import { PathTraversalError, clearVaultRootRealPathCache, computeEtag } from '../vault/index'
import type { IConfigService, ServerConfig, VaultConfig } from '../config/index'
import type { ILogger } from '../logger/index'
import type { IVaultRegistry, VaultRegistryEntry } from '../vault/registry'

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
    features: {},
    mcp: { maxFileSize: 16777216, rateLimit: 60 },
    sse: { maxConnections: 1000, maxPerUser: 3, heartbeatInterval: 30000, replayBufferSize: 100, replayTtl: 300000, batchWindow: 100, batchMax: 20 },
    trash: { retentionDays: 30 },
    versions: { maxPerFile: 20 },
    cleanup: { intervalHours: 24 },
    templates: { directory: 'Templates' },
    upload: { maxFileSizeBytes: 104857600, maxFilesPerDrop: 50, maxImagePasteSize: 10485760 },
    welcomeVault: { name: { de: 'Willkommen', en: 'Welcome' } },
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
    getOverrides: () => ({}),
    updateOverrides: async () => [],
  }
}

function createMockTree(): DirectoryTree {
  return {
    name: 'vault',
    type: 'directory',
    path: '',
    children: [
      { name: 'notes', type: 'directory', path: 'notes', children: [], itemCount: 0 },
      { name: 'readme.md', type: 'file', path: 'readme.md', size: 100 },
    ],
    itemCount: 2,
  }
}

function createMockVault(id: string, name: string, vaultPath: string): Vault {
  return {
    info: {
      id,
      name,
      path: vaultPath,
      status: 'loaded',
    },
    tree: createMockTree(),
  }
}

function createMockVaultManager(vaults: Vault[] = []): IVaultManager & { loadVaultsCalled: boolean; loadVaultsConfigs: VaultConfig[]; addedVaults: Vault[]; removedVaultIds: string[] } {
  const vaultMap = new Map(vaults.map(v => [v.info.id, v]))
  return {
    loadVaultsCalled: false,
    loadVaultsConfigs: [],
    addedVaults: [],
    removedVaultIds: [],
    async loadVaults(configs: VaultConfig[]) {
      this.loadVaultsCalled = true
      this.loadVaultsConfigs = configs
    },
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

function createMockVaultReader(fileContent?: FileContent): IVaultReader {
  return {
    async readDirectory(_absolutePath: string, _maxDepth: number): Promise<DirectoryTree> {
      return createMockTree()
    },
    async readFile(_absolutePath: string, _maxSize: number): Promise<FileContent> {
      return fileContent ?? {
        path: 'test.md',
        name: 'test.md',
        content: '# Hello',
        size: 7,
        encoding: 'utf-8',
        isBinary: false,
        isTruncated: false,
        etag: '0000000000000000',
      }
    },
  }
}

function createMockRegistry(entries: VaultRegistryEntry[] = []): IVaultRegistry & { addedEntries: VaultRegistryEntry[]; removedIds: string[]; shouldFailOnAdd: boolean; shouldFailOnRemove: boolean } {
  const entryList = [...entries]
  return {
    addedEntries: [],
    removedIds: [],
    shouldFailOnAdd: false,
    shouldFailOnRemove: false,
    async load() {
      return [...entryList]
    },
    async save(_entries: VaultRegistryEntry[]) {
      // no-op for mock
    },
    async addEntry(entry: VaultRegistryEntry) {
      if (this.shouldFailOnAdd) {
        throw new Error('Registry write failed')
      }
      entryList.push(entry)
      this.addedEntries.push(entry)
    },
    async removeEntry(vaultId: string) {
      if (this.shouldFailOnRemove) {
        throw new Error('Registry remove failed')
      }
      const idx = entryList.findIndex(e => e.id === vaultId)
      if (idx >= 0) entryList.splice(idx, 1)
      this.removedIds.push(vaultId)
    },
    findById(vaultId: string) {
      return entryList.find(e => e.id === vaultId) ?? null
    },
    findByName(name: string) {
      return entryList.find(e => e.name === name) ?? null
    },
    async updateEntries<T>(mutator: (entries: VaultRegistryEntry[]) => T): Promise<T> {
      return mutator(entryList)
    },
  }
}

// --- Tests ---

describe('VaultService', () => {
  describe('initializeVaults', () => {
    it('falls back to static config when no registry is configured', async () => {
      const vaultConfigs: VaultConfig[] = [
        { path: '/vault/one' },
        { path: '/vault/two', name: 'Custom' },
      ]
      const configService = createMockConfigService({ vaults: vaultConfigs })
      const vaultManager = createMockVaultManager()
      const vaultReader = createMockVaultReader()
      const logger = createMockLogger()

      const service: IVaultService = new VaultService(vaultManager, vaultReader, configService, logger)
      await service.initializeVaults()

      expect(vaultManager.loadVaultsCalled).toBe(true)
      expect(vaultManager.loadVaultsConfigs).toEqual(vaultConfigs)
    })

    it('loads vaults from registry when registry is configured', async () => {
      const tmpDir = path.join(process.env['TEMP'] || '/tmp', `slatebase-init-test-${Date.now()}`)
      const vaultDir = path.join(tmpDir, 'vaults', 'abc123def456')
      await fs.mkdir(vaultDir, { recursive: true })
      await fs.writeFile(path.join(vaultDir, 'note.md'), '# Hello')

      const entries: VaultRegistryEntry[] = [
        { id: 'abc123def456', name: 'My Vault', storagePath: vaultDir, createdAt: '2025-01-15T10:00:00.000Z' },
      ]
      const registry = createMockRegistry(entries)
      const vaultManager = createMockVaultManager()
      const configService = createMockConfigService()
      const vaultReader = createMockVaultReader()
      const logger = createMockLogger()

      const service = new VaultService(vaultManager, vaultReader, configService, logger, registry)
      await service.initializeVaults()

      // Should NOT fall back to static config
      expect(vaultManager.loadVaultsCalled).toBe(false)
      // Should add vault to manager
      expect(vaultManager.addedVaults).toHaveLength(1)
      expect(vaultManager.addedVaults[0]!.info.id).toBe('abc123def456')
      expect(vaultManager.addedVaults[0]!.info.name).toBe('My Vault')
      expect(vaultManager.addedVaults[0]!.info.path).toBe(vaultDir)
      expect(vaultManager.addedVaults[0]!.info.status).toBe('loaded')

      await fs.rm(tmpDir, { recursive: true, force: true })
    })

    it('skips vaults with missing storage directories and logs a warning', async () => {
      const entries: VaultRegistryEntry[] = [
        { id: 'missing123ab', name: 'Missing Vault', storagePath: '/nonexistent/path/that/does/not/exist', createdAt: '2025-01-15T10:00:00.000Z' },
      ]
      const registry = createMockRegistry(entries)
      const vaultManager = createMockVaultManager()
      const configService = createMockConfigService()
      const vaultReader = createMockVaultReader()
      const warnings: { message: string; meta?: object | undefined }[] = []
      const logger: ILogger = {
        debug() {},
        info() {},
        warn(message: string, meta?: object) { warnings.push(meta ? { message, meta } : { message }) },
        error() {},
      }

      const service = new VaultService(vaultManager, vaultReader, configService, logger, registry)
      await service.initializeVaults()

      // Should not add vault to manager
      expect(vaultManager.addedVaults).toHaveLength(0)
      // Should log a warning about missing storage directory
      const storageWarning = warnings.find((w) => w.message.includes('not found'))
      expect(storageWarning).toBeDefined()
    })

    it('loads valid vaults and skips missing ones in a mixed registry', async () => {
      const tmpDir = path.join(process.env['TEMP'] || '/tmp', `slatebase-init-test-${Date.now()}`)
      const validDir = path.join(tmpDir, 'vaults', 'valid123abcd')
      await fs.mkdir(validDir, { recursive: true })

      const entries: VaultRegistryEntry[] = [
        { id: 'valid123abcd', name: 'Valid Vault', storagePath: validDir, createdAt: '2025-01-15T10:00:00.000Z' },
        { id: 'missing12345', name: 'Missing Vault', storagePath: '/nonexistent/path', createdAt: '2025-01-15T11:00:00.000Z' },
      ]
      const registry = createMockRegistry(entries)
      const vaultManager = createMockVaultManager()
      const configService = createMockConfigService()
      const vaultReader = createMockVaultReader()
      const warnings: string[] = []
      const logger: ILogger = {
        debug() {},
        info() {},
        warn(message: string) { warnings.push(message) },
        error() {},
      }

      const service = new VaultService(vaultManager, vaultReader, configService, logger, registry)
      await service.initializeVaults()

      // Only valid vault should be added
      expect(vaultManager.addedVaults).toHaveLength(1)
      expect(vaultManager.addedVaults[0]!.info.id).toBe('valid123abcd')
      // Warning should be logged for missing vault
      expect(warnings.length).toBeGreaterThan(0)

      await fs.rm(tmpDir, { recursive: true, force: true })
    })

    it('handles empty registry gracefully', async () => {
      const registry = createMockRegistry([])
      const vaultManager = createMockVaultManager()
      const configService = createMockConfigService()
      const vaultReader = createMockVaultReader()
      const logger = createMockLogger()

      const service = new VaultService(vaultManager, vaultReader, configService, logger, registry)
      await service.initializeVaults()

      // Should not fall back to static config
      expect(vaultManager.loadVaultsCalled).toBe(false)
      // Should not add any vaults
      expect(vaultManager.addedVaults).toHaveLength(0)
    })
  })

  describe('getVaultList', () => {
    it('returns VaultInfo[] from all loaded vaults', async () => {
      const vault1 = createMockVault('abc123def456', 'Vault One', '/path/one')
      const vault2 = createMockVault('789xyz012abc', 'Vault Two', '/path/two')
      const vaultManager = createMockVaultManager([vault1, vault2])
      const configService = createMockConfigService()
      const vaultReader = createMockVaultReader()
      const logger = createMockLogger()

      const service = new VaultService(vaultManager, vaultReader, configService, logger)
      const result = await service.getVaultList()

      expect(result).toHaveLength(2)
      expect(result[0]).toEqual(vault1.info)
      expect(result[1]).toEqual(vault2.info)
    })

    it('returns empty array when no vaults are loaded', async () => {
      const vaultManager = createMockVaultManager([])
      const configService = createMockConfigService()
      const vaultReader = createMockVaultReader()
      const logger = createMockLogger()

      const service = new VaultService(vaultManager, vaultReader, configService, logger)
      const result = await service.getVaultList()

      expect(result).toEqual([])
    })
  })

  describe('getVaultTree', () => {
    it('returns cached tree for a valid vaultId', async () => {
      const vault = createMockVault('abc123def456', 'Test Vault', '/test/vault')
      const vaultManager = createMockVaultManager([vault])
      const configService = createMockConfigService()
      const vaultReader = createMockVaultReader()
      const logger = createMockLogger()

      const service = new VaultService(vaultManager, vaultReader, configService, logger)
      const tree = await service.getVaultTree('abc123def456')

      expect(tree.name).toBe('vault')
      expect(tree.children).toHaveLength(2)
    })

    it('throws VaultNotFoundError for unknown vaultId', () => {
      const vaultManager = createMockVaultManager([])
      const configService = createMockConfigService()
      const vaultReader = createMockVaultReader()
      const logger = createMockLogger()

      const service = new VaultService(vaultManager, vaultReader, configService, logger)

      expect(() => service.getVaultTree('nonexistent')).toThrow(VaultNotFoundError)
      expect(() => service.getVaultTree('nonexistent')).toThrow('Vault not found: nonexistent')
    })
  })

  describe('getFileContent', () => {
    it('returns file content for a valid vault and file path', async () => {
      const vaultPath = path.resolve('/test/vault')
      const vault = createMockVault('abc123def456', 'Test Vault', vaultPath)
      const vaultManager = createMockVaultManager([vault])
      const configService = createMockConfigService({ maxFileSize: 1024 })
      const expectedContent: FileContent = {
        path: 'notes/hello.md',
        name: 'hello.md',
        content: '# Hello World',
        size: 13,
        encoding: 'utf-8',
        isBinary: false,
        isTruncated: false,
        etag: '0000000000000000',
      }
      const vaultReader = createMockVaultReader(expectedContent)
      const logger = createMockLogger()

      const service = new VaultService(vaultManager, vaultReader, configService, logger)
      const result = await service.getFileContent('abc123def456', 'notes/hello.md')

      expect(result.content).toBe('# Hello World')
      expect(result.path).toBe('notes/hello.md')
      expect(result.isBinary).toBe(false)
      expect(result.isTruncated).toBe(false)
    })

    it('throws VaultNotFoundError for unknown vaultId', async () => {
      const vaultManager = createMockVaultManager([])
      const configService = createMockConfigService()
      const vaultReader = createMockVaultReader()
      const logger = createMockLogger()

      const service = new VaultService(vaultManager, vaultReader, configService, logger)

      await expect(service.getFileContent('nonexistent', 'file.md'))
        .rejects.toThrow(VaultNotFoundError)
    })

    it('propagates PathTraversalError from validateFilePath', async () => {
      const vaultPath = path.resolve('/test/vault')
      const vault = createMockVault('abc123def456', 'Test Vault', vaultPath)
      const vaultManager = createMockVaultManager([vault])
      const configService = createMockConfigService()
      const vaultReader = createMockVaultReader()
      const logger = createMockLogger()

      const service = new VaultService(vaultManager, vaultReader, configService, logger)

      await expect(service.getFileContent('abc123def456', '../etc/passwd'))
        .rejects.toThrow(PathTraversalError)
    })

    it('calls vaultReader.readFile with resolved path and maxFileSize from config', async () => {
      const vaultPath = path.resolve('/test/vault')
      const vault = createMockVault('abc123def456', 'Test Vault', vaultPath)
      const vaultManager = createMockVaultManager([vault])
      const configService = createMockConfigService({ maxFileSize: 2048 })

      let capturedPath: string | undefined
      let capturedMaxSize: number | undefined
      const vaultReader: IVaultReader = {
        async readDirectory(): Promise<DirectoryTree> {
          return createMockTree()
        },
        async readFile(absolutePath: string, maxSize: number): Promise<FileContent> {
          capturedPath = absolutePath
          capturedMaxSize = maxSize
          return {
            path: 'notes/test.md',
            name: 'test.md',
            content: 'content',
            size: 7,
            encoding: 'utf-8',
            isBinary: false,
            isTruncated: false,
            etag: '0000000000000000',
          }
        },
      }
      const logger = createMockLogger()

      const service = new VaultService(vaultManager, vaultReader, configService, logger)
      await service.getFileContent('abc123def456', 'notes/test.md')

      expect(capturedPath).toBe(path.join(vaultPath, 'notes', 'test.md'))
      expect(capturedMaxSize).toBe(2048)
    })

    it('overrides file path in result with the original relative path', async () => {
      const vaultPath = path.resolve('/test/vault')
      const vault = createMockVault('abc123def456', 'Test Vault', vaultPath)
      const vaultManager = createMockVaultManager([vault])
      const configService = createMockConfigService()
      const vaultReader = createMockVaultReader({
        path: 'will-be-overridden',
        name: 'test.md',
        content: 'content',
        size: 7,
        encoding: 'utf-8',
        isBinary: false,
        isTruncated: false,
        etag: '0000000000000000',
      })
      const logger = createMockLogger()

      const service = new VaultService(vaultManager, vaultReader, configService, logger)
      const result = await service.getFileContent('abc123def456', 'notes/test.md')

      expect(result.path).toBe('notes/test.md')
    })
  })

  describe('createVault', () => {
    it('throws StorageError when registry is not configured', async () => {
      const vaultManager = createMockVaultManager()
      const configService = createMockConfigService()
      const vaultReader = createMockVaultReader()
      const logger = createMockLogger()

      const service = new VaultService(vaultManager, vaultReader, configService, logger)

      await expect(service.createVault('My Vault', 'test-owner-id'))
        .rejects.toThrow(StorageError)
      await expect(service.createVault('My Vault', 'test-owner-id'))
        .rejects.toThrow('VaultRegistry is not configured')
    })

    it('rejects a create once the owner reached maxVaultsPerUser', async () => {
      const owned = Array.from({ length: 3 }, (_, i) => {
        const vault = createMockVault(`vault-${i}`, `Vault ${i}`, `/data/vault-${i}`)
        vault.info.ownerId = 'owner-a'
        return vault
      })
      const vaultManager = createMockVaultManager(owned)
      const configService = createMockConfigService({ maxVaultsPerUser: 3 })
      const service = new VaultService(
        vaultManager,
        createMockVaultReader(),
        configService,
        createMockLogger(),
        createMockRegistry(),
      )

      await expect(service.createVault('One More', 'owner-a'))
        .rejects.toThrow(VaultValidationError)
    })

    it('counts only the vaults the requesting user owns', async () => {
      // Someone else's vaults must not consume this user's allowance.
      const owned = Array.from({ length: 3 }, (_, i) => {
        const vault = createMockVault(`vault-${i}`, `Vault ${i}`, `/data/vault-${i}`)
        vault.info.ownerId = 'someone-else'
        return vault
      })
      const vaultManager = createMockVaultManager(owned)
      const configService = createMockConfigService({ maxVaultsPerUser: 3 })
      const service = new VaultService(
        vaultManager,
        createMockVaultReader(),
        configService,
        createMockLogger(),
        createMockRegistry(),
      )

      const created = await service.createVault('Mine', 'owner-a')

      expect(created.name).toBe('Mine')
    })

    it('throws VaultValidationError for empty name', async () => {
      const vaultManager = createMockVaultManager()
      const configService = createMockConfigService()
      const vaultReader = createMockVaultReader()
      const logger = createMockLogger()
      const registry = createMockRegistry()

      const service = new VaultService(vaultManager, vaultReader, configService, logger, registry)

      await expect(service.createVault('', 'test-owner-id'))
        .rejects.toThrow(VaultValidationError)
    })

    it('throws VaultValidationError for whitespace-only name', async () => {
      const vaultManager = createMockVaultManager()
      const configService = createMockConfigService()
      const vaultReader = createMockVaultReader()
      const logger = createMockLogger()
      const registry = createMockRegistry()

      const service = new VaultService(vaultManager, vaultReader, configService, logger, registry)

      await expect(service.createVault('   ', 'test-owner-id'))
        .rejects.toThrow(VaultValidationError)
    })

    it('throws VaultValidationError for name exceeding 128 characters', async () => {
      const vaultManager = createMockVaultManager()
      const configService = createMockConfigService()
      const vaultReader = createMockVaultReader()
      const logger = createMockLogger()
      const registry = createMockRegistry()

      const service = new VaultService(vaultManager, vaultReader, configService, logger, registry)

      const longName = 'a'.repeat(129)
      await expect(service.createVault(longName, 'test-owner-id'))
        .rejects.toThrow(VaultValidationError)
    })

    it('throws VaultValidationError with VAULT_NAME_CONFLICT for duplicate name', async () => {
      const existingVault = createMockVault('abc123def456', 'Existing Vault', '/path/existing')
      const vaultManager = createMockVaultManager([existingVault])
      const configService = createMockConfigService()
      const vaultReader = createMockVaultReader()
      const logger = createMockLogger()
      const registry = createMockRegistry()

      const service = new VaultService(vaultManager, vaultReader, configService, logger, registry)

      try {
        await service.createVault('Existing Vault', 'test-owner-id')
        expect.fail('Should have thrown')
      } catch (error) {
        expect(error).toBeInstanceOf(VaultValidationError)
        expect((error as VaultValidationError).code).toBe('VAULT_NAME_CONFLICT')
      }
    })

    it('creates vault directory, adds to registry, and loads into manager on success', async () => {
      const vaultManager = createMockVaultManager()
      const tmpDir = path.join(process.env['TEMP'] || '/tmp', `slatebase-test-${Date.now()}`)
      const configService = createMockConfigService({ dataDir: tmpDir })
      const vaultReader = createMockVaultReader()
      const logger = createMockLogger()
      const registry = createMockRegistry()

      const service = new VaultService(vaultManager, vaultReader, configService, logger, registry)

      const result = await service.createVault('Test Vault', 'test-owner-id')

      // Verify returned VaultInfo
      expect(result.id).toMatch(/^[0-9a-f]{12}$/)
      expect(result.name).toBe('Test Vault')
      expect(result.status).toBe('loaded')
      expect(result.path).toContain(result.id)

      // Verify directory was created
      const stat = await fs.stat(result.path)
      expect(stat.isDirectory()).toBe(true)

      // Verify registry entry was added
      expect(registry.addedEntries).toHaveLength(1)
      expect(registry.addedEntries[0]!.name).toBe('Test Vault')
      expect(registry.addedEntries[0]!.id).toBe(result.id)

      // Verify vault was added to manager
      expect(vaultManager.addedVaults).toHaveLength(1)
      expect(vaultManager.addedVaults[0]!.info.name).toBe('Test Vault')

      // Cleanup
      await fs.rm(tmpDir, { recursive: true, force: true })
    })

    it('does not add to registry when directory creation fails (atomicity)', async () => {
      const vaultManager = createMockVaultManager()
      // Use an invalid path that will fail on mkdir
      const configService = createMockConfigService({ dataDir: '\0invalid' })
      const vaultReader = createMockVaultReader()
      const logger = createMockLogger()
      const registry = createMockRegistry()

      const service = new VaultService(vaultManager, vaultReader, configService, logger, registry)

      await expect(service.createVault('Test Vault', 'test-owner-id'))
        .rejects.toThrow(StorageError)

      // Registry should not have been modified
      expect(registry.addedEntries).toHaveLength(0)
      // Manager should not have been modified
      expect(vaultManager.addedVaults).toHaveLength(0)
    })

    it('removes created directory when registry add fails (atomicity)', async () => {
      const vaultManager = createMockVaultManager()
      const tmpDir = path.join(process.env['TEMP'] || '/tmp', `slatebase-test-${Date.now()}`)
      const configService = createMockConfigService({ dataDir: tmpDir })
      const vaultReader = createMockVaultReader()
      const logger = createMockLogger()
      const registry = createMockRegistry()
      registry.shouldFailOnAdd = true

      const service = new VaultService(vaultManager, vaultReader, configService, logger, registry)

      await expect(service.createVault('Test Vault', 'test-owner-id'))
        .rejects.toThrow(StorageError)

      // The vault directory should have been cleaned up
      // The vaults subdirectory may still exist, but no vault-specific directory should remain
      try {
        const vaultsDir = path.join(tmpDir, 'vaults')
        const entries = await fs.readdir(vaultsDir)
        expect(entries).toHaveLength(0)
      } catch {
        // If vaults dir doesn't exist, that's also fine
      }

      // Manager should not have been modified
      expect(vaultManager.addedVaults).toHaveLength(0)

      // Cleanup
      await fs.rm(tmpDir, { recursive: true, force: true })
    })

    it('returns VaultInfo with correct id derived from storage path', async () => {
      const vaultManager = createMockVaultManager()
      const tmpDir = path.join(process.env['TEMP'] || '/tmp', `slatebase-test-${Date.now()}`)
      const configService = createMockConfigService({ dataDir: tmpDir })
      const vaultReader = createMockVaultReader()
      const logger = createMockLogger()
      const registry = createMockRegistry()

      const service = new VaultService(vaultManager, vaultReader, configService, logger, registry)

      const result = await service.createVault('ID Test', 'test-owner-id')

      // The ID should be a 12-char hex string (SHA-256 prefix)
      expect(result.id).toHaveLength(12)
      expect(result.id).toMatch(/^[0-9a-f]+$/)

      // Cleanup
      await fs.rm(tmpDir, { recursive: true, force: true })
    })
  })

  describe('deleteVault', () => {
    it('throws StorageError when registry is not configured', async () => {
      const vault = createMockVault('abc123def456', 'Test', '/path/test')
      const vaultManager = createMockVaultManager([vault])
      const configService = createMockConfigService()
      const vaultReader = createMockVaultReader()
      const logger = createMockLogger()

      const service = new VaultService(vaultManager, vaultReader, configService, logger)

      await expect(service.deleteVault('abc123def456'))
        .rejects.toThrow(StorageError)
    })

    it('throws VaultNotFoundError for non-existent vault', async () => {
      const vaultManager = createMockVaultManager()
      const configService = createMockConfigService()
      const vaultReader = createMockVaultReader()
      const logger = createMockLogger()
      const registry = createMockRegistry()

      const service = new VaultService(vaultManager, vaultReader, configService, logger, registry)

      await expect(service.deleteVault('nonexistent'))
        .rejects.toThrow(VaultNotFoundError)
    })

    it('removes directory, registry entry, and manager entry on success', async () => {
      const tmpDir = path.join(process.env['TEMP'] || '/tmp', `slatebase-test-${Date.now()}`)
      const vaultDir = path.join(tmpDir, 'vault-to-delete')
      await fs.mkdir(vaultDir, { recursive: true })
      await fs.writeFile(path.join(vaultDir, 'test.txt'), 'hello')

      const vault = createMockVault('abc123def456', 'Delete Me', vaultDir)
      const vaultManager = createMockVaultManager([vault])
      const configService = createMockConfigService()
      const vaultReader = createMockVaultReader()
      const logger = createMockLogger()
      const registry = createMockRegistry()

      const service = new VaultService(vaultManager, vaultReader, configService, logger, registry)

      await service.deleteVault('abc123def456')

      // Directory should be removed
      await expect(fs.access(vaultDir)).rejects.toThrow()

      // Registry entry should be removed
      expect(registry.removedIds).toContain('abc123def456')

      // Manager entry should be removed
      expect(vaultManager.removedVaultIds).toContain('abc123def456')

      // Cleanup
      await fs.rm(tmpDir, { recursive: true, force: true })
    })
  })

  describe('VaultNotFoundError', () => {
    it('has correct name and message', () => {
      const error = new VaultNotFoundError('abc123')
      expect(error.name).toBe('VaultNotFoundError')
      expect(error.message).toBe('Vault not found: abc123')
      expect(error.vaultId).toBe('abc123')
      expect(error).toBeInstanceOf(Error)
    })
  })

  describe('deleteVault', () => {
    it('throws VaultNotFoundError when vault does not exist', async () => {
      const vaultManager = createMockVaultManager([])
      const configService = createMockConfigService()
      const vaultReader = createMockVaultReader()
      const logger = createMockLogger()
      const registry = createMockRegistry()

      const service = new VaultService(vaultManager, vaultReader, configService, logger, registry)

      await expect(service.deleteVault('nonexistent')).rejects.toThrow(VaultNotFoundError)
      await expect(service.deleteVault('nonexistent')).rejects.toThrow('Vault not found: nonexistent')
    })

    it('throws StorageError when registry is not configured', async () => {
      const vaultManager = createMockVaultManager([])
      const configService = createMockConfigService()
      const vaultReader = createMockVaultReader()
      const logger = createMockLogger()

      const service = new VaultService(vaultManager, vaultReader, configService, logger)

      await expect(service.deleteVault('abc123')).rejects.toThrow(StorageError)
    })

    it('removes vault from registry and manager after successful directory removal', async () => {
      const fsModule = await import('node:fs/promises')
      const os = await import('node:os')
      const tmpDir = await fsModule.mkdtemp(path.join(os.default.tmpdir(), 'vault-test-'))
      const vaultDir = path.join(tmpDir, 'test-vault')
      await fsModule.mkdir(vaultDir, { recursive: true })
      // Create a file inside to verify recursive removal
      await fsModule.writeFile(path.join(vaultDir, 'test.md'), '# Test')

      const vault = createMockVault('abc123def456', 'Test Vault', vaultDir)
      const vaultManager = createMockVaultManager([vault])
      const configService = createMockConfigService()
      const vaultReader = createMockVaultReader()
      const logger = createMockLogger()
      const registry = createMockRegistry()

      const service = new VaultService(vaultManager, vaultReader, configService, logger, registry)
      await service.deleteVault('abc123def456')

      // Verify directory was removed
      await expect(fsModule.access(vaultDir)).rejects.toThrow()
      // Verify registry entry was removed
      expect(registry.removedIds).toContain('abc123def456')
      // Verify vault was removed from manager
      expect(vaultManager.removedVaultIds).toContain('abc123def456')

      // Cleanup
      try { await fsModule.rm(tmpDir, { recursive: true, force: true }) } catch { /* ignore cleanup errors */ }
    })

    it('removes vault from registry even when directory does not exist (force flag)', async () => {
      // fs.rm with force:true doesn't throw on non-existent paths
      const vault = createMockVault('abc123def456', 'Test Vault', '/nonexistent/path/that/should/not/exist')
      const vaultManager = createMockVaultManager([vault])
      const configService = createMockConfigService()
      const vaultReader = createMockVaultReader()
      const logger = createMockLogger()
      const registry = createMockRegistry()

      const service = new VaultService(vaultManager, vaultReader, configService, logger, registry)

      // fs.rm with force:true doesn't throw on non-existent paths, so this should succeed
      await service.deleteVault('abc123def456')
      expect(registry.removedIds).toContain('abc123def456')
      expect(vaultManager.removedVaultIds).toContain('abc123def456')
    })
  })

  describe('saveFile — ETag conflict detection', () => {
    it('returns etag in save result', async () => {
      const tmpDir = path.join(process.env['TEMP'] || '/tmp', `slatebase-etag-test-${Date.now()}`)
      const vaultDir = path.join(tmpDir, 'vault')
      await fs.mkdir(vaultDir, { recursive: true })

      const vault = createMockVault('abc123def456', 'Test Vault', vaultDir)
      const vaultManager = createMockVaultManager([vault])
      const configService = createMockConfigService()
      const vaultReader = createMockVaultReader()
      const logger = createMockLogger()

      const service = new VaultService(vaultManager, vaultReader, configService, logger)
      const result = await service.saveFile('abc123def456', 'test.md', '# Hello')

      expect(result.etag).toBeDefined()
      expect(result.etag).toHaveLength(16)
      expect(result.etag).toMatch(/^[0-9a-f]{16}$/)

      // Verify etag matches the content hash
      const expectedEtag = computeEtag(Buffer.from('# Hello', 'utf-8'))
      expect(result.etag).toBe(expectedEtag)

      await fs.rm(tmpDir, { recursive: true, force: true })
    })

    it('honours the maxSize override, rejecting only above it (MCP writes its own limit)', async () => {
      const tmpDir = path.join(process.env['TEMP'] || '/tmp', `slatebase-maxsize-test-${Date.now()}`)
      const vaultDir = path.join(tmpDir, 'vault')
      await fs.mkdir(vaultDir, { recursive: true })

      const vault = createMockVault('abc123def456', 'Test Vault', vaultDir)
      const vaultManager = createMockVaultManager([vault])
      // Server-wide limit is far below the content being written
      const configService = createMockConfigService({ maxFileSize: 100 })
      const vaultReader = createMockVaultReader()
      const logger = createMockLogger()

      const service = new VaultService(vaultManager, vaultReader, configService, logger)
      const content = 'x'.repeat(500)

      const result = await service.saveFile('abc123def456', 'big.md', content, undefined, 1000)
      expect(result.size).toBe(500)

      await expect(service.saveFile('abc123def456', 'big.md', content, undefined, 400))
        .rejects.toThrow(FileTooLargeError)

      await fs.rm(tmpDir, { recursive: true, force: true })
    })

    it('writes Buffer content byte-for-byte (binary files via MCP write_file)', async () => {
      const tmpDir = path.join(process.env['TEMP'] || '/tmp', `slatebase-binary-test-${Date.now()}`)
      const vaultDir = path.join(tmpDir, 'vault')
      await fs.mkdir(vaultDir, { recursive: true })

      const vault = createMockVault('abc123def456', 'Test Vault', vaultDir)
      const vaultManager = createMockVaultManager([vault])
      const configService = createMockConfigService()
      const vaultReader = createMockVaultReader()
      const logger = createMockLogger()

      // Bytes that would not survive a UTF-8 round trip (NUL, lone 0xff)
      const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff, 0xfe, 0x01])

      const service = new VaultService(vaultManager, vaultReader, configService, logger)
      const result = await service.saveFile('abc123def456', 'Bilder/logo.png', bytes)

      const written = await fs.readFile(path.join(vaultDir, 'Bilder', 'logo.png'))
      expect(written.equals(bytes)).toBe(true)
      expect(result.size).toBe(bytes.length)
      expect(result.etag).toBe(computeEtag(bytes))

      await fs.rm(tmpDir, { recursive: true, force: true })
    })

    it('saves successfully when ifMatch matches current file etag', async () => {
      const tmpDir = path.join(process.env['TEMP'] || '/tmp', `slatebase-etag-test-${Date.now()}`)
      const vaultDir = path.join(tmpDir, 'vault')
      await fs.mkdir(vaultDir, { recursive: true })

      // Write initial file
      const initialContent = '# Initial'
      await fs.writeFile(path.join(vaultDir, 'test.md'), initialContent, 'utf-8')
      const currentEtag = computeEtag(Buffer.from(initialContent, 'utf-8'))

      const vault = createMockVault('abc123def456', 'Test Vault', vaultDir)
      const vaultManager = createMockVaultManager([vault])
      const configService = createMockConfigService()
      const vaultReader = createMockVaultReader()
      const logger = createMockLogger()

      const service = new VaultService(vaultManager, vaultReader, configService, logger)
      const result = await service.saveFile('abc123def456', 'test.md', '# Updated', currentEtag)

      expect(result.path).toBe('test.md')
      expect(result.etag).toMatch(/^[0-9a-f]{16}$/)
      // New etag should differ from old
      expect(result.etag).not.toBe(currentEtag)

      await fs.rm(tmpDir, { recursive: true, force: true })
    })

    it('throws ConflictError when ifMatch does not match current file etag', async () => {
      const tmpDir = path.join(process.env['TEMP'] || '/tmp', `slatebase-etag-test-${Date.now()}`)
      const vaultDir = path.join(tmpDir, 'vault')
      await fs.mkdir(vaultDir, { recursive: true })

      // Write initial file
      await fs.writeFile(path.join(vaultDir, 'test.md'), '# Current content', 'utf-8')

      const vault = createMockVault('abc123def456', 'Test Vault', vaultDir)
      const vaultManager = createMockVaultManager([vault])
      const configService = createMockConfigService()
      const vaultReader = createMockVaultReader()
      const logger = createMockLogger()

      const service = new VaultService(vaultManager, vaultReader, configService, logger)

      // Provide a stale/wrong etag
      await expect(service.saveFile('abc123def456', 'test.md', '# New content', 'stale_etag_value_'))
        .rejects.toThrow(ConflictError)

      // Verify file was NOT modified
      const fileContent = await fs.readFile(path.join(vaultDir, 'test.md'), 'utf-8')
      expect(fileContent).toBe('# Current content')

      await fs.rm(tmpDir, { recursive: true, force: true })
    })

    it('skips conflict check when ifMatch is not provided (backward compatibility)', async () => {
      const tmpDir = path.join(process.env['TEMP'] || '/tmp', `slatebase-etag-test-${Date.now()}`)
      const vaultDir = path.join(tmpDir, 'vault')
      await fs.mkdir(vaultDir, { recursive: true })

      // Write initial file
      await fs.writeFile(path.join(vaultDir, 'test.md'), '# Old content', 'utf-8')

      const vault = createMockVault('abc123def456', 'Test Vault', vaultDir)
      const vaultManager = createMockVaultManager([vault])
      const configService = createMockConfigService()
      const vaultReader = createMockVaultReader()
      const logger = createMockLogger()

      const service = new VaultService(vaultManager, vaultReader, configService, logger)

      // No ifMatch provided — should save without conflict check
      const result = await service.saveFile('abc123def456', 'test.md', '# New content')
      expect(result.path).toBe('test.md')
      expect(result.etag).toMatch(/^[0-9a-f]{16}$/)

      await fs.rm(tmpDir, { recursive: true, force: true })
    })

    it('saves successfully when ifMatch is provided but file does not exist yet', async () => {
      const tmpDir = path.join(process.env['TEMP'] || '/tmp', `slatebase-etag-test-${Date.now()}`)
      const vaultDir = path.join(tmpDir, 'vault')
      await fs.mkdir(vaultDir, { recursive: true })

      const vault = createMockVault('abc123def456', 'Test Vault', vaultDir)
      const vaultManager = createMockVaultManager([vault])
      const configService = createMockConfigService()
      const vaultReader = createMockVaultReader()
      const logger = createMockLogger()

      const service = new VaultService(vaultManager, vaultReader, configService, logger)

      // File doesn't exist yet — ifMatch should be ignored (no conflict possible)
      const result = await service.saveFile('abc123def456', 'new-file.md', '# Brand new', 'any_etag_value_x')
      expect(result.path).toBe('new-file.md')
      expect(result.etag).toMatch(/^[0-9a-f]{16}$/)

      await fs.rm(tmpDir, { recursive: true, force: true })
    })
  })

  describe('moveContent', () => {
    let tmpDir: string
    let vaultDir: string

    async function setup() {
      tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'move-test-'))
      vaultDir = path.join(tmpDir, 'vault')
      await fs.mkdir(vaultDir, { recursive: true })

      const vault = createMockVault('abc123def456', 'Test Vault', vaultDir)
      const vaultManager = createMockVaultManager([vault])
      const configService = createMockConfigService()
      const vaultReader = createMockVaultReader()
      const logger = createMockLogger()
      const service = new VaultService(vaultManager, vaultReader, configService, logger)
      return { service, vaultManager }
    }

    async function cleanup() {
      await fs.rm(tmpDir, { recursive: true, force: true })
    }

    it('moves a file and preserves its content', async () => {
      const { service } = await setup()
      try {
        await fs.writeFile(path.join(vaultDir, 'source.md'), '# Hello')

        const result = await service.moveContent('abc123def456', 'source.md', 'dest.md')

        expect(result.newPath).toBe('dest.md')
        await expect(fs.access(path.join(vaultDir, 'source.md'))).rejects.toThrow()
        const content = await fs.readFile(path.join(vaultDir, 'dest.md'), 'utf-8')
        expect(content).toBe('# Hello')
      } finally {
        await cleanup()
      }
    })

    it('moves a directory', async () => {
      const { service } = await setup()
      try {
        await fs.mkdir(path.join(vaultDir, 'sourceDir'))
        await fs.writeFile(path.join(vaultDir, 'sourceDir', 'note.md'), '# In folder')

        const result = await service.moveContent('abc123def456', 'sourceDir', 'destDir')

        expect(result.newPath).toBe('destDir')
        const content = await fs.readFile(path.join(vaultDir, 'destDir', 'note.md'), 'utf-8')
        expect(content).toBe('# In folder')
      } finally {
        await cleanup()
      }
    })

    it('throws FileConflictError when a file already exists at the destination', async () => {
      const { service } = await setup()
      try {
        await fs.writeFile(path.join(vaultDir, 'source.md'), '# Source')
        await fs.writeFile(path.join(vaultDir, 'dest.md'), '# Existing')

        await expect(service.moveContent('abc123def456', 'source.md', 'dest.md'))
          .rejects.toThrow(FileConflictError)

        // Neither file should have been touched
        expect(await fs.readFile(path.join(vaultDir, 'source.md'), 'utf-8')).toBe('# Source')
        expect(await fs.readFile(path.join(vaultDir, 'dest.md'), 'utf-8')).toBe('# Existing')
      } finally {
        await cleanup()
      }
    })

    it('throws an ENOENT error when the source does not exist', async () => {
      const { service } = await setup()
      try {
        await expect(service.moveContent('abc123def456', 'missing.md', 'dest.md'))
          .rejects.toMatchObject({ code: 'ENOENT' })
      } finally {
        await cleanup()
      }
    })

    it('throws InvalidMoveError for a circular move into a subdirectory of itself', async () => {
      const { service } = await setup()
      try {
        await fs.mkdir(path.join(vaultDir, 'folder'))

        await expect(service.moveContent('abc123def456', 'folder', 'folder/nested'))
          .rejects.toThrow(InvalidMoveError)
      } finally {
        await cleanup()
      }
    })

    it('does not lose either file when two concurrent moves race to the same destination', async () => {
      // Regression test: moveContent used to check fs.access(dest) and then
      // separately fs.rename() — a file created at dest in that gap would be
      // silently clobbered by rename(). For files, the move is now performed
      // via fs.link() (which atomically fails with EEXIST) + fs.unlink(),
      // so exactly one of two racing moves to the same destination succeeds
      // and the other is rejected with FileConflictError — neither file is lost.
      const { service } = await setup()
      try {
        await fs.writeFile(path.join(vaultDir, 'fileA.md'), '# A')
        await fs.writeFile(path.join(vaultDir, 'fileB.md'), '# B')

        const results = await Promise.allSettled([
          service.moveContent('abc123def456', 'fileA.md', 'dest.md'),
          service.moveContent('abc123def456', 'fileB.md', 'dest.md'),
        ])

        const fulfilled = results.filter((r) => r.status === 'fulfilled')
        const rejected = results.filter((r) => r.status === 'rejected')
        expect(fulfilled).toHaveLength(1)
        expect(rejected).toHaveLength(1)
        expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(FileConflictError)

        // The winning file's content must be intact at the destination, and the
        // loser's original file must still exist untouched (the move never happened).
        const destContent = await fs.readFile(path.join(vaultDir, 'dest.md'), 'utf-8')
        expect(['# A', '# B']).toContain(destContent)

        const loserPath = destContent === '# A' ? 'fileB.md' : 'fileA.md'
        const loserContent = await fs.readFile(path.join(vaultDir, loserPath), 'utf-8')
        expect(loserContent).toBe(destContent === '# A' ? '# B' : '# A')
      } finally {
        await cleanup()
      }
    })
  })

  describe('renameContent', () => {
    let tmpDir: string
    let vaultDir: string

    async function setup() {
      tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'rename-test-'))
      vaultDir = path.join(tmpDir, 'vault')
      await fs.mkdir(vaultDir, { recursive: true })

      const vault = createMockVault('abc123def456', 'Test Vault', vaultDir)
      const vaultManager = createMockVaultManager([vault])
      const configService = createMockConfigService()
      const vaultReader = createMockVaultReader()
      const logger = createMockLogger()
      const service = new VaultService(vaultManager, vaultReader, configService, logger)
      return { service, vaultManager }
    }

    async function cleanup() {
      await fs.rm(tmpDir, { recursive: true, force: true })
    }

    it('renames a file and preserves its content', async () => {
      const { service } = await setup()
      try {
        await fs.writeFile(path.join(vaultDir, 'old.md'), '# Hello')

        const result = await service.renameContent('abc123def456', 'old.md', 'new.md')

        expect(result.newPath).toBe('new.md')
        await expect(fs.access(path.join(vaultDir, 'old.md'))).rejects.toThrow()
        const content = await fs.readFile(path.join(vaultDir, 'new.md'), 'utf-8')
        expect(content).toBe('# Hello')
      } finally {
        await cleanup()
      }
    })

    it('throws FileConflictError when a file already exists at the target name', async () => {
      const { service } = await setup()
      try {
        await fs.writeFile(path.join(vaultDir, 'old.md'), '# Old')
        await fs.writeFile(path.join(vaultDir, 'new.md'), '# Existing')

        await expect(service.renameContent('abc123def456', 'old.md', 'new.md'))
          .rejects.toThrow(FileConflictError)

        expect(await fs.readFile(path.join(vaultDir, 'old.md'), 'utf-8')).toBe('# Old')
        expect(await fs.readFile(path.join(vaultDir, 'new.md'), 'utf-8')).toBe('# Existing')
      } finally {
        await cleanup()
      }
    })

    it('throws an ENOENT error when the source does not exist', async () => {
      const { service } = await setup()
      try {
        await expect(service.renameContent('abc123def456', 'missing.md', 'new.md'))
          .rejects.toMatchObject({ code: 'ENOENT' })
      } finally {
        await cleanup()
      }
    })
  })

  describe('ConflictError', () => {
    it('has correct name and message', () => {
      const error = new ConflictError('current123456789', 'provided12345678')
      expect(error.name).toBe('ConflictError')
      expect(error.message).toBe('File has been modified by another session')
      expect(error.currentEtag).toBe('current123456789')
      expect(error.providedEtag).toBe('provided12345678')
      expect(error).toBeInstanceOf(Error)
    })
  })
})

// --- Symlink Escape Protection ---
//
// Symlink creation needs a privilege a normal Windows CI account lacks; the
// guard itself is covered platform-independently in vault/index.test.ts.
describe.skipIf(process.platform === 'win32')('VaultService — symlink escape protection', () => {
  let dataDir: string
  let vaultDir: string

  function createCapturingLogger(): ILogger & { warnings: { message: string; meta?: object | undefined }[] } {
    const warnings: { message: string; meta?: object | undefined }[] = []
    return {
      warnings,
      debug() {},
      info() {},
      warn(message: string, meta?: object) { warnings.push({ message, meta }) },
      error() {},
    }
  }

  // Production layout: the vault sits next to the directories holding session
  // tokens and password hashes, which is what an escape is after.
  async function setup(logger: ILogger = createMockLogger()) {
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'symlink-service-'))
    vaultDir = path.join(dataDir, 'vaults', 'v1')
    await fs.mkdir(vaultDir, { recursive: true })
    await fs.mkdir(path.join(dataDir, 'sessions'), { recursive: true })
    await fs.writeFile(path.join(dataDir, 'sessions', 'abc.json'), '{"token":"secret"}')

    const vault = createMockVault('abc123def456', 'Test Vault', vaultDir)
    const service = new VaultService(
      createMockVaultManager([vault]),
      createMockVaultReader(),
      createMockConfigService(),
      logger,
    )
    clearVaultRootRealPathCache()
    return service
  }

  async function cleanup() {
    clearVaultRootRealPathCache()
    await fs.rm(dataDir, { recursive: true, force: true })
  }

  it('refuses to write through a symlink that leaves the vault', async () => {
    const service = await setup()
    try {
      await fs.symlink(path.join(dataDir, 'sessions'), path.join(vaultDir, 'escape'), 'dir')

      await expect(service.saveFile('abc123def456', 'escape/abc.json', 'overwritten'))
        .rejects.toThrow(PathTraversalError)

      // The file outside the vault is untouched.
      const outside = await fs.readFile(path.join(dataDir, 'sessions', 'abc.json'), 'utf-8')
      expect(outside).toBe('{"token":"secret"}')
    } finally {
      await cleanup()
    }
  })

  it('refuses to delete through a symlink that leaves the vault', async () => {
    const service = await setup()
    try {
      await fs.symlink(path.join(dataDir, 'sessions'), path.join(vaultDir, 'escape'), 'dir')

      await expect(service.deleteContent('abc123def456', 'escape/abc.json'))
        .rejects.toThrow(PathTraversalError)

      await expect(fs.access(path.join(dataDir, 'sessions', 'abc.json'))).resolves.toBeUndefined()
    } finally {
      await cleanup()
    }
  })

  it('refuses to move a file out of the vault through a symlinked destination', async () => {
    const service = await setup()
    try {
      await fs.symlink(path.join(dataDir, 'sessions'), path.join(vaultDir, 'escape'), 'dir')
      await fs.writeFile(path.join(vaultDir, 'note.md'), '# note')

      await expect(service.moveContent('abc123def456', 'note.md', 'escape/leaked.md'))
        .rejects.toThrow(PathTraversalError)

      await expect(fs.access(path.join(dataDir, 'sessions', 'leaked.md'))).rejects.toThrow()
      await expect(fs.access(path.join(vaultDir, 'note.md'))).resolves.toBeUndefined()
    } finally {
      await cleanup()
    }
  })

  it('refuses to rename a symlink that points out of the vault', async () => {
    const service = await setup()
    try {
      await fs.symlink(path.join(dataDir, 'sessions', 'abc.json'), path.join(vaultDir, 'escape.json'), 'file')

      await expect(service.renameContent('abc123def456', 'escape.json', 'renamed.json'))
        .rejects.toThrow(PathTraversalError)
    } finally {
      await cleanup()
    }
  })

  it('regression: a vault behind a symlinked data directory works normally', async () => {
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'symlink-service-'))
    const realDir = await fs.mkdtemp(path.join(os.tmpdir(), 'symlink-real-'))
    try {
      const linkedVaultDir = path.join(dataDir, 'linked-vault')
      await fs.symlink(realDir, linkedVaultDir, 'dir')

      const vault = createMockVault('abc123def456', 'Linked Vault', linkedVaultDir)
      const service = new VaultService(
        createMockVaultManager([vault]),
        createMockVaultReader(),
        createMockConfigService(),
        createMockLogger(),
      )
      clearVaultRootRealPathCache()

      const saved = await service.saveFile('abc123def456', 'sub/note.md', '# Hello')
      expect(saved.path).toBe('sub/note.md')
      expect(await fs.readFile(path.join(realDir, 'sub', 'note.md'), 'utf-8')).toBe('# Hello')

      const renamed = await service.renameContent('abc123def456', 'sub/note.md', 'renamed.md')
      expect(renamed.newPath).toBe('sub/renamed.md')

      const moved = await service.moveContent('abc123def456', 'sub/renamed.md', 'moved.md')
      expect(moved.newPath).toBe('moved.md')

      await service.deleteContent('abc123def456', 'moved.md')
      await expect(fs.access(path.join(realDir, 'moved.md'))).rejects.toThrow()
    } finally {
      clearVaultRootRealPathCache()
      await fs.rm(realDir, { recursive: true, force: true })
      await cleanup()
    }
  })

  it('warns once per pre-existing symlink when vaults are initialized', async () => {
    const logger = createCapturingLogger()
    const service = await setup(logger)
    try {
      await fs.mkdir(path.join(vaultDir, 'notes'), { recursive: true })
      await fs.mkdir(path.join(vaultDir, '.slatebase'), { recursive: true })
      await fs.symlink(dataDir, path.join(vaultDir, 'notes', 'escape'), 'dir')
      // Dot-directories are skipped everywhere else in the vault code, here too.
      await fs.symlink(dataDir, path.join(vaultDir, '.slatebase', 'hidden-escape'), 'dir')

      await service.initializeVaults()

      // The scan is fire-and-forget so it cannot delay the server start.
      const found = await waitFor(() => logger.warnings.find((w) => w.message.includes('Symlink found in vault')))
      expect(found!.meta).toMatchObject({
        vaultId: 'abc123def456',
        path: 'notes/escape',
        target: dataDir,
      })
      expect(logger.warnings.filter((w) => w.message.includes('Symlink found in vault'))).toHaveLength(1)
    } finally {
      await cleanup()
    }
  })

  /** Polls until `predicate` returns something truthy — for the fire-and-forget scan. */
  async function waitFor<T>(predicate: () => T | undefined, timeoutMs = 2000): Promise<T> {
    const deadline = Date.now() + timeoutMs
    for (;;) {
      const result = predicate()
      if (result) return result
      if (Date.now() > deadline) throw new Error('Timed out waiting for condition')
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
  }
})
