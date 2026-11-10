import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { BasesKanbanView } from './BasesKanbanView'
import type { BaseDocument, BaseRow, BaseView } from '@slatebase/shared-contracts'

const doc: BaseDocument = { views: [] }

const view: BaseView = {
  type: 'cards',
  groupBy: { property: 'file.folder' },
  order: ['file.name'],
}

const rows = (): BaseRow[] => [
  { path: 'Projekte/a.md', fileName: 'Task A', values: { 'file.folder': 'Projekte' } },
  { path: 'Archiv/b.md', fileName: 'Task B', values: { 'file.folder': 'Archiv' } },
  { path: 'root.md', fileName: 'Task R', values: { 'file.folder': '' } },
]

function dt(): DataTransfer {
  const store: Record<string, string> = {}
  return {
    effectAllowed: '',
    dropEffect: '',
    setData: (k: string, v: string) => { store[k] = v },
    getData: (k: string) => store[k] ?? '',
  } as unknown as DataTransfer
}

const cardFor = (name: string) => screen.getByText(name).closest('button') as HTMLElement
const columnFor = (label: string) => screen.getByText(label).closest('section') as HTMLElement

describe('BasesKanbanView — grouped by file.folder (Obsidian 1.14.2)', () => {
  it('shows folder columns and names the vault root column "(Wurzel)"', () => {
    render(<BasesKanbanView doc={doc} view={view} rows={rows()} onOpenNote={vi.fn()} />)
    expect(screen.getByText('Projekte')).toBeInTheDocument()
    expect(screen.getByText('Archiv')).toBeInTheDocument()
    expect(screen.getByText('(Wurzel)')).toBeInTheDocument()
    expect(screen.queryByText(/^Ohne /)).toBeNull()
  })

  it('reports a drop on a folder column with the folder path as value', () => {
    const onMoveCard = vi.fn()
    render(<BasesKanbanView doc={doc} view={view} rows={rows()} onOpenNote={vi.fn()} onMoveCard={onMoveCard} />)
    const data = dt()
    fireEvent.dragStart(cardFor('Task A'), { dataTransfer: data })
    fireEvent.dragOver(columnFor('Archiv'), { dataTransfer: data })
    fireEvent.drop(columnFor('Archiv'), { dataTransfer: data })
    expect(onMoveCard).toHaveBeenCalledWith('Projekte/a.md', 'file.folder', 'Archiv')
  })

  it('reports a drop on the root column as the empty folder', () => {
    const onMoveCard = vi.fn()
    render(<BasesKanbanView doc={doc} view={view} rows={rows()} onOpenNote={vi.fn()} onMoveCard={onMoveCard} />)
    const data = dt()
    fireEvent.dragStart(cardFor('Task A'), { dataTransfer: data })
    fireEvent.dragOver(columnFor('(Wurzel)'), { dataTransfer: data })
    fireEvent.drop(columnFor('(Wurzel)'), { dataTransfer: data })
    expect(onMoveCard).toHaveBeenCalledWith('Projekte/a.md', 'file.folder', '')
  })

  it('passes the folder column value (root as "") to the per-column add button', () => {
    const onAddCard = vi.fn()
    render(<BasesKanbanView doc={doc} view={view} rows={rows()} onOpenNote={vi.fn()} onAddCard={onAddCard} />)
    fireEvent.click(screen.getByRole('button', { name: 'Neuer Eintrag in Archiv' }))
    expect(onAddCard).toHaveBeenLastCalledWith('file.folder', 'Archiv')
    fireEvent.click(screen.getByRole('button', { name: 'Neuer Eintrag in (Wurzel)' }))
    expect(onAddCard).toHaveBeenLastCalledWith('file.folder', '')
  })
})
