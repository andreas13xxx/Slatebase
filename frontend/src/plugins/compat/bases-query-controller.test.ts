/**
 * Tests for BasesQueryController — same rows as the table, live refresh,
 * Value-wrapped columns, formula evaluation.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { installObsidianGlobals } from './install-globals'
import { BasesQueryController, type DrivableBasesView } from './bases-query-controller'
import { dispatchRealtimeVaultChange } from '../../state/realtimeVaultBridge'
import type { IApiClient } from '../../api'
import type { BaseDocument, BaseView, BaseQueryResultWire } from '../../bases/types'

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

  it('reports a query error through onError', async () => {
    const api = { queryBase: vi.fn().mockRejectedValue(new Error('boom')), getPropertyTypes: vi.fn().mockResolvedValue({ entries: [] }) } as unknown as IApiClient
    const onError = vi.fn()
    const ctrl = new BasesQueryController({ apiClient: api, vaultId: 'v1', doc, view, target, onError })
    await ctrl.start()
    expect(onError).toHaveBeenCalledWith(expect.stringContaining('boom'))
    ctrl.stop()
  })
})
