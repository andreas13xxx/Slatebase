import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Hono } from 'hono'
import { mkdtemp, rm, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PagePreviewConfigService } from '../obsidian-config/page-preview-config.js'
import { createPagePreviewConfigRoutes } from './pagePreviewConfigRoutes.js'
import type { IVaultRegistry } from '../vault/registry.js'
import type { IVaultAccessControl } from '../business/index.js'
import type { IEventBus } from '../realtime/types.js'

const logger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} } as unknown as import('../logger/index.js').ILogger

describe('page-preview-config routes', () => {
  let vaultPath: string
  let app: Hono
  const publish = vi.fn()
  const file = () => join(vaultPath, '.obsidian', 'page-preview.json')

  beforeEach(async () => {
    vaultPath = await mkdtemp(join(tmpdir(), 'page-preview-config-routes-'))
    const vaultRegistry = { findById: (id: string) => (id === 'v1' ? { storagePath: vaultPath } : undefined) } as unknown as IVaultRegistry
    const accessControl = { getUsersWithAccess: async () => ['u1', 'u2'] } as unknown as IVaultAccessControl
    app = new Hono()
    app.use('*', async (c, next) => {
      c.set('session' as never, { userId: 'u1', username: 'alice' } as never)
      await next()
    })
    app.route('/vaults/:vaultId/page-preview-config', createPagePreviewConfigRoutes({
      pagePreviewConfigService: new PagePreviewConfigService(),
      accessControl,
      vaultRegistry,
      eventBus: { publish } as unknown as IEventBus,
      logger,
    }))
    publish.mockClear()
  })
  afterEach(async () => { await rm(vaultPath, { recursive: true, force: true }) })

  const patch = (body: unknown) =>
    app.request('/vaults/v1/page-preview-config', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) })

  it('answers an empty config for a vault without page-preview.json', async () => {
    const res = await app.request('/vaults/v1/page-preview-config')
    expect(await res.json()).toEqual({ config: {} })
  })

  it('sets and removes sources, keeps the rest, and tells the other users', async () => {
    await mkdir(join(vaultPath, '.obsidian'))
    await writeFile(file(), JSON.stringify({ search: true, editor: false, 'other-app': 'x' }))

    const res = await patch({ preview: true, editor: null })

    expect(res.status).toBe(200)
    const expected = { search: true, 'other-app': 'x', preview: true }
    expect(await res.json()).toEqual({ config: expected })
    expect(JSON.parse(await readFile(file(), 'utf-8'))).toEqual(expected)
    expect(publish).toHaveBeenCalledWith(expect.objectContaining({
      payload: expect.objectContaining({ path: '.obsidian/page-preview.json', action: 'saved' }),
      excludeUserId: 'u1',
    }))
  })

  it('refuses values that are not booleans, bad source IDs and too many sources', async () => {
    const tooMany = Object.fromEntries(Array.from({ length: 101 }, (_, i) => [`s${i}`, true]))
    for (const body of [{ a: 'x' }, { a: 1 }, { 'bad id': true }, { '': true }, { __proto__x: true }, tooMany]) {
      expect((await patch(body)).status).toBe(400)
    }
    expect(publish).not.toHaveBeenCalled()
  })

  it('never lets __proto__ reach the file', async () => {
    await patch('{"__proto__":true,"a":true}')
    expect(({} as Record<string, unknown>)['a']).toBeUndefined()
    const written = JSON.parse(await readFile(file(), 'utf-8')) as Record<string, unknown>
    expect(Object.getPrototypeOf(written)).toBe(Object.prototype)
    expect(Object.keys(written)).toEqual(['a'])
  })

  it('answers 404 for an unknown vault and 409 for a file that is not JSON, and keeps that file', async () => {
    expect((await app.request('/vaults/nope/page-preview-config')).status).toBe(404)
    await mkdir(join(vaultPath, '.obsidian'))
    await writeFile(file(), '<<<<<<<')
    const get = await app.request('/vaults/v1/page-preview-config')
    expect(get.status).toBe(409)
    expect(((await get.json()) as { code: string }).code).toBe('PAGE_PREVIEW_CONFIG_INVALID')
    expect((await patch({ a: true })).status).toBe(409)
    expect(await readFile(file(), 'utf-8')).toBe('<<<<<<<')
  })
})
