import { describe, it, expect } from 'vitest'
import { buildQuerySpec } from './query-engine'
import type { BaseDocument, BaseView } from './types'

describe('buildQuerySpec', () => {
  const doc: BaseDocument = {
    filters: { property: 'status', op: 'eq', value: 'open' },
    formulas: { days_left: 'today() - date(deadline)' },
    properties: { status: {}, priority: {}, days_left: {} },
    views: [],
  }

  it('takes columns from the view order, dropping file.* and formula columns', () => {
    const view: BaseView = { type: 'table', order: ['file.name', 'status', 'priority', 'days_left'] }
    const spec = buildQuerySpec(doc, view)
    expect(spec.columns).toEqual(['status', 'priority'])
  })

  it('falls back to the document property keys when the view has no order', () => {
    const view: BaseView = { type: 'table' }
    const spec = buildQuerySpec(doc, view)
    // days_left is a formula → excluded; status/priority remain
    expect(spec.columns).toEqual(['status', 'priority'])
  })

  it('passes the document filter through', () => {
    const spec = buildQuerySpec(doc, { type: 'table', order: ['status'] })
    expect(spec.filters).toEqual({ property: 'status', op: 'eq', value: 'open' })
  })

  it('keeps a file.* sort but drops a formula-column sort', () => {
    const view: BaseView = {
      type: 'table',
      order: ['status'],
      sort: [
        { column: 'file.name', direction: 'asc' },
        { column: 'days_left', direction: 'desc' },
      ],
    }
    const spec = buildQuerySpec(doc, view)
    expect(spec.sort).toEqual([{ column: 'file.name', direction: 'asc' }])
  })

  it('omits sort entirely when only formula sorts are present', () => {
    const view: BaseView = { type: 'table', order: ['status'], sort: [{ column: 'days_left' }] }
    const spec = buildQuerySpec(doc, view)
    expect(spec.sort).toBeUndefined()
  })

  it('adds a cards view groupBy property to the requested columns', () => {
    const view: BaseView = { type: 'cards', order: ['file.name'], groupBy: 'status' }
    const spec = buildQuerySpec(doc, view)
    expect(spec.columns).toContain('status')
  })

  it('does not duplicate groupBy when it is already a displayed column', () => {
    const view: BaseView = { type: 'cards', order: ['status', 'priority'], groupBy: 'status' }
    const spec = buildQuerySpec(doc, view)
    expect(spec.columns.filter((c) => c === 'status')).toHaveLength(1)
  })

  it('ignores a groupBy on a file.* or formula column', () => {
    const specFile = buildQuerySpec(doc, { type: 'cards', order: ['status'], groupBy: 'file.name' })
    expect(specFile.columns).not.toContain('file.name')
    const specFormula = buildQuerySpec(doc, { type: 'cards', order: ['status'], groupBy: 'days_left' })
    expect(specFormula.columns).not.toContain('days_left')
  })
})
