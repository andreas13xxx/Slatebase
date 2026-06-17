// Unit tests for CleanupJob

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { CleanupJob } from './cleanup-job.js'
import type { ITrashService } from '../trash/types.js'
import type { IVersionService } from '../version/types.js'
import type { IVaultManager, Vault } from '../vault/index.js'
import type { IConfigService } from '../config/index.js'
import type { ILogger } from '../logger/index.js'

// --- Mock Factories ---

function createMockTrashService(): ITrashService {
  return {
    moveToTrash: vi.fn(),
    listTrash: vi.fn(),
    restore: vi.fn(),
    deletePermanently: vi.fn(),
    purgeExpired: vi.fn().mockResolvedValue(0),
    deleteImmediately: vi.fn(),
  }
}

function createMockVersionService(): IVersionService {
  return {
    createVersion: vi.fn(),
    listVersions: vi.fn(),
    getVersionContent: vi.fn(),
    restoreVersion: vi.fn(),
    pruneVersions: vi.fn().mockResolvedValue(0),
    moveVersions: vi.fn(),
    deleteVersions: vi.fn(),
  }
}

function createMockVaultManager(vaults: Vault[] = []): IVaultManager {
  return {
    loadVaults: vi.fn(),
    getVault: vi.fn(),
    getAllVaults: vi.fn().mockReturnValue(vaults),
    addVault: vi.fn(),
    removeVault: vi.fn(),
  }
}

function createMockConfigService(overrides?: {
  retentionDays?: number
  maxPerFile?: number
  intervalHours?: number
}): IConfigService {
  return {
    getServerConfig: vi.fn().mockReturnValue({}),
    getVaultConfigs: vi.fn().mockReturnValue([]),
    getFeaturesConfig: vi.fn().mockReturnValue({}),
    getSseConfig: vi.fn().mockReturnValue({}),
    getTrashConfig: vi.fn().mockReturnValue({ retentionDays: overrides?.retentionDays ?? 30 }),
    getVersionsConfig: vi.fn().mockReturnValue({ maxPerFile: overrides?.maxPerFile ?? 20 }),
    getCleanupConfig: vi.fn().mockReturnValue({ intervalHours: overrides?.intervalHours ?? 24 }),
    getTemplatesConfig: vi.fn().mockReturnValue({ directory: '_templates' }),
    getUploadConfig: vi.fn().mockReturnValue({}),
  }
}

function createMockLogger(): ILogger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }
}

function createTestVault(id: string, vaultPath: string): Vault {
  return {
    info: {
      id,
      name: `Vault ${id}`,
      path: vaultPath,
      status: 'loaded',
    },
    tree: { name: 'root', type: 'directory', path: '' },
  }
}

describe('CleanupJob', () => {
  let trashService: ITrashService
  let versionService: IVersionService
  let vaultManager: IVaultManager
  let configService: IConfigService
  let logger: ILogger
  let cleanupJob: CleanupJob

  beforeEach(() => {
    vi.useFakeTimers()
    trashService = createMockTrashService()
    versionService = createMockVersionService()
    logger = createMockLogger()
  })

  afterEach(() => {
    cleanupJob?.stop()
    vi.useRealTimers()
  })

  describe('start()', () => {
    it('should run immediately on start', async () => {
      const vault = createTestVault('abc123', '/tmp/vault1')
      vaultManager = createMockVaultManager([vault])
      configService = createMockConfigService()
      cleanupJob = new CleanupJob(trashService, versionService, vaultManager, configService, logger)

      cleanupJob.start()

      // Flush microtasks for the initial async runOnce
      await vi.advanceTimersByTimeAsync(0)

      expect(trashService.purgeExpired).toHaveBeenCalledWith('abc123', 30)
    })

    it('should set interval for periodic execution', async () => {
      vaultManager = createMockVaultManager([])
      configService = createMockConfigService({ intervalHours: 1 })
      cleanupJob = new CleanupJob(trashService, versionService, vaultManager, configService, logger)

      cleanupJob.start()

      // Flush initial run
      await vi.advanceTimersByTimeAsync(0)

      // Clear initial call count
      vi.mocked(configService.getTrashConfig).mockClear()

      // Advance by 1 hour to trigger the interval
      await vi.advanceTimersByTimeAsync(1 * 60 * 60 * 1000)

      expect(configService.getTrashConfig).toHaveBeenCalled()
    })

    it('should log start with interval info', () => {
      vaultManager = createMockVaultManager([])
      configService = createMockConfigService({ intervalHours: 12 })
      cleanupJob = new CleanupJob(trashService, versionService, vaultManager, configService, logger)

      cleanupJob.start()

      expect(logger.info).toHaveBeenCalledWith('Cleanup job started', { intervalHours: 12 })
    })
  })

  describe('stop()', () => {
    it('should clear the interval', async () => {
      vaultManager = createMockVaultManager([])
      configService = createMockConfigService({ intervalHours: 1 })
      cleanupJob = new CleanupJob(trashService, versionService, vaultManager, configService, logger)

      cleanupJob.start()

      // Flush initial run
      await vi.advanceTimersByTimeAsync(0)

      cleanupJob.stop()

      // Clear counts
      vi.mocked(configService.getTrashConfig).mockClear()

      // Advance by 2 hours — should NOT trigger another run
      await vi.advanceTimersByTimeAsync(2 * 60 * 60 * 1000)

      expect(configService.getTrashConfig).not.toHaveBeenCalled()
    })

    it('should log stop', () => {
      vaultManager = createMockVaultManager([])
      configService = createMockConfigService()
      cleanupJob = new CleanupJob(trashService, versionService, vaultManager, configService, logger)

      cleanupJob.start()
      cleanupJob.stop()

      expect(logger.info).toHaveBeenCalledWith('Cleanup job stopped')
    })

    it('should be safe to call stop without start', () => {
      vaultManager = createMockVaultManager([])
      configService = createMockConfigService()
      cleanupJob = new CleanupJob(trashService, versionService, vaultManager, configService, logger)

      // Should not throw
      cleanupJob.stop()
    })
  })

  describe('runOnce()', () => {
    it('should read fresh config values on each run', async () => {
      vaultManager = createMockVaultManager([])
      configService = createMockConfigService()
      cleanupJob = new CleanupJob(trashService, versionService, vaultManager, configService, logger)

      await cleanupJob.runOnce()

      expect(configService.getTrashConfig).toHaveBeenCalled()
      expect(configService.getVersionsConfig).toHaveBeenCalled()
    })

    it('should call purgeExpired for each vault when retentionDays > 0', async () => {
      const vault1 = createTestVault('vault1', '/tmp/v1')
      const vault2 = createTestVault('vault2', '/tmp/v2')
      vaultManager = createMockVaultManager([vault1, vault2])
      configService = createMockConfigService({ retentionDays: 7 })
      cleanupJob = new CleanupJob(trashService, versionService, vaultManager, configService, logger)

      await cleanupJob.runOnce()

      expect(trashService.purgeExpired).toHaveBeenCalledWith('vault1', 7)
      expect(trashService.purgeExpired).toHaveBeenCalledWith('vault2', 7)
    })

    it('should skip trash purge when retentionDays is 0', async () => {
      const vault = createTestVault('vault1', '/tmp/v1')
      vaultManager = createMockVaultManager([vault])
      configService = createMockConfigService({ retentionDays: 0 })
      cleanupJob = new CleanupJob(trashService, versionService, vaultManager, configService, logger)

      await cleanupJob.runOnce()

      expect(trashService.purgeExpired).not.toHaveBeenCalled()
    })

    it('should isolate errors per vault for trash cleanup', async () => {
      const vault1 = createTestVault('vault1', '/tmp/v1')
      const vault2 = createTestVault('vault2', '/tmp/v2')
      vaultManager = createMockVaultManager([vault1, vault2])
      configService = createMockConfigService({ retentionDays: 30 })
      cleanupJob = new CleanupJob(trashService, versionService, vaultManager, configService, logger)

      // First vault throws, second should still be processed
      vi.mocked(trashService.purgeExpired)
        .mockRejectedValueOnce(new Error('disk full'))
        .mockResolvedValueOnce(2)

      await cleanupJob.runOnce()

      expect(trashService.purgeExpired).toHaveBeenCalledTimes(2)
      expect(logger.error).toHaveBeenCalledWith(
        'Trash cleanup failed for vault',
        expect.objectContaining({ vaultId: 'vault1' }),
      )
    })

    it('should log purge count when entries are purged', async () => {
      const vault = createTestVault('vault1', '/tmp/v1')
      vaultManager = createMockVaultManager([vault])
      configService = createMockConfigService({ retentionDays: 30 })
      cleanupJob = new CleanupJob(trashService, versionService, vaultManager, configService, logger)

      vi.mocked(trashService.purgeExpired).mockResolvedValue(5)

      await cleanupJob.runOnce()

      expect(logger.info).toHaveBeenCalledWith('Trash entries purged', { vaultId: 'vault1', purged: 5 })
    })

    it('should skip version pruning when maxPerFile is 0', async () => {
      const vault = createTestVault('vault1', '/tmp/v1')
      vaultManager = createMockVaultManager([vault])
      configService = createMockConfigService({ maxPerFile: 0 })
      cleanupJob = new CleanupJob(trashService, versionService, vaultManager, configService, logger)

      await cleanupJob.runOnce()

      expect(versionService.pruneVersions).not.toHaveBeenCalled()
    })

    it('should handle no vaults gracefully', async () => {
      vaultManager = createMockVaultManager([])
      configService = createMockConfigService()
      cleanupJob = new CleanupJob(trashService, versionService, vaultManager, configService, logger)

      // Should not throw
      await cleanupJob.runOnce()

      expect(logger.info).toHaveBeenCalledWith('Cleanup run completed')
    })
  })
})
