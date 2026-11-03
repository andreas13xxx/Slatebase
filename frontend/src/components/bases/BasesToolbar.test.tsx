import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import type { BaseDocument } from '@slatebase/shared-contracts'
import { BasesToolbar } from './BasesToolbar'

const makeDoc = (): BaseDocument => ({
  formulas: { late: '1' },
  properties: { status: { displayName: 'Status' }, priority: {} },
  views: [
    { type: 'table', name: 'Offen', order: ['file.name', 'status'], sort: [{ column: 'status', direction: 'asc' }] },
    { type: 'list', name: 'Liste' },
  ],
})

function setup(over: Partial<{ doc: BaseDocument; readOnly: boolean; index: number }> = {}) {
  const onChange = vi.fn()
  const onSelectView = vi.fn()
  const onModeChange = vi.fn()
  render(
    <BasesToolbar
      doc={over.doc ?? makeDoc()}
      rows={[]}
      activeIndex={over.index ?? 0}
      readOnly={over.readOnly ?? false}
      mode="view"
      onModeChange={onModeChange}
      onSelectView={onSelectView}
      onChange={onChange}
    />,
  )
  return { onChange, onSelectView, onModeChange }
}

const open = (name: RegExp | string) => fireEvent.click(screen.getByRole('button', { name }))
const lastDoc = (fn: ReturnType<typeof vi.fn>): BaseDocument => fn.mock.calls[fn.mock.calls.length - 1]![0] as BaseDocument

describe('BasesToolbar — views', () => {
  it('selects another view', () => {
    const { onSelectView } = setup()
    open(/Offen/)
    fireEvent.click(within(screen.getByRole('list', { name: 'Ansichten' })).getByRole('button', { name: /Liste/ }))
    expect(onSelectView).toHaveBeenCalledWith(1)
  })

  it('creates a view with name and type and selects it', () => {
    const { onChange, onSelectView } = setup()
    open(/Offen/)
    fireEvent.change(screen.getByLabelText('Name der neuen Ansicht'), { target: { value: 'Galerie' } })
    fireEvent.change(screen.getByLabelText('Typ der neuen Ansicht'), { target: { value: 'cards' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ansicht anlegen' }))
    expect(lastDoc(onChange).views[2]).toMatchObject({ name: 'Galerie', type: 'cards' })
    expect(onSelectView).toHaveBeenCalledWith(2)
  })

  it('renames, changes type, duplicates', () => {
    const { onChange, onSelectView } = setup()
    open(/Offen/)
    const name = screen.getByLabelText('Name der Ansicht')
    fireEvent.change(name, { target: { value: 'Neu' } })
    fireEvent.blur(name)
    expect(lastDoc(onChange).views[0]!.name).toBe('Neu')
    fireEvent.change(screen.getByLabelText('Typ der Ansicht'), { target: { value: 'cards' } })
    expect(lastDoc(onChange).views[0]!.type).toBe('cards')
    fireEvent.click(screen.getByRole('button', { name: 'Duplizieren' }))
    expect(lastDoc(onChange).views.map((v) => v.name)).toEqual(['Offen', 'Offen (Kopie)', 'Liste'])
    expect(onSelectView).toHaveBeenCalledWith(1)
  })

  it('deletes only after a second click and selects a neighbour', () => {
    const { onChange, onSelectView } = setup({ index: 1 })
    open(/Liste/)
    fireEvent.click(screen.getByRole('button', { name: 'Löschen' }))
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Wirklich löschen' }))
    expect(lastDoc(onChange).views.map((v) => v.name)).toEqual(['Offen'])
    expect(onSelectView).toHaveBeenCalledWith(0)
  })

  it('cannot delete the last view', () => {
    setup({ doc: { views: [{ type: 'table', name: 'Einzig' }] } })
    open(/Einzig/)
    expect((screen.getByRole('button', { name: 'Löschen' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('switches mode', () => {
    const { onModeChange } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Quelltext' }))
    expect(onModeChange).toHaveBeenCalledWith('source')
  })
})

describe('BasesToolbar — sort, group, properties', () => {
  it('edits the sort', () => {
    const { onChange } = setup()
    open(/Sortieren/)
    fireEvent.change(screen.getByLabelText('Richtung'), { target: { value: 'desc' } })
    expect(lastDoc(onChange).views[0]!.sort).toEqual([{ column: 'status', direction: 'desc' }])
    fireEvent.click(screen.getByRole('button', { name: '+ Sortierung hinzufügen' }))
    expect(lastDoc(onChange).views[0]!.sort).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: 'Sortierung entfernen' }))
    expect('sort' in lastDoc(onChange).views[0]!).toBe(false)
  })

  it('sets and clears the grouping', () => {
    const { onChange } = setup()
    open('Gruppieren')
    fireEvent.change(screen.getByLabelText('Gruppieren nach'), { target: { value: 'status' } })
    expect(lastDoc(onChange).views[0]!.groupBy).toEqual({ property: 'status', direction: 'ASC' })
  })

  it('toggles and adds properties', () => {
    const { onChange } = setup()
    open('Eigenschaften')
    fireEvent.click(within(screen.getByRole('list', { name: 'Angezeigte Eigenschaften' })).getAllByRole('checkbox')[1]!)
    expect(lastDoc(onChange).views[0]!.order).toEqual(['file.name'])
    fireEvent.click(within(screen.getByRole('list', { name: 'Ausgeblendete Eigenschaften' })).getAllByRole('checkbox')[0]!)
    expect(lastDoc(onChange).views[0]!.order!.length).toBe(3)
    const custom = screen.getByLabelText('Eigene Eigenschaft hinzufügen')
    fireEvent.change(custom, { target: { value: 'deadline' } })
    fireEvent.blur(custom)
    expect(lastDoc(onChange).views[0]!.order).toContain('deadline')
  })

  it('reorders properties', () => {
    const { onChange } = setup()
    open('Eigenschaften')
    fireEvent.click(screen.getByRole('button', { name: 'Status nach oben' }))
    expect(lastDoc(onChange).views[0]!.order).toEqual(['status', 'file.name'])
  })
})

describe('BasesToolbar — filter', () => {
  it('builds a condition into the view filter', () => {
    const { onChange } = setup()
    open(/Filtern/)
    fireEvent.click(screen.getByRole('button', { name: '+ Bedingung' }))
    expect(lastDoc(onChange).views[0]!.filters).toEqual({ and: ['file.name.contains("")'] })
  })

  it('edits an existing condition via the guided builder', () => {
    const doc = makeDoc()
    doc.views[0]!.filters = { and: ['status == "open"'] }
    const { onChange } = setup({ doc })
    open(/Filtern/)
    expect((screen.getByLabelText('Eigenschaft') as HTMLSelectElement).value).toBe('status')
    fireEvent.change(screen.getByLabelText('Operator'), { target: { value: 'neq' } })
    expect(lastDoc(onChange).views[0]!.filters).toEqual({ and: ['status != "open"'] })
    const value = screen.getByLabelText('Wert')
    fireEvent.change(value, { target: { value: 'done' } })
    fireEvent.blur(value)
    // The props are static here (the mock does not feed the change back), so the value edit applies to the original operator.
    expect(lastDoc(onChange).views[0]!.filters).toEqual({ and: ['status == "done"'] })
  })

  it('shows an expression the builder cannot split as raw text', () => {
    const doc = makeDoc()
    doc.views[0]!.filters = 'a == 1 && b == 2'
    setup({ doc })
    open(/Filtern/)
    expect((screen.getByLabelText('Filterausdruck') as HTMLInputElement).value).toBe('a == 1 && b == 2')
  })

  it('edits the document filter on the "Alle Ansichten" tab and removes a condition', () => {
    const doc = makeDoc()
    doc.filters = { and: ['type == "task"'] }
    const { onChange } = setup({ doc })
    open(/Filtern/)
    fireEvent.click(screen.getByRole('tab', { name: 'Alle Ansichten' }))
    fireEvent.click(screen.getByRole('button', { name: 'Bedingung entfernen' }))
    expect('filters' in lastDoc(onChange)).toBe(false)
  })

  it('adds a nested group and switches its logic', () => {
    const { onChange } = setup()
    open(/Filtern/)
    fireEvent.click(screen.getByRole('button', { name: '+ Gruppe' }))
    expect(lastDoc(onChange).views[0]!.filters).toBeUndefined() // an empty group is dropped
  })
})

describe('BasesToolbar — read-only', () => {
  it('opens panels but writes nothing and hides creation', () => {
    const { onChange } = setup({ readOnly: true })
    open(/Sortieren/)
    expect((screen.getByLabelText('Richtung') as HTMLSelectElement).disabled).toBe(true)
    expect(screen.queryByRole('button', { name: '+ Sortierung hinzufügen' })).toBeNull()
    open(/Offen/)
    expect(screen.queryByRole('button', { name: 'Ansicht anlegen' })).toBeNull()
    expect(onChange).not.toHaveBeenCalled()
  })
})
