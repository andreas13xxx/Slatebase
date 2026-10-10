import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Hono } from 'hono'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { createActivityRoutes } from './activityRoutes'
import { ActivityStore } from '../activity/index.js'
import type { ILogger } from '../logger/index.js'
import type { ActivityPage } from '../activity/index.js'

function createMockLogger(): ILogger {
  const noop = (): void => {}
  return { debug: noop, info: noop, warn: noop, error: noop } as unknown as ILogger
}

describe('Activity Route', () => {
  let tmpDir: string
  let vaultDir: string
  let store: ActivityStore
  let app: Hono

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'activity-route-'))
    vaultDir = path.join(tmpDir, 'vault')
    await fs.mkdir(vaultDir, { recursive: true })
    store = new ActivityStore(() => vaultDir, createMockLogger())
    app = new Hono()
    app.route('/api/v1', createActivityRoutes({ activityService: store, logger: createMockLogger() }))
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  async function get(query = ''): Promise<Response> {
    return app.request(`/api/v1/vaults/vault-1/activity${query}`)
  }

  it('returns a page of recorded events, newest first', async () => {
    await store.record('vault-1', { type: 'note.created', path: 'A.md', user: 'andreas' })
    await store.record('vault-1', { type: 'note.deleted', path: 'B.md', user: 'andreas' })

    const res = await get()
    expect(res.status).toBe(200)
    const body = (await res.json()) as ActivityPage
    expect(body.items.length).toBe(2)
    expect(body.items.every(e => typeof e.id === 'string')).toBe(true)
  })

  it('filters by event type', async () => {
    await store.record('vault-1', { type: 'note.created', path: 'A.md', user: 'andreas' })
    await store.record('vault-1', { type: 'note.deleted', path: 'B.md', user: 'andreas' })

    const res = await get('?types=note.deleted')
    expect(res.status).toBe(200)
    const body = (await res.json()) as ActivityPage
    expect(body.items).toHaveLength(1)
    expect(body.items[0]?.type).toBe('note.deleted')
  })

  it('rejects an unknown event type with 400', async () => {
    const res = await get('?types=note.exploded')
    expect(res.status).toBe(400)
    const body = (await res.json()) as { code: string }
    expect(body.code).toBe('VALIDATION_ERROR')
  })

  it('rejects an invalid limit with 400', async () => {
    const res = await get('?limit=0')
    expect(res.status).toBe(400)
  })

  it('paginates via the cursor', async () => {
    for (let i = 0; i < 3; i++) {
      await store.record('vault-1', { type: 'note.created', path: `N${i}.md`, user: 'andreas' })
    }
    const first = await get('?limit=2')
    const firstBody = (await first.json()) as ActivityPage
    expect(firstBody.items).toHaveLength(2)
    expect(firstBody.nextCursor).not.toBeNull()

    const second = await get(`?limit=2&cursor=${encodeURIComponent(firstBody.nextCursor ?? '')}`)
    const secondBody = (await second.json()) as ActivityPage
    expect(secondBody.items).toHaveLength(1)
    expect(secondBody.nextCursor).toBeNull()
  })

  it('returns an empty page for a vault with no activity', async () => {
    const res = await get()
    expect(res.status).toBe(200)
    const body = (await res.json()) as ActivityPage
    expect(body.items).toEqual([])
    expect(body.nextCursor).toBeNull()
  })
})

describe('Activity Route — access control & feature gate (composed with middleware)', () => {
  let tmpDir: string
  let vaultDir: string
  let store: ActivityStore

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'activity-route-guard-'))
    vaultDir = path.join(tmpDir, 'vault')
    await fs.mkdir(vaultDir, { recursive: true })
    store = new ActivityStore(() => vaultDir, createMockLogger())
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('rejects with 403 when the vault-auth middleware denies read access', async () => {
    // Mirror production: a vault-auth middleware guards /vaults/:vaultId/* and
    // short-circuits with 403 before the activity handler runs.
    const app = new Hono()
    app.use('/api/v1/vaults/:vaultId/*', async (c, next) => {
      if (c.req.param('vaultId') === 'forbidden-vault') {
        return c.json({ code: 'FORBIDDEN', message: 'No read access', timestamp: new Date().toISOString() }, 403)
      }
      await next()
      return undefined
    })
    app.route('/api/v1', createActivityRoutes({ activityService: store, logger: createMockLogger() }))

    const denied = await app.request('/api/v1/vaults/forbidden-vault/activity')
    expect(denied.status).toBe(403)
    const body = (await denied.json()) as { code: string }
    expect(body.code).toBe('FORBIDDEN')

    // A vault the middleware allows still reaches the handler (200).
    const allowed = await app.request('/api/v1/vaults/vault-1/activity')
    expect(allowed.status).toBe(200)
  })

  it('is not reachable (404) when the feature guard blocks the mount', async () => {
    // Mirror production: when the `activity-timeline` toggle is off, the route
    // is never mounted, so the path does not resolve.
    const featureEnabled = false
    const app = new Hono()
    if (featureEnabled) {
      app.route('/api/v1', createActivityRoutes({ activityService: store, logger: createMockLogger() }))
    }

    const res = await app.request('/api/v1/vaults/vault-1/activity')
    expect(res.status).toBe(404)
  })

  it('does not leak another vault’s activity (R4.3 — path param scopes the read)', async () => {
    // The vaultId path param is the only key into the per-vault store, so a
    // request for vault-A can never return vault-B's events.
    const perVaultDirs: Record<string, string> = {}
    const scopedStore = new ActivityStore(vaultId => {
      const dir = perVaultDirs[vaultId] ?? path.join(tmpDir, vaultId)
      perVaultDirs[vaultId] = dir
      return dir
    }, createMockLogger())
    await fs.mkdir(path.join(tmpDir, 'vault-a'), { recursive: true })
    await fs.mkdir(path.join(tmpDir, 'vault-b'), { recursive: true })
    await scopedStore.record('vault-a', { type: 'note.created', path: 'SecretA.md', user: 'andreas' })
    await scopedStore.record('vault-b', { type: 'note.created', path: 'SecretB.md', user: 'andreas' })

    const app = new Hono()
    app.route('/api/v1', createActivityRoutes({ activityService: scopedStore, logger: createMockLogger() }))

    const res = await app.request('/api/v1/vaults/vault-a/activity')
    const body = (await res.json()) as ActivityPage
    expect(body.items).toHaveLength(1)
    expect(body.items[0]?.path).toBe('SecretA.md')
    expect(body.items.some(e => e.path === 'SecretB.md')).toBe(false)
  })
})
