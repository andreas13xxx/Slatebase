// MailImportStatusStore — per-vault persistence of last-run status per config

import { join } from 'node:path'
import { KeyedJsonFileStore } from '../shared/json-file-store.js'
import type { MailImportRunStatus, MailImportStatusMap } from './types.js'

function parseStatusMap(value: unknown): MailImportStatusMap | null {
  if (typeof value !== 'object' || value === null) return null
  return value as MailImportStatusMap
}

export interface IMailImportStatusStore {
  getStatus(vaultId: string, configId: string): Promise<MailImportRunStatus | null>
  setStatus(vaultId: string, status: MailImportRunStatus): Promise<void>
}

export class MailImportStatusStore implements IMailImportStatusStore {
  private readonly store: KeyedJsonFileStore<MailImportStatusMap>

  constructor(dataDir: string) {
    this.store = new KeyedJsonFileStore<MailImportStatusMap>(
      (vaultId) => join(dataDir, 'mail-import', 'status', `${vaultId}.json`),
      {},
      parseStatusMap,
    )
  }

  async getStatus(vaultId: string, configId: string): Promise<MailImportRunStatus | null> {
    const map = await this.store.read(vaultId)
    return map[configId] ?? null
  }

  async setStatus(vaultId: string, status: MailImportRunStatus): Promise<void> {
    await this.store.mutate(vaultId, (current) => ({ ...current, [status.configId]: status }))
  }
}
