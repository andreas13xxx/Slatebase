// MCP query_base — server-side evaluation of .base files

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { registerToolHandlers } from './tool-handlers.js'
import type { IVaultService, IVaultAccessControl } from '../business/index.js'
import { VaultAccessDeniedError } from '../business/index.js'
import type { ILinkIndex, BaseQueryRow } from '../link-index/index.js'
import type { ILogger } from '../logger/index.js'
import type { McpConfig } from './config.js'

type Handler = (args: Record<string, unknown>) => Promise<CallToolResult>

function createMockLogger(): ILogger {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as unknown as ILogger
}

function createMockServer() {
  const handlers = new Map<string, Handler>()
  return {
    tool: vi.fn((...args: unknown[]) => {
      handlers.set(args[0] as string, args[args.length - 1] as Handler)
    }),
    handlers,
  }
}

function createMockLinkIndex(rows: BaseQueryRow[], ready = true): ILinkIndex {
  return {
    isReady: () => ready,
    queryForBase: vi.fn().mockResolvedValue({ rows, total: rows.length }),
  } as unknown as ILinkIndex
}

const ROWS: BaseQueryRow[] = [
  { path: 'Tasks/a.md', fileName: 'a', folder: 'Tasks', tags: ['urgent'], values: { status: ['open'], price: ['4'] } },
  { path: 'Tasks/b.md', fileName: 'b', folder: 'Tasks', tags: [], values: { status: ['done'], price: ['2'] } },
  { path: 'Tasks/c.md', fileName: 'c', folder: 'Tasks', tags: [], values: { status: ['open'], price: ['1'] } },
]

const BASE = `filters:
  and:
    - 'status == "open"'
formulas:
  double: price * 2
views:
  - type: table
    name: Open
    order:
      - file.name
      - status
      - formula.double
  - type: table
    name: Limited
    limit: 1
    order:
      - file.name
`

let dir: string

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'query-base-'))
})
afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true })
})

async function setup(opts: { content?: string; rows?: BaseQueryRow[]; ready?: boolean; denyRead?: boolean } = {}) {
  await fs.writeFile(path.join(dir, 'tasks.base'), opts.content ?? BASE)
  const server = createMockServer()
  const accessControl = {
    checkReadAccess: opts.denyRead
      ? vi.fn().mockRejectedValue(new VaultAccessDeniedError('v1', 'user-1', 'read'))
      : vi.fn().mockResolvedValue(undefined),
  } as unknown as IVaultAccessControl
  const linkIndex = createMockLinkIndex(opts.rows ?? ROWS, opts.ready ?? true)
  registerToolHandlers(server as never, {
    vaultService: { resolveFilePath: (_v: string, p: string) => path.join(dir, p) } as unknown as IVaultService,
    vaultAccessControl: accessControl,
    logger: createMockLogger(),
    mcpConfig: { maxFileSize: 1_000_000 } as McpConfig,
    getUserId: () => 'user-1',
    linkIndexResolver: async () => linkIndex,
  })
  return { call: server.handlers.get('query_base')!, linkIndex, server }
}

function parse(result: CallToolResult): Record<string, unknown> {
  const first = result.content[0]
  return JSON.parse(first && first.type === 'text' ? first.text : '{}') as Record<string, unknown>
}

describe('query_base', () => {
  it('is only registered when a link index resolver is wired', () => {
    const server = createMockServer()
    registerToolHandlers(server as never, {
      vaultService: {} as IVaultService,
      vaultAccessControl: {} as IVaultAccessControl,
      logger: createMockLogger(),
      mcpConfig: { maxFileSize: 1 } as McpConfig,
      getUserId: () => 'u',
    })
    expect(server.handlers.has('query_base')).toBe(false)
  })

  it('applies filters, evaluates formulas and returns the first view by default', async () => {
    const { call, linkIndex } = await setup()
    const out = parse(await call({ vaultId: 'v1', path: 'tasks.base', limit: 100 }))
    expect(out['columns']).toEqual(['file.name', 'status', 'formula.double'])
    expect(out['total']).toBe(2)
    expect(out['rows']).toEqual([
      { path: 'Tasks/a.md', cells: { 'file.name': 'a', status: 'open', 'formula.double': '8' } },
      { path: 'Tasks/c.md', cells: { 'file.name': 'c', status: 'open', 'formula.double': '2' } },
    ])
    expect(out['truncated']).toBe(false)
    // The conservative prefilter (status == "open" → an eq condition) IS sent
    // to the index so the candidate cap bites prefiltered rows; the full
    // expression filter still runs client-side on the returned candidates.
    const spec = vi.mocked(linkIndex.queryForBase).mock.calls[0]![0]
    expect(spec.filters).toEqual({ property: 'status', op: 'eq', value: 'open' })
  })

  it('applies the view limit after filtering; only the tool limit counts as truncation', async () => {
    const { call } = await setup()
    const limited = parse(await call({ vaultId: 'v1', path: 'tasks.base', view: 'Limited', limit: 100 }))
    expect(limited['returned']).toBe(1)
    expect(limited['total']).toBe(1) // what the view shows
    expect(limited['matches']).toBe(2) // matches before the view's own limit
    expect(limited['truncated']).toBe(false)

    const capped = parse(await call({ vaultId: 'v1', path: 'tasks.base', limit: 1 }))
    expect(capped['returned']).toBe(1)
    expect(capped['total']).toBe(2)
    expect(capped['truncated']).toBe(true)
  })

  it('rejects a directory named *.base', async () => {
    const { call } = await setup()
    await fs.mkdir(path.join(dir, 'folder.base'))
    const result = await call({ vaultId: 'v1', path: 'folder.base', limit: 100 })
    expect(parse(result)['code']).toBe(-32602)
  })

  it('retries a transiently locked file and succeeds', async () => {
    const { call } = await setup()
    const real = fs.readFile.bind(fs)
    const spy = vi.spyOn(fs, 'readFile')
      .mockRejectedValueOnce(Object.assign(new Error('locked'), { code: 'EPERM' }))
      .mockImplementation(real as never)
    const out = parse(await call({ vaultId: 'v1', path: 'tasks.base', limit: 100 }))
    expect(out['total']).toBe(2)
    expect(spy).toHaveBeenCalledTimes(2)
    spy.mockRestore()
  })

  it('reports a persistently unreadable file as a storage error, not "not found"', async () => {
    const { call } = await setup()
    const spy = vi.spyOn(fs, 'readFile').mockRejectedValue(Object.assign(new Error('locked'), { code: 'EACCES' }))
    const result = await call({ vaultId: 'v1', path: 'tasks.base', limit: 100 })
    spy.mockRestore()
    expect(parse(result)['code']).toBe(-32006)
  })

  it('includes the groupBy property of a cards view and fetches properties used by method filters', async () => {
    const content = `filters:
  and:
    - 'status.contains("op")'
views:
  - type: cards
    name: Board
    order:
      - file.name
    groupBy:
      property: status
`
    const { call, linkIndex } = await setup({ content })
    const out = parse(await call({ vaultId: 'v1', path: 'tasks.base', limit: 100 }))
    expect(out['columns']).toEqual(['file.name', 'status'])
    expect(out['total']).toBe(2)
    expect(out['rows']).toEqual([
      { path: 'Tasks/a.md', cells: { 'file.name': 'a', status: 'open' } },
      { path: 'Tasks/c.md', cells: { 'file.name': 'c', status: 'open' } },
    ])
    const spec = vi.mocked(linkIndex.queryForBase).mock.calls[0]![0]
    expect(spec.columns).toEqual(['status'])
  })

  it('rejects an unknown view and lists the available ones', async () => {
    const { call } = await setup()
    const result = await call({ vaultId: 'v1', path: 'tasks.base', view: 'Nope', limit: 100 })
    expect(result.isError).toBe(true)
    expect(JSON.stringify(parse(result))).toContain('Open, Limited')
  })

  it('rejects non-.base paths', async () => {
    const { call } = await setup()
    const result = await call({ vaultId: 'v1', path: 'note.md', limit: 100 })
    expect(result.isError).toBe(true)
  })

  it('reports a missing file as not found', async () => {
    const { call } = await setup()
    const result = await call({ vaultId: 'v1', path: 'missing.base', limit: 100 })
    expect(parse(result)['code']).toBe(-32002)
  })

  it('reports unparseable YAML as invalid params', async () => {
    const { call } = await setup({ content: 'views: [unclosed' })
    const result = await call({ vaultId: 'v1', path: 'tasks.base', limit: 100 })
    expect(result.isError).toBe(true)
    expect(parse(result)['code']).toBe(-32602)
  })

  it('denies access without read permission', async () => {
    const { call } = await setup({ denyRead: true })
    const result = await call({ vaultId: 'v1', path: 'tasks.base', limit: 100 })
    expect(parse(result)['code']).toBe(-32001)
  })

  it('fails cleanly while the link index is not ready', async () => {
    const { call } = await setup({ ready: false })
    const result = await call({ vaultId: 'v1', path: 'tasks.base', limit: 100 })
    expect(result.isError).toBe(true)
    expect(parse(result)['code']).toBe(-32006)
  })
})
