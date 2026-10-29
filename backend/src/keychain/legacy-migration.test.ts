import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, mkdir, access, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PluginSecretKeyManager } from '../plugin/index.js'
import { ModuleSecretKeyManager, ModuleSecretStore } from '../shared-secrets/index.js'
import { KeychainService } from './index.js'
import { migratePluginSecretsToKeychain, normalizeSecretId } from './legacy-migration.js'

const logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
} as unknown as import('../logger/index.js').ILogger

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

describe('normalizeSecretId', () => {
  it('lowercases and turns other characters into single hyphens', () => {
    expect(normalizeSecretId('ApiKey')).toBe('apikey')
    expect(normalizeSecretId('api_key')).toBe('api-key')
    expect(normalizeSecretId('__a__b--c__')).toBe('a-b-c')
  })

  it('falls back to "secret" and respects the length limit', () => {
    expect(normalizeSecretId('___')).toBe('secret')
    expect(normalizeSecretId('a'.repeat(200))).toHaveLength(128)
  })
})

/** Writes a secret in the former per-plugin file format (`{ secrets: { <id>: { iv, ciphertext } } }`). */
async function writeLegacySecret(
  dataDir: string,
  keys: PluginSecretKeyManager,
  vaultId: string,
  pluginId: string,
  secretId: string,
  value: string,
): Promise<void> {
  const dir = join(dataDir, 'plugins', vaultId, pluginId)
  const file = join(dir, 'secrets.json')
  await mkdir(dir, { recursive: true })
  let data: { secrets: Record<string, { iv: string; ciphertext: string }> } = { secrets: {} }
  try {
    data = JSON.parse(await readFile(file, 'utf-8')) as typeof data
  } catch { /* first secret of this plugin */ }
  data.secrets[secretId] = keys.encrypt(value)
  await writeFile(file, JSON.stringify(data))
}

describe('migratePluginSecretsToKeychain', () => {
  let dataDir: string
  let oldKeys: PluginSecretKeyManager
  let oldStore: { setSecret(vaultId: string, pluginId: string, secretId: string, value: string): Promise<void> }
  let keychain: KeychainService

  const run = () => migratePluginSecretsToKeychain({ dataDir, keychain, keyManager: oldKeys, logger })
  const legacyFile = (vault: string, plugin: string) => join(dataDir, 'plugins', vault, plugin, 'secrets.json')

  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'keychain-migration-'))
    oldKeys = new PluginSecretKeyManager(dataDir, logger)
    await oldKeys.loadOrCreate()
    oldStore = { setSecret: (v, p, id, value) => writeLegacySecret(dataDir, oldKeys, v, p, id, value) }
    const newKeys = new ModuleSecretKeyManager(dataDir, logger)
    await newKeys.loadOrCreate()
    keychain = new KeychainService(new ModuleSecretStore(dataDir, newKeys))
  })

  afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true })
  })

  it('does nothing when there is no plugin data', async () => {
    expect(await run()).toEqual({ migrated: 0, renamed: 0, dropped: 0, failedFiles: 0 })
  })

  it('moves secrets into the keychain, normalizes IDs and removes the old file', async () => {
    await oldStore.setSecret('v1', 'plug-a', 'API_Key', 'sk-1')
    await oldStore.setSecret('v1', 'plug-a', 'token', 'tok')

    const result = await run()

    expect(result).toMatchObject({ migrated: 2, renamed: 1, dropped: 0, failedFiles: 0 })
    expect(await keychain.list('v1')).toEqual(['api-key', 'token'])
    expect(await keychain.get('v1', 'api-key')).toBe('sk-1')
    expect(await exists(legacyFile('v1', 'plug-a'))).toBe(false)
  })

  it('shares one entry when two plugins have the same ID and value', async () => {
    await oldStore.setSecret('v1', 'plug-a', 'key', 'same')
    await oldStore.setSecret('v1', 'plug-b', 'key', 'same')

    await run()

    expect(await keychain.list('v1')).toEqual(['key'])
  })

  it('keeps both values when the same ID has different values', async () => {
    await oldStore.setSecret('v1', 'plug-a', 'key', 'from-a')
    await oldStore.setSecret('v1', 'plug-b', 'key', 'from-b')

    await run()

    const ids = await keychain.list('v1')
    expect(ids).toHaveLength(2)
    const values = await Promise.all(ids.map((id) => keychain.get('v1', id)))
    expect(values.sort()).toEqual(['from-a', 'from-b'])
    expect(ids.some((id) => id === 'plug-b-key' || id === 'plug-a-key')).toBe(true)
  })

  it('keeps vaults apart', async () => {
    await oldStore.setSecret('v1', 'plug-a', 'key', 'one')
    await oldStore.setSecret('v2', 'plug-a', 'key', 'two')

    await run()

    expect(await keychain.get('v1', 'key')).toBe('one')
    expect(await keychain.get('v2', 'key')).toBe('two')
  })

  it('is idempotent, also when a previous run stopped before deleting the file', async () => {
    await oldStore.setSecret('v1', 'plug-a', 'key', 'a')
    await oldStore.setSecret('v1', 'plug-b', 'key', 'b')
    await run()
    const before = await keychain.list('v1')

    // Simulate a crash after storing but before the unlink: write the legacy data again.
    await oldStore.setSecret('v1', 'plug-a', 'key', 'a')
    await oldStore.setSecret('v1', 'plug-b', 'key', 'b')
    await run()

    expect(await keychain.list('v1')).toEqual(before)
    expect(await run()).toMatchObject({ migrated: 0 })
  })

  it('does not overwrite an entry the user already has in the keychain', async () => {
    await keychain.set('v1', 'key', 'keychain-value')
    await oldStore.setSecret('v1', 'plug-a', 'key', 'legacy-value')

    await run()

    expect(await keychain.get('v1', 'key')).toBe('keychain-value')
    expect(await keychain.get('v1', 'plug-a-key')).toBe('legacy-value')
  })

  it('drops entries that cannot be decrypted and still removes the file', async () => {
    await oldStore.setSecret('v1', 'plug-a', 'good', 'ok')
    const otherKeys = new PluginSecretKeyManager(await mkdtemp(join(tmpdir(), 'other-key-')), logger)
    await otherKeys.loadOrCreate()
    // Same file, but one entry encrypted with a different key.
    await writeLegacySecret(dataDir, otherKeys, 'v1', 'plug-a', 'bad', 'lost')

    const result = await run()

    expect(result).toMatchObject({ migrated: 1, dropped: 1, failedFiles: 0 })
    expect(await keychain.list('v1')).toEqual(['good'])
    expect(await exists(legacyFile('v1', 'plug-a'))).toBe(false)
  })

  it('leaves an invalid file in place and counts it as failed', async () => {
    await mkdir(join(dataDir, 'plugins', 'v1', 'plug-a'), { recursive: true })
    await writeFile(legacyFile('v1', 'plug-a'), 'not json')

    const result = await run()

    expect(result.failedFiles).toBe(1)
    expect(await exists(legacyFile('v1', 'plug-a'))).toBe(true)
  })

  it('ignores plugin folders without secrets and the registry file', async () => {
    await mkdir(join(dataDir, 'plugins', 'v1', 'plug-a'), { recursive: true })
    await writeFile(join(dataDir, 'plugins', 'v1', '_registry.json'), '{}')

    expect(await run()).toEqual({ migrated: 0, renamed: 0, dropped: 0, failedFiles: 0 })
  })
})
