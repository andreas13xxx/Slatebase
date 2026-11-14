import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { BaseDocument, BaseRow, BaseView } from '@slatebase/shared-contracts'
import { BasesListView } from './BasesListView'
import { BasesTableView } from './BasesTableView'
import { BasesToolbar } from './BasesToolbar'
import { setRowHeight, setListMarkers, setListIndentProperties, setListSeparator } from './base-edit'

const doc = (): BaseDocument => ({
  properties: { status: { displayName: 'Status' }, prio: { displayName: 'Prio' } },
  views: [{ type: 'table', name: 'T' }, { type: 'list', name: 'L' }],
})

const rows: BaseRow[] = [
  { path: 'a.md', fileName: 'a', values: { status: ['open'], prio: ['1'] } },
]

describe('display option edits', () => {
  it('sets and removes the row height; the default is never written', () => {
    const set = setRowHeight(doc(), 0, 'tall')
    expect(set.views[0]!.rowHeight).toBe('tall')
    expect('rowHeight' in setRowHeight(set, 0, undefined).views[0]!).toBe(false)
  })

  it('sets and removes markers, indent and separator', () => {
    let d = setListMarkers(doc(), 1, 'number')
    d = setListIndentProperties(d, 1, true)
    d = setListSeparator(d, 1, ';')
    expect(d.views[1]).toMatchObject({ markers: 'number', indentProperties: true, separator: ';' })
    d = setListMarkers(d, 1, undefined)
    d = setListIndentProperties(d, 1, false)
    d = setListSeparator(d, 1, '')
    expect(d.views[1]).toEqual({ type: 'list', name: 'L' })
  })

  it('leaves the other views alone', () => {
    expect(setRowHeight(doc(), 0, 'medium').views[1]).toEqual({ type: 'list', name: 'L' })
  })
})

describe('table row height', () => {
  const renderTable = (view: BaseView) =>
    render(<BasesTableView doc={doc()} view={view} rows={rows} onOpenNote={() => {}} onCommitCell={() => {}} onSortChange={() => {}} />)

  it.each(['medium', 'tall', 'extra'])('adds a class for %s', (h) => {
    const { container } = renderTable({ type: 'table', order: ['file.name', 'status'], rowHeight: h })
    expect(container.querySelector(`.bases-table-view--row-${h}`)).not.toBeNull()
  })

  it('adds none for the default or an unknown value', () => {
    for (const rowHeight of [undefined, 'huge']) {
      const view: BaseView = rowHeight ? { type: 'table', rowHeight } : { type: 'table' }
      const { container, unmount } = renderTable(view)
      expect(container.querySelector('[class*="bases-table-view--row-"]')).toBeNull()
      unmount()
    }
  })
})

describe('list options', () => {
  const renderList = (extra: Partial<BaseView>) =>
    render(<BasesListView doc={doc()} view={{ type: 'list', order: ['file.name', 'status', 'prio'], ...extra }} rows={rows} onOpenNote={() => {}} />)

  it('uses bullets by default and honours number and none', () => {
    const a = renderList({})
    expect(a.container.querySelector('.bases-list--bullet')).not.toBeNull()
    a.unmount()
    const b = renderList({ markers: 'number' })
    expect(b.container.querySelector('.bases-list--number')).not.toBeNull()
    b.unmount()
    const c = renderList({ markers: 'none' })
    expect(c.container.querySelector('.bases-list--none')).not.toBeNull()
  })

  it('runs the values on in one line with a comma by default', () => {
    const { container } = renderList({})
    expect(container.querySelector('.bases-list__details--joined')?.textContent).toBe('open, 1')
    expect(container.querySelector('.bases-list__chip')).toBeNull()
  })

  it('uses the separator from the file', () => {
    const { container } = renderList({ separator: ';' })
    expect(container.querySelector('.bases-list__details--joined')?.textContent).toBe('open; 1')
  })

  it('shows each property on its own indented line instead, ignoring the separator', () => {
    const { container } = renderList({ indentProperties: true, separator: ';' })
    expect(container.querySelector('.bases-list__details--indent')).not.toBeNull()
    expect(container.querySelector('.bases-list__details--joined')).toBeNull()
    expect(container.querySelectorAll('.bases-list__chip')).toHaveLength(2)
  })
})

describe('Anzeige panel', () => {
  function setup(index: number, readOnly = false) {
    let current = doc()
    const onChange = vi.fn()
    render(
      <BasesToolbar
        doc={current}
        rows={[]}
        activeIndex={index}
        readOnly={readOnly}
        mode="view"
        onSelectView={() => {}}
        onChange={onChange}
        searchQuery=""
        onSearchQueryChange={() => {}}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Anzeige/ }))
    const apply = (): BaseDocument => { current = onChange.mock.calls.at(-1)![0](current); return current }
    return { onChange, apply }
  }

  it('changes the row height of a table', () => {
    const { apply } = setup(0)
    fireEvent.change(screen.getByLabelText('Zeilenhöhe'), { target: { value: 'extra' } })
    expect(apply().views[0]!.rowHeight).toBe('extra')
  })

  it('changes marker, indent and separator of a list', () => {
    const { apply } = setup(1)
    fireEvent.change(screen.getByLabelText('Markierung'), { target: { value: 'none' } })
    expect(apply().views[1]!.markers).toBe('none')
    fireEvent.click(screen.getByLabelText('Eigenschaften einrücken'))
    expect(apply().views[1]!.indentProperties).toBe(true)
    const sep = screen.getByLabelText('Trennzeichen')
    fireEvent.change(sep, { target: { value: ';' } })
    fireEvent.blur(sep)
    expect(apply().views[1]!.separator).toBe(';')
  })

  it('hides the separator while properties are indented', () => {
    const d = doc()
    d.views[1] = { type: 'list', name: 'L', indentProperties: true }
    render(
      <BasesToolbar doc={d} rows={[]} activeIndex={1} readOnly={false} mode="view" onSelectView={() => {}} onChange={() => {}} searchQuery="" onSearchQueryChange={() => {}} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Anzeige/ }))
    expect(screen.queryByLabelText('Trennzeichen')).toBeNull()
  })

  it('disables the controls for a read-only base', () => {
    setup(0, true)
    expect((screen.getByLabelText('Zeilenhöhe') as HTMLSelectElement).disabled).toBe(true)
  })
})
