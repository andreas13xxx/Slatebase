// Tests for pluginRoutes — vault:change events and the registry/community-plugins.json errors

import { describe, it, expect, vi } from 'vitest'
import { Hono } from 'hono'
import type { SessionContext } from '../auth/index.js'
import type { IVaultAccessControl } from '../business/index.js'
import type { ILogger } from '../logger/index.js'
import { CommunityPluginsFileInvalidError } from '../plugin/errors.js'
import type { IPluginService } from '../plugin/plugin-service.js'
import type { PluginInstallResult } from '../plugin/plugin-installer.js'
import type { IEventBus, PublishOptions } from '../realtime/types.js'
import type { IVaultRegistry } from '../vault/registry.js'
import { createPluginRoutes } from './pluginRoutes.js'

const session: SessionContext = { userId: 'owner-1', username: 'owner', role: 'user', sessionId: 'sess-1' }

const logger: ILogger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }

function createService(overrides: Partial<IPluginService> = {}): IPluginService {
  const installResult: PluginInstallResult = {
    pluginId: 'scrybble.ink',
    manifest: { id: 'scrybble.ink', name: 'Scrybble', version: '1.0.0' },
    isUpgrade: false,
    warnings: [],
  }
  return {
    installFromZip: vi.fn(async () => installResult),
    saveRegistry: vi.fn(async () => {}),
    loadRegistry: vi.fn(async () => null),
    mutateRegistry: vi.fn(),
    listPlugins: vi.fn(async () => []),
    getManifest: vi.fn(async () => ({ id: 'dataview', name: 'Dataview', version: '1.0.0' })),
    deletePlugin: vi.fn(async () => {}),
    loadBundle: vi.fn(async () => null),
    loadStyles: vi.fn(async () => null),
    loadSettings: vi.fn(async () => null),
    saveSettings: vi.fn(async () => {}),
    ...overrides,
  } as unknown as IPluginService
}

function createApp(service: IPluginService, published: PublishOptions[]): Hono {
  const eventBus = { publish: (options: PublishOptions) => { published.push(options) } } as unknown as IEventBus
  const accessControl = { getUsersWithAccess: async () => ['owner-1', 'user-2'] } as unknown as IVaultAccessControl
  const app = new Hono()
  app.use('*', async (c, next) => {
    c.set('session' as never, session as never)
    return next()
  })
  app.route('/api/v1/vaults/:vaultId/plugins', createPluginRoutes({
    pluginService: service,
    accessControl,
    vaultRegistry: {} as IVaultRegistry,
    eventBus,
    logger,
  }))
  return app
}

const events = (published: PublishOptions[]) =>
  published.map((e) => [(e.payload as { path: string }).path, (e.payload as { action: string }).action])

describe('pluginRoutes vault:change events', () => {
  it('announces an uploaded plugin, using the id from its manifest', async () => {
    const published: PublishOptions[] = []
    const app = createApp(createService(), published)
    const form = new FormData()
    form.set('file', new File([new Uint8Array([1, 2, 3])], 'plugin.zip'))

    const res = await app.request('/api/v1/vaults/vault-1/plugins', { method: 'POST', body: form })

    expect(res.status).toBe(201)
    expect(events(published)).toEqual([['.obsidian/plugins/scrybble.ink/manifest.json', 'saved']])
    expect(published[0]?.excludeUserId).toBe('owner-1')
    expect(published[0]?.target).toEqual({ kind: 'users', userIds: ['owner-1', 'user-2'] })
  })

  it('refuses an upload over the ZIP limit from its declared length, before the body is read', async () => {
    const published: PublishOptions[] = []
    const service = createService()
    const app = createApp(service, published)
    const form = new FormData()
    form.set('file', new File([new Uint8Array([1])], 'plugin.zip'))

    const res = await app.request('/api/v1/vaults/vault-1/plugins', {
      method: 'POST',
      body: form,
      headers: { 'content-length': String(60 * 1024 * 1024) },
    })

    expect(res.status).toBe(413)
    expect(await res.json()).toMatchObject({ code: 'FILE_TOO_LARGE', message: expect.stringContaining('50 MB') })
    expect(service.installFromZip).not.toHaveBeenCalled()
    expect(published).toEqual([])
  })

  it('announces a deleted plugin', async () => {
    const published: PublishOptions[] = []
    const app = createApp(createService(), published)

    const res = await app.request('/api/v1/vaults/vault-1/plugins/dataview', { method: 'DELETE' })

    expect(res.status).toBe(204)
    expect(events(published)).toEqual([['.obsidian/plugins/dataview/manifest.json', 'deleted']])
  })

  it('announces a changed activation as a change of community-plugins.json', async () => {
    const published: PublishOptions[] = []
    const app = createApp(createService(), published)

    const res = await app.request('/api/v1/vaults/vault-1/plugins/registry', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ version: 1, plugins: {} }),
    })

    expect(res.status).toBe(204)
    expect(events(published)).toEqual([['.obsidian/community-plugins.json', 'saved']])
  })

  it('stays silent when the change fails', async () => {
    const published: PublishOptions[] = []
    const app = createApp(createService({
      saveRegistry: async () => { throw new CommunityPluginsFileInvalidError() },
      deletePlugin: async () => { throw new Error('disk full') },
    }), published)

    const registry = await app.request('/api/v1/vaults/vault-1/plugins/registry', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ version: 1, plugins: {} }),
    })
    const deleted = await app.request('/api/v1/vaults/vault-1/plugins/dataview', { method: 'DELETE' })

    expect(registry.status).toBe(409)
    expect(((await registry.json()) as { code: string }).code).toBe('COMMUNITY_PLUGINS_FILE_INVALID')
    expect(deleted.status).toBe(500)
    expect(published).toEqual([])
  })

  it('does not announce plugin settings: they have their own plugin-settings:change event', async () => {
    const published: PublishOptions[] = []
    const service = createService()
    const app = createApp(service, published)

    const res = await app.request('/api/v1/vaults/vault-1/plugins/dataview/settings', { method: 'PUT', body: '{"a":1}' })

    expect(res.status).toBe(204)
    expect(service.saveSettings).toHaveBeenCalledWith('vault-1', 'dataview', '{"a":1}')
    expect(published).toEqual([])
  })

  it('refuses settings for a plugin that is not installed, so no folder is created for an arbitrary id', async () => {
    const service = createService({ getManifest: vi.fn(async () => null) })
    const app = createApp(service, [])

    const res = await app.request('/api/v1/vaults/vault-1/plugins/not-installed/settings', { method: 'PUT', body: '{"a":1}' })

    expect(res.status).toBe(404)
    expect(((await res.json()) as { code: string }).code).toBe('PLUGIN_NOT_FOUND')
    expect(service.saveSettings).not.toHaveBeenCalled()
  })

  it('still answers when publishing fails', async () => {
    const eventBus = { publish: () => { throw new Error('bus down') } } as unknown as IEventBus
    const app = new Hono()
    app.use('*', async (c, next) => {
      c.set('session' as never, session as never)
      return next()
    })
    app.route('/api/v1/vaults/:vaultId/plugins', createPluginRoutes({
      pluginService: createService(),
      accessControl: { getUsersWithAccess: async () => [] } as unknown as IVaultAccessControl,
      vaultRegistry: {} as IVaultRegistry,
      eventBus,
      logger,
    }))

    const res = await app.request('/api/v1/vaults/vault-1/plugins/dataview', { method: 'DELETE' })

    expect(res.status).toBe(204)
  })
})
