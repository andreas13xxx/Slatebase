import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PluginSecretKeyManager } from './secret-key-manager.js'
import { PluginSecretStore, SecretLimitExceededError, SecretTooLargeError } from './secret-store.js'

// ─── Mock Logger ─────────────────────────────────────────────────────────────

const createMockLogger = () => ({
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
  child: () => createMockLogger(),
} as unknown as import('../logger/index.js').ILogger)

// ─── PluginSecretKeyManager Tests ────────────────────────────────────────────

describe('PluginSecretKeyManager', () => {
  let dataDir: string

  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'plugin-secret-key-'))
  })

  afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true })
  })

  it('generates and persists a key on first run', async () => {
    const manager = new PluginSecretKeyManager(dataDir, createMockLogger())
    await manager.loadOrCreate()

    const keyFile = await readFile(join(dataDir, '.plugin-secret-key'), 'utf-8')
    expect(keyFile.trim()).toMatch(/^[0-9a-f]{64}$/i)
  })

  it('reuses persisted key on subsequent runs', async () => {
    const manager1 = new PluginSecretKeyManager(dataDir, createMockLogger())
    await manager1.loadOrCreate()

    const manager2 = new PluginSecretKeyManager(dataDir, createMockLogger())
    await manager2.loadOrCreate()

    // Encrypt with one, decrypt with the other — proves same key
    const encrypted = manager1.encrypt('hello')
    const decrypted = manager2.decrypt(encrypted.iv, encrypted.ciphertext)
    expect(decrypted).toBe('hello')
  })

  it('loads key from env variable', async () => {
    const fakeKey = 'a'.repeat(64)
    process.env['SLATEBASE_PLUGIN_SECRET_KEY'] = fakeKey
    try {
      const manager = new PluginSecretKeyManager(dataDir, createMockLogger())
      await manager.loadOrCreate()

      const encrypted = manager.encrypt('test')
      expect(manager.decrypt(encrypted.iv, encrypted.ciphertext)).toBe('test')
    } finally {
      delete process.env['SLATEBASE_PLUGIN_SECRET_KEY']
    }
  })

  it('encrypt/decrypt round-trip', async () => {
    const manager = new PluginSecretKeyManager(dataDir, createMockLogger())
    await manager.loadOrCreate()

    const plaintext = 'sk-proj-abc123XYZ!@#$%^&*()'
    const { iv, ciphertext } = manager.encrypt(plaintext)
    expect(iv).toMatch(/^[0-9a-f]{24}$/i) // 12 bytes = 24 hex chars
    expect(ciphertext.length).toBeGreaterThan(0)
    expect(manager.decrypt(iv, ciphertext)).toBe(plaintext)
  })

  it('throws on tampered ciphertext', async () => {
    const manager = new PluginSecretKeyManager(dataDir, createMockLogger())
    await manager.loadOrCreate()

    const { iv, ciphertext } = manager.encrypt('secret')
    // XOR-flip (not overwrite) the first byte, so it's guaranteed to differ from the
    // original regardless of its value — a fixed 'ff' has a ~1/256 chance of being a
    // no-op if the ciphertext already happens to start with that byte.
    const firstByte = parseInt(ciphertext.slice(0, 2), 16)
    const flipped = (firstByte ^ 0xff).toString(16).padStart(2, '0')
    const tampered = flipped + ciphertext.slice(2)
    expect(() => manager.decrypt(iv, tampered)).toThrow()
  })
})

// ─── PluginSecretStore Tests ─────────────────────────────────────────────────

describe('PluginSecretStore', () => {
  let dataDir: string
  let keyManager: PluginSecretKeyManager
  let store: PluginSecretStore

  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'plugin-secret-store-'))
    keyManager = new PluginSecretKeyManager(dataDir, createMockLogger())
    await keyManager.loadOrCreate()
    store = new PluginSecretStore(dataDir, keyManager)
  })

  afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true })
  })

  it('set/get round-trip', async () => {
    await store.setSecret('vault-1', 'my-plugin', 'api-key', 'sk-abc123')
    const value = await store.getSecret('vault-1', 'my-plugin', 'api-key')
    expect(value).toBe('sk-abc123')
  })

  it('returns null for non-existent secret', async () => {
    const value = await store.getSecret('vault-1', 'my-plugin', 'missing')
    expect(value).toBeNull()
  })

  it('listSecrets returns secret IDs', async () => {
    await store.setSecret('vault-1', 'my-plugin', 'key-a', 'val-a')
    await store.setSecret('vault-1', 'my-plugin', 'key-b', 'val-b')
    const ids = await store.listSecrets('vault-1', 'my-plugin')
    expect(ids.sort()).toEqual(['key-a', 'key-b'])
  })

  it('deleteSecret removes a single secret', async () => {
    await store.setSecret('vault-1', 'my-plugin', 'key-a', 'val-a')
    await store.setSecret('vault-1', 'my-plugin', 'key-b', 'val-b')
    await store.deleteSecret('vault-1', 'my-plugin', 'key-a')

    expect(await store.getSecret('vault-1', 'my-plugin', 'key-a')).toBeNull()
    expect(await store.getSecret('vault-1', 'my-plugin', 'key-b')).toBe('val-b')
  })

  it('deleteAllForPlugin removes the secrets file', async () => {
    await store.setSecret('vault-1', 'my-plugin', 'key', 'val')
    await store.deleteAllForPlugin('vault-1', 'my-plugin')
    expect(await store.listSecrets('vault-1', 'my-plugin')).toEqual([])
  })

  it('enforces max secrets limit', async () => {
    for (let i = 0; i < 50; i++) {
      await store.setSecret('vault-1', 'my-plugin', `key-${i}`, `val-${i}`)
    }
    await expect(
      store.setSecret('vault-1', 'my-plugin', 'key-51', 'val')
    ).rejects.toThrow(SecretLimitExceededError)
  })

  it('enforces max secret value size', async () => {
    const largeValue = 'x'.repeat(11 * 1024) // > 10 KB
    await expect(
      store.setSecret('vault-1', 'my-plugin', 'big', largeValue)
    ).rejects.toThrow(SecretTooLargeError)
  })

  it('updating an existing secret does not count against the limit', async () => {
    for (let i = 0; i < 50; i++) {
      await store.setSecret('vault-1', 'my-plugin', `key-${i}`, `val-${i}`)
    }
    // Update existing — should NOT throw
    await store.setSecret('vault-1', 'my-plugin', 'key-0', 'updated-val')
    expect(await store.getSecret('vault-1', 'my-plugin', 'key-0')).toBe('updated-val')
  })

  it('secrets are stored encrypted on disk', async () => {
    await store.setSecret('vault-1', 'my-plugin', 'token', 'super-secret-value')
    const filePath = join(dataDir, 'plugins', 'vault-1', 'my-plugin', 'secrets.json')
    const raw = await readFile(filePath, 'utf-8')
    expect(raw).not.toContain('super-secret-value')
    expect(raw).toContain('"iv"')
    expect(raw).toContain('"ciphertext"')
  })
})
