/**
 * Tests for BasesQueryController — same rows as the table, live refresh,
 * Value-wrapped columns, formula evaluation.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { installObsidianGlobals } from './install-globals'
import { BasesQueryController, type DrivableBasesView } from './bases-query-controller'
import { dispatchRealtimeVaultChange } from '../../state/realtimeVaultBridge'
import type { IApiClient } from '../../api'
import type { BaseDocument, BaseView, BaseQueryResultWire } from '@slatebase/shared-contracts'

installObsidianGlobals()

function makeApiClient(result: BaseQueryResultWire): IApiClient {
  return {
    queryBase: vi.fn().mockResolvedValue(result),
    getPropertyTypes: vi.fn().mockResolvedValue({ entries: [] }),
  } as unknown as IApiClient
}

const doc: BaseDocument = {
  properties: { title: {}, count: {}, score2x: {} },
  formulas: { score2x: 'count * 2' },
  views: [{ type: 'cards', order: ['title', 'count', 'score2x'] }],
}
const view: BaseView = doc.views[0] as BaseView

const result: BaseQueryResultWire = {
  rows: [
    { path: 'a.md', fileName: 'a', values: { title: ['Alpha'], count: ['3'] } },
    { path: 'b.md', fileName: 'b', values: { title: ['Beta'], count: ['5'] } },
  ],
  total: 2,
}

describe('BasesQueryController', () => {
  let target: DrivableBasesView & { onDataUpdated: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    target = { onDataUpdated: vi.fn() }
  })

  it('runs the query, wraps columns as Values, and calls onDataUpdated()', async () => {
    const api = makeApiClient(result)
    const ctrl = new BasesQueryController({ apiClient: api, vaultId: 'v1', doc, view, target })
    await ctrl.start()

    expect(api.queryBase).toHaveBeenCalledTimes(1)
    expect(target.onDataUpdated).toHaveBeenCalledTimes(1)
    expect(target.allProperties).toEqual(['title', 'count', 'score2x'])

    const data = target.data as { length(): number; get(i: number): { getValue(k: string): { toString(): string } } }
    expect(data.length()).toBe(2)
    const row0 = data.get(0)
    expect(row0.getValue('title').toString()).toBe('Alpha')
    expect(row0.getValue('count').toString()).toBe('3')
    // Formula column: count(3) * 2 = 6
    expect(row0.getValue('score2x').toString()).toBe('6')
    ctrl.stop()
  })

  it('re-queries and re-fires onDataUpdated() on a matching vault:change', async () => {
    const api = makeApiClient(result)
    const ctrl = new BasesQueryController({ apiClient: api, vaultId: 'v1', doc, view, target })
    await ctrl.start()
    expect(target.onDataUpdated).toHaveBeenCalledTimes(1)

    dispatchRealtimeVaultChange({ vaultId: 'v1', action: 'saved', path: 'a.md', userId: 'u', username: 'n' })
    await Promise.resolve(); await Promise.resolve()
    expect(api.queryBase).toHaveBeenCalledTimes(2)
    expect(target.onDataUpdated).toHaveBeenCalledTimes(2)
    ctrl.stop()
  })

  it('ignores vault:change for a different vault', async () => {
    const api = makeApiClient(result)
    const ctrl = new BasesQueryController({ apiClient: api, vaultId: 'v1', doc, view, target })
    await ctrl.start()
    dispatchRealtimeVaultChange({ vaultId: 'other', action: 'saved', path: 'x.md', userId: 'u', username: 'n' })
    await Promise.resolve()
    expect(api.queryBase).toHaveBeenCalledTimes(1)
    ctrl.stop()
  })

  it('stop() unsubscribes from further updates', async () => {
    const api = makeApiClient(result)
    const ctrl = new BasesQueryController({ apiClient: api, vaultId: 'v1', doc, view, target })
    await ctrl.start()
    ctrl.stop()
    dispatchRealtimeVaultChange({ vaultId: 'v1', action: 'saved', path: 'a.md', userId: 'u', username: 'n' })
    await Promise.resolve()
    expect(api.queryBase).toHaveBeenCalledTimes(1)
  })

  it('reports a single key-less group for an ungrouped view', async () => {
    const ctrl = new BasesQueryController({ apiClient: makeApiClient(result), vaultId: 'v1', doc, view, target })
    await ctrl.start()
    const groups = (target.data as { groupedData: Array<{ hasKey(): boolean; entries: unknown[] }> }).groupedData
    expect(groups).toHaveLength(1)
    expect(groups[0]!.hasKey()).toBe(false)
    expect(groups[0]!.entries).toHaveLength(2)
    ctrl.stop()
  })

  it('splits entries into groups per groupBy; notes without a value form a key-less group last', async () => {
    const grouped: BaseView = { ...view, groupBy: { property: 'status', direction: 'ASC' } } as BaseView
    const res: BaseQueryResultWire = {
      rows: [
        { path: 'a.md', fileName: 'a', values: { status: ['open'] } },
        { path: 'b.md', fileName: 'b', values: { status: ['done'] } },
        { path: 'c.md', fileName: 'c', values: { status: ['open'] } },
        { path: 'd.md', fileName: 'd', values: {} },
      ],
      total: 4,
    }
    const ctrl = new BasesQueryController({ apiClient: makeApiClient(res), vaultId: 'v1', doc, view: grouped, target })
    await ctrl.start()
    const groups = (target.data as { groupedData: Array<{ key: { toString(): string } | null; hasKey(): boolean; entries: unknown[] }> }).groupedData
    expect(groups.map((g) => g.key?.toString() ?? null)).toEqual(['done', 'open', null])
    expect(groups.map((g) => g.entries.length)).toEqual([1, 2, 1])
    expect(groups[2]!.hasKey()).toBe(false)
    ctrl.stop()
  })

  it('resolves `this` in a formula column when a hostPath is given', async () => {
    const doc2: BaseDocument = {
      formulas: { fromHost: 'this.project' },
      views: [{ type: 'cards', order: ['title', 'fromHost'] }],
    }
    const view2: BaseView = doc2.views[0] as BaseView
    const api = {
      queryBase: vi.fn()
        // The data query (candidate rows), then the host-row query (buildHostQuerySpec picks `project`).
        .mockResolvedValueOnce({
          rows: [{ path: 'a.md', fileName: 'a', values: { title: ['Alpha'] } }],
          total: 1,
        } satisfies BaseQueryResultWire)
        .mockResolvedValueOnce({
          rows: [{ path: 'Host.md', fileName: 'Host', values: { project: ['Apollo'] } }],
          total: 1,
        } satisfies BaseQueryResultWire),
      getPropertyTypes: vi.fn().mockResolvedValue({ entries: [] }),
    } as unknown as IApiClient
    const ctrl = new BasesQueryController({ apiClient: api, vaultId: 'v1', doc: doc2, view: view2, hostPath: 'Host.md', target })
    await ctrl.start()
    const data = target.data as { get(i: number): { getValue(k: string): { toString(): string } } }
    expect(data.get(0).getValue('fromHost').toString()).toBe('Apollo')
    ctrl.stop()
  })

  it('reports a query error through onError', async () => {
    const api = { queryBase: vi.fn().mockRejectedValue(new Error('boom')), getPropertyTypes: vi.fn().mockResolvedValue({ entries: [] }) } as unknown as IApiClient
    const onError = vi.fn()
    const ctrl = new BasesQueryController({ apiClient: api, vaultId: 'v1', doc, view, target, onError })
    await ctrl.start()
    expect(onError).toHaveBeenCalledWith(expect.stringContaining('boom'))
    ctrl.stop()
  })

  it('hands formula results to plugins as typed Values, not text', async () => {
    const doc2: BaseDocument = {
      formulas: {
        age: 'now() - date("2020-01-01")',
        dur: 'duration("1d")',
        lnk: 'link("Other")',
        obj: 'file.properties',
        tags: 'list("a")',
      },
      views: [{ type: 'cards', order: ['formula.dur', 'formula.lnk', 'formula.tags'] }],
    }
    const view2: BaseView = doc2.views[0] as BaseView
    const api = makeApiClient({ rows: [{ path: 'a.md', fileName: 'a', values: { title: ['Alpha'] } }], total: 1 })
    const ctrl = new BasesQueryController({ apiClient: api, vaultId: 'v1', doc: doc2, view: view2, target })
    await ctrl.start()
    const O = window.obsidian as Record<string, new (...a: never[]) => unknown>
    const entry = (target.data as { get(i: number): { getValue(k: string): unknown } }).get(0)
    const dur = entry.getValue('formula.dur') as { data: number; toString(): string }
    expect(dur).toBeInstanceOf(O['DurationValue'])
    expect(dur.data).toBe(86_400_000)
    expect(dur.toString()).toBe('1d')
    expect(entry.getValue('formula.lnk')).toBeInstanceOf(O['LinkValue'])
    expect(entry.getValue('formula.tags')).toBeInstanceOf(O['ListValue'])
    ctrl.stop()
  })

  it('puts the path-derived file.* properties on every entry', async () => {
    const api = makeApiClient({ rows: [{ path: 'Folder/Sub/note.md', fileName: 'note', values: {} }], total: 1 })
    const ctrl = new BasesQueryController({ apiClient: api, vaultId: 'v1', doc, view, target })
    await ctrl.start()
    const O = window.obsidian as Record<string, new (...a: never[]) => unknown>
    const entry = (target.data as { get(i: number): { getValue(k: string): { toString(): string } } }).get(0)
    expect(entry.getValue('file.ext').toString()).toBe('md')
    expect(entry.getValue('file.folder').toString()).toBe('Folder/Sub')
    expect(entry.getValue('file.basename').toString()).toBe('note')
    expect(entry.getValue('file.file')).toBeInstanceOf(O['FileValue'])
    ctrl.stop()
  })

  it('BasesQueryResult.hasKey() is true only for a grouped result', async () => {
    const O = window.obsidian as Record<string, new (...a: never[]) => unknown>
    const Result = O['BasesQueryResult'] as unknown as new (e?: unknown[], g?: unknown[]) => { hasKey(): boolean }
    expect(new Result([], undefined).hasKey()).toBe(false)
    expect(new Result([], [{ key: null, entries: [] }]).hasKey()).toBe(false)
    expect(new Result([], [{ key: 'x', entries: [] }]).hasKey()).toBe(true)
  })
})
