import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { BaseDocument, BaseRow, BaseView } from '@slatebase/shared-contracts'
import { groupRows, UNGROUPED } from './base-groups'
import { BasesTableView } from './BasesTableView'
import { BasesListView } from './BasesListView'

const doc: BaseDocument = { properties: { 'file.name': { displayName: 'Task' }, status: { displayName: 'Status' } }, views: [] }
const rows: BaseRow[] = [
  { path: 'a.md', fileName: 'a', values: { status: ['open'] } },
  { path: 'b.md', fileName: 'b', values: { status: ['done'] } },
  { path: 'c.md', fileName: 'c', values: {} },
  { path: 'd.md', fileName: 'd', values: { status: ['open'] } },
]
const keys = (v: BaseView) => groupRows(rows, v)?.map((g) => g.key)

describe('groupRows', () => {
  it('returns null without groupBy', () => {
    expect(groupRows(rows, { type: 'table' })).toBeNull()
  })
  it('sorts groups by value with the empty group last, honouring direction', () => {
    expect(keys({ type: 'table', groupBy: { property: 'status' } })).toEqual(['done', 'open', UNGROUPED])
    expect(keys({ type: 'table', groupBy: { property: 'status', direction: 'DESC' } })).toEqual(['open', 'done', UNGROUPED])
  })
  it('groupOrder reorders and hides groups', () => {
    expect(keys({ type: 'table', groupBy: { property: 'status' }, groupOrder: ['open', null] })).toEqual(['open', UNGROUPED])
    expect(keys({ type: 'table', groupBy: { property: 'status' }, groupOrder: [] })).toEqual([])
  })
  it('resolves a note.-prefixed groupBy against the bare row-value key', () => {
    // The backend strips `note.` when filling rows, so `note.status` must group
    // against `row.values.status` — not land everything in the empty group.
    expect(keys({ type: 'table', groupBy: { property: 'note.status' } })).toEqual(['done', 'open', UNGROUPED])
  })
})

describe('grouped table and list views', () => {
  const view: BaseView = { type: 'table', order: ['file.name', 'status'], groupBy: { property: 'status' }, groupOrder: ['open', 'done'] }

  it('table: renders group headers in groupOrder and collapses a group', () => {
    render(<BasesTableView doc={doc} view={view} rows={rows} onOpenNote={vi.fn()} onCommitCell={vi.fn()} onSortChange={vi.fn()} />)
    const headers = screen.getAllByRole('button', { name: /\(\d+\)/ })
    expect(headers.map((h) => h.textContent)).toEqual(expect.arrayContaining([expect.stringContaining('open'), expect.stringContaining('done')]))
    expect(headers[0]?.textContent).toContain('open')
    expect(screen.queryByText('c')).toBeNull() // hidden by groupOrder
    expect(screen.getByText('b')).toBeTruthy()
    fireEvent.click(headers[1]!)
    expect(headers[1]?.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByText('b')).toBeNull()
  })

  it('list: renders group headers and collapses a group', () => {
    render(<BasesListView doc={doc} view={{ ...view, type: 'list' }} rows={rows} onOpenNote={vi.fn()} />)
    const headers = screen.getAllByRole('button', { name: /\(\d+\)/ })
    expect(headers).toHaveLength(2)
    expect(screen.getByText('b', { selector: '.bases-list__title' })).toBeTruthy()
    fireEvent.click(headers[1]!)
    expect(screen.queryByText('b', { selector: '.bases-list__title' })).toBeNull()
  })
})
