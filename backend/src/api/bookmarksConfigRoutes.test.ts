import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Hono } from 'hono'
import { mkdtemp, rm, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { BookmarksConfigService } from '../obsidian-config/bookmarks-config.js'
import { createBookmarksConfigRoutes } from './bookmarksConfigRoutes.js'
import type { IVaultRegistry } from '../vault/registry.js'
import type { IVaultAccessControl } from '../business/index.js'
import type { IEventBus } from '../realtime/types.js'

const logger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} } as unknown as import('../logger/index.js').ILogger

describe('bookmarks-config routes', () => {
  let vaultPath: string
  let app: Hono
  const publish = vi.fn()
  const reported: string[] = []
  const file = () => join(vaultPath, '.obsidian', 'bookmarks.json')

  beforeEach(async () => {
    vaultPath = await mkdtemp(join(tmpdir(), 'bookmarks-config-routes-'))
    const vaultRegistry = { findById: (id: string) => (id === 'v1' ? { storagePath: vaultPath } : undefined) } as unknown as IVaultRegistry
    const accessControl = { getUsersWithAccess: async () => ['u1', 'u2'] } as unknown as IVaultAccessControl
    app = new Hono()
    app.use('*', async (c, next) => {
      c.set('session' as never, { userId: 'u1', username: 'alice' } as never)
      await next()
    })
    reported.length = 0
    app.route('/vaults/:vaultId/bookmarks-config', createBookmarksConfigRoutes({
      bookmarksConfigService: new BookmarksConfigService({ report: (_v, _f, deviations) => reported.push(...deviations.map((d) => d.path)) }),
      accessControl,
      vaultRegistry,
      eventBus: { publish } as unknown as IEventBus,
      logger,
    }))
    publish.mockClear()
  })
  afterEach(async () => { await rm(vaultPath, { recursive: true, force: true }) })

  const patch = (body: unknown, vault = 'v1') =>
    app.request(`/vaults/${vault}/bookmarks-config`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) })

  it('answers an empty config for a vault without bookmarks.json', async () => {
    const res = await app.request('/vaults/v1/bookmarks-config')
    expect(await res.json()).toEqual({ config: {} })
  })

  it('replaces the list as a whole, keeps other keys of the file, and tells the other users', async () => {
    await mkdir(join(vaultPath, '.obsidian'))
    await writeFile(file(), JSON.stringify({ items: [{ type: 'url', url: 'https://x.test' }], other: 1 }))
    const items = [{ type: 'file', path: 'a.md', title: 'A' }, { type: 'group', title: 'G', items: [{ type: 'file', path: 'b.md' }] }]

    const res = await patch({ items })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ config: { items, other: 1 } })
    expect(JSON.parse(await readFile(file(), 'utf-8'))).toEqual({ items, other: 1 })
    expect(publish).toHaveBeenCalledWith(expect.objectContaining({
      payload: expect.objectContaining({ path: '.obsidian/bookmarks.json', action: 'saved' }),
      excludeUserId: 'u1',
    }))
  })

  it('refuses entries that are not objects, too many entries, and keys it does not know', async () => {
    for (const body of [
      { items: ['a.md'] }, { items: 'x' }, { items: Array.from({ length: 5001 }, () => ({ type: 'file' })) }, { other: 1 },
    ]) {
      expect((await patch(body)).status).toBe(400)
    }
    expect(publish).not.toHaveBeenCalled()
  })

  it('reports unknown entry types by position when the file is read', async () => {
    await mkdir(join(vaultPath, '.obsidian'))
    await writeFile(file(), JSON.stringify({ items: [{ type: 'file', path: 'a.md' }, { type: 'rating' }] }))
    await app.request('/vaults/v1/bookmarks-config')
    expect(reported).toEqual(['items.1.type'])
  })

  it('answers 404 for an unknown vault and 409 for a file that is not JSON, and keeps that file', async () => {
    expect((await app.request('/vaults/nope/bookmarks-config')).status).toBe(404)
    await mkdir(join(vaultPath, '.obsidian'))
    await writeFile(file(), '<<<<<<<')
    const get = await app.request('/vaults/v1/bookmarks-config')
    expect(get.status).toBe(409)
    expect(((await get.json()) as { code: string }).code).toBe('BOOKMARKS_CONFIG_INVALID')
    expect((await patch({ items: [] })).status).toBe(409)
    expect(await readFile(file(), 'utf-8')).toBe('<<<<<<<')
  })
})
