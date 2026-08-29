// MailImportConfigStore — per-vault persistence of IMAP mail-import configs
//
// One JSON file per vault (`data/mail-import/config/<vaultId>.json`) holding
// an array of configs, via the shared KeyedJsonFileStore (atomic writes,
// per-key mutex against concurrent read-modify-write).

import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { readdir } from 'node:fs/promises'
import { KeyedJsonFileStore } from '../shared/json-file-store.js'
import { MailImportConfigNotFoundError, MailImportConfigLimitExceededError } from './errors.js'
import type { MailImportConfig } from './types.js'
import type { CreateMailImportConfigInput, UpdateMailImportConfigInput } from './validation.js'

export const MAX_CONFIGS_PER_VAULT = 20

function parseConfigs(value: unknown): MailImportConfig[] | null {
  return Array.isArray(value) ? (value as MailImportConfig[]) : null
}

export interface IMailImportConfigStore {
  listByVault(vaultId: string): Promise<MailImportConfig[]>
  get(vaultId: string, configId: string): Promise<MailImportConfig | null>
  create(vaultId: string, input: CreateMailImportConfigInput): Promise<MailImportConfig>
  update(vaultId: string, configId: string, input: UpdateMailImportConfigInput): Promise<MailImportConfig>
  remove(vaultId: string, configId: string): Promise<void>
  /** All vaults that have at least one mail-import config — used by the scheduler. */
  listVaultIdsWithConfigs(): Promise<string[]>
}

export class MailImportConfigStore implements IMailImportConfigStore {
  private readonly store: KeyedJsonFileStore<MailImportConfig[]>
  private readonly baseDir: string

  constructor(dataDir: string) {
    this.baseDir = join(dataDir, 'mail-import', 'config')
    this.store = new KeyedJsonFileStore<MailImportConfig[]>(
      (vaultId) => join(this.baseDir, `${vaultId}.json`),
      [],
      parseConfigs,
    )
  }

  async listByVault(vaultId: string): Promise<MailImportConfig[]> {
    return this.store.read(vaultId)
  }

  async get(vaultId: string, configId: string): Promise<MailImportConfig | null> {
    const configs = await this.store.read(vaultId)
    return configs.find((c) => c.id === configId) ?? null
  }

  async create(vaultId: string, input: CreateMailImportConfigInput): Promise<MailImportConfig> {
    const now = new Date().toISOString()
    const config: MailImportConfig = {
      id: randomBytes(6).toString('hex'),
      vaultId,
      name: input.name,
      host: input.host,
      port: input.port,
      secure: input.secure,
      username: input.username,
      mailbox: input.mailbox,
      targetFolder: input.targetFolder,
      intervalMinutes: input.intervalMinutes,
      enabled: input.enabled,
      createdAt: now,
      updatedAt: now,
    }

    await this.store.mutate(vaultId, (current) => {
      if (current.length >= MAX_CONFIGS_PER_VAULT) {
        throw new MailImportConfigLimitExceededError(vaultId, MAX_CONFIGS_PER_VAULT)
      }
      return [...current, config]
    })

    return config
  }

  async update(vaultId: string, configId: string, input: UpdateMailImportConfigInput): Promise<MailImportConfig> {
    let updated: MailImportConfig | undefined

    await this.store.mutate(vaultId, (current) => {
      const index = current.findIndex((c) => c.id === configId)
      if (index === -1) {
        throw new MailImportConfigNotFoundError(vaultId, configId)
      }
      const existing = current[index]!
      updated = {
        ...existing,
        ...(input.name !== undefined && { name: input.name }),
        ...(input.host !== undefined && { host: input.host }),
        ...(input.port !== undefined && { port: input.port }),
        ...(input.secure !== undefined && { secure: input.secure }),
        ...(input.username !== undefined && { username: input.username }),
        ...(input.mailbox !== undefined && { mailbox: input.mailbox }),
        ...(input.targetFolder !== undefined && { targetFolder: input.targetFolder }),
        ...(input.intervalMinutes !== undefined && { intervalMinutes: input.intervalMinutes }),
        ...(input.enabled !== undefined && { enabled: input.enabled }),
        updatedAt: new Date().toISOString(),
      }
      const next = [...current]
      next[index] = updated
      return next
    })

    return updated!
  }

  async remove(vaultId: string, configId: string): Promise<void> {
    await this.store.mutate(vaultId, (current) => {
      const exists = current.some((c) => c.id === configId)
      if (!exists) {
        throw new MailImportConfigNotFoundError(vaultId, configId)
      }
      return current.filter((c) => c.id !== configId)
    })
  }

  async listVaultIdsWithConfigs(): Promise<string[]> {
    let files: string[]
    try {
      files = await readdir(this.baseDir)
    } catch {
      return []
    }
    return files.filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -'.json'.length))
  }
}
