import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PaneTreeView } from './PaneTreeView'
import {
  createInitialPaneTree,
  paneTreeReducer,
  type PaneNode,
  type PaneTree,
} from '../../state/paneTreeState'

/** Split p1 → [p1, p2] horizontally for a two-pane fixture. */
function twoPaneTree(): PaneTree {
  return paneTreeReducer(createInitialPaneTree('p1'), {
    type: 'SPLIT_PANE',
    payload: { paneId: 'p1', direction: 'horizontal', newPaneId: 'p2' },
  })
}

/** renderPane that just prints the pane id + active flag, and wires onFocus. */
function renderPane(pane: PaneNode, isActive: boolean, onFocus: () => void) {
  return (
    <button data-testid={`pane-${pane.id}`} data-active={isActive} onClick={onFocus}>
      {pane.id}
    </button>
  )
}

describe('PaneTreeView', () => {
  it('renders a single pane with no resize handle', () => {
    const tree = createInitialPaneTree('p1')
    const { container } = render(
      <PaneTreeView tree={tree} dispatch={vi.fn()} renderPane={renderPane} resizeLabel="Resize" />,
    )
    expect(screen.getByTestId('pane-p1')).toBeInTheDocument()
    expect(container.querySelector('.pane-split-handle')).toBeNull()
  })

  it('renders two panes in a split with one resize handle between them', () => {
    const { container } = render(
      <PaneTreeView tree={twoPaneTree()} dispatch={vi.fn()} renderPane={renderPane} resizeLabel="Resize" />,
    )
    expect(screen.getByTestId('pane-p1')).toBeInTheDocument()
    expect(screen.getByTestId('pane-p2')).toBeInTheDocument()
    expect(container.querySelectorAll('.pane-split-handle')).toHaveLength(1)
  })

  it('marks the active pane', () => {
    const { container } = render(
      <PaneTreeView tree={twoPaneTree()} dispatch={vi.fn()} renderPane={renderPane} resizeLabel="Resize" />,
    )
    // p2 is active (SPLIT focuses the new pane).
    const active = container.querySelector('.pane-leaf--active')
    expect(active).not.toBeNull()
    expect(active?.querySelector('[data-testid="pane-p2"]')).not.toBeNull()
  })

  it('dispatches FOCUS_PANE when a pane is clicked', () => {
    const dispatch = vi.fn()
    render(<PaneTreeView tree={twoPaneTree()} dispatch={dispatch} renderPane={renderPane} resizeLabel="Resize" />)
    fireEvent.mouseDown(screen.getByTestId('pane-p1'))
    expect(dispatch).toHaveBeenCalledWith({ type: 'FOCUS_PANE', payload: { paneId: 'p1' } })
  })

  it('dispatches RESIZE_SPLIT from the handle keyboard arrows', () => {
    const dispatch = vi.fn()
    const { container } = render(
      <PaneTreeView tree={twoPaneTree()} dispatch={dispatch} renderPane={renderPane} resizeLabel="Resize" />,
    )
    const handle = container.querySelector('.pane-split-handle') as HTMLElement
    expect(handle).not.toBeNull()
    fireEvent.keyDown(handle, { key: 'ArrowRight' })
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'RESIZE_SPLIT', payload: expect.objectContaining({ childIndex: 0 }) }),
    )
  })

  it('exposes the resize handle as an accessible separator', () => {
    render(<PaneTreeView tree={twoPaneTree()} dispatch={vi.fn()} renderPane={renderPane} resizeLabel="Resize pane" />)
    const sep = screen.getByRole('separator', { name: 'Resize pane' })
    expect(sep).toHaveAttribute('aria-orientation', 'vertical')
    expect(sep).toHaveAttribute('aria-valuenow')
    expect(sep).toHaveAttribute('tabindex', '0')
  })
})
