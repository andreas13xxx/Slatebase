import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import type { BaseDocument, BaseRow, BaseView } from '@slatebase/shared-contracts'
import { BasesTableView } from './BasesTableView'
import { BasesKanbanView } from './BasesKanbanView'
import { BasesToolbar } from './BasesToolbar'
import { setBoardSize, setColumnSize, resetColumnSizes, COLUMN_WIDTH } from './base-edit'

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

describe('table column resize', () => {
  const renderTable = (view: BaseView, onColumnResize?: (c: string, w: number | undefined) => void) =>
    render(
      <BasesTableView
        doc={doc()}
        view={view}
        rows={rows}
        onOpenNote={() => {}}
        onCommitCell={() => {}}
        onSortChange={() => {}}
        {...(onColumnResize ? { onColumnResize } : {})}
      />,
    )

  it('applies saved widths through a colgroup', () => {
    const { container } = renderTable({ type: 'table', order: ['file.name', 'status'], columnSize: { status: 240 } })
    const cols = container.querySelectorAll('col')
    expect(cols).toHaveLength(2)
    expect((cols[1] as HTMLElement).style.width).toBe('240px')
  })

  it('has no resize handles without a handler', () => {
    renderTable({ type: 'table', order: ['file.name', 'status'] })
    expect(screen.queryAllByRole('separator')).toHaveLength(0)
  })

  it('resizes with the keyboard and resets on double click', () => {
    const onResize = vi.fn()
    renderTable({ type: 'table', order: ['file.name', 'status'], columnSize: { status: 200 } }, onResize)
    const handle = screen.getByRole('separator', { name: 'Spaltenbreite Status' })
    fireEvent.keyDown(handle, { key: 'ArrowRight' })
    expect(onResize).toHaveBeenCalledWith('status', expect.any(Number))
    fireEvent.doubleClick(handle)
    expect(onResize).toHaveBeenLastCalledWith('status', undefined)
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
