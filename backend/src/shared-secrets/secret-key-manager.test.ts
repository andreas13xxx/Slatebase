import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { ModuleSecretKeyManager, SecretKeyError } from './secret-key-manager.js'
import type { ILogger } from '../logger/index.js'

function createMockLogger(): ILogger {
  return {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
    child: () => createMockLogger(),
  } as unknown as ILogger
}

const ENV_VAR = 'SLATEBASE_MODULE_SECRET_KEY'
const VALID_KEY = 'a'.repeat(64)
const KEY_FILE = '.module-secret-key'

describe('ModuleSecretKeyManager — fail-fast key loading', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'module-secret-'))
    delete process.env[ENV_VAR]
  })

  afterEach(async () => {
    delete process.env[ENV_VAR]
    await rm(dir, { recursive: true, force: true })
  })

  it('generates and persists a new key on a genuine first run (no file)', async () => {
    const mgr = new ModuleSecretKeyManager(dir, createMockLogger())
    await mgr.loadOrCreate()
    // A round-trip proves a usable key was derived.
    const { iv, ciphertext } = mgr.encrypt('secret-value')
    expect(mgr.decrypt(iv, ciphertext)).toBe('secret-value')
    // And it was written to disk for the next start.
    const persisted = (await readFile(join(dir, KEY_FILE), 'utf-8')).trim()
    expect(persisted).toMatch(/^[0-9a-f]{64}$/i)
  })

  it('loads a valid key from the environment', async () => {
    process.env[ENV_VAR] = VALID_KEY
    const mgr = new ModuleSecretKeyManager(dir, createMockLogger())
    await expect(mgr.loadOrCreate()).resolves.toBeUndefined()
  })

  it('throws instead of falling back when the env var is set but invalid', async () => {
    process.env[ENV_VAR] = 'not-a-valid-key'
    const mgr = new ModuleSecretKeyManager(dir, createMockLogger())
    await expect(mgr.loadOrCreate()).rejects.toThrow(SecretKeyError)
  })

  it('loads a valid key from the file', async () => {
    await writeFile(join(dir, KEY_FILE), VALID_KEY, 'utf-8')
    const mgr = new ModuleSecretKeyManager(dir, createMockLogger())
    await mgr.loadOrCreate()
    const { iv, ciphertext } = mgr.encrypt('x')
    expect(mgr.decrypt(iv, ciphertext)).toBe('x')
  })

  it('throws (never regenerates) when the file exists but is corrupt', async () => {
    // Regenerating here would orphan every credential the real key encrypted.
    await writeFile(join(dir, KEY_FILE), 'garbage-not-hex', 'utf-8')
    const mgr = new ModuleSecretKeyManager(dir, createMockLogger())
    await expect(mgr.loadOrCreate()).rejects.toThrow(SecretKeyError)
    // The corrupt file is left untouched — not overwritten with a new key.
    expect((await readFile(join(dir, KEY_FILE), 'utf-8'))).toBe('garbage-not-hex')
  })

  it('throws (never regenerates) when the file cannot be read (not ENOENT)', async () => {
    // A read that fails for a reason OTHER than "file absent" must NOT be treated
    // as "key gone" and silently regenerated. Make the key path a directory so
    // readFile fails with EISDIR — stand-in for the EPERM/EBUSY locks that
    // antivirus/OneDrive cause on Windows.
    const { mkdir } = await import('node:fs/promises')
    await mkdir(join(dir, KEY_FILE))
    const mgr = new ModuleSecretKeyManager(dir, createMockLogger())
    await expect(mgr.loadOrCreate()).rejects.toThrow(SecretKeyError)
  })
})
