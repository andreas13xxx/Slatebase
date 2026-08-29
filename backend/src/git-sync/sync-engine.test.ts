import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, readFile, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { GitSyncEngine } from './sync-engine.js'
import type { IGitCli } from './git-cli.js'
import type { IVaultRegistry, VaultRegistryEntry } from '../vault/registry.js'
import type { IGitSyncConfigStore } from './config-store.js'
import type { IGitSyncStatusStore } from './status-store.js'
import type { IModuleSecretStore } from '../shared-secrets/index.js'
import type { GitSyncRemoteConfig, GitSyncVaultData, GitSyncRemoteStatus } from './types.js'

const createMockLogger = () => ({
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
} as unknown as import('../logger/index.js').ILogger)

function makeRemote(overrides: Partial<GitSyncRemoteConfig> = {}): GitSyncRemoteConfig {
  return {
    id: 'remote-1',
    vaultId: 'vault-1',
    name: 'Origin',
    remoteUrl: 'https://example.invalid/repo.git',
    authMethod: 'https-token',
    intervalMinutes: 15,
    enabled: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

class FakeGitCli implements IGitCli {
  public isRepoValue = false
  public mergeResult: 'merged' | 'up-to-date' | 'conflict' = 'merged'
  public fetchShouldThrow = false
  public conflicted: string[] = []
  public hasCommitsValue = true
  public calls: string[] = []
  /** Consumed in order by successive `getHead()` calls; the last entry repeats once exhausted. */
  public headSequence: Array<string | null> = ['head-1', 'head-2', 'head-3']
  private headIndex = 0
  /** Returned by every `diffNameOnly()` call. */
  public diffResult: string[] = ['file.md']

  async isRepo(): Promise<boolean> { this.calls.push('isRepo'); return this.isRepoValue }
  async init(): Promise<void> { this.calls.push('init'); this.isRepoValue = true }
  async configureIdentity(): Promise<void> { this.calls.push('configureIdentity') }
  async hasCommits(): Promise<boolean> { this.calls.push('hasCommits'); return this.hasCommitsValue }
  async remoteAddOrSetUrl(): Promise<void> { this.calls.push('remoteAddOrSetUrl') }
  async hasUncommittedChanges(): Promise<boolean> { return false }
  async commitAll(): Promise<void> { this.calls.push('commitAll') }
  async fetch(): Promise<void> {
    this.calls.push('fetch')
    if (this.fetchShouldThrow) throw new Error('fetch failed: repository not found')
  }
  async mergeNoEdit(): Promise<'merged' | 'up-to-date' | 'conflict'> { this.calls.push('merge'); return this.mergeResult }
  async conflictedFiles(): Promise<string[]> { return this.conflicted }
  async push(): Promise<void> { this.calls.push('push') }
  async getHead(): Promise<string | null> {
    this.calls.push('getHead')
    const value = this.headSequence[this.headIndex] ?? this.headSequence.at(-1) ?? null
    this.headIndex++
    return value
  }
  async diffNameOnly(): Promise<string[]> { this.calls.push('diffNameOnly'); return this.diffResult }
}

describe('GitSyncEngine', () => {
  let vaultPath: string
  let gitCli: FakeGitCli
  let vaultRegistry: IVaultRegistry
  let configStore: IGitSyncConfigStore
  let statusStore: IGitSyncStatusStore
  let secretStore: IModuleSecretStore
  let recordedStatuses: GitSyncRemoteStatus[]
  let engine: GitSyncEngine

  beforeEach(async () => {
    vaultPath = await mkdtemp(join(tmpdir(), 'git-sync-vault-'))
    gitCli = new FakeGitCli()
    recordedStatuses = []

    vaultRegistry = {
      findById: (id: string) => (id === 'vault-1' ? ({ id: 'vault-1', storagePath: vaultPath } as VaultRegistryEntry) : null),
    } as unknown as IVaultRegistry

    const vaultData: GitSyncVaultData = { branch: 'main', remotes: [makeRemote()] }
    configStore = {
      getVaultData: async () => vaultData,
      getRemote: async (_vaultId: string, remoteId: string) => vaultData.remotes.find((r) => r.id === remoteId) ?? null,
    } as unknown as IGitSyncConfigStore

    statusStore = {
      setStatus: async (_vaultId: string, status: GitSyncRemoteStatus) => { recordedStatuses.push(status) },
    } as unknown as IGitSyncStatusStore

    secretStore = {
      getSecret: async () => 'dummy-token',
    } as unknown as IModuleSecretStore

    engine = new GitSyncEngine(gitCli, vaultRegistry, configStore, statusStore, secretStore, vaultPath, createMockLogger())
  })

  afterEach(async () => {
    await rm(vaultPath, { recursive: true, force: true })
  })

  it('initializes the repo, writes .gitignore, commits, fetches, merges and pushes on first run', async () => {
    const outcome = await engine.runOne('vault-1', 'remote-1')

    expect(outcome.result).toBe('success')
    expect(gitCli.calls).toEqual([
      'isRepo', 'init', 'configureIdentity', 'remoteAddOrSetUrl',
      'getHead', 'commitAll', 'getHead', 'diffNameOnly',
      'fetch', 'merge', 'getHead', 'diffNameOnly',
      'hasCommits', 'push',
    ])

    const gitignore = await readFile(join(vaultPath, '.gitignore'), 'utf-8')
    expect(gitignore).toContain('.slatebase/')
    expect(gitignore).toContain('.obsidian/')

    expect(recordedStatuses).toHaveLength(1)
    expect(recordedStatuses[0]).toMatchObject({ remoteId: 'remote-1', lastResult: 'success' })
  })

  it('reports how many files were pulled from the merge and pushed from the local commit', async () => {
    gitCli.diffResult = ['a.md', 'b.md'] // same fake list returned for both diff calls in this test

    const outcome = await engine.runOne('vault-1', 'remote-1')

    expect(outcome).toMatchObject({ result: 'success', pulledFiles: 2, pushedFiles: 2 })
    expect(recordedStatuses[0]).toMatchObject({ lastPulledFiles: 2, lastPushedFiles: 2 })
  })

  it('reports zero pushed files when the local commit head does not move (nothing local to commit)', async () => {
    gitCli.headSequence = ['head-1', 'head-1', 'head-2'] // pre/post-commit head identical -> nothing committed locally

    const outcome = await engine.runOne('vault-1', 'remote-1')

    expect(outcome.pushedFiles).toBe(0)
    // Only the merge's diff should have run — the local-commit diff is skipped since heads didn't move.
    expect(gitCli.calls.filter((c) => c === 'diffNameOnly')).toHaveLength(1)
  })

  it('skips merge and proceeds to push when fetch fails (new/empty remote)', async () => {
    gitCli.isRepoValue = true
    gitCli.fetchShouldThrow = true

    const outcome = await engine.runOne('vault-1', 'remote-1')

    expect(outcome.result).toBe('success')
    expect(outcome.pulledFiles).toBe(0) // never fetched -> nothing to have pulled
    expect(gitCli.calls).not.toContain('merge')
    expect(gitCli.calls).toContain('push')
  })

  it('reports a conflict outcome and does not push', async () => {
    gitCli.isRepoValue = true
    gitCli.mergeResult = 'conflict'
    gitCli.conflicted = ['notes/example.md']

    const outcome = await engine.runOne('vault-1', 'remote-1')

    expect(outcome.result).toBe('conflict')
    expect(outcome.conflictFiles).toEqual(['notes/example.md'])
    expect(gitCli.calls).not.toContain('push')
    expect(recordedStatuses[0]).toMatchObject({ lastResult: 'conflict', conflictFiles: ['notes/example.md'], lastPulledFiles: null, lastPushedFiles: null })
  })

  it('skips the push when the repo has no commits yet (e.g. an empty vault)', async () => {
    gitCli.isRepoValue = true
    gitCli.hasCommitsValue = false

    const outcome = await engine.runOne('vault-1', 'remote-1')

    expect(outcome.result).toBe('success')
    expect(outcome).toMatchObject({ pulledFiles: 0, pushedFiles: 0 })
    expect(gitCli.calls).not.toContain('push')
  })

  it('skips a run whose previous conflict markers are still present in the working tree', async () => {
    gitCli.isRepoValue = true
    gitCli.conflicted = ['notes/example.md']
    await mkdir(join(vaultPath, 'notes'), { recursive: true })
    await writeFile(join(vaultPath, 'notes', 'example.md'), 'before\n<<<<<<< HEAD\nours\n=======\ntheirs\n>>>>>>> origin/main\nafter\n')

    const outcome = await engine.runOne('vault-1', 'remote-1')

    expect(outcome).toEqual({ result: 'conflict', conflictFiles: ['notes/example.md'] })
    // Nothing else should have been attempted — no commit, no fetch, no push.
    expect(gitCli.calls).toEqual(['isRepo'])
  })

  it('proceeds normally once the previously-conflicted file no longer contains conflict markers', async () => {
    gitCli.isRepoValue = true
    gitCli.conflicted = ['notes/example.md']
    await mkdir(join(vaultPath, 'notes'), { recursive: true })
    await writeFile(join(vaultPath, 'notes', 'example.md'), 'resolved content, no markers here\n')

    const outcome = await engine.runOne('vault-1', 'remote-1')

    expect(outcome.result).toBe('success')
    expect(gitCli.calls).toContain('commitAll')
    expect(gitCli.calls).toContain('push')
  })

  it('treats a previously-conflicted file that no longer exists as resolved (e.g. resolved by deleting it)', async () => {
    gitCli.isRepoValue = true
    gitCli.conflicted = ['notes/deleted.md'] // never written to vaultPath -> ENOENT on read

    const outcome = await engine.runOne('vault-1', 'remote-1')

    expect(outcome.result).toBe('success')
    expect(gitCli.calls).toContain('commitAll')
  })

  it('reports an error outcome when no credential is stored, without invoking git', async () => {
    secretStore = { getSecret: async () => null } as unknown as IModuleSecretStore
    engine = new GitSyncEngine(gitCli, vaultRegistry, configStore, statusStore, secretStore, vaultPath, createMockLogger())

    const outcome = await engine.runOne('vault-1', 'remote-1')

    expect(outcome.result).toBe('error')
    expect(outcome.error).toMatch(/credential/i)
    // Only the prior-conflict check runs before the credential lookup; no actual git mutation is attempted.
    expect(gitCli.calls).toEqual(['isRepo'])
  })

  it('throws when the remote config does not exist', async () => {
    await expect(engine.runOne('vault-1', 'missing-remote')).rejects.toThrow()
  })
})
