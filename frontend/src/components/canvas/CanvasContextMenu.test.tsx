import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CanvasContextMenu } from './CanvasContextMenu'
import type { CanvasContextMenuProps } from './CanvasContextMenu'

function renderMenu(overrides: Partial<CanvasContextMenuProps> = {}) {
  const onAction = vi.fn()
  const onClose = vi.fn()
  render(
    <CanvasContextMenu
      x={10}
      y={10}
      targetNodeId={null}
      readOnly={false}
      canUndo={false}
      canRedo={false}
      canPaste={false}
      hasSelection={false}
      onClose={onClose}
      onAction={onAction}
      {...overrides}
    />
  )
  return { onAction, onClose }
}

async function click(name: string) {
  const item = screen.getByRole('menuitem', { name: new RegExp(name) })
  await userEvent.click(item.querySelector('button')!)
}

describe('CanvasContextMenu — background menu', () => {
  it('offers add/paste/undo/redo actions when not read-only', () => {
    renderMenu({ readOnly: false })
    expect(screen.getByRole('menuitem', { name: /Textknoten hinzufügen/ })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /Einfügen/ })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /Rückgängig/ })).toBeInTheDocument()
  })

  it('hides add/edit actions when read-only, keeps select-all and fit-view', () => {
    renderMenu({ readOnly: true })
    expect(screen.queryByRole('menuitem', { name: /Textknoten hinzufügen/ })).not.toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /Alles auswählen/ })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /Alles einpassen/ })).toBeInTheDocument()
  })

  it('disables paste when canPaste is false', () => {
    renderMenu({ canPaste: false })
    expect(screen.getByRole('menuitem', { name: /Einfügen/ })).toHaveAttribute('aria-disabled', 'true')
  })

  it('enables paste when canPaste is true', () => {
    renderMenu({ canPaste: true })
    expect(screen.getByRole('menuitem', { name: /Einfügen/ })).not.toHaveAttribute('aria-disabled', 'true')
  })

  it('shows a delete action only when there is a selection and not read-only', () => {
    renderMenu({ hasSelection: true, readOnly: false })
    expect(screen.getByRole('menuitem', { name: /Auswahl löschen/ })).toBeInTheDocument()
  })

  it('hides delete when there is no selection', () => {
    renderMenu({ hasSelection: false })
    expect(screen.queryByRole('menuitem', { name: /löschen/ })).not.toBeInTheDocument()
  })

  it('calls onAction with the action id when an item is clicked', async () => {
    const { onAction } = renderMenu()
    await click('Alles einpassen')
    expect(onAction).toHaveBeenCalledWith('fit-view')
  })
})

describe('CanvasContextMenu — node menu', () => {
  it('offers edit/copy/duplicate/color/delete actions for a selected node', () => {
    renderMenu({ targetNodeId: 'n1' })
    expect(screen.getByRole('menuitem', { name: /Bearbeiten/ })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /Duplizieren/ })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /Löschen/ })).toBeInTheDocument()
  })

  it('offers a path-edit action only for markdown file nodes', () => {
    renderMenu({ targetNodeId: 'n1', targetIsMarkdownFile: true })
    expect(screen.getByRole('menuitem', { name: /Dateipfad ändern/ })).toBeInTheDocument()
  })

  it('does not offer path-edit for non-markdown nodes', () => {
    renderMenu({ targetNodeId: 'n1', targetIsMarkdownFile: false })
    expect(screen.queryByRole('menuitem', { name: /Dateipfad ändern/ })).not.toBeInTheDocument()
  })

  it('only offers copy when read-only, even for a targeted node', () => {
    renderMenu({ targetNodeId: 'n1', readOnly: true })
    expect(screen.getByRole('menuitem', { name: /Kopieren/ })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: /Löschen/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: /Bearbeiten/ })).not.toBeInTheDocument()
  })

  it('calls onAction with a color id when a color item is clicked', async () => {
    const { onAction } = renderMenu({ targetNodeId: 'n1' })
    await click('Rot')
    expect(onAction).toHaveBeenCalledWith('color-1')
  })
})
