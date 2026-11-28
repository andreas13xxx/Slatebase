import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import type { BaseDocument, BaseRow, BaseView } from '@slatebase/shared-contracts'
import { BasesKanbanView } from './BasesKanbanView'
import { BasesToolbar } from './BasesToolbar'
import { setBoardSize, setColumnWidth, setColumnSize, resetColumnSizes, COLUMN_WIDTH } from './base-edit'

const doc = (): BaseDocument => ({
  properties: { status: { displayName: 'Status' }, cover: { displayName: 'Cover' } },
  views: [{ type: 'table', name: 'T' }, { type: 'kanban', name: 'K', groupBy: { property: 'status' } }],
})

const rows: BaseRow[] = [
  { path: 'a.md', fileName: 'a', values: { status: ['open'], cover: ['#ff0000'] } },
]

describe('column width edits', () => {
  it('sets, clamps and removes a column width; the map disappears when empty', () => {
    let d = setColumnSize(doc(), 0, 'status', 200)
    expect(d.views[0]!.columnSize).toEqual({ status: 200 })
    d = setColumnSize(d, 0, 'cover', 5)
    expect(d.views[0]!.columnSize).toEqual({ status: 200, cover: COLUMN_WIDTH.min })
    d = setColumnSize(setColumnSize(d, 0, 'status', undefined), 0, 'cover', undefined)
    expect('columnSize' in d.views[0]!).toBe(false)
  })

  it('resets all widths', () => {
    const d = resetColumnSizes(setColumnSize(doc(), 0, 'status', 200), 0)
    expect('columnSize' in d.views[0]!).toBe(false)
  })

  it('writes a board width and removes it again (unset = automatic)', () => {
    const set = setBoardSize(doc(), 1, 300)
    expect(set.views[1]!.cardSize).toBe(300)
    expect('cardSize' in setBoardSize(set, 1, undefined).views[1]!).toBe(false)
  })
})

describe('kanban column width (columnWidth, as Obsidian writes it)', () => {
  it('writes columnWidth, drops the legacy cardSize, and removes it again', () => {
    const legacy: BaseDocument = { ...doc(), views: [{ type: 'kanban', cardSize: 300 }] }
    const set = setColumnWidth(legacy, 0, 360)
    expect(set.views[0]).toEqual({ type: 'kanban', columnWidth: 360 })
    expect('columnWidth' in setColumnWidth(set, 0, undefined).views[0]!).toBe(false)
  })

  it('clamps to the allowed range', () => {
    expect(setColumnWidth(doc(), 1, 5000).views[1]!.columnWidth).toBe(800)
  })

  it('sizes the board from columnWidth, which wins over a legacy cardSize', () => {
    const view: BaseView = { type: 'kanban', groupBy: { property: 'status' }, columnWidth: 360, cardSize: 220 }
    const { container } = render(<BasesKanbanView doc={doc()} view={view} rows={rows} vaultId="v1" onOpenNote={() => {}} />)
    expect((container.querySelector('.bases-kanban') as HTMLElement).style.getPropertyValue('--bases-board-size')).toBe('360px')
  })

  it('still honours a legacy cardSize on a kanban view', () => {
    const view: BaseView = { type: 'kanban', groupBy: { property: 'status' }, cardSize: 220 }
    const { container } = render(<BasesKanbanView doc={doc()} view={view} rows={rows} vaultId="v1" onOpenNote={() => {}} />)
    expect((container.querySelector('.bases-kanban') as HTMLElement).style.getPropertyValue('--bases-board-size')).toBe('220px')
  })

  it('grouped cards (rows) ignore columnWidth and use cardSize', () => {
    const view: BaseView = { type: 'cards', groupBy: { property: 'status' }, columnWidth: 360, cardSize: 240 }
    const { container } = render(<BasesKanbanView doc={doc()} view={view} rows={rows} layout="rows" vaultId="v1" onOpenNote={() => {}} />)
    expect((container.querySelector('.bases-kanban') as HTMLElement).style.getPropertyValue('--bases-board-size')).toBe('240px')
  })

  it('the toolbar field edits columnWidth', () => {
    const d: BaseDocument = { ...doc(), views: [{ type: 'kanban', name: 'K', groupBy: { property: 'status' }, columnWidth: 360 }] }
    let next: BaseDocument | null = null
    render(
      <BasesToolbar
        doc={d}
        rows={[]}
        activeIndex={0}
        readOnly={false}
        mode="view"
        onSelectView={() => {}}
        onChange={(update) => { next = update(d) }}
        searchQuery=""
        onSearchQueryChange={() => {}}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Anzeige/ }))
    const input = screen.getByLabelText('Spaltenbreite') as HTMLInputElement
    expect(input.value).toBe('360')
    fireEvent.change(input, { target: { value: '400' } })
    fireEvent.blur(input)
    expect((next as BaseDocument | null)?.views[0]).toMatchObject({ columnWidth: 400 })
  })
})

describe('kanban board options', () => {
  it('uses cardSize as the board width variable and shows the cover image', () => {
    const view: BaseView = { type: 'kanban', groupBy: { property: 'status' }, cardSize: 320, image: 'cover' }
    const { container } = render(<BasesKanbanView doc={doc()} view={view} rows={rows} vaultId="v1" onOpenNote={() => {}} />)
    expect((container.querySelector('.bases-kanban') as HTMLElement).style.getPropertyValue('--bases-board-size')).toBe('320px')
    expect(container.querySelector('.bases-kanban__card .bases-cards__cover')).not.toBeNull()
  })

  it('leaves the stylesheet defaults without cardSize', () => {
    const view: BaseView = { type: 'kanban', groupBy: { property: 'status' } }
    const { container } = render(<BasesKanbanView doc={doc()} view={view} rows={rows} vaultId="v1" onOpenNote={() => {}} />)
    expect((container.querySelector('.bases-kanban') as HTMLElement).style.getPropertyValue('--bases-board-size')).toBe('')
  })
})

describe('display panel for kanban', () => {
  it('offers width and image options', () => {
    const d: BaseDocument = { ...doc(), views: [{ type: 'kanban', name: 'K', groupBy: { property: 'status' } }] }
    render(
      <BasesToolbar
        doc={d}
        rows={[]}
        activeIndex={0}
        readOnly={false}
        mode="view"
        onSelectView={() => {}}
        onChange={() => {}}
        searchQuery=""
        onSearchQueryChange={() => {}}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Anzeige/ }))
    expect(screen.getByLabelText('Spaltenbreite')).toBeTruthy()
    expect(screen.getByLabelText('Bildanpassung')).toBeTruthy()
  })
})
