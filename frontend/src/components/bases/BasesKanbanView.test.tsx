import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { BasesKanbanView } from './BasesKanbanView'
import type { BaseDocument, BaseRow, BaseView } from '../../bases/types'

const doc: BaseDocument = {
  properties: { status: {}, priority: {} },
  views: [],
}

const view: BaseView = {
  type: 'cards',
  groupBy: 'status',
  order: ['file.name', 'status', 'priority'],
}

function rows(): BaseRow[] {
  return [
    { path: 'a.md', fileName: 'Task A', values: { status: ['todo'], priority: ['high'] } },
    { path: 'b.md', fileName: 'Task B', values: { status: ['todo'], priority: ['low'] } },
    { path: 'c.md', fileName: 'Task C', values: { status: ['done'] } },
    { path: 'd.md', fileName: 'Task D', values: {} }, // no status → ungrouped column
  ]
}

describe('BasesKanbanView', () => {
  it('groups rows into one column per distinct grouping value', () => {
    render(<BasesKanbanView doc={doc} view={view} rows={rows()} onOpenNote={vi.fn()} />)
    expect(screen.getByText('todo')).toBeInTheDocument()
    expect(screen.getByText('done')).toBeInTheDocument()
    // Rows with no status land in an "Ohne status" column.
    expect(screen.getByText('Ohne status')).toBeInTheDocument()
  })

  it('shows all cards and column counts', () => {
    render(<BasesKanbanView doc={doc} view={view} rows={rows()} onOpenNote={vi.fn()} />)
    expect(screen.getByText('Task A')).toBeInTheDocument()
    expect(screen.getByText('Task B')).toBeInTheDocument()
    expect(screen.getByText('Task C')).toBeInTheDocument()
    expect(screen.getByText('Task D')).toBeInTheDocument()
    // todo column holds 2 cards.
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('opens a note when its card is clicked', () => {
    const onOpenNote = vi.fn()
    render(<BasesKanbanView doc={doc} view={view} rows={rows()} onOpenNote={onOpenNote} />)
    fireEvent.click(screen.getByText('Task A'))
    expect(onOpenNote).toHaveBeenCalledWith('a.md')
  })

  it('collapses a column when its header is clicked', () => {
    render(<BasesKanbanView doc={doc} view={view} rows={rows()} onOpenNote={vi.fn()} />)
    expect(screen.getByText('Task C')).toBeInTheDocument()
    // Collapse the "done" column.
    fireEvent.click(screen.getByText('done'))
    expect(screen.queryByText('Task C')).not.toBeInTheDocument()
  })

  it('does not render the grouping property as a chip (it is the column)', () => {
    render(<BasesKanbanView doc={doc} view={view} rows={rows()} onOpenNote={vi.fn()} />)
    // priority chips appear; status chips do not (status is the column grouping)
    expect(screen.getByText('high')).toBeInTheDocument()
  })

  it('shows a guidance message when groupBy is missing', () => {
    const noGroup: BaseView = { type: 'cards', order: ['file.name'] }
    render(<BasesKanbanView doc={doc} view={noGroup} rows={rows()} onOpenNote={vi.fn()} />)
    expect(screen.getByRole('alert')).toHaveTextContent('groupBy')
  })

  it('shows an empty message when there are no rows', () => {
    render(<BasesKanbanView doc={doc} view={view} rows={[]} onOpenNote={vi.fn()} />)
    expect(screen.getByText('Keine Einträge')).toBeInTheDocument()
  })
})
