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
  groupBy: { property: 'status' },
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

  // ── Drag-between-columns ──────────────────────────────────────────────────

  /** Minimal DataTransfer stub for jsdom (no native drag support). */
  function dt(): DataTransfer {
    const store: Record<string, string> = {}
    return {
      effectAllowed: '',
      dropEffect: '',
      setData: (k: string, v: string) => { store[k] = v },
      getData: (k: string) => store[k] ?? '',
    } as unknown as DataTransfer
  }

  function cardFor(name: string): HTMLElement {
    // The card <button> carries the title span; climb to the button.
    return screen.getByText(name).closest('button') as HTMLElement
  }

  function columnFor(label: string): HTMLElement {
    return screen.getByText(label).closest('section') as HTMLElement
  }

  it('cards are draggable only when onMoveCard is supplied', () => {
    const { rerender } = render(
      <BasesKanbanView doc={doc} view={view} rows={rows()} onOpenNote={vi.fn()} />,
    )
    expect(cardFor('Task A').getAttribute('draggable')).toBe('false')

    rerender(
      <BasesKanbanView doc={doc} view={view} rows={rows()} onOpenNote={vi.fn()} onMoveCard={vi.fn()} />,
    )
    expect(cardFor('Task A').getAttribute('draggable')).toBe('true')
  })

  it('dropping a card on another column writes the grouping property', () => {
    const onMoveCard = vi.fn()
    render(<BasesKanbanView doc={doc} view={view} rows={rows()} onOpenNote={vi.fn()} onMoveCard={onMoveCard} />)
    const data = dt()
    fireEvent.dragStart(cardFor('Task A'), { dataTransfer: data })
    const done = columnFor('done')
    fireEvent.dragOver(done, { dataTransfer: data })
    fireEvent.drop(done, { dataTransfer: data })
    expect(onMoveCard).toHaveBeenCalledWith('a.md', 'status', 'done')
  })

  it('dropping a card on the "Ohne …" column clears the grouping property', () => {
    const onMoveCard = vi.fn()
    render(<BasesKanbanView doc={doc} view={view} rows={rows()} onOpenNote={vi.fn()} onMoveCard={onMoveCard} />)
    const data = dt()
    fireEvent.dragStart(cardFor('Task A'), { dataTransfer: data })
    const ungrouped = columnFor('Ohne status')
    fireEvent.dragOver(ungrouped, { dataTransfer: data })
    fireEvent.drop(ungrouped, { dataTransfer: data })
    expect(onMoveCard).toHaveBeenCalledWith('a.md', 'status', '')
  })

  it('dropping a card back on its own column is a no-op', () => {
    const onMoveCard = vi.fn()
    render(<BasesKanbanView doc={doc} view={view} rows={rows()} onOpenNote={vi.fn()} onMoveCard={onMoveCard} />)
    const data = dt()
    fireEvent.dragStart(cardFor('Task A'), { dataTransfer: data })
    const todo = columnFor('todo')
    fireEvent.dragOver(todo, { dataTransfer: data })
    fireEvent.drop(todo, { dataTransfer: data })
    expect(onMoveCard).not.toHaveBeenCalled()
  })
})
