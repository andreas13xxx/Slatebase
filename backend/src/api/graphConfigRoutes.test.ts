import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Hono } from 'hono'
import { mkdtemp, rm, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { GraphConfigService } from '../obsidian-config/graph-config.js'
import { createGraphConfigRoutes } from './graphConfigRoutes.js'
import type { IVaultRegistry } from '../vault/registry.js'
import type { IVaultAccessControl } from '../business/index.js'
import type { IEventBus } from '../realtime/types.js'

const logger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} } as unknown as import('../logger/index.js').ILogger

describe('graph-config routes', () => {
  let vaultPath: string
  let app: Hono
  const publish = vi.fn()
  const reported: string[] = []
  const file = () => join(vaultPath, '.obsidian', 'graph.json')

  beforeEach(async () => {
    vaultPath = await mkdtemp(join(tmpdir(), 'graph-config-routes-'))
    const vaultRegistry = { findById: (id: string) => (id === 'v1' ? { storagePath: vaultPath } : undefined) } as unknown as IVaultRegistry
    const accessControl = { getUsersWithAccess: async () => ['u1', 'u2'] } as unknown as IVaultAccessControl
    app = new Hono()
    app.use('*', async (c, next) => {
      c.set('session' as never, { userId: 'u1', username: 'alice' } as never)
      await next()
    })
    reported.length = 0
    app.route('/vaults/:vaultId/graph-config', createGraphConfigRoutes({
      graphConfigService: new GraphConfigService({ report: (_v, _f, deviations) => reported.push(...deviations.map((d) => d.path)) }),
      accessControl,
      vaultRegistry,
      eventBus: { publish } as unknown as IEventBus,
      logger,
    }))
    publish.mockClear()
  })
  afterEach(async () => { await rm(vaultPath, { recursive: true, force: true }) })

  const patch = (body: unknown, vault = 'v1') =>
    app.request(`/vaults/${vault}/graph-config`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) })

  it('answers an empty config for a vault without graph.json', async () => {
    const res = await app.request('/vaults/v1/graph-config')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ config: {} })
  })

  it('patches the forces next to the keys of Obsidian\'s file it keeps, and tells the other users', async () => {
    await mkdir(join(vaultPath, '.obsidian'))
    const colorGroups = [{ query: 'tag:#a', color: { a: 1, rgb: 14701138 } }]
    await writeFile(file(), JSON.stringify({ search: 'path:Notes', colorGroups, scale: 0.4, foreign: 1 }))

    const res = await patch({ repelStrength: 15, showTags: true })

    expect(res.status).toBe(200)
    const expected = { search: 'path:Notes', colorGroups, scale: 0.4, foreign: 1, repelStrength: 15, showTags: true }
    expect(await res.json()).toEqual({ config: expected })
    expect(JSON.parse(await readFile(file(), 'utf-8'))).toEqual(expected)
    expect(publish).toHaveBeenCalledWith(expect.objectContaining({
      type: 'vault:change',
      payload: expect.objectContaining({ vaultId: 'v1', path: '.obsidian/graph.json', action: 'saved' }),
      excludeUserId: 'u1',
    }))
  })

  it('refuses values outside the ranges, unknown keys and oversized colour groups', async () => {
    for (const body of [
      { repelStrength: 999 }, { linkDistance: 5000 }, { showTags: 'yes' }, { fancy: 1 },
      { colorGroups: 'x'.repeat(70 * 1024) }, 'not json',
    ]) {
      expect((await patch(body)).status, JSON.stringify(body).slice(0, 40)).toBe(400)
    }
    expect(publish).not.toHaveBeenCalled()
  })

  it('reports what the table does not expect, but not what Obsidian really writes', async () => {
    await mkdir(join(vaultPath, '.obsidian'))
    await writeFile(file(), JSON.stringify({ 'collapse-filter': true, colorGroups: [], close: true, fancy: 1, linkStrength: 70 }))
    await app.request('/vaults/v1/graph-config')
    expect(reported).toEqual(['fancy', 'linkStrength'])
  })

  it('answers 404 for an unknown vault and 409 for a file that is not JSON, and keeps that file', async () => {
    expect((await app.request('/vaults/nope/graph-config')).status).toBe(404)
    await mkdir(join(vaultPath, '.obsidian'))
    await writeFile(file(), '<<<<<<< ours')
    const get = await app.request('/vaults/v1/graph-config')
    expect(get.status).toBe(409)
    expect(((await get.json()) as { code: string }).code).toBe('GRAPH_CONFIG_INVALID')
    expect((await patch({ showTags: true })).status).toBe(409)
    expect(await readFile(file(), 'utf-8')).toBe('<<<<<<< ours')
  })
})
