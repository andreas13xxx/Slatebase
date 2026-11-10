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

  it('reorders by dragging the handle onto another row', () => {
    const { container, apply } = setup(root())
    const grips = container.querySelectorAll('.bases-tb__grip')
    const wraps = container.querySelectorAll('.bases-tb__row-wrap')
    const dataTransfer = { setData: vi.fn(), effectAllowed: '', dropEffect: '' }
    fireEvent.dragStart(grips[0]!, { dataTransfer })
    fireEvent.dragOver(wraps[2]!, { dataTransfer })
    expect(wraps[2]!.className).toContain('bases-tb__row--drop-after')
    fireEvent.drop(wraps[2]!, { dataTransfer })
    expect(apply(root())).toEqual({ and: ['status == "b"', 'status == "c"', 'status == "a"'] })
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
})
