import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EdgeContextMenu } from './EdgeContextMenu'
import type { CanvasEdge } from '../../canvas/types'

function makeEdge(overrides: Partial<CanvasEdge> = {}): CanvasEdge {
  return { id: 'e1', fromNode: 'n1', fromSide: 'right', toNode: 'n2', toSide: 'left', ...overrides }
}

function renderMenu(edgeOverrides: Partial<CanvasEdge> = {}) {
  const onClose = vi.fn()
  const onUpdateLabel = vi.fn()
  const onUpdateArrows = vi.fn()
  const onDelete = vi.fn()
  render(
    <EdgeContextMenu
      edge={makeEdge(edgeOverrides)}
      position={{ x: 10, y: 20 }}
      onClose={onClose}
      onUpdateLabel={onUpdateLabel}
      onUpdateArrows={onUpdateArrows}
      onDelete={onDelete}
    />
  )
  return { onClose, onUpdateLabel, onUpdateArrows, onDelete }
}

describe('EdgeContextMenu', () => {
  it('shows an "add label" prompt when the edge has no label', () => {
    renderMenu()
    expect(screen.getByRole('menuitem', { name: 'Beschriftung hinzufügen…' })).toBeInTheDocument()
  })

  it('shows the current label when the edge has one', () => {
    renderMenu({ label: 'depends on' })
    expect(screen.getByRole('menuitem', { name: 'Beschriftung: "depends on"' })).toBeInTheDocument()
  })

  it('enters label-edit mode and saves the new label on Enter', async () => {
    const { onUpdateLabel } = renderMenu({ label: 'old' })
    await userEvent.click(screen.getByRole('menuitem', { name: /Beschriftung/ }))

    const input = screen.getByLabelText('Kantenbeschriftung')
    await userEvent.clear(input)
    await userEvent.type(input, 'new label{Enter}')

    expect(onUpdateLabel).toHaveBeenCalledWith('e1', 'new label')
  })

  it('reverts the label edit on Escape without saving', async () => {
    const { onUpdateLabel } = renderMenu({ label: 'old' })
    await userEvent.click(screen.getByRole('menuitem', { name: /Beschriftung/ }))

    const input = screen.getByLabelText('Kantenbeschriftung')
    await userEvent.type(input, ' more{Escape}')

    expect(onUpdateLabel).not.toHaveBeenCalled()
    expect(screen.getByRole('menuitem', { name: 'Beschriftung: "old"' })).toBeInTheDocument()
  })

  it('shows the "from" arrow toggle as unchecked by default', () => {
    renderMenu()
    expect(screen.getByRole('menuitemcheckbox', { name: /Pfeil am Anfang/ })).toHaveAttribute('aria-checked', 'false')
  })

  it('toggles the "from" arrow on and off', async () => {
    const { onUpdateArrows } = renderMenu({ fromEnd: undefined, toEnd: 'arrow' })
    await userEvent.click(screen.getByRole('menuitemcheckbox', { name: /Pfeil am Anfang/ }))
    expect(onUpdateArrows).toHaveBeenCalledWith('e1', 'arrow', 'arrow')
  })

  it('toggles the "from" arrow off when it is already an arrow', async () => {
    const { onUpdateArrows } = renderMenu({ fromEnd: 'arrow' })
    await userEvent.click(screen.getByRole('menuitemcheckbox', { name: /Pfeil am Anfang/ }))
    expect(onUpdateArrows).toHaveBeenCalledWith('e1', 'none', undefined)
  })

  it('shows the "to" arrow toggle as checked by default (arrow is the default end)', () => {
    renderMenu()
    expect(screen.getByRole('menuitemcheckbox', { name: /Pfeil am Ende/ })).toHaveAttribute('aria-checked', 'true')
  })

  it('toggles the "to" arrow off', async () => {
    const { onUpdateArrows } = renderMenu({ toEnd: 'arrow' })
    await userEvent.click(screen.getByRole('menuitemcheckbox', { name: /Pfeil am Ende/ }))
    expect(onUpdateArrows).toHaveBeenCalledWith('e1', undefined, 'none')
  })

  it('deletes the edge and closes the menu', async () => {
    const { onDelete, onClose } = renderMenu()
    await userEvent.click(screen.getByRole('menuitem', { name: 'Kante löschen' }))
    expect(onDelete).toHaveBeenCalledWith('e1')
    expect(onClose).toHaveBeenCalled()
  })

  it('closes when clicking outside the menu', async () => {
    const { onClose } = renderMenu()
    await userEvent.click(document.body)
    expect(onClose).toHaveBeenCalled()
  })

  it('does not close when clicking inside the menu', async () => {
    const { onClose } = renderMenu()
    await userEvent.click(screen.getByRole('menu'))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('closes on Escape', async () => {
    const { onClose } = renderMenu()
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })

  it('closes when the window loses focus', () => {
    const { onClose } = renderMenu()
    window.dispatchEvent(new Event('blur'))
    expect(onClose).toHaveBeenCalled()
  })
})
