import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Hono } from 'hono'
import { mkdtemp, rm, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AppConfigService } from '../obsidian-config/index.js'
import { createAppConfigRoutes } from './appConfigRoutes.js'
import type { IVaultRegistry } from '../vault/registry.js'
import type { IVaultAccessControl } from '../business/index.js'
import type { IEventBus } from '../realtime/types.js'

const logger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} } as unknown as import('../logger/index.js').ILogger

describe('app-config routes', () => {
  let vaultPath: string
  let app: Hono
  const publish = vi.fn()

  beforeEach(async () => {
    vaultPath = await mkdtemp(join(tmpdir(), 'app-config-routes-'))
    const vaultRegistry = { findById: (id: string) => (id === 'v1' ? { storagePath: vaultPath } : undefined) } as unknown as IVaultRegistry
    const accessControl = { getUsersWithAccess: async () => ['u1', 'u2'] } as unknown as IVaultAccessControl
    app = new Hono()
    // Stand in for the auth middleware: a session makes the route publish a vault:change event.
    app.use('*', async (c, next) => {
      c.set('session' as never, { userId: 'u1', username: 'alice' } as never)
      await next()
    })
    app.route('/vaults/:vaultId/app-config', createAppConfigRoutes({
      appConfigService: new AppConfigService(),
      accessControl,
      vaultRegistry,
      eventBus: { publish } as unknown as IEventBus,
      logger,
    }))
    publish.mockClear()
  })

  afterEach(async () => {
    await rm(vaultPath, { recursive: true, force: true })
  })

  const patch = (body: unknown, vault = 'v1') =>
    app.request(`/vaults/${vault}/app-config`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) })

  it('answers an empty config for a vault without app.json', async () => {
    const res = await app.request('/vaults/v1/app-config')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ config: {} })
  })

  it('patches, returns the merged file and tells the other users', async () => {
    await mkdir(join(vaultPath, '.obsidian'))
    await writeFile(join(vaultPath, '.obsidian', 'app.json'), JSON.stringify({ vimMode: true }))

    const res = await patch({ attachmentFolderPath: './attachments', useMarkdownLinks: true })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ config: { vimMode: true, attachmentFolderPath: './attachments', useMarkdownLinks: true } })
    expect(JSON.parse(await readFile(join(vaultPath, '.obsidian', 'app.json'), 'utf-8'))).toMatchObject({ vimMode: true, useMarkdownLinks: true })
    expect(publish).toHaveBeenCalledWith(expect.objectContaining({
      type: 'vault:change',
      payload: expect.objectContaining({ vaultId: 'v1', path: '.obsidian/app.json', action: 'saved' }),
      excludeUserId: 'u1',
    }))
  })

  it('rejects unknown keys, bad values and bad JSON with 400', async () => {
    expect((await patch({ notAnObsidianKey: true })).status).toBe(400)
    expect((await patch({ newLinkFormat: 'nope' })).status).toBe(400)
    expect((await patch('not json')).status).toBe(400)
    expect(publish).not.toHaveBeenCalled()
  })

  it('answers 404 for an unknown vault', async () => {
    expect((await app.request('/vaults/nope/app-config')).status).toBe(404)
    expect((await patch({ spellcheck: true }, 'nope')).status).toBe(404)
  })

  it('answers 409 and keeps the file when it is not valid JSON', async () => {
    await mkdir(join(vaultPath, '.obsidian'))
    await writeFile(join(vaultPath, '.obsidian', 'app.json'), '{ broken')

    const get = await app.request('/vaults/v1/app-config')
    expect(get.status).toBe(409)
    expect(((await get.json()) as { code: string }).code).toBe('APP_CONFIG_INVALID')
    expect((await patch({ spellcheck: true })).status).toBe(409)
    expect(await readFile(join(vaultPath, '.obsidian', 'app.json'), 'utf-8')).toBe('{ broken')
  })
})
