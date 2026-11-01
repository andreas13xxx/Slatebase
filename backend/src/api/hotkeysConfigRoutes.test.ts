import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Hono } from 'hono'
import { mkdtemp, rm, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { HotkeysConfigService } from '../obsidian-config/hotkeys-config.js'
import { createHotkeysConfigRoutes } from './hotkeysConfigRoutes.js'
import type { IVaultRegistry } from '../vault/registry.js'
import type { IVaultAccessControl } from '../business/index.js'
import type { IEventBus } from '../realtime/types.js'

const logger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} } as unknown as import('../logger/index.js').ILogger

describe('hotkeys-config routes', () => {
  let vaultPath: string
  let app: Hono
  const publish = vi.fn()
  const reported: string[] = []
  const file = () => join(vaultPath, '.obsidian', 'hotkeys.json')

  beforeEach(async () => {
    vaultPath = await mkdtemp(join(tmpdir(), 'hotkeys-config-routes-'))
    const vaultRegistry = { findById: (id: string) => (id === 'v1' ? { storagePath: vaultPath } : undefined) } as unknown as IVaultRegistry
    const accessControl = { getUsersWithAccess: async () => ['u1', 'u2'] } as unknown as IVaultAccessControl
    app = new Hono()
    app.use('*', async (c, next) => {
      c.set('session' as never, { userId: 'u1', username: 'alice' } as never)
      await next()
    })
    reported.length = 0
    app.route('/vaults/:vaultId/hotkeys-config', createHotkeysConfigRoutes({
      hotkeysConfigService: new HotkeysConfigService({ report: (_v, _f, deviations) => reported.push(...deviations.map((d) => d.path)) }),
      accessControl,
      vaultRegistry,
      eventBus: { publish } as unknown as IEventBus,
      logger,
    }))
    publish.mockClear()
  })
  afterEach(async () => { await rm(vaultPath, { recursive: true, force: true }) })

  const patch = (body: unknown, vault = 'v1') =>
    app.request(`/vaults/${vault}/hotkeys-config`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) })

  it('answers an empty config for a vault without hotkeys.json', async () => {
    const res = await app.request('/vaults/v1/hotkeys-config')
    expect(await res.json()).toEqual({ config: {} })
  })

  it('sets, unbinds and removes entries, keeps the rest, and tells the other users', async () => {
    await mkdir(join(vaultPath, '.obsidian'))
    await writeFile(file(), JSON.stringify({ 'other-app:cmd': [{ modifiers: ['Alt'], key: 'X' }], 'app:go-back': [{ modifiers: ['Alt'], key: 'ArrowLeft' }] }))
    const bold = [{ modifiers: ['Mod'], key: 'B' }]

    const res = await patch({ 'editor:toggle-bold': bold, 'app:open-settings': [], 'app:go-back': null })

    expect(res.status).toBe(200)
    const expected = { 'other-app:cmd': [{ modifiers: ['Alt'], key: 'X' }], 'editor:toggle-bold': bold, 'app:open-settings': [] }
    expect(await res.json()).toEqual({ config: expected })
    expect(JSON.parse(await readFile(file(), 'utf-8'))).toEqual(expected)
    expect(publish).toHaveBeenCalledWith(expect.objectContaining({
      payload: expect.objectContaining({ path: '.obsidian/hotkeys.json', action: 'saved' }),
      excludeUserId: 'u1',
    }))
  })

  it('writes nothing for a patch that changes nothing', async () => {
    await mkdir(join(vaultPath, '.obsidian'))
    await writeFile(file(), JSON.stringify({ a: [] }))
    const res = await patch({ a: [], gone: null })
    expect(await res.json()).toEqual({ config: { a: [] } })
    expect(await readFile(file(), 'utf-8')).toBe(JSON.stringify({ a: [] }))
  })

  it('refuses bad bindings, bad modifiers, names that are no command IDs and too many bindings', async () => {
    const key = { modifiers: [], key: 'K' }
    for (const body of [
      { a: 'x' }, { a: [{ key: 'K' }] }, { a: [{ modifiers: ['Hyper'], key: 'K' }] }, { a: [{ modifiers: [], key: '' }] },
      { a: [{ modifiers: [], key: 'K', extra: 1 }] }, { 'bad id': [] }, { a: Array.from({ length: 21 }, () => key) },
    ]) {
      expect((await patch(body)).status).toBe(400)
    }
    expect(publish).not.toHaveBeenCalled()
  })

  it('never lets __proto__ reach the file', async () => {
    await patch('{"__proto__":[{"modifiers":[],"key":"K"}],"a":[]}')
    expect(({} as Record<string, unknown>)['length']).toBeUndefined()
    expect(Object.getPrototypeOf(JSON.parse(await readFile(file(), 'utf-8')))).toBe(Object.prototype)
    expect(Object.keys(JSON.parse(await readFile(file(), 'utf-8')))).toEqual(['a'])
  })

  it('reports bad entries by name when the file is read', async () => {
    await mkdir(join(vaultPath, '.obsidian'))
    await writeFile(file(), JSON.stringify({ ok: [], broken: 3, mixed: [{ modifiers: ['Hyper'], key: 'X' }] }))
    await app.request('/vaults/v1/hotkeys-config')
    expect(reported).toEqual(['broken', 'mixed.0'])
  })

  it('answers 404 for an unknown vault and 409 for a file that is not JSON, and keeps that file', async () => {
    expect((await app.request('/vaults/nope/hotkeys-config')).status).toBe(404)
    await mkdir(join(vaultPath, '.obsidian'))
    await writeFile(file(), '<<<<<<<')
    const get = await app.request('/vaults/v1/hotkeys-config')
    expect(get.status).toBe(409)
    expect(((await get.json()) as { code: string }).code).toBe('HOTKEYS_CONFIG_INVALID')
    expect((await patch({ a: [] })).status).toBe(409)
    expect(await readFile(file(), 'utf-8')).toBe('<<<<<<<')
  })
})
