/**
 * Table columns: stored widths, the resize handle, header drag-reorder, and the
 * formula values that render as something other than text (html / icon / image).
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { BaseDocument, BaseRow, BaseView } from '@slatebase/shared-contracts'
import { BasesTableView } from './BasesTableView'
import { COLUMN_WIDTH } from './base-edit'

const doc: BaseDocument = {
  formulas: {
    badge: 'html("<b>wichtig</b><script>window.__pwned = 1</script><img src=x onerror=\\"window.__pwned = 1\\">")',
    cover: 'image(pic)',
    remote: 'image("https://example.org/a.png")',
    span: 'date("2026-01-10") - date("2026-01-01")',
  },
  views: [],
}

const view: BaseView = {
  type: 'table',
  order: ['file.name', 'status', 'formula.badge', 'formula.cover', 'formula.remote', 'formula.span'],
  columnSize: { status: 180 },
}

const rows: BaseRow[] = [
  { path: 'Notes/a.md', fileName: 'a', values: { status: ['open'], pic: ['Bilder/a.png'] } },
]

const noop = () => {}

function setup(over: Partial<{ onColumnResize: (c: string, w: number | undefined) => void; onReorderColumns: (f: number, t: number) => void }> = {}) {
  return render(
    <BasesTableView
      doc={doc}
      view={view}
      rows={rows}
      vaultId="v1"
      onOpenNote={noop}
      onCommitCell={noop}
      onSortChange={noop}
      {...over}
    />,
  )
}

describe('formula values', () => {
  it('renders html() sanitized', () => {
    const { container } = setup()
    const html = container.querySelector('.bases-value-html')!
    expect(html.querySelector('b')?.textContent).toBe('wichtig')
    expect(html.querySelector('script')).toBeNull()
    expect(html.querySelector('[onerror]')).toBeNull()
    expect((window as unknown as Record<string, unknown>)['__pwned']).toBeUndefined()
  })

  it('renders image() for a vault path and for an http(s) URL', () => {
    const { container } = setup()
    const sources = Array.from(container.querySelectorAll<HTMLImageElement>('img.bases-value-image')).map((i) => i.getAttribute('src'))
    expect(sources).toEqual([
      '/api/v1/vaults/v1/files?path=Bilder%2Fa.png&raw=true',
      'https://example.org/a.png',
    ])
  })

  it('shows a duration as text', () => {
    setup()
    expect(screen.getByText('9d')).toBeTruthy()
  })
})

describe('column width', () => {
  it('applies a stored width to header and cells of that column only', () => {
    const { container } = setup()
    const sized = container.querySelectorAll<HTMLElement>('.bases-table__header--sized, .bases-table__cell--sized')
    expect(sized).toHaveLength(2)
    sized.forEach((el) => expect(el.style.getPropertyValue('--bases-col-width')).toBe('180px'))
  })

  it('has no resize handle when the table is read-only', () => {
    setup()
    expect(screen.queryAllByRole('separator')).toHaveLength(0)
  })

  it('resizes by keyboard and resets with Delete or a double click', () => {
    const onColumnResize = vi.fn()
    setup({ onColumnResize })
    const handle = screen.getByRole('separator', { name: 'Breite der Spalte status' })
    expect(handle.getAttribute('aria-valuenow')).toBe('180')
    expect(handle.getAttribute('aria-valuemin')).toBe(String(COLUMN_WIDTH.min))
    expect(handle.getAttribute('aria-valuemax')).toBe(String(COLUMN_WIDTH.max))
    fireEvent.keyDown(handle, { key: 'ArrowRight' })
    expect(onColumnResize).toHaveBeenLastCalledWith('status', 180 + COLUMN_WIDTH.step)
    fireEvent.keyDown(handle, { key: 'ArrowLeft' })
    expect(onColumnResize).toHaveBeenLastCalledWith('status', 180 - COLUMN_WIDTH.step)
    fireEvent.keyDown(handle, { key: 'Delete' })
    expect(onColumnResize).toHaveBeenLastCalledWith('status', undefined)
    fireEvent.doubleClick(handle)
    expect(onColumnResize).toHaveBeenCalledTimes(4)
  })

  it('writes the width once, when the handle is released', () => {
    const onColumnResize = vi.fn()
    setup({ onColumnResize })
    const handle = screen.getByRole('separator', { name: 'Breite der Spalte status' })
    fireEvent.pointerDown(handle, { button: 0, clientX: 100, pointerId: 1 })
    fireEvent.pointerMove(handle, { clientX: 130, pointerId: 1 })
    expect(onColumnResize).not.toHaveBeenCalled()
    expect(handle.getAttribute('aria-valuenow')).toBe('210')
    fireEvent.pointerUp(handle, { clientX: 140, pointerId: 1 })
    expect(onColumnResize).toHaveBeenCalledTimes(1)
    expect(onColumnResize).toHaveBeenCalledWith('status', 220)
  })
})

describe('column order', () => {
  const dataTransfer = () => {
    const data = new Map<string, string>()
    return {
      setData: (type: string, value: string) => { data.set(type, value) },
      getData: (type: string) => data.get(type) ?? '',
      get types() { return Array.from(data.keys()) },
      effectAllowed: 'none',
    }
  }

  it('moves a column when its header is dropped on another', () => {
    const onReorderColumns = vi.fn()
    const { container } = setup({ onReorderColumns })
    const headers = container.querySelectorAll('th.bases-table__header')
    const dt = dataTransfer()
    fireEvent.dragStart(headers[1]!, { dataTransfer: dt })
    fireEvent.dragOver(headers[3]!, { dataTransfer: dt })
    expect(headers[3]!.classList.contains('bases-table__header--drop')).toBe(true)
    fireEvent.drop(headers[3]!, { dataTransfer: dt })
    expect(onReorderColumns).toHaveBeenCalledWith(1, 3)
  })

  it('headers are not draggable without a reorder handler', () => {
    const { container } = setup()
    expect(container.querySelector('th[draggable="true"]')).toBeNull()
  })
})
