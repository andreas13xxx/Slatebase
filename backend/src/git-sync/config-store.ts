// GitSyncConfigStore — per-vault persistence of git-sync remotes + shared branch
//
// One JSON file per vault (`data/git-sync/config/<vaultId>.json`) holding the
// vault's branch and its list of remotes, via the shared KeyedJsonFileStore
// (atomic writes, per-key mutex against concurrent read-modify-write).

import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { readdir } from 'node:fs/promises'
import { KeyedJsonFileStore } from '../shared/json-file-store.js'
import { GitSyncRemoteNotFoundError, GitSyncRemoteLimitExceededError } from './errors.js'
import type { GitSyncRemoteConfig, GitSyncVaultData } from './types.js'
import type { CreateGitSyncRemoteInput, UpdateGitSyncRemoteInput } from './validation.js'

export const DEFAULT_GIT_SYNC_BRANCH = 'main'
export const MAX_REMOTES_PER_VAULT = 20

const DEFAULT_VAULT_DATA: GitSyncVaultData = { branch: DEFAULT_GIT_SYNC_BRANCH, remotes: [] }

function parseVaultData(value: unknown): GitSyncVaultData | null {
  if (typeof value !== 'object' || value === null) return null
  const obj = value as Record<string, unknown>
  if (typeof obj['branch'] !== 'string' || !Array.isArray(obj['remotes'])) return null
  // `publicKey` was added after some records were already on disk — default it to `null`.
  const remotes = (obj['remotes'] as GitSyncRemoteConfig[]).map((r) => ({ publicKey: null, ...r }))
  return { branch: obj['branch'], remotes }
}

export interface IGitSyncConfigStore {
  getVaultData(vaultId: string): Promise<GitSyncVaultData>
  setBranch(vaultId: string, branch: string): Promise<GitSyncVaultData>
  listRemotes(vaultId: string): Promise<GitSyncRemoteConfig[]>
  getRemote(vaultId: string, remoteId: string): Promise<GitSyncRemoteConfig | null>
  createRemote(vaultId: string, input: CreateGitSyncRemoteInput, publicKey: string | null): Promise<GitSyncRemoteConfig>
  /** `publicKey === undefined` leaves the stored public key untouched; `null` clears it. */
  updateRemote(vaultId: string, remoteId: string, input: UpdateGitSyncRemoteInput, publicKey?: string | null): Promise<GitSyncRemoteConfig>
  removeRemote(vaultId: string, remoteId: string): Promise<void>
  /** All vaults that have at least one git-sync remote configured — used by the scheduler. */
  listVaultIdsWithRemotes(): Promise<string[]>
}

export class GitSyncConfigStore implements IGitSyncConfigStore {
  private readonly store: KeyedJsonFileStore<GitSyncVaultData>
  private readonly baseDir: string

  constructor(dataDir: string) {
    this.baseDir = join(dataDir, 'git-sync', 'config')
    this.store = new KeyedJsonFileStore<GitSyncVaultData>(
      (vaultId) => join(this.baseDir, `${vaultId}.json`),
      DEFAULT_VAULT_DATA,
      parseVaultData,
    )
  }

  async getVaultData(vaultId: string): Promise<GitSyncVaultData> {
    return this.store.read(vaultId)
  }

  async setBranch(vaultId: string, branch: string): Promise<GitSyncVaultData> {
    return this.store.mutate(vaultId, (current) => ({ ...current, branch }))
  }

  async listRemotes(vaultId: string): Promise<GitSyncRemoteConfig[]> {
    const data = await this.store.read(vaultId)
    return data.remotes
  }

  async getRemote(vaultId: string, remoteId: string): Promise<GitSyncRemoteConfig | null> {
    const data = await this.store.read(vaultId)
    return data.remotes.find((r) => r.id === remoteId) ?? null
  }

  async createRemote(vaultId: string, input: CreateGitSyncRemoteInput, publicKey: string | null): Promise<GitSyncRemoteConfig> {
    const now = new Date().toISOString()
    const remote: GitSyncRemoteConfig = {
      id: randomBytes(6).toString('hex'),
      vaultId,
      name: input.name,
      remoteUrl: input.remoteUrl,
      authMethod: input.authMethod,
      publicKey,
      intervalMinutes: input.intervalMinutes,
      enabled: input.enabled,
      createdAt: now,
      updatedAt: now,
    }

    await this.store.mutate(vaultId, (current) => {
      if (current.remotes.length >= MAX_REMOTES_PER_VAULT) {
        throw new GitSyncRemoteLimitExceededError(vaultId, MAX_REMOTES_PER_VAULT)
      }
      return { ...current, remotes: [...current.remotes, remote] }
    })

    return remote
  }

  async updateRemote(vaultId: string, remoteId: string, input: UpdateGitSyncRemoteInput, publicKey?: string | null): Promise<GitSyncRemoteConfig> {
    let updated: GitSyncRemoteConfig | undefined

    await this.store.mutate(vaultId, (current) => {
      const index = current.remotes.findIndex((r) => r.id === remoteId)
      if (index === -1) {
        throw new GitSyncRemoteNotFoundError(vaultId, remoteId)
      }
      const existing = current.remotes[index]!
      updated = {
        ...existing,
        ...(input.name !== undefined && { name: input.name }),
        ...(input.remoteUrl !== undefined && { remoteUrl: input.remoteUrl }),
        ...(input.authMethod !== undefined && { authMethod: input.authMethod }),
        ...(publicKey !== undefined && { publicKey }),
        ...(input.intervalMinutes !== undefined && { intervalMinutes: input.intervalMinutes }),
        ...(input.enabled !== undefined && { enabled: input.enabled }),
        updatedAt: new Date().toISOString(),
      }
      const remotes = [...current.remotes]
      remotes[index] = updated
      return { ...current, remotes }
    })

    return updated!
  }

  async removeRemote(vaultId: string, remoteId: string): Promise<void> {
    await this.store.mutate(vaultId, (current) => {
      const exists = current.remotes.some((r) => r.id === remoteId)
      if (!exists) {
        throw new GitSyncRemoteNotFoundError(vaultId, remoteId)
      }
      return { ...current, remotes: current.remotes.filter((r) => r.id !== remoteId) }
    })
  }

  async listVaultIdsWithRemotes(): Promise<string[]> {
    let files: string[]
    try {
      files = await readdir(this.baseDir)
    } catch {
      return []
    }
    return files.filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -'.json'.length))
  }
}
