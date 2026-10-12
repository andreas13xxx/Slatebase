import { describe, it, expect } from 'vitest'
import { findPaneInDirection, type PaneRect } from './pane-focus-direction'

/** Two panes side by side: A (left) | B (right). */
const sideBySide: PaneRect[] = [
  { paneId: 'A', left: 0, right: 100, top: 0, bottom: 100 },
  { paneId: 'B', left: 100, right: 200, top: 0, bottom: 100 },
]

/** Two panes stacked: A (top) over B (bottom). */
const stacked: PaneRect[] = [
  { paneId: 'A', left: 0, right: 100, top: 0, bottom: 100 },
  { paneId: 'B', left: 0, right: 100, top: 100, bottom: 200 },
]

describe('findPaneInDirection', () => {
  it('finds the pane to the right', () => {
    expect(findPaneInDirection(sideBySide, 'A', 'right')).toBe('B')
  })

  it('finds the pane to the left', () => {
    expect(findPaneInDirection(sideBySide, 'B', 'left')).toBe('A')
  })

  it('finds the pane below', () => {
    expect(findPaneInDirection(stacked, 'A', 'down')).toBe('B')
  })

  it('finds the pane above', () => {
    expect(findPaneInDirection(stacked, 'B', 'up')).toBe('A')
  })

  it('returns null when there is no pane in that direction', () => {
    expect(findPaneInDirection(sideBySide, 'B', 'right')).toBeNull()
    expect(findPaneInDirection(sideBySide, 'A', 'left')).toBeNull()
    expect(findPaneInDirection(sideBySide, 'A', 'up')).toBeNull()
    expect(findPaneInDirection(sideBySide, 'A', 'down')).toBeNull()
  })

  it('returns null when the active pane id does not resolve', () => {
    expect(findPaneInDirection(sideBySide, 'missing', 'right')).toBeNull()
  })

  it('returns null for a single pane', () => {
    expect(findPaneInDirection([sideBySide[0]!], 'A', 'right')).toBeNull()
  })

  it('prefers a cross-axis-aligned neighbour over a diagonal one', () => {
    // Active A on the left; B is directly to its right (aligned), C is to the
    // right but vertically offset (not aligned). "right" must pick B.
    const rects: PaneRect[] = [
      { paneId: 'A', left: 0, right: 100, top: 0, bottom: 100 },
      { paneId: 'B', left: 100, right: 200, top: 0, bottom: 100 },
      { paneId: 'C', left: 100, right: 200, top: 100, bottom: 200 },
    ]
    expect(findPaneInDirection(rects, 'A', 'right')).toBe('B')
  })

  it('picks the nearest among several aligned candidates', () => {
    // A | B | C in a row; "right" from A lands on the adjacent B, not C.
    const rects: PaneRect[] = [
      { paneId: 'A', left: 0, right: 100, top: 0, bottom: 100 },
      { paneId: 'B', left: 100, right: 200, top: 0, bottom: 100 },
      { paneId: 'C', left: 200, right: 300, top: 0, bottom: 100 },
    ]
    expect(findPaneInDirection(rects, 'A', 'right')).toBe('B')
  })

  it('finds a non-aligned pane when no aligned one exists', () => {
    // A top-left, B bottom-right. "right" from A still finds B (offset but the
    // only candidate on that side) rather than giving up.
    const rects: PaneRect[] = [
      { paneId: 'A', left: 0, right: 100, top: 0, bottom: 100 },
      { paneId: 'B', left: 100, right: 200, top: 150, bottom: 250 },
    ]
    expect(findPaneInDirection(rects, 'A', 'right')).toBe('B')
  })
})
