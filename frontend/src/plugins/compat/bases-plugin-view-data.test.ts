/**
 * Regression tests for what real Bases view plugins read from the data we hand
 * them (found with Base Graph, Bases Charts and Bases Timeline View):
 * `Value.data`, ISO `DateValue.toString()`, `note.`-prefixed property ids,
 * a real `TFile` on `entry.file`, and index links in `resolvedLinks`.
 */

import { describe, it, expect, vi } from 'vitest'
import { installObsidianGlobals } from './install-globals'
import { BasesQueryController, type DrivableBasesView } from './bases-query-controller'
import { DateValue, NumberValue, StringValue } from './bases-values'
import { MetadataCacheShim } from './shims/metadata-cache-shim'
import type { IApiClient } from '../../api'
import type { BaseDocument, BaseView, BaseQueryResultWire } from '@slatebase/shared-contracts'
import type { DirectoryTree } from '../../types'

installObsidianGlobals()

type Cfg = {
  setOrder(o: string[]): void
  setViewData(k: string, v: unknown): void
  getOrder(): string[]
  getAsPropertyId(k: string): string | null
  getDisplayName(id: string): string
  _displayNames: Record<string, string>
}
const newConfig = (): Cfg => new (window.obsidian!['BasesViewConfig'] as unknown as new () => Cfg)()

describe('Bases Value objects as plugins read them', () => {
  it('exposes the raw value as .data', () => {
    expect(new NumberValue(5).data).toBe(5)
    expect(new StringValue('x').data).toBe('x')
  })

  it('DateValue.toString() stays machine-readable, never locale-formatted', () => {
    expect(new DateValue('2026-08-03').toString()).toBe('2026-08-03')
    expect(new DateValue('2026-08-03T10:30').toString()).toBe('2026-08-03T10:30')
  })
})

describe('BasesViewConfig property ids', () => {
  it('returns note.-prefixed ids from getAsPropertyId() and getOrder()', () => {
    const cfg = newConfig()
    cfg.setOrder(['estimate', 'file.name', 'formula.days'])
    cfg.setViewData('startField', 'start')
    cfg.setViewData('x', 'file.name')
    expect(cfg.getOrder()).toEqual(['note.estimate', 'file.name', 'formula.days'])
    expect(cfg.getAsPropertyId('startField')).toBe('note.start')
    expect(cfg.getAsPropertyId('x')).toBe('file.name')
    expect(cfg.getAsPropertyId('missing')).toBeNull()
  })

  it('resolves display names, falling back to the bare property name', () => {
    const cfg = newConfig()
    cfg._displayNames = { estimate: 'Aufwand' }
    expect(cfg.getDisplayName('note.estimate')).toBe('Aufwand')
    expect(cfg.getDisplayName('note.status')).toBe('status')
  })
})

describe('BasesQueryController entries', () => {
  const doc: BaseDocument = {
    properties: {},
    formulas: { days: '2 + 1' },
    views: [{ type: 'timeline-view', order: ['file.name', 'start', 'formula.days'] }],
  }
  const view = doc.views[0] as BaseView
  const result: BaseQueryResultWire = {
    rows: [{ path: 'P/Alpha.md', fileName: 'Alpha', values: { start: ['2026-08-03'] }, links: ['P/Beta.md'] }],
    total: 1,
  }
  const api = {
    queryBase: vi.fn().mockResolvedValue(result),
    getPropertyTypes: vi.fn().mockResolvedValue({ entries: [] }),
  } as unknown as IApiClient

  it('accepts note.-prefixed ids, carries a TFile and evaluates formula.* columns', async () => {
    const target: DrivableBasesView = { onDataUpdated: vi.fn() }
    const ctrl = new BasesQueryController({ apiClient: api, vaultId: 'v', doc, view, target })
    await ctrl.start()
    const entry = (target.data as { get(i: number): { file: { basename: string; path: string }; getValue(k: string): { toString(): string } } }).get(0)
    expect(entry.getValue('note.start').toString()).toBe('2026-08-03')
    expect(entry.getValue('start').toString()).toBe('2026-08-03')
    expect(entry.getValue('formula.days').toString()).toBe('3')
    expect(entry.file.basename).toBe('Alpha')
    expect(entry.file.path).toBe('P/Alpha.md')
    expect((target.data as { properties: string[] }).properties).toEqual(['file.name', 'note.start', 'formula.days'])
    ctrl.stop()
  })

  it('exposes the raw note properties as entry.properties (TaskNotes cards)', async () => {
    const taskView: BaseView = { type: 'tasknotesTaskList', order: ['note.status', 'note.contexts', 'note.timeEstimate', 'file.tags'] } as BaseView
    const taskApi = {
      queryBase: vi.fn().mockResolvedValue({
        rows: [{ path: 'T.md', fileName: 'T', values: { status: ['in-progress'], contexts: ['@büro'], timeEstimate: ['60'], 'file.tags': ['task'] } }],
        total: 1,
      }),
      getPropertyTypes: vi.fn().mockResolvedValue({ entries: [{ key: 'contexts', type: 'list' }, { key: 'timeEstimate', type: 'number' }] }),
    } as unknown as IApiClient
    const target: DrivableBasesView = { onDataUpdated: vi.fn() }
    const ctrl = new BasesQueryController({ apiClient: taskApi, vaultId: 'v', doc, view: taskView, target })
    await ctrl.start()
    const entry = (target.data as { get(i: number): { properties: Record<string, unknown> } }).get(0)
    expect(entry.properties).toEqual({ status: 'in-progress', contexts: ['@büro'], timeEstimate: 60 })
    ctrl.stop()
  })

  it('converts checkbox properties to booleans', async () => {
    const taskView: BaseView = { type: 'tasknotesTaskList', order: ['note.done'] } as BaseView
    const taskApi = {
      queryBase: vi.fn().mockResolvedValue({ rows: [{ path: 'T.md', fileName: 'T', values: { done: ['true'] } }], total: 1 }),
      getPropertyTypes: vi.fn().mockResolvedValue({ entries: [{ key: 'done', type: 'checkbox' }] }),
    } as unknown as IApiClient
    const target: DrivableBasesView = { onDataUpdated: vi.fn() }
    const ctrl = new BasesQueryController({ apiClient: taskApi, vaultId: 'v', doc, view: taskView, target })
    await ctrl.start()
    const entry = (target.data as { get(i: number): { properties: Record<string, unknown> } }).get(0)
    expect(entry.properties).toEqual({ done: true })
    ctrl.stop()
  })

  it('resolves file.name even when it is not a displayed column (chart X axis)', async () => {
    const chartView: BaseView = { type: 'chart-bar', order: ['start'], _unknown: { x: 'file.name' } } as BaseView
    const target: DrivableBasesView = { onDataUpdated: vi.fn() }
    const ctrl = new BasesQueryController({ apiClient: api, vaultId: 'v', doc, view: chartView, target })
    await ctrl.start()
    const entry = (target.data as { get(i: number): { getValue(k: string): { toString(): string } } }).get(0)
    expect(entry.getValue('file.name').toString()).toBe('Alpha')
    expect(entry.getValue('file.path').toString()).toBe('P/Alpha.md')
    ctrl.stop()
  })
})

describe('MetadataCacheShim indexed links', () => {
  it('reports server-indexed links in resolvedLinks for unread files', () => {
    const tree = {
      name: 'root', path: '', type: 'directory', children: [
        { name: 'Alpha.md', path: 'Alpha.md', type: 'file' },
        { name: 'Beta.md', path: 'Beta.md', type: 'file' },
      ],
    } as unknown as DirectoryTree
    const cache = new MetadataCacheShim(tree)
    cache.setIndexedLinks('Alpha.md', ['Beta.md'])
    expect(cache.resolvedLinks).toEqual({ 'Alpha.md': { 'Beta.md': 1 } })
    cache.setIndexedLinks('Alpha.md', [])
    expect(cache.resolvedLinks).toEqual({})
  })
})
