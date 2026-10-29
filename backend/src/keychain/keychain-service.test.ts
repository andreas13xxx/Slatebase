import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, readFile, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ModuleSecretKeyManager, ModuleSecretStore } from '../shared-secrets/index.js'
import {
  KeychainService,
  KeychainInvalidIdError,
  KeychainLimitExceededError,
  MAX_KEYCHAIN_ENTRIES,
  isValidKeychainSecretId,
} from './index.js'

const logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
} as unknown as import('../logger/index.js').ILogger

describe('isValidKeychainSecretId', () => {
  it('accepts lowercase letters, digits and single hyphens', () => {
    for (const id of ['a', 'openai-key', 'key2', 'a-b-c-1']) expect(isValidKeychainSecretId(id)).toBe(true)
  })

  it('rejects everything else', () => {
    for (const id of ['', 'Key', 'a_b', '-a', 'a-', 'a--b', 'a b', 'a/b', '../x', 'ä']) {
      expect(isValidKeychainSecretId(id)).toBe(false)
    }
    expect(isValidKeychainSecretId('a'.repeat(129))).toBe(false)
    expect(isValidKeychainSecretId('a'.repeat(128))).toBe(true)
  })
})

describe('KeychainService', () => {
  let dataDir: string
  let service: KeychainService

  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'keychain-'))
    const keyManager = new ModuleSecretKeyManager(dataDir, logger)
    await keyManager.loadOrCreate()
    service = new KeychainService(new ModuleSecretStore(dataDir, keyManager))
  })

  afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true })
  })

  it('stores, reads, lists (sorted) and deletes entries', async () => {
    await service.set('v1', 'zeta', 'z')
    await service.set('v1', 'alpha', 'a')

    expect(await service.get('v1', 'alpha')).toBe('a')
    expect(await service.list('v1')).toEqual(['alpha', 'zeta'])

    await service.delete('v1', 'alpha')
    expect(await service.get('v1', 'alpha')).toBeNull()
    expect(await service.list('v1')).toEqual(['zeta'])
  })

  it('replaces an existing entry', async () => {
    await service.set('v1', 'k', 'old')
    await service.set('v1', 'k', 'new')
    expect(await service.get('v1', 'k')).toBe('new')
    expect(await service.list('v1')).toEqual(['k'])
  })

  it('keeps vaults apart', async () => {
    await service.set('v1', 'k', 'one')
    await service.set('v2', 'k', 'two')
    expect(await service.get('v1', 'k')).toBe('one')
    expect(await service.get('v2', 'k')).toBe('two')
    expect(await service.list('v3')).toEqual([])
  })

  it('never writes the plaintext to disk', async () => {
    await service.set('v1', 'k', 'super-secret-value')
    const file = join(dataDir, 'module-secrets', 'v1', 'keychain', 'secrets.json')
    expect(await readFile(file, 'utf-8')).not.toContain('super-secret-value')
  })

  it('rejects invalid IDs on every operation', async () => {
    await expect(service.set('v1', 'Bad_ID', 'x')).rejects.toBeInstanceOf(KeychainInvalidIdError)
    await expect(service.get('v1', '../x')).rejects.toBeInstanceOf(KeychainInvalidIdError)
    await expect(service.delete('v1', 'a--b')).rejects.toBeInstanceOf(KeychainInvalidIdError)
  })

  it('enforces the entry limit but still allows replacing an existing entry', async () => {
    for (let i = 0; i < MAX_KEYCHAIN_ENTRIES; i++) await service.set('v1', `k${i}`, 'x')
    await expect(service.set('v1', 'one-too-many', 'x')).rejects.toBeInstanceOf(KeychainLimitExceededError)
    await expect(service.set('v1', 'k0', 'changed')).resolves.toBeUndefined()
    expect(await service.get('v1', 'k0')).toBe('changed')
  }, 60_000)

  it('deletes every entry of a vault and tolerates a vault without any', async () => {
    await service.set('v1', 'a', '1')
    await service.deleteAllForVault('v1')
    expect(await service.list('v1')).toEqual([])
    await expect(service.deleteAllForVault('never-had-any')).resolves.toBeUndefined()
    expect(await readdir(join(dataDir, 'module-secrets', 'v1', 'keychain'))).not.toContain('secrets.json')
  })
})
