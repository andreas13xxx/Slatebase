import { describe, it, expect, vi } from 'vitest'
import { MailImportScheduler } from './mail-import-scheduler.js'
import type { IMailImportConfigStore } from './config-store.js'
import type { IMailImportStatusStore } from './status-store.js'
import type { IMailImportEngine } from './import-engine.js'
import type { MailImportConfig, MailImportRunStatus } from './types.js'

const createMockLogger = () => ({
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
} as unknown as import('../logger/index.js').ILogger)

function makeConfig(overrides: Partial<MailImportConfig> = {}): MailImportConfig {
  return {
    id: 'c1', vaultId: 'v1', name: 'Inbox', host: 'imap.example.invalid', port: 993,
    secure: true, username: 'user@example.invalid', mailbox: 'INBOX', targetFolder: '',
    intervalMinutes: 15, enabled: true,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('MailImportScheduler', () => {
  it('runs a config with no prior status (always due)', async () => {
    const configStore = {
      listVaultIdsWithConfigs: async () => ['v1'],
      listByVault: async () => [makeConfig()],
    } as unknown as IMailImportConfigStore
    const statusStore = { getStatus: async () => null } as unknown as IMailImportStatusStore
    const runOne = vi.fn(async () => ({ result: 'success' as const, importedCount: 0 }))
    const engine = { runOne } as unknown as IMailImportEngine

    const scheduler = new MailImportScheduler(configStore, statusStore, engine, createMockLogger())
    await scheduler.tick()

    expect(runOne).toHaveBeenCalledWith('v1', 'c1')
  })

  it('skips a config whose interval has not elapsed yet', async () => {
    const recentStatus: MailImportRunStatus = {
      configId: 'c1', lastRunAt: new Date().toISOString(), lastResult: 'success', lastError: null, lastFoundCount: 0, lastImportedCount: 0,
    }
    const configStore = {
      listVaultIdsWithConfigs: async () => ['v1'],
      listByVault: async () => [makeConfig({ intervalMinutes: 60 })],
    } as unknown as IMailImportConfigStore
    const statusStore = { getStatus: async () => recentStatus } as unknown as IMailImportStatusStore
    const runOne = vi.fn()
    const engine = { runOne } as unknown as IMailImportEngine

    const scheduler = new MailImportScheduler(configStore, statusStore, engine, createMockLogger())
    await scheduler.tick()

    expect(runOne).not.toHaveBeenCalled()
  })

  it('skips disabled configs', async () => {
    const configStore = {
      listVaultIdsWithConfigs: async () => ['v1'],
      listByVault: async () => [makeConfig({ enabled: false })],
    } as unknown as IMailImportConfigStore
    const statusStore = { getStatus: async () => null } as unknown as IMailImportStatusStore
    const runOne = vi.fn()
    const engine = { runOne } as unknown as IMailImportEngine

    const scheduler = new MailImportScheduler(configStore, statusStore, engine, createMockLogger())
    await scheduler.tick()

    expect(runOne).not.toHaveBeenCalled()
  })

  it('isolates a failing config so others in the same tick still run', async () => {
    const configStore = {
      listVaultIdsWithConfigs: async () => ['v1'],
      listByVault: async () => [makeConfig({ id: 'c1' }), makeConfig({ id: 'c2' })],
    } as unknown as IMailImportConfigStore
    const statusStore = { getStatus: async () => null } as unknown as IMailImportStatusStore
    const runOne = vi.fn(async (_vaultId: string, configId: string) => {
      if (configId === 'c1') throw new Error('boom')
      return { result: 'success' as const, importedCount: 0 }
    })
    const engine = { runOne } as unknown as IMailImportEngine

    const scheduler = new MailImportScheduler(configStore, statusStore, engine, createMockLogger())
    await scheduler.tick()

    expect(runOne).toHaveBeenCalledWith('v1', 'c1')
    expect(runOne).toHaveBeenCalledWith('v1', 'c2')
  })
})
