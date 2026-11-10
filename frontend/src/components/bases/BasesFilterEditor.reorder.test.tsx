import { useState } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { BaseFilterNode } from '@slatebase/shared-contracts'
import { BasesFilterEditor, type RootUpdate } from './BasesFilterEditor'

const columns = [{ id: 'status', label: 'Status' }, { id: 'file.name', label: 'Name' }] as never

function setup(root: BaseFilterNode, extra: { disabled?: boolean; scopeMove?: { label: string; onMove: (p: number[]) => void } } = {}) {
  const updates: RootUpdate[] = []
  const onChange = vi.fn((u: RootUpdate) => { updates.push(u) })
  const view = render(
    <BasesFilterEditor root={root} doc={{ views: [] }} rows={[]} columns={columns} disabled={extra.disabled ?? false} onChange={onChange} scopeMove={extra.scopeMove} />,
  )
  const apply = (from: BaseFilterNode) => updates.reduce<BaseFilterNode>((acc, u) => u(acc), from)
  return { ...view, onChange, apply }
}

const root = (): BaseFilterNode => ({ and: ['status == "a"', 'status == "b"', 'status == "c"'] })

describe('BasesFilterEditor — reorder (Obsidian 1.14/1.15)', () => {
  it('moves a condition down with the ↓ button', () => {
    const { apply } = setup(root())
    fireEvent.click(screen.getAllByRole('button', { name: 'Bedingung nach unten' })[0]!)
    expect(apply(root())).toEqual({ and: ['status == "b"', 'status == "a"', 'status == "c"'] })
  })

  it('moves a condition up with the ↑ button', () => {
    const { apply } = setup(root())
    fireEvent.click(screen.getAllByRole('button', { name: 'Bedingung nach oben' })[2]!)
    expect(apply(root())).toEqual({ and: ['status == "a"', 'status == "c"', 'status == "b"'] })
  })

  it('disables ↑ on the first and ↓ on the last row', () => {
    setup(root())
    const ups = screen.getAllByRole('button', { name: 'Bedingung nach oben' }) as HTMLButtonElement[]
    const downs = screen.getAllByRole('button', { name: 'Bedingung nach unten' }) as HTMLButtonElement[]
    expect(ups[0]!.disabled).toBe(true)
    expect(downs[downs.length - 1]!.disabled).toBe(true)
  })

  /** jsdom has no layout: give the row wrappers stacked 20px-high boxes. */
  function stackRows(container: HTMLElement): HTMLElement[] {
    const wraps = Array.from(container.querySelectorAll<HTMLElement>('.bases-tb__row-wrap'))
    wraps.forEach((el, k) => {
      el.getBoundingClientRect = () => ({ top: k * 20, bottom: k * 20 + 20, left: 0, right: 100, width: 100, height: 20, x: 0, y: k * 20, toJSON: () => ({}) })
    })
    return wraps
  }

  it('reorders by dragging the handle with the pointer (mouse, pen and touch alike)', () => {
    const { container, apply } = setup(root())
    const grips = container.querySelectorAll('.bases-tb__grip')
    const wraps = stackRows(container)
    fireEvent.pointerDown(grips[0]!, { pointerId: 1, pointerType: 'touch', button: 0, clientY: 5 })
    fireEvent.pointerMove(grips[0]!, { pointerId: 1, pointerType: 'touch', clientY: 50 })
    expect(wraps[2]!.className).toContain('bases-tb__row--drop-after')
    fireEvent.pointerUp(grips[0]!, { pointerId: 1, pointerType: 'touch', clientY: 50 })
    expect(apply(root())).toEqual({ and: ['status == "b"', 'status == "c"', 'status == "a"'] })
  })

  it('moves a row up when dropped above it, and ignores a drop on its own row', () => {
    const { container, apply, onChange } = setup(root())
    const grips = container.querySelectorAll('.bases-tb__grip')
    stackRows(container)
    fireEvent.pointerDown(grips[2]!, { pointerId: 1, pointerType: 'mouse', button: 0, clientY: 50 })
    fireEvent.pointerUp(grips[2]!, { pointerId: 1, pointerType: 'mouse', clientY: 5 })
    expect(apply(root())).toEqual({ and: ['status == "c"', 'status == "a"', 'status == "b"'] })
    onChange.mockClear()
    fireEvent.pointerDown(grips[1]!, { pointerId: 2, pointerType: 'mouse', button: 0, clientY: 30 })
    fireEvent.pointerUp(grips[1]!, { pointerId: 2, pointerType: 'mouse', clientY: 30 })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('clears the dragging state when pointer capture is lost without a pointerup', () => {
    const { container, onChange } = setup(root())
    const grips = container.querySelectorAll('.bases-tb__grip')
    stackRows(container)
    fireEvent.pointerDown(grips[0]!, { pointerId: 1, pointerType: 'mouse', button: 0, clientY: 5 })
    expect(container.querySelector('.bases-tb__row-wrap--dragging')).not.toBeNull()
    fireEvent.lostPointerCapture(grips[0]!, { pointerId: 1 })
    expect(container.querySelector('.bases-tb__row-wrap--dragging')).toBeNull()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('cancels a drag on pointercancel without changing anything', () => {
    const { container, onChange } = setup(root())
    const grips = container.querySelectorAll('.bases-tb__grip')
    stackRows(container)
    fireEvent.pointerDown(grips[0]!, { pointerId: 1, pointerType: 'touch', button: 0, clientY: 5 })
    fireEvent.pointerMove(grips[0]!, { pointerId: 1, pointerType: 'touch', clientY: 50 })
    fireEvent.pointerCancel(grips[0]!, { pointerId: 1 })
    expect(container.querySelector('.bases-tb__row-wrap--dragging')).toBeNull()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('shows no reorder controls with a single condition, but keeps the scope move', () => {
    const onMove = vi.fn()
    setup({ and: ['status == "a"'] }, { scopeMove: { label: 'Zu allen Ansichten verschieben', onMove } })
    expect(screen.queryByRole('button', { name: 'Bedingung nach oben' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Zu allen Ansichten verschieben' }))
    expect(onMove).toHaveBeenCalledWith([0])
  })

  it('passes the full path of a nested row to the scope move', () => {
    const onMove = vi.fn()
    setup({ and: ['status == "a"', { or: ['status == "b"', 'status == "c"'] }] }, { scopeMove: { label: 'Verschieben', onMove } })
    const buttons = screen.getAllByRole('button', { name: 'Verschieben' })
    fireEvent.click(buttons[buttons.length - 1]!)
    expect(onMove).toHaveBeenCalledWith([1, 1])
  })

  it('offers no reordering or moving while read-only', () => {
    const { container } = setup(root(), { disabled: true, scopeMove: { label: 'Verschieben', onMove: vi.fn() } })
    expect(container.querySelector('.bases-tb__grip')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Bedingung nach unten' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Verschieben' })).toBeNull()
  })

  it('keeps the raw-expression mode with its row when the row is moved', () => {
    const Harness = () => {
      const [tree, setTree] = useState<BaseFilterNode>(root())
      return (
        <BasesFilterEditor
          root={tree}
          doc={{ views: [] }}
          rows={[]}
          columns={columns}
          disabled={false}
          onChange={(u) => setTree((t) => u(t))}
        />
      )
    }
    render(<Harness />)
    // Switch the FIRST row to the raw editor, then move it down one place.
    fireEvent.click(screen.getAllByRole('button', { name: 'Als Ausdruck bearbeiten' })[0]!)
    const rawFirst = screen.getAllByLabelText('Filterausdruck')
    expect(rawFirst).toHaveLength(1)
    expect((rawFirst[0] as HTMLInputElement).value).toBe('status == "a"')
    fireEvent.click(screen.getAllByRole('button', { name: 'Bedingung nach unten' })[0]!)
    const rawAfter = screen.getAllByLabelText('Filterausdruck')
    expect(rawAfter).toHaveLength(1)
    expect((rawAfter[0] as HTMLInputElement).value).toBe('status == "a"')
    // It is now the second row: the first row is the guided builder again.
    const rowsEls = document.querySelectorAll('.bases-tb__row-wrap')
    expect(rowsEls[0]!.querySelector('[aria-label="Filterausdruck"]')).toBeNull()
    expect(rowsEls[1]!.querySelector('[aria-label="Filterausdruck"]')).not.toBeNull()
  })
})
