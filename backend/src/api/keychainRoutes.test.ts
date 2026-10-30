import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Hono } from 'hono'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ModuleSecretKeyManager, ModuleSecretStore } from '../shared-secrets/index.js'
import { KeychainService } from '../keychain/index.js'
import { createKeychainRoutes } from './keychainRoutes.js'

const logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
} as unknown as import('../logger/index.js').ILogger

describe('keychain routes', () => {
  let dataDir: string
  let app: Hono

  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'keychain-routes-'))
    const keyManager = new ModuleSecretKeyManager(dataDir, logger)
    await keyManager.loadOrCreate()
    const keychainService = new KeychainService(new ModuleSecretStore(dataDir, keyManager))
    app = new Hono()
    app.route('/vaults/:vaultId/keychain', createKeychainRoutes({ keychainService, logger }))
  })

  afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true })
  })

  const put = (id: string, body: unknown): Promise<Response> =>
    Promise.resolve(app.request(`/vaults/v1/keychain/${id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }))

  it('round-trips an entry and lists only IDs', async () => {
    expect((await put('openai-key', { value: 'sk-123' })).status).toBe(204)

    const list = await app.request('/vaults/v1/keychain')
    expect(list.status).toBe(200)
    const listBody = await list.json() as { ids: string[] }
    expect(listBody).toEqual({ ids: ['openai-key'] })
    expect(JSON.stringify(listBody)).not.toContain('sk-123')

    const value = await app.request('/vaults/v1/keychain/openai-key')
    expect(value.status).toBe(200)
    expect(await value.json()).toEqual({ value: 'sk-123' })
  })

  it('answers 404 for an unknown entry', async () => {
    const res = await app.request('/vaults/v1/keychain/nope')
    expect(res.status).toBe(404)
    expect(((await res.json()) as { code: string }).code).toBe('SECRET_NOT_FOUND')
  })

  it('deletes an entry, also when it does not exist', async () => {
    await put('k', { value: 'x' })
    expect((await app.request('/vaults/v1/keychain/k', { method: 'DELETE' })).status).toBe(204)
    expect((await app.request('/vaults/v1/keychain/k', { method: 'DELETE' })).status).toBe(204)
    expect((await app.request('/vaults/v1/keychain/k')).status).toBe(404)
  })

  it('validates the ID, the body and the vault ID', async () => {
    expect((await put('Bad_ID', { value: 'x' })).status).toBe(400)
    expect((await put('k', { value: '' })).status).toBe(400)
    expect((await put('k', { nope: 1 })).status).toBe(400)
    expect((await put('k', 'not json')).status).toBe(400)
    expect((await app.request(`/vaults/${'a'.repeat(25)}/keychain`)).status).toBe(400)
  })

  it('answers 413 for a value above the size limit', async () => {
    expect((await put('k', { value: 'x'.repeat(10 * 1024 + 1) })).status).toBe(413)
  })
})
