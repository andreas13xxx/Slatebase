import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ModuleSecretKeyManager } from './secret-key-manager.js'
import { ModuleSecretStore, ModuleSecretTooLargeError } from './secret-store.js'

// ─── Mock Logger ─────────────────────────────────────────────────────────────

const createMockLogger = () => ({
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
} as unknown as import('../logger/index.js').ILogger)

// ─── ModuleSecretKeyManager Tests ────────────────────────────────────────────

describe('ModuleSecretKeyManager', () => {
  let dataDir: string

  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'module-secret-key-'))
  })

  afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true })
  })

  it('generates and persists a key on first run', async () => {
    const manager = new ModuleSecretKeyManager(dataDir, createMockLogger())
    await manager.loadOrCreate()

    const keyFile = await readFile(join(dataDir, '.module-secret-key'), 'utf-8')
    expect(keyFile.trim()).toMatch(/^[0-9a-f]{64}$/i)
  })

  it('reuses persisted key on subsequent runs', async () => {
    const manager1 = new ModuleSecretKeyManager(dataDir, createMockLogger())
    await manager1.loadOrCreate()

    const manager2 = new ModuleSecretKeyManager(dataDir, createMockLogger())
    await manager2.loadOrCreate()

    const encrypted = manager1.encrypt('hello')
    const decrypted = manager2.decrypt(encrypted.iv, encrypted.ciphertext)
    expect(decrypted).toBe('hello')
  })

  it('loads key from env variable', async () => {
    const fakeKey = 'b'.repeat(64)
    process.env['SLATEBASE_MODULE_SECRET_KEY'] = fakeKey
    try {
      const manager = new ModuleSecretKeyManager(dataDir, createMockLogger())
      await manager.loadOrCreate()

      const encrypted = manager.encrypt('test')
      expect(manager.decrypt(encrypted.iv, encrypted.ciphertext)).toBe('test')
    } finally {
      delete process.env['SLATEBASE_MODULE_SECRET_KEY']
    }
  })

  it('throws on tampered ciphertext', async () => {
    const manager = new ModuleSecretKeyManager(dataDir, createMockLogger())
    await manager.loadOrCreate()

    const { iv, ciphertext } = manager.encrypt('secret')
    const firstByte = parseInt(ciphertext.slice(0, 2), 16)
    const flipped = (firstByte ^ 0xff).toString(16).padStart(2, '0')
    const tampered = flipped + ciphertext.slice(2)
    expect(() => manager.decrypt(iv, tampered)).toThrow()
  })
})

// ─── ModuleSecretStore Tests ─────────────────────────────────────────────────

describe('ModuleSecretStore', () => {
  let dataDir: string
  let keyManager: ModuleSecretKeyManager
  let store: ModuleSecretStore

  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'module-secret-store-'))
    keyManager = new ModuleSecretKeyManager(dataDir, createMockLogger())
    await keyManager.loadOrCreate()
    store = new ModuleSecretStore(dataDir, keyManager)
  })

  afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true })
  })

  it('set/get round-trip, scoped per module', async () => {
    await store.setSecret('vault-1', 'git-sync', 'remote-a', 'ghp_token')
    await store.setSecret('vault-1', 'mail-import', 'account-a', 'imap-password')

    expect(await store.getSecret('vault-1', 'git-sync', 'remote-a')).toBe('ghp_token')
    expect(await store.getSecret('vault-1', 'mail-import', 'account-a')).toBe('imap-password')
  })

  it('returns null for non-existent secret', async () => {
    expect(await store.getSecret('vault-1', 'git-sync', 'missing')).toBeNull()
  })

  it('deleteSecret removes a single secret without affecting others', async () => {
    await store.setSecret('vault-1', 'git-sync', 'remote-a', 'token-a')
    await store.setSecret('vault-1', 'git-sync', 'remote-b', 'token-b')
    await store.deleteSecret('vault-1', 'git-sync', 'remote-a')

    expect(await store.getSecret('vault-1', 'git-sync', 'remote-a')).toBeNull()
    expect(await store.getSecret('vault-1', 'git-sync', 'remote-b')).toBe('token-b')
  })

  it('enforces max secret value size', async () => {
    const largeValue = 'x'.repeat(11 * 1024) // > 10 KB
    await expect(
      store.setSecret('vault-1', 'git-sync', 'big', largeValue)
    ).rejects.toThrow(ModuleSecretTooLargeError)
  })

  it('secrets are stored encrypted on disk', async () => {
    await store.setSecret('vault-1', 'mail-import', 'account-a', 'super-secret-password')
    const filePath = join(dataDir, 'module-secrets', 'vault-1', 'mail-import', 'secrets.json')
    const raw = await readFile(filePath, 'utf-8')
    expect(raw).not.toContain('super-secret-password')
    expect(raw).toContain('"iv"')
    expect(raw).toContain('"ciphertext"')
  })
})
