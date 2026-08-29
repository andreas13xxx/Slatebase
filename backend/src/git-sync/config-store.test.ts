import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { GitSyncConfigStore, DEFAULT_GIT_SYNC_BRANCH, MAX_REMOTES_PER_VAULT } from './config-store.js'
import { GitSyncRemoteNotFoundError, GitSyncRemoteLimitExceededError } from './errors.js'
import type { CreateGitSyncRemoteInput } from './validation.js'

function makeInput(overrides: Partial<CreateGitSyncRemoteInput> = {}): CreateGitSyncRemoteInput {
  return {
    name: 'Origin',
    remoteUrl: 'https://example.invalid/repo.git',
    authMethod: 'https-token',
    credential: 'unused-in-config-store',
    intervalMinutes: 15,
    enabled: true,
    ...overrides,
  }
}

describe('GitSyncConfigStore', () => {
  let dataDir: string
  let store: GitSyncConfigStore

  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'git-sync-config-'))
    store = new GitSyncConfigStore(dataDir)
  })

  afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true })
  })

  it('defaults a vault with no remotes to the default branch and an empty list', async () => {
    const data = await store.getVaultData('vault-1')
    expect(data).toEqual({ branch: DEFAULT_GIT_SYNC_BRANCH, remotes: [] })
  })

  it('creates and lists remotes for a vault', async () => {
    const remote = await store.createRemote('vault-1', makeInput({ name: 'Primary' }), null)
    expect(remote.name).toBe('Primary')
    expect(remote.id).toMatch(/^[0-9a-f]{12}$/)

    const remotes = await store.listRemotes('vault-1')
    expect(remotes).toHaveLength(1)
    expect(remotes[0]?.id).toBe(remote.id)
  })

  it('keeps remotes for different vaults isolated', async () => {
    await store.createRemote('vault-1', makeInput({ name: 'A' }), null)
    await store.createRemote('vault-2', makeInput({ name: 'B' }), null)

    expect((await store.listRemotes('vault-1')).map((r) => r.name)).toEqual(['A'])
    expect((await store.listRemotes('vault-2')).map((r) => r.name)).toEqual(['B'])
  })

  it('updates a remote and bumps updatedAt', async () => {
    const remote = await store.createRemote('vault-1', makeInput(), null)
    const updated = await store.updateRemote('vault-1', remote.id, { intervalMinutes: 30, enabled: false })

    expect(updated.intervalMinutes).toBe(30)
    expect(updated.enabled).toBe(false)
    expect(updated.name).toBe(remote.name) // untouched fields survive
  })

  it('throws when updating or removing a remote that does not exist', async () => {
    await expect(store.updateRemote('vault-1', 'missing', { enabled: false })).rejects.toThrow(GitSyncRemoteNotFoundError)
    await expect(store.removeRemote('vault-1', 'missing')).rejects.toThrow(GitSyncRemoteNotFoundError)
  })

  it('removes a remote', async () => {
    const remote = await store.createRemote('vault-1', makeInput(), null)
    await store.removeRemote('vault-1', remote.id)
    expect(await store.listRemotes('vault-1')).toEqual([])
  })

  it('sets the shared branch for a vault', async () => {
    const data = await store.setBranch('vault-1', 'develop')
    expect(data.branch).toBe('develop')
    expect((await store.getVaultData('vault-1')).branch).toBe('develop')
  })

  it('enforces the maximum number of remotes per vault', async () => {
    for (let i = 0; i < MAX_REMOTES_PER_VAULT; i++) {
      await store.createRemote('vault-1', makeInput({ name: `Remote ${i}` }), null)
    }
    await expect(store.createRemote('vault-1', makeInput({ name: 'One too many' }), null)).rejects.toThrow(GitSyncRemoteLimitExceededError)
  })

  it('lists vault IDs that have at least one remote configured', async () => {
    await store.createRemote('vault-1', makeInput(), null)
    await store.getVaultData('vault-2') // touches nothing on disk — vault-2 has no file yet

    expect(await store.listVaultIdsWithRemotes()).toEqual(['vault-1'])
  })

  it('stores the public key on create and lets it be updated or cleared', async () => {
    const remote = await store.createRemote('vault-1', makeInput({ authMethod: 'ssh-key' }), 'ssh-ed25519 AAAA... first')
    expect(remote.publicKey).toBe('ssh-ed25519 AAAA... first')

    const rotated = await store.updateRemote('vault-1', remote.id, {}, 'ssh-ed25519 AAAA... second')
    expect(rotated.publicKey).toBe('ssh-ed25519 AAAA... second')

    const untouched = await store.updateRemote('vault-1', remote.id, { intervalMinutes: 20 })
    expect(untouched.publicKey).toBe('ssh-ed25519 AAAA... second') // publicKey omitted -> left alone

    const cleared = await store.updateRemote('vault-1', remote.id, { authMethod: 'https-token' }, null)
    expect(cleared.publicKey).toBeNull()
  })

  it('defaults publicKey to null for records persisted before the field existed', async () => {
    const remote = await store.createRemote('vault-1', makeInput(), null)
    const configPath = join(dataDir, 'git-sync', 'config', 'vault-1.json')
    const raw = JSON.parse(await readFile(configPath, 'utf-8')) as { remotes: Array<Record<string, unknown>> }
    const legacyRemote = raw.remotes.find((r) => r['id'] === remote.id)!
    delete legacyRemote['publicKey']
    await writeFile(configPath, JSON.stringify(raw))

    const reloaded = await store.getRemote('vault-1', remote.id)
    expect(reloaded?.publicKey).toBeNull()
  })
})
