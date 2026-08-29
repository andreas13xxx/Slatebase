// GitSyncStatusStore — per-vault persistence of last-run status per remote,
// so status survives a server restart.

import { join } from 'node:path'
import { KeyedJsonFileStore } from '../shared/json-file-store.js'
import type { GitSyncRemoteStatus, GitSyncStatusMap } from './types.js'

function parseStatusMap(value: unknown): GitSyncStatusMap | null {
  if (typeof value !== 'object' || value === null) return null
  return value as GitSyncStatusMap
}

export interface IGitSyncStatusStore {
  getStatus(vaultId: string, remoteId: string): Promise<GitSyncRemoteStatus | null>
  setStatus(vaultId: string, status: GitSyncRemoteStatus): Promise<void>
  removeStatus(vaultId: string, remoteId: string): Promise<void>
}

export class GitSyncStatusStore implements IGitSyncStatusStore {
  private readonly store: KeyedJsonFileStore<GitSyncStatusMap>

  constructor(dataDir: string) {
    this.store = new KeyedJsonFileStore<GitSyncStatusMap>(
      (vaultId) => join(dataDir, 'git-sync', 'status', `${vaultId}.json`),
      {},
      parseStatusMap,
    )
  }

  async getStatus(vaultId: string, remoteId: string): Promise<GitSyncRemoteStatus | null> {
    const map = await this.store.read(vaultId)
    return map[remoteId] ?? null
  }

  async setStatus(vaultId: string, status: GitSyncRemoteStatus): Promise<void> {
    await this.store.mutate(vaultId, (current) => ({ ...current, [status.remoteId]: status }))
  }

  async removeStatus(vaultId: string, remoteId: string): Promise<void> {
    await this.store.mutate(vaultId, (current) => {
      const next = { ...current }
      delete next[remoteId]
      return next
    })
  }
}
