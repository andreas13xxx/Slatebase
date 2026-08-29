import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MailImportConfigStore, MAX_CONFIGS_PER_VAULT } from './config-store.js'
import { MailImportConfigNotFoundError, MailImportConfigLimitExceededError } from './errors.js'
import type { CreateMailImportConfigInput } from './validation.js'

function makeInput(overrides: Partial<CreateMailImportConfigInput> = {}): CreateMailImportConfigInput {
  return {
    name: 'Personal Inbox',
    host: 'imap.example.invalid',
    port: 993,
    secure: true,
    username: 'user@example.invalid',
    password: 'unused-in-config-store',
    mailbox: 'INBOX',
    targetFolder: 'Mail',
    intervalMinutes: 15,
    enabled: true,
    ...overrides,
  }
}

describe('MailImportConfigStore', () => {
  let dataDir: string
  let store: MailImportConfigStore

  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'mail-import-config-'))
    store = new MailImportConfigStore(dataDir)
  })

  afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true })
  })

  it('starts empty for a vault with no configs', async () => {
    expect(await store.listByVault('vault-1')).toEqual([])
  })

  it('creates a config with a generated id', async () => {
    const config = await store.create('vault-1', makeInput())
    expect(config.id).toMatch(/^[0-9a-f]{12}$/)
  })

  it('keeps configs for different vaults isolated', async () => {
    await store.create('vault-1', makeInput({ name: 'A' }))
    await store.create('vault-2', makeInput({ name: 'B' }))

    expect((await store.listByVault('vault-1')).map((c) => c.name)).toEqual(['A'])
    expect((await store.listByVault('vault-2')).map((c) => c.name)).toEqual(['B'])
  })

  it('updates a config', async () => {
    const config = await store.create('vault-1', makeInput())
    const updated = await store.update('vault-1', config.id, { intervalMinutes: 60, enabled: false })
    expect(updated.intervalMinutes).toBe(60)
    expect(updated.enabled).toBe(false)
  })

  it('throws when updating or removing a config that does not exist', async () => {
    await expect(store.update('vault-1', 'missing', { enabled: false })).rejects.toThrow(MailImportConfigNotFoundError)
    await expect(store.remove('vault-1', 'missing')).rejects.toThrow(MailImportConfigNotFoundError)
  })

  it('enforces the maximum number of configs per vault', async () => {
    for (let i = 0; i < MAX_CONFIGS_PER_VAULT; i++) {
      await store.create('vault-1', makeInput({ name: `Account ${i}` }))
    }
    await expect(store.create('vault-1', makeInput({ name: 'One too many' }))).rejects.toThrow(MailImportConfigLimitExceededError)
  })

  it('lists vault IDs that have at least one config', async () => {
    await store.create('vault-1', makeInput())
    expect(await store.listVaultIdsWithConfigs()).toEqual(['vault-1'])
  })
})
