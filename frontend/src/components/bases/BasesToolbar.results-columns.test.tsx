/**
 * Toolbar: reordering views, the Results panel (limit, copy, CSV) and the
 * per-column options (display name, summary).
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import type { BaseDocument } from '@slatebase/shared-contracts'
import { BasesToolbar } from './BasesToolbar'

const makeDoc = (): BaseDocument => ({
  summaries: { Mittel: 'values.mean()' },
  views: [
    { type: 'table', name: 'Offen', order: ['file.name', 'price'] },
    { type: 'list', name: 'Liste', order: ['file.name'] },
    { type: 'table', name: 'Archiv', order: ['file.name'] },
  ],
})

function setup(over: Partial<{ readOnly: boolean; index: number; onCopyTable: () => void; onExportCsv: () => void }> = {}) {
  const doc = makeDoc()
  const onChange = vi.fn()
  const onSelectView = vi.fn()
  render(
    <BasesToolbar
      doc={doc}
      rows={[]}
      activeIndex={over.index ?? 0}
      readOnly={over.readOnly ?? false}
      mode="view"
      onSelectView={onSelectView}
      onChange={onChange}
      searchQuery=""
      onSearchQueryChange={() => {}}
      {...(over.onCopyTable ? { onCopyTable: over.onCopyTable } : {})}
      {...(over.onExportCsv ? { onExportCsv: over.onExportCsv } : {})}
    />,
  )
  const lastDoc = (): BaseDocument =>
    (onChange.mock.calls[onChange.mock.calls.length - 1]![0] as (d: BaseDocument) => BaseDocument)(doc)
  return { onChange, onSelectView, lastDoc }
}

const open = (name: RegExp | string) => fireEvent.click(screen.getByRole('button', { name }))

describe('BasesToolbar — view order', () => {
  it('moves a view down and keeps the open view selected', () => {
    const { lastDoc, onSelectView } = setup()
    open(/Offen/)
    fireEvent.click(screen.getByRole('button', { name: 'Offen nach unten' }))
    expect(lastDoc().views.map((v) => v.name)).toEqual(['Liste', 'Offen', 'Archiv'])
    expect(onSelectView).toHaveBeenCalledWith(1)
  })

  it('moves another view above the open one', () => {
    const { lastDoc, onSelectView } = setup()
    open(/Offen/)
    fireEvent.click(screen.getByRole('button', { name: 'Liste nach oben' }))
    expect(lastDoc().views.map((v) => v.name)).toEqual(['Liste', 'Offen', 'Archiv'])
    expect(onSelectView).toHaveBeenCalledWith(1)
  })

  it('disables the move buttons at both ends', () => {
    setup()
    open(/Offen/)
    expect((screen.getByRole('button', { name: 'Offen nach oben' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Archiv nach unten' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('has no move buttons when read-only', () => {
    setup({ readOnly: true })
    open(/Offen/)
    expect(screen.queryByRole('button', { name: 'Offen nach unten' })).toBeNull()
  })
})

describe('BasesToolbar — results', () => {
  it('sets and clears the limit', () => {
    const { lastDoc } = setup()
    open(/Ergebnisse/)
    const input = screen.getByRole('textbox', { name: 'Ergebnisse begrenzen' })
    fireEvent.change(input, { target: { value: '25' } })
    fireEvent.blur(input)
    expect(lastDoc().views[0]!.limit).toBe(25)
  })

  it('treats text that is not a positive number as no limit', () => {
    const { lastDoc } = setup()
    open(/Ergebnisse/)
    const input = screen.getByRole('textbox', { name: 'Ergebnisse begrenzen' })
    fireEvent.change(input, { target: { value: 'viele' } })
    fireEvent.blur(input)
    expect('limit' in lastDoc().views[0]!).toBe(false)
  })

  it('offers copy and CSV for a table view only', () => {
    const onCopyTable = vi.fn()
    const onExportCsv = vi.fn()
    setup({ onCopyTable, onExportCsv })
    open(/Ergebnisse/)
    fireEvent.click(screen.getByRole('button', { name: 'In die Zwischenablage kopieren' }))
    fireEvent.click(screen.getByRole('button', { name: 'Als CSV exportieren' }))
    expect(onCopyTable).toHaveBeenCalledTimes(1)
    expect(onExportCsv).toHaveBeenCalledTimes(1)
  })

  it('hides copy and CSV for a list view', () => {
    setup({ index: 1, onCopyTable: () => {}, onExportCsv: () => {} })
    open(/Ergebnisse/)
    expect(screen.queryByRole('button', { name: 'Als CSV exportieren' })).toBeNull()
  })
})

describe('BasesToolbar — column options', () => {
  const openOptions = () => {
    open('Eigenschaften')
    const shown = screen.getByRole('list', { name: 'Angezeigte Eigenschaften' })
    fireEvent.click(within(shown).getByRole('button', { name: 'Optionen für price' }))
    return shown
  }

  it('sets a display name', () => {
    const { lastDoc } = setup()
    openOptions()
    const input = screen.getByRole('textbox', { name: 'Anzeigename für price' })
    fireEvent.change(input, { target: { value: 'Preis' } })
    fireEvent.blur(input)
    expect(lastDoc().properties).toEqual({ price: { displayName: 'Preis' } })
  })

  it('assigns a built-in and a custom summary, and removes it', () => {
    const { lastDoc } = setup()
    openOptions()
    const select = screen.getByRole('combobox', { name: 'Zusammenfassung für price' })
    fireEvent.change(select, { target: { value: 'Sum' } })
    expect(lastDoc().views[0]!.summaries).toEqual({ price: 'Sum' })
    fireEvent.change(select, { target: { value: 'Mittel' } })
    expect(lastDoc().views[0]!.summaries).toEqual({ price: 'Mittel' })
    fireEvent.change(select, { target: { value: '' } })
    expect('summaries' in lastDoc().views[0]!).toBe(false)
  })

  it('shows one options block at a time and closes it again', () => {
    setup()
    const shown = openOptions()
    expect(screen.getByRole('button', { name: 'Optionen für price' }).getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(within(shown).getByRole('button', { name: 'Optionen für Name' }))
    expect(screen.queryByRole('combobox', { name: 'Zusammenfassung für price' })).toBeNull()
    expect(screen.getByRole('combobox', { name: 'Zusammenfassung für Name' })).toBeTruthy()
  })
})
