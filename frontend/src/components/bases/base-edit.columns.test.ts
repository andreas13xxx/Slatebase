/**
 * Edit operations for view order, the result limit, column summaries, display
 * names and column widths.
 */

import { describe, it, expect } from 'vitest'
import type { BaseDocument } from '@slatebase/shared-contracts'
import {
  COLUMN_WIDTH, MAX_VIEW_LIMIT, columnEntry, columnLabel, indexAfterMove, moveItem, moveView,
  setColumnSize, setDisplayName, setLimit, setViewSummary,
} from './base-edit'

const makeDoc = (): BaseDocument => ({
  properties: { status: { displayName: 'Status' } },
  views: [
    { type: 'table', name: 'A', order: ['file.name', 'note.status', 'price'] },
    { type: 'list', name: 'B' },
    { type: 'cards', name: 'C', order: ['file.name'] },
  ],
})

describe('moveItem / moveView / indexAfterMove', () => {
  it('moves an item and leaves the input alone', () => {
    const list = ['a', 'b', 'c']
    expect(moveItem(list, 0, 2)).toEqual(['b', 'c', 'a'])
    expect(moveItem(list, 2, 0)).toEqual(['c', 'a', 'b'])
    expect(list).toEqual(['a', 'b', 'c'])
  })

  it('ignores an index outside the list', () => {
    expect(moveItem(['a', 'b'], 0, 5)).toEqual(['a', 'b'])
    expect(moveItem(['a', 'b'], -1, 0)).toEqual(['a', 'b'])
  })

  it('reorders views', () => {
    expect(moveView(makeDoc(), 0, 2).views.map((v) => v.name)).toEqual(['B', 'C', 'A'])
    const doc = makeDoc()
    expect(moveView(doc, 0, 9)).toBe(doc)
  })

  it('tracks where the open view ends up', () => {
    expect(indexAfterMove(0, 0, 2)).toBe(2) // the open view itself moved
    expect(indexAfterMove(1, 0, 2)).toBe(0) // a view before it moved behind it
    expect(indexAfterMove(1, 2, 0)).toBe(2) // a view behind it moved before it
    expect(indexAfterMove(2, 0, 1)).toBe(2) // a move that does not cross it
  })
})

describe('setLimit', () => {
  it('writes a whole positive number', () => {
    expect(setLimit(makeDoc(), 0, 25.9).views[0]!.limit).toBe(25)
    expect(setLimit(makeDoc(), 0, 10 ** 9).views[0]!.limit).toBe(MAX_VIEW_LIMIT)
  })

  it('removes the key for no limit or a useless value', () => {
    const limited = setLimit(makeDoc(), 0, 5)
    expect('limit' in setLimit(limited, 0, undefined).views[0]!).toBe(false)
    expect('limit' in setLimit(limited, 0, 0).views[0]!).toBe(false)
    expect('limit' in setLimit(limited, 0, Number.NaN).views[0]!).toBe(false)
  })
})

describe('setViewSummary', () => {
  it('assigns and removes a summary', () => {
    const doc = setViewSummary(makeDoc(), 0, 'price', 'Sum')
    expect(doc.views[0]!.summaries).toEqual({ price: 'Sum' })
    expect('summaries' in setViewSummary(doc, 0, 'price', undefined).views[0]!).toBe(false)
  })

  it('reuses the spelling the file already has for the column', () => {
    const doc = makeDoc()
    doc.views[0]!.summaries = { 'note.price': 'Average' }
    expect(setViewSummary(doc, 0, 'price', 'Max').views[0]!.summaries).toEqual({ 'note.price': 'Max' })
    expect(columnEntry(doc.views[0]!.summaries, 'price')).toBe('Average')
  })
})

describe('setDisplayName', () => {
  it('renames a declared column under either spelling', () => {
    const doc = setDisplayName(makeDoc(), 'note.status', 'Zustand')
    expect(doc.properties).toEqual({ status: { displayName: 'Zustand' } })
    expect(columnLabel(doc, 'note.status')).toBe('Zustand')
    expect(columnLabel(doc, 'status')).toBe('Zustand')
  })

  it('removes the name but keeps the other fields of the entry', () => {
    const doc: BaseDocument = { properties: { status: { displayName: 'Status', _unknown: { hint: 1 } } }, views: [] }
    expect(setDisplayName(doc, 'status', '  ').properties).toEqual({ status: { _unknown: { hint: 1 } } })
  })

  it('pins the columns of a view without its own order before declaring a new column', () => {
    const doc = setDisplayName(makeDoc(), 'price', 'Preis')
    expect(doc.properties?.['price']).toEqual({ displayName: 'Preis' })
    // View B showed the declared properties (`status`); it must not gain `price`.
    expect(doc.views[1]!.order).toEqual(['status'])
    expect(doc.views[0]!.order).toEqual(['file.name', 'note.status', 'price'])
  })

  it('does nothing for an empty name on an undeclared column', () => {
    const doc = makeDoc()
    expect(setDisplayName(doc, 'price', '')).toBe(doc)
  })
})

describe('setColumnSize', () => {
  it('writes a rounded width inside the allowed range', () => {
    expect(setColumnSize(makeDoc(), 0, 'price', 180.6).views[0]!.columnSize).toEqual({ price: 181 })
    expect(setColumnSize(makeDoc(), 0, 'price', 1).views[0]!.columnSize).toEqual({ price: COLUMN_WIDTH.min })
    expect(setColumnSize(makeDoc(), 0, 'price', 99_999).views[0]!.columnSize).toEqual({ price: COLUMN_WIDTH.max })
  })

  it('resets a column and drops the key once no width is left', () => {
    const doc = setColumnSize(setColumnSize(makeDoc(), 0, 'price', 100), 0, 'file.name', 300)
    const one = setColumnSize(doc, 0, 'price', undefined)
    expect(one.views[0]!.columnSize).toEqual({ 'file.name': 300 })
    expect('columnSize' in setColumnSize(one, 0, 'file.name', undefined).views[0]!).toBe(false)
  })
})
