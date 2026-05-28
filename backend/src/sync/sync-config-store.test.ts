import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { SyncConfigStore } from './sync-config-store.js'
import { CryptoService } from './crypto-service.js'
import type { ILogger } from '../logger/index.js'
import type { SyncConfig } from './types.js'

// ─── Test Helpers ────────────────────────────────────────────────────────────

function createMockLogger(): ILogger {
  return {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  }
}

function createTestConfig(overrides?: Partial<SyncConfig>): SyncConfig {
  return {
    endpoint: 'https://couch.example.com',
    database: 'my-vault-db',
    usernameEncrypted: 'encrypted-user',
    passwordEncrypted: 'encrypted-pass',
    mode: 'bidirectional',
    trigger: 'manual',
    status: 'active',
    e2eEnabled: false,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  }
}

// ─── Test Setup ──────────────────────────────────────────────────────────────

let testDir: string
let store: SyncConfigStore
let cryptoService: CryptoService
const logger = createMockLogger()

beforeEach(async () => {
  testDir = path.join(os.tmpdir(), `slatebase-sync-config-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  await fs.mkdir(testDir, { recursive: true })
  cryptoService = new CryptoService('test-secret-for-sync-config')
  store = new SyncConfigStore(testDir, cryptoService, logger)
})

afterAll(async () => {
  // Cleanup all test directories
  try {
    const tmpDir = os.tmpdir()
    const entries = await fs.readdir(tmpDir)
    for (const entry of entries) {
      if (entry.startsWith('slatebase-sync-config-test-')) {
        await fs.rm(path.join(tmpDir, entry), { recursive: true, force: true })
      }
    }
  } catch {
    // Ignore cleanup errors
  }
})

// ─── save() ──────────────────────────────────────────────────────────────────

describe('SyncConfigStore.save', () => {
  it('creates the vault sync directory and writes config.json', async () => {
    const vaultId = 'aabbccdd1122'
    const config = createTestConfig()

    await store.save(vaultId, config)

    const filePath = path.join(testDir, 'sync', vaultId, 'config.json')
    const raw = await fs.readFile(filePath, 'utf-8')
    const persisted = JSON.parse(raw)

    expect(persisted.endpoint).toBe('https://couch.example.com')
    expect(persisted.database).toBe('my-vault-db')
    expect(persisted.mode).toBe('bidirectional')
    expect(persisted.status).toBe('active')
  })

  it('overwrites an existing config atomically', async () => {
    const vaultId = 'aabbccdd1122'
    const config1 = createTestConfig({ endpoint: 'https://first.example.com' })
    const config2 = createTestConfig({ endpoint: 'https://second.example.com' })

    await store.save(vaultId, config1)
    await store.save(vaultId, config2)

    const loaded = await store.load(vaultId)
    expect(loaded?.endpoint).toBe('https://second.example.com')
  })

  it('stores encrypted credentials as-is (already encrypted by service layer)', async () => {
    const vaultId = 'aabbccdd1122'
    const encryptedUser = cryptoService.encrypt('admin')
    const encryptedPass = cryptoService.encrypt('s3cr3t!')
    const config = createTestConfig({
      usernameEncrypted: encryptedUser,
      passwordEncrypted: encryptedPass,
    })

    await store.save(vaultId, config)

    const filePath = path.join(testDir, 'sync', vaultId, 'config.json')
    const raw = await fs.readFile(filePath, 'utf-8')

    // Raw file should contain encrypted values, not plaintext
    expect(raw).not.toContain('admin')
    expect(raw).not.toContain('s3cr3t!')
    expect(raw).toContain(encryptedUser)
    expect(raw).toContain(encryptedPass)

    // Verify we can decrypt them back
    const persisted = JSON.parse(raw) as SyncConfig
    expect(cryptoService.decrypt(persisted.usernameEncrypted)).toBe('admin')
    expect(cryptoService.decrypt(persisted.passwordEncrypted)).toBe('s3cr3t!')
  })

  it('stores encrypted E2E passphrase when enabled', async () => {
    const vaultId = 'aabbccdd1122'
    const encryptedPassphrase = cryptoService.encrypt('my-e2e-passphrase')
    const config = createTestConfig({
      e2eEnabled: true,
      e2ePassphraseEncrypted: encryptedPassphrase,
    })

    await store.save(vaultId, config)

    const filePath = path.join(testDir, 'sync', vaultId, 'config.json')
    const raw = await fs.readFile(filePath, 'utf-8')

    expect(raw).not.toContain('my-e2e-passphrase')
    expect(raw).toContain(encryptedPassphrase)

    const persisted = JSON.parse(raw) as SyncConfig
    expect(cryptoService.decrypt(persisted.e2ePassphraseEncrypted!)).toBe('my-e2e-passphrase')
  })

  it('does not leave temp files on success', async () => {
    const vaultId = 'aabbccdd1122'
    await store.save(vaultId, createTestConfig())

    const dir = path.join(testDir, 'sync', vaultId)
    const files = await fs.readdir(dir)
    const tmpFiles = files.filter(f => f.endsWith('.tmp'))
    expect(tmpFiles).toHaveLength(0)
  })
})

// ─── load() ──────────────────────────────────────────────────────────────────

describe('SyncConfigStore.load', () => {
  it('returns the saved config', async () => {
    const vaultId = 'aabbccdd1122'
    const config = createTestConfig({
      mode: 'readonly',
      trigger: 'interval',
      intervalMinutes: 30,
    })

    await store.save(vaultId, config)
    const loaded = await store.load(vaultId)

    expect(loaded).not.toBeNull()
    expect(loaded!.endpoint).toBe('https://couch.example.com')
    expect(loaded!.mode).toBe('readonly')
    expect(loaded!.trigger).toBe('interval')
    expect(loaded!.intervalMinutes).toBe(30)
  })

  it('returns null when config does not exist', async () => {
    const loaded = await store.load('nonexistent123')
    expect(loaded).toBeNull()
  })

  it('returns null and logs error for corrupt JSON', async () => {
    const vaultId = 'corrupt12345'
    const dir = path.join(testDir, 'sync', vaultId)
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(path.join(dir, 'config.json'), 'not valid json{{{', 'utf-8')

    const errorCalls: unknown[] = []
    const errorLogger: ILogger = {
      ...createMockLogger(),
      error: (msg, meta) => { errorCalls.push({ msg, meta }) },
    }
    const storeWithErrorLogger = new SyncConfigStore(testDir, cryptoService, errorLogger)

    const loaded = await storeWithErrorLogger.load(vaultId)
    expect(loaded).toBeNull()
    expect(errorCalls.length).toBeGreaterThan(0)
  })
})

// ─── remove() ────────────────────────────────────────────────────────────────

describe('SyncConfigStore.remove', () => {
  it('removes an existing config file', async () => {
    const vaultId = 'aabbccdd1122'
    await store.save(vaultId, createTestConfig())

    await store.remove(vaultId)

    const loaded = await store.load(vaultId)
    expect(loaded).toBeNull()
  })

  it('does nothing when config does not exist', async () => {
    // Should not throw
    await expect(store.remove('nonexistent123')).resolves.toBeUndefined()
  })
})

// ─── loadAll() ───────────────────────────────────────────────────────────────

describe('SyncConfigStore.loadAll', () => {
  it('returns all saved configs', async () => {
    const config1 = createTestConfig({ endpoint: 'https://one.example.com' })
    const config2 = createTestConfig({ endpoint: 'https://two.example.com', status: 'disabled' })

    await store.save('vault1111aaaa', config1)
    await store.save('vault2222bbbb', config2)

    const all = await store.loadAll()

    expect(all).toHaveLength(2)
    const endpoints = all.map(e => e.config.endpoint).sort()
    expect(endpoints).toEqual(['https://one.example.com', 'https://two.example.com'])

    const vaultIds = all.map(e => e.vaultId).sort()
    expect(vaultIds).toEqual(['vault1111aaaa', 'vault2222bbbb'])
  })

  it('returns empty array when sync directory does not exist', async () => {
    const emptyDir = path.join(os.tmpdir(), `slatebase-sync-config-test-empty-${Date.now()}`)
    const emptyStore = new SyncConfigStore(emptyDir, cryptoService, logger)

    const all = await emptyStore.loadAll()
    expect(all).toEqual([])
  })

  it('skips directories without config.json', async () => {
    await store.save('vault1111aaaa', createTestConfig())

    // Create a directory without config.json
    const emptyVaultDir = path.join(testDir, 'sync', 'emptyvault123')
    await fs.mkdir(emptyVaultDir, { recursive: true })

    const all = await store.loadAll()
    expect(all).toHaveLength(1)
    expect(all[0]!.vaultId).toBe('vault1111aaaa')
  })

  it('skips corrupt config files and logs error', async () => {
    await store.save('goodvault1234', createTestConfig())

    // Create a corrupt config
    const corruptDir = path.join(testDir, 'sync', 'badvault12345')
    await fs.mkdir(corruptDir, { recursive: true })
    await fs.writeFile(path.join(corruptDir, 'config.json'), '{{invalid', 'utf-8')

    const errorCalls: unknown[] = []
    const errorLogger: ILogger = {
      ...createMockLogger(),
      error: (msg, meta) => { errorCalls.push({ msg, meta }) },
    }
    const storeWithErrorLogger = new SyncConfigStore(testDir, cryptoService, errorLogger)

    const all = await storeWithErrorLogger.loadAll()
    expect(all).toHaveLength(1)
    expect(all[0]!.vaultId).toBe('goodvault1234')
    expect(errorCalls.length).toBeGreaterThan(0)
  })
})
