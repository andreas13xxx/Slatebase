import { describe, it, expect } from 'vitest'
import { Hono } from 'hono'
import { createBasesRoutes } from './basesRoutes'
import type { ILinkIndex, BaseQuerySpec, BaseQueryResult } from '../link-index/index.js'
import type { ILogger } from '../logger/index.js'

function createMockLogger(): ILogger {
  const noop = (): void => {}
  return { debug: noop, info: noop, warn: noop, error: noop, child: () => createMockLogger() } as unknown as ILogger
}

function createMockLinkIndex(overrides: Partial<ILinkIndex> = {}): ILinkIndex {
  return {
    rebuild: async () => {},
    updateFile: async () => {},
    removeFile: async () => {},
    renameFile: async () => {},
    renameDirectory: async () => {},
    getForwardLinks: () => [],
    getBacklinks: () => [],
    getGraph: () => ({ nodes: [], edges: [] }),
    getGraphMeta: () => ({ tags: [], propertyKeys: [] }),
    isReady: () => true,
    getFilesByProperty: () => [],
    getPropertyKeys: () => [],
    getPropertyValues: () => [],
    queryByProperties: () => [],
    queryForBase: async () => ({ rows: [], total: 0 }),
    ...overrides,
  }
}

function createTestApp(options: { linkIndex?: ILinkIndex | undefined } = {}) {
  const linkIndex = 'linkIndex' in options ? options.linkIndex : createMockLinkIndex()
  const app = new Hono()
  const routes = createBasesRoutes({
    linkIndexResolver: async () => linkIndex,
    logger: createMockLogger(),
  })
  app.route('/api/v1', routes)
  return app
}

async function postQuery(app: Hono, body: unknown): Promise<Response> {
  return app.request('/api/v1/vaults/vault-1/bases/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

describe('Bases Query Route', () => {
  it('resolves a query to rows and forwards the parsed spec', async () => {
    let seen: BaseQuerySpec | undefined
    const result: BaseQueryResult = {
      rows: [{ path: 'Tasks/a.md', fileName: 'a', values: { status: ['open'] } }],
      total: 1,
    }
    const linkIndex = createMockLinkIndex({
      queryForBase: async (spec) => {
        seen = spec
        return result
      },
    })
    const app = createTestApp({ linkIndex })

    const res = await postQuery(app, {
      filters: { and: [{ property: 'status', op: 'eq', value: 'open' }] },
      columns: ['status'],
      sort: [{ column: 'file.name', direction: 'asc' }],
    })

    expect(res.status).toBe(200)
    const body = await res.json() as BaseQueryResult
    expect(body.total).toBe(1)
    expect(body.rows[0]?.path).toBe('Tasks/a.md')
    expect(seen?.columns).toEqual(['status'])
    expect(seen?.sort).toEqual([{ column: 'file.name', direction: 'asc' }])
    expect(seen?.filters).toEqual({ and: [{ property: 'status', op: 'eq', value: 'open' }] })
  })

  it('accepts a query without filters (whole-vault base)', async () => {
    const app = createTestApp()
    const res = await postQuery(app, { columns: ['status'] })
    expect(res.status).toBe(200)
  })

  it('returns 503 when the link index is not ready', async () => {
    const linkIndex = createMockLinkIndex({ isReady: () => false })
    const app = createTestApp({ linkIndex })
    const res = await postQuery(app, { columns: [] })
    expect(res.status).toBe(503)
  })

  it('returns 400 on invalid JSON', async () => {
    const app = createTestApp()
    const res = await postQuery(app, '{ not json')
    expect(res.status).toBe(400)
  })

  it('returns 400 when columns is missing', async () => {
    const app = createTestApp()
    const res = await postQuery(app, { sort: [] })
    expect(res.status).toBe(400)
  })

  it('returns 400 on an invalid operator', async () => {
    const app = createTestApp()
    const res = await postQuery(app, {
      filters: { property: 'x', op: 'between' },
      columns: [],
    })
    expect(res.status).toBe(400)
  })

  it('returns 500 when the query throws', async () => {
    const linkIndex = createMockLinkIndex({
      queryForBase: async () => { throw new Error('boom') },
    })
    const app = createTestApp({ linkIndex })
    const res = await postQuery(app, { columns: [] })
    expect(res.status).toBe(500)
  })
})
