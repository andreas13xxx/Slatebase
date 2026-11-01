import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Hono } from 'hono'
import { mkdtemp, rm, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AppearanceConfigService } from '../obsidian-config/appearance-config.js'
import { createAppearanceConfigRoutes } from './appearanceConfigRoutes.js'
import type { IVaultRegistry } from '../vault/registry.js'
import type { IVaultAccessControl } from '../business/index.js'
import type { IEventBus } from '../realtime/types.js'

const logger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} } as unknown as import('../logger/index.js').ILogger

describe('appearance-config routes', () => {
  let vaultPath: string
  let app: Hono
  const publish = vi.fn()
  const reported: string[] = []
  const file = () => join(vaultPath, '.obsidian', 'appearance.json')

  beforeEach(async () => {
    vaultPath = await mkdtemp(join(tmpdir(), 'appearance-config-routes-'))
    const vaultRegistry = { findById: (id: string) => (id === 'v1' ? { storagePath: vaultPath } : undefined) } as unknown as IVaultRegistry
    const accessControl = { getUsersWithAccess: async () => ['u1', 'u2'] } as unknown as IVaultAccessControl
    app = new Hono()
    app.use('*', async (c, next) => {
      c.set('session' as never, { userId: 'u1', username: 'alice' } as never)
      await next()
    })
    reported.length = 0
    app.route('/vaults/:vaultId/appearance-config', createAppearanceConfigRoutes({
      appearanceConfigService: new AppearanceConfigService({ report: (_v, _f, deviations) => reported.push(...deviations.map((d) => d.path)) }),
      accessControl,
      vaultRegistry,
      eventBus: { publish } as unknown as IEventBus,
      logger,
    }))
    publish.mockClear()
  })
  afterEach(async () => { await rm(vaultPath, { recursive: true, force: true }) })

  const patch = (body: unknown, vault = 'v1') =>
    app.request(`/vaults/${vault}/appearance-config`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) })

  it('answers an empty config for a vault without appearance.json', async () => {
    const res = await app.request('/vaults/v1/appearance-config')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ config: {} })
  })

  it('patches next to the theme and the snippets without losing them, and tells the other users', async () => {
    await mkdir(join(vaultPath, '.obsidian'))
    await writeFile(file(), JSON.stringify({ cssTheme: 'Minimal', enabledCssSnippets: ['a'], foreign: 1 }))

    const res = await patch({ accentColor: '#ff0000', baseFontSize: 18, textFontFamily: 'Inter, "Noto Sans"' })

    expect(res.status).toBe(200)
    const expected = { cssTheme: 'Minimal', enabledCssSnippets: ['a'], foreign: 1, accentColor: '#ff0000', baseFontSize: 18, textFontFamily: 'Inter, "Noto Sans"' }
    expect(await res.json()).toEqual({ config: expected })
    expect(JSON.parse(await readFile(file(), 'utf-8'))).toEqual(expected)
    expect(publish).toHaveBeenCalledWith(expect.objectContaining({
      type: 'vault:change',
      payload: expect.objectContaining({ vaultId: 'v1', path: '.obsidian/appearance.json', action: 'saved' }),
      excludeUserId: 'u1',
    }))
  })

  it('removes a key on null', async () => {
    await patch({ accentColor: '#00ff00', baseFontSize: 20 })
    await patch({ accentColor: null })
    expect(JSON.parse(await readFile(file(), 'utf-8'))).toEqual({ baseFontSize: 20 })
  })

  it('refuses what could leave a CSS declaration, a bad colour, a theme it does not know, and keys of other services', async () => {
    for (const body of [
      { textFontFamily: 'x; background: url(//evil)' },
      { interfaceFontFamily: 'a}b' },
      { accentColor: 'red' },
      { theme: 'sepia' },
      { baseFontSize: 5 },
      { cssTheme: 'Other' },
      { enabledCssSnippets: [] },
      'not json',
    ]) {
      expect((await patch(body)).status, JSON.stringify(body)).toBe(400)
    }
    expect(publish).not.toHaveBeenCalled()
  })

  it('reports keys and values the table does not expect, but not the theme and snippets', async () => {
    await mkdir(join(vaultPath, '.obsidian'))
    await writeFile(file(), JSON.stringify({ cssTheme: 'x', enabledCssSnippets: [], fancy: 1, theme: 'sepia' }))
    await app.request('/vaults/v1/appearance-config')
    expect(reported).toEqual(['fancy', 'theme'])
  })

  it('answers 404 for an unknown vault and 409 for a file that is not JSON, and keeps that file', async () => {
    expect((await app.request('/vaults/nope/appearance-config')).status).toBe(404)
    await mkdir(join(vaultPath, '.obsidian'))
    await writeFile(file(), '{ broken')
    const get = await app.request('/vaults/v1/appearance-config')
    expect(get.status).toBe(409)
    expect(((await get.json()) as { code: string }).code).toBe('APPEARANCE_CONFIG_INVALID')
    expect((await patch({ baseFontSize: 18 })).status).toBe(409)
    expect(await readFile(file(), 'utf-8')).toBe('{ broken')
  })
})
