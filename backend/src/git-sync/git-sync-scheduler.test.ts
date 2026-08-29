import { describe, it, expect, vi } from 'vitest'
import { GitSyncScheduler } from './git-sync-scheduler.js'
import type { IGitSyncConfigStore } from './config-store.js'
import type { IGitSyncStatusStore } from './status-store.js'
import type { IGitSyncEngine } from './sync-engine.js'
import type { GitSyncRemoteConfig, GitSyncRemoteStatus } from './types.js'

const createMockLogger = () => ({
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
} as unknown as import('../logger/index.js').ILogger)

function makeRemote(overrides: Partial<GitSyncRemoteConfig> = {}): GitSyncRemoteConfig {
  return {
    id: 'r1', vaultId: 'v1', name: 'Origin', remoteUrl: 'https://example.invalid/repo.git',
    authMethod: 'https-token', intervalMinutes: 15, enabled: true,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('GitSyncScheduler', () => {
  it('runs a remote with no prior status (always due)', async () => {
    const configStore = {
      listVaultIdsWithRemotes: async () => ['v1'],
      listRemotes: async () => [makeRemote()],
    } as unknown as IGitSyncConfigStore
    const statusStore = { getStatus: async () => null } as unknown as IGitSyncStatusStore
    const runOne = vi.fn(async () => ({ result: 'success' as const }))
    const engine = { runOne } as unknown as IGitSyncEngine

    const scheduler = new GitSyncScheduler(configStore, statusStore, engine, createMockLogger())
    await scheduler.tick()

    expect(runOne).toHaveBeenCalledWith('v1', 'r1')
  })

  it('skips a remote whose interval has not elapsed yet', async () => {
    const recentStatus: GitSyncRemoteStatus = {
      remoteId: 'r1', lastRunAt: new Date().toISOString(), lastResult: 'success', lastError: null, conflictFiles: [],
      lastPulledFiles: 0, lastPushedFiles: 0,
    }
    const configStore = {
      listVaultIdsWithRemotes: async () => ['v1'],
      listRemotes: async () => [makeRemote({ intervalMinutes: 60 })],
    } as unknown as IGitSyncConfigStore
    const statusStore = { getStatus: async () => recentStatus } as unknown as IGitSyncStatusStore
    const runOne = vi.fn()
    const engine = { runOne } as unknown as IGitSyncEngine

    const scheduler = new GitSyncScheduler(configStore, statusStore, engine, createMockLogger())
    await scheduler.tick()

    expect(runOne).not.toHaveBeenCalled()
  })

  it('skips a remote whose last run ended in an unresolved conflict, regardless of elapsed time', async () => {
    const oldConflictStatus: GitSyncRemoteStatus = {
      remoteId: 'r1',
      lastRunAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // a day ago -> interval long elapsed
      lastResult: 'conflict', lastError: null, conflictFiles: ['note.md'],
      lastPulledFiles: null, lastPushedFiles: null,
    }
    const configStore = {
      listVaultIdsWithRemotes: async () => ['v1'],
      listRemotes: async () => [makeRemote({ intervalMinutes: 15 })],
    } as unknown as IGitSyncConfigStore
    const statusStore = { getStatus: async () => oldConflictStatus } as unknown as IGitSyncStatusStore
    const runOne = vi.fn()
    const engine = { runOne } as unknown as IGitSyncEngine

    const scheduler = new GitSyncScheduler(configStore, statusStore, engine, createMockLogger())
    await scheduler.tick()

    expect(runOne).not.toHaveBeenCalled()
  })

  it('skips disabled remotes', async () => {
    const configStore = {
      listVaultIdsWithRemotes: async () => ['v1'],
      listRemotes: async () => [makeRemote({ enabled: false })],
    } as unknown as IGitSyncConfigStore
    const statusStore = { getStatus: async () => null } as unknown as IGitSyncStatusStore
    const runOne = vi.fn()
    const engine = { runOne } as unknown as IGitSyncEngine

    const scheduler = new GitSyncScheduler(configStore, statusStore, engine, createMockLogger())
    await scheduler.tick()

    expect(runOne).not.toHaveBeenCalled()
  })

  it('isolates a failing remote so others in the same tick still run', async () => {
    const configStore = {
      listVaultIdsWithRemotes: async () => ['v1'],
      listRemotes: async () => [makeRemote({ id: 'r1' }), makeRemote({ id: 'r2' })],
    } as unknown as IGitSyncConfigStore
    const statusStore = { getStatus: async () => null } as unknown as IGitSyncStatusStore
    const runOne = vi.fn(async (_vaultId: string, remoteId: string) => {
      if (remoteId === 'r1') throw new Error('boom')
      return { result: 'success' as const }
    })
    const engine = { runOne } as unknown as IGitSyncEngine

    const scheduler = new GitSyncScheduler(configStore, statusStore, engine, createMockLogger())
    await scheduler.tick()

    expect(runOne).toHaveBeenCalledWith('v1', 'r1')
    expect(runOne).toHaveBeenCalledWith('v1', 'r2')
  })

  it('skips a tick that overlaps a still-running previous tick', async () => {
    let resolveFirst!: () => void
    const firstRunGate = new Promise<void>((resolve) => { resolveFirst = resolve })

    const configStore = {
      listVaultIdsWithRemotes: async () => ['v1'],
      listRemotes: async () => [makeRemote()],
    } as unknown as IGitSyncConfigStore
    const statusStore = { getStatus: async () => null } as unknown as IGitSyncStatusStore
    const runOne = vi.fn(async () => { await firstRunGate; return { result: 'success' as const } })
    const engine = { runOne } as unknown as IGitSyncEngine

    const scheduler = new GitSyncScheduler(configStore, statusStore, engine, createMockLogger())
    const firstTick = scheduler.tick()
    await scheduler.tick() // should return immediately (isRunning guard), not call runOne again

    resolveFirst()
    await firstTick

    expect(runOne).toHaveBeenCalledTimes(1)
  })
})
