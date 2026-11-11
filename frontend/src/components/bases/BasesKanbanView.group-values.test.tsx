import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, createEvent } from '@testing-library/react'
import { BasesKanbanView } from './BasesKanbanView'
import type { BaseDocument, BaseRow, BaseView } from '@slatebase/shared-contracts'

const doc: BaseDocument = { properties: { priority: {} }, views: [] }
const view: BaseView = { type: 'cards', groupBy: { property: 'priority' }, order: ['file.name', 'priority'] }

const rows = (): BaseRow[] => [
  { path: 'a.md', fileName: 'A', values: { priority: [1] } },
  { path: 'b.md', fileName: 'B', values: { priority: [2] } },
  { path: 'c.md', fileName: 'C', values: { priority: ['high'] } },
  { path: 'd.md', fileName: 'D', values: { priority: [true] } },
]

function dt(): DataTransfer {
  const store: Record<string, string> = {}
  return {
    effectAllowed: '', dropEffect: '',
    setData: (k: string, v: string) => { store[k] = v },
    getData: (k: string) => store[k] ?? '',
  } as unknown as DataTransfer
}

describe('BasesKanbanView — column reorder keeps value types', () => {
  it('writes numbers and booleans back as numbers and booleans, not strings', () => {
    const onReorderColumns = vi.fn()
    render(<BasesKanbanView doc={doc} view={view} rows={rows()} onOpenNote={vi.fn()} onReorderColumns={onReorderColumns} />)
    const title = (label: string) => screen.getAllByText(label).find((el) => el.classList.contains('bases-kanban__column-title')) as HTMLElement
    const header = (label: string) => title(label).closest('.bases-kanban__column-header-row') as HTMLElement
    const section = (label: string) => title(label).closest('section') as HTMLElement
    const data = dt()
    // Alphabetical default: 1, 2, high, true. Move "1" onto "2" → 2, 1, high, true.
    fireEvent.dragStart(header('1'), { dataTransfer: data })
    fireEvent.dragOver(section('2'), { dataTransfer: data })
    fireEvent.drop(section('2'), { dataTransfer: data })
    expect(onReorderColumns).toHaveBeenCalledWith([2, 1, 'high', true])
  })

  it('keeps the drop-target highlight while the pointer moves onto a child of the column', () => {
    render(<BasesKanbanView doc={doc} view={view} rows={rows()} onOpenNote={vi.fn()} onMoveCard={vi.fn()} />)
    const data = dt()
    const card = screen.getByText('A').closest('button') as HTMLElement
    const target = screen.getAllByText('2').find((el) => el.classList.contains('bases-kanban__column-title'))!.closest('section') as HTMLElement
    fireEvent.dragStart(card, { dataTransfer: data })
    fireEvent.dragOver(target, { dataTransfer: data })
    expect(target.className).toContain('drop-target')
    // dragleave towards an element INSIDE the column must not clear the highlight …
    const leave = (related: Element | null) => {
      const ev = createEvent.dragLeave(target)
      Object.defineProperty(ev, 'relatedTarget', { value: related }) // jsdom's DragEvent has no relatedTarget
      fireEvent(target, ev)
    }
    leave(target.querySelector('.bases-kanban__column-count'))
    expect(target.className).toContain('drop-target')
    // … but really leaving it does.
    leave(document.body)
    expect(target.className).not.toContain('drop-target')
  })

  it('restores the type of a column that currently has no cards from the saved groupOrder', () => {
    const onReorderColumns = vi.fn()
    const withOrder: BaseView = { ...view, groupOrder: [1, 2, 3] }
    // No row has priority 3: its column is empty but listed in groupOrder.
    const r: BaseRow[] = [
      { path: 'a.md', fileName: 'A', values: { priority: [1] } },
      { path: 'b.md', fileName: 'B', values: { priority: [2] } },
    ]
    render(<BasesKanbanView doc={doc} view={withOrder} rows={r} onOpenNote={vi.fn()} onReorderColumns={onReorderColumns} />)
    const title = (label: string) => screen.getAllByText(label).find((el) => el.classList.contains('bases-kanban__column-title')) as HTMLElement
    const data = dt()
    fireEvent.dragStart(title('2').closest('.bases-kanban__column-header-row') as HTMLElement, { dataTransfer: data })
    fireEvent.dragOver(title('1').closest('section') as HTMLElement, { dataTransfer: data })
    fireEvent.drop(title('1').closest('section') as HTMLElement, { dataTransfer: data })
    expect(onReorderColumns).toHaveBeenCalledWith([2, 1, 3])
  })

  it('finds the type in any value of a multi-value property, on any row', () => {
    const onReorderColumns = vi.fn()
    const r: BaseRow[] = [
      { path: 'a.md', fileName: 'A', values: { priority: ['high', 7] } },
      { path: 'b.md', fileName: 'B', values: { priority: [1] } },
    ]
    render(<BasesKanbanView doc={doc} view={view} rows={r} onOpenNote={vi.fn()} onReorderColumns={onReorderColumns} />)
    const title = (label: string) => screen.getAllByText(label).find((el) => el.classList.contains('bases-kanban__column-title')) as HTMLElement
    const data = dt()
    fireEvent.dragStart(title('1').closest('.bases-kanban__column-header-row') as HTMLElement, { dataTransfer: data })
    fireEvent.dragOver(title('high').closest('section') as HTMLElement, { dataTransfer: data })
    fireEvent.drop(title('high').closest('section') as HTMLElement, { dataTransfer: data })
    const order = onReorderColumns.mock.calls[0]![0] as unknown[]
    expect(order).toContain(1)
    expect(order).not.toContain('1')
  })
})
