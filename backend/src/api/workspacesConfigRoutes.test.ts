import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Hono } from 'hono'
import { mkdtemp, rm, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { WorkspacesConfigService } from '../obsidian-config/workspaces-config.js'
import { createWorkspacesConfigRoutes } from './workspacesConfigRoutes.js'
import type { IVaultRegistry } from '../vault/registry.js'
import type { IVaultAccessControl } from '../business/index.js'
import type { IEventBus } from '../realtime/types.js'

const logger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} } as unknown as import('../logger/index.js').ILogger

describe('workspaces-config routes', () => {
  let vaultPath: string
  let app: Hono
  const publish = vi.fn()
  const reported: string[] = []
  const file = () => join(vaultPath, '.obsidian', 'workspaces.json')

  beforeEach(async () => {
    vaultPath = await mkdtemp(join(tmpdir(), 'workspaces-config-routes-'))
    const vaultRegistry = { findById: (id: string) => (id === 'v1' ? { storagePath: vaultPath } : undefined) } as unknown as IVaultRegistry
    const accessControl = { getUsersWithAccess: async () => ['u1', 'u2'] } as unknown as IVaultAccessControl
    app = new Hono()
    app.use('*', async (c, next) => {
      c.set('session' as never, { userId: 'u1', username: 'alice' } as never)
      await next()
    })
    reported.length = 0
    app.route('/vaults/:vaultId/workspaces-config', createWorkspacesConfigRoutes({
      workspacesConfigService: new WorkspacesConfigService({ report: (_v, _f, deviations) => reported.push(...deviations.map((d) => d.path)) }),
      accessControl,
      vaultRegistry,
      eventBus: { publish } as unknown as IEventBus,
      logger,
    }))
    publish.mockClear()
  })
  afterEach(async () => { await rm(vaultPath, { recursive: true, force: true }) })

  const patch = (body: unknown, vault = 'v1') =>
    app.request(`/vaults/${vault}/workspaces-config`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) })

  const main = (file: string) => ({ main: { type: 'split', direction: 'vertical', children: [{ type: 'tabs', children: [{ type: 'leaf', state: { type: 'markdown', state: { file } } }] }] } })

  it('answers an empty config for a vault without workspaces.json', async () => {
    const res = await app.request('/vaults/v1/workspaces-config')
    expect(await res.json()).toEqual({ config: {} })
  })

  it('saves, replaces and deletes single layouts, sets the active one, keeps the rest, and tells the other users', async () => {
    await mkdir(join(vaultPath, '.obsidian'))
    await writeFile(file(), JSON.stringify({ workspaces: { Old: main('old.md'), Keep: main('keep.md') }, active: 'Old', extra: 1 }))

    const res = await patch({ workspaces: { Old: null, New: main('new.md'), Keep: main('kept-too.md') }, active: 'New' })

    expect(res.status).toBe(200)
    const expected = { workspaces: { Keep: main('kept-too.md'), New: main('new.md') }, active: 'New', extra: 1 }
    expect(await res.json()).toEqual({ config: expected })
    expect(JSON.parse(await readFile(file(), 'utf-8'))).toEqual(expected)
    expect(publish).toHaveBeenCalledWith(expect.objectContaining({
      payload: expect.objectContaining({ path: '.obsidian/workspaces.json', action: 'saved' }),
      excludeUserId: 'u1',
    }))
  })

  it('renames in one request: delete the old name, set the new one', async () => {
    await mkdir(join(vaultPath, '.obsidian'))
    await writeFile(file(), JSON.stringify({ workspaces: { A: main('a.md') }, active: 'A' }))
    await patch({ workspaces: { A: null, B: main('a.md') }, active: 'B' })
    expect(JSON.parse(await readFile(file(), 'utf-8'))).toEqual({ workspaces: { B: main('a.md') }, active: 'B' })
  })

  it('removes the active name with null, and writes nothing for a patch that changes nothing', async () => {
    await mkdir(join(vaultPath, '.obsidian'))
    await writeFile(file(), JSON.stringify({ workspaces: { A: main('a.md') }, active: 'A' }))
    await patch({ workspaces: { A: main('a.md'), Gone: null } })
    expect(await readFile(file(), 'utf-8')).toBe(JSON.stringify({ workspaces: { A: main('a.md') }, active: 'A' }))
    await patch({ active: null })
    expect(JSON.parse(await readFile(file(), 'utf-8'))).toEqual({ workspaces: { A: main('a.md') } })
  })

  it('refuses bad names, layouts that are not objects, too large ones and keys it does not know', async () => {
    const big = { main: { pad: 'x'.repeat(1024 * 1024 + 1) } }
    for (const body of [
      { workspaces: { '': main('a.md') } }, { workspaces: { 'a\nb': main('a.md') } }, { workspaces: { A: 'x' } },
      { workspaces: { A: [] } }, { workspaces: { A: big } }, { other: 1 }, { active: 3 },
    ]) {
      expect((await patch(body)).status).toBe(400)
    }
    expect(publish).not.toHaveBeenCalled()
  })

  it('never lets __proto__ reach the file', async () => {
    await patch('{"workspaces":{"__proto__":{"main":{}},"A":{"main":{}}}}')
    expect(({} as Record<string, unknown>)['main']).toBeUndefined()
    const written = JSON.parse(await readFile(file(), 'utf-8')) as { workspaces: Record<string, unknown> }
    expect(Object.keys(written.workspaces)).toEqual(['A'])
    expect(Object.getPrototypeOf(written.workspaces)).toBe(Object.prototype)
  })

  it('reports bad entries by name when the file is read', async () => {
    await mkdir(join(vaultPath, '.obsidian'))
    await writeFile(file(), JSON.stringify({ workspaces: { Good: main('a.md'), Bad: 3 }, active: 5 }))
    await app.request('/vaults/v1/workspaces-config')
    expect(reported).toEqual(['workspaces.Bad', 'active'])
  })

  it('answers 404 for an unknown vault and 409 for a file that is not JSON, and keeps that file', async () => {
    expect((await app.request('/vaults/nope/workspaces-config')).status).toBe(404)
    await mkdir(join(vaultPath, '.obsidian'))
    await writeFile(file(), '<<<<<<<')
    const get = await app.request('/vaults/v1/workspaces-config')
    expect(get.status).toBe(409)
    expect(((await get.json()) as { code: string }).code).toBe('WORKSPACES_CONFIG_INVALID')
    expect((await patch({ active: 'A' })).status).toBe(409)
    expect(await readFile(file(), 'utf-8')).toBe('<<<<<<<')
  })
})
