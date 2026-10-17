import { describe, it, expect, vi } from 'vitest'
import { createInitialPaneTree } from '../../state/paneTreeState'
import { splitActivePane, focusPaneInDirection } from './pane-commands'

describe('pane-commands', () => {
  it('does not split when the active pane has no active tab', () => {
    const dispatch = vi.fn()
    expect(splitActivePane(createInitialPaneTree('p1'), dispatch, 'horizontal')).toBe(false)
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('is a no-op when no pane lies in the requested direction', () => {
    const dispatch = vi.fn()
    focusPaneInDirection(createInitialPaneTree('p1'), dispatch, 'left')
    expect(dispatch).not.toHaveBeenCalled()
  })
})
