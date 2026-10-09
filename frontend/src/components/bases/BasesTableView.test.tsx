import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { BasesTableView } from './BasesTableView'
import { inferCellType } from './base-cell-type'
import type { BaseDocument, BaseRow, BaseView } from '../../bases/types'

const doc: BaseDocument = {
  formulas: { days_left: 'date(deadline) - date("2026-01-01")' },
  properties: {
    'file.name': { displayName: 'Task' },
    status: { displayName: 'Status' },
    days_left: { displayName: 'Days left' },
  },
  views: [],
}

const view: BaseView = {
  type: 'table',
  order: ['file.name', 'status', 'days_left'],
  sort: [{ column: 'status', direction: 'asc' }],
}

const rows: BaseRow[] = [
  { path: 'Tasks/a.md', fileName: 'a', values: { status: ['open'], deadline: ['2026-01-10'] } },
  { path: 'Tasks/b.md', fileName: 'b', values: { status: ['done'], deadline: ['2026-01-05'] } },
]

describe('inferCellType', () => {
  it('infers types from raw values', () => {
    expect(inferCellType(['hello'])).toBe('text')
    expect(inferCellType(['42'])).toBe('number')
    expect(inferCellType(['true'])).toBe('checkbox')
    expect(inferCellType(['2026-03-15'])).toBe('date')
    expect(inferCellType(['a', 'b'])).toBe('list')
    expect(inferCellType([])).toBe('text')
  })
})

describe('BasesTableView', () => {
  it('renders a row per note and the configured headers', () => {
    render(
      <BasesTableView doc={doc} view={view} rows={rows} onOpenNote={() => {}} onCommitCell={() => {}} onSortChange={() => {}} />,
    )
    expect(screen.getByText('Task')).toBeTruthy()
    expect(screen.getByText('Status')).toBeTruthy()
    expect(screen.getByText('Days left')).toBeTruthy()
    // First column links
    expect(screen.getByRole('button', { name: 'a' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'b' })).toBeTruthy()
  })

  it('evaluates a formula column client-side', () => {
    render(
      <BasesTableView doc={doc} view={view} rows={rows} onOpenNote={() => {}} onCommitCell={() => {}} onSortChange={() => {}} />,
    )
    // days_left for row a: 2026-01-10 - 2026-01-01 = 9
    expect(screen.getByText('9')).toBeTruthy()
    // row b: 2026-01-05 - 2026-01-01 = 4
    expect(screen.getByText('4')).toBeTruthy()
  })

  it('reports a sort toggle on a header click', () => {
    const onSortChange = vi.fn()
    render(
      <BasesTableView doc={doc} view={view} rows={rows} onOpenNote={() => {}} onCommitCell={() => {}} onSortChange={onSortChange} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Status/ }))
    // status was asc → toggles to desc
    expect(onSortChange).toHaveBeenCalledWith([{ column: 'status', direction: 'desc' }])
  })

  it('opens a note when the link is clicked', () => {
    const onOpenNote = vi.fn()
    render(
      <BasesTableView doc={doc} view={view} rows={rows} onOpenNote={onOpenNote} onCommitCell={() => {}} onSortChange={() => {}} />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'a' }))
    expect(onOpenNote).toHaveBeenCalledWith('Tasks/a.md')
  })

  it('shows an empty-state message when there are no rows', () => {
    render(
      <BasesTableView doc={doc} view={view} rows={[]} onOpenNote={() => {}} onCommitCell={() => {}} onSortChange={() => {}} />,
    )
    expect(screen.getByText('Keine Einträge')).toBeTruthy()
  })
})
