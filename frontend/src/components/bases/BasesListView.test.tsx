import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { BasesListView } from './BasesListView'
import type { BaseDocument, BaseRow, BaseView } from '@slatebase/shared-contracts'

const doc: BaseDocument = {
  formulas: { days_left: 'days(date(deadline), date("2026-01-01"))' },
  properties: {
    'file.name': { displayName: 'Task' },
    status: { displayName: 'Status' },
    days_left: { displayName: 'Days left' },
  },
  views: [],
}

const view: BaseView = {
  type: 'list',
  order: ['file.name', 'status', 'days_left'],
}

const rows: BaseRow[] = [
  { path: 'Tasks/a.md', fileName: 'a', values: { status: ['open'], deadline: ['2026-01-10'] } },
  { path: 'Tasks/b.md', fileName: 'b', values: { status: ['done'], deadline: ['2026-01-05'] } },
]

describe('BasesListView', () => {
  it('renders one entry per note with the file name as the title', () => {
    render(<BasesListView doc={doc} view={view} rows={rows} onOpenNote={() => {}} />)
    // Titles render as their own spans; the button's accessible name also
    // includes the detail chips, so assert on the title text specifically.
    expect(screen.getByText('a', { selector: '.bases-list__title' })).toBeTruthy()
    expect(screen.getByText('b', { selector: '.bases-list__title' })).toBeTruthy()
    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(2)
  })

  it('shows the configured detail columns as labelled chips', () => {
    render(<BasesListView doc={doc} view={view} rows={rows} onOpenNote={() => {}} />)
    // Column labels appear (at least once) and the open/done values render.
    expect(screen.getAllByText('Status').length).toBeGreaterThan(0)
    expect(screen.getByText('open')).toBeTruthy()
    expect(screen.getByText('done')).toBeTruthy()
  })

  it('evaluates a formula column read-only', () => {
    render(<BasesListView doc={doc} view={view} rows={rows} onOpenNote={() => {}} />)
    // days_left for row a: 2026-01-10 - 2026-01-01 = 9; row b: 4
    expect(screen.getByText('9')).toBeTruthy()
    expect(screen.getByText('4')).toBeTruthy()
  })

  it('opens a note when its entry is clicked', () => {
    const onOpenNote = vi.fn()
    render(<BasesListView doc={doc} view={view} rows={rows} onOpenNote={onOpenNote} />)
    const titleA = screen.getByText('a', { selector: '.bases-list__title' })
    const entry = titleA.closest('button')
    expect(entry).not.toBeNull()
    fireEvent.click(entry!)
    expect(onOpenNote).toHaveBeenCalledWith('Tasks/a.md')
  })

  it('renders an empty state for no rows', () => {
    render(<BasesListView doc={doc} view={view} rows={[]} onOpenNote={() => {}} />)
    expect(screen.getByText('Keine Einträge')).toBeTruthy()
  })
})
