import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { GlobalTooltip } from './GlobalTooltip'

describe('GlobalTooltip', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows the aria-label as a tooltip after hovering, and hides it on mouseout', () => {
    render(
      <div>
        <button aria-label="Reset to current month">•</button>
        <GlobalTooltip />
      </div>,
    )

    const button = screen.getByRole('button')
    expect(screen.queryByRole('tooltip')).toBeNull()

    fireEvent.mouseOver(button)
    // Not shown immediately — only after the hover delay.
    expect(screen.queryByRole('tooltip')).toBeNull()

    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(screen.getByRole('tooltip')).toHaveTextContent('Reset to current month')

    fireEvent.mouseOut(button, { relatedTarget: document.body })
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('shows a title as our own tooltip and hides the native one while it shows', () => {
    render(
      <div>
        <button title="Native text">•</button>
        <GlobalTooltip />
      </div>,
    )
    const button = screen.getByRole('button')
    fireEvent.mouseOver(button)
    // Taken off at once, before the browser's own delay runs out.
    expect(button).not.toHaveAttribute('title')
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(screen.getByRole('tooltip')).toHaveTextContent('Native text')

    fireEvent.mouseOut(button, { relatedTarget: document.body })
    expect(button).toHaveAttribute('title', 'Native text')
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('stays on the target when the pointer moves to a child of a title-only element', () => {
    render(
      <div>
        <button title="Native text"><span data-testid="icon">•</span></button>
        <GlobalTooltip />
      </div>,
    )
    const button = screen.getByRole('button')
    fireEvent.mouseOver(button)
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(screen.getByRole('tooltip')).toBeInTheDocument()

    // The title is off the button now; the move onto the icon must not dismiss the tooltip.
    fireEvent.mouseOver(screen.getByTestId('icon'))
    expect(screen.getByRole('tooltip')).toHaveTextContent('Native text')
  })

  it('prefers aria-label over title when an element has both', () => {
    render(
      <div>
        <button aria-label="Label" title="Title">•</button>
        <GlobalTooltip />
      </div>,
    )
    const button = screen.getByRole('button')
    fireEvent.mouseOver(button)
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(screen.getByRole('tooltip')).toHaveTextContent('Label')
  })

  it('leaves an iframe title alone', () => {
    render(
      <div>
        <iframe title="Frame name" />
        <GlobalTooltip />
      </div>,
    )
    const frame = document.querySelector('iframe')!
    fireEvent.mouseOver(frame)
    expect(frame).toHaveAttribute('title', 'Frame name')
  })

  it('survives a plugin removing every .tooltip element from the document', () => {
    render(
      <div>
        <button aria-label="Hint">•</button>
        <GlobalTooltip />
      </div>,
    )
    const button = screen.getByRole('button')
    fireEvent.mouseOver(button)
    act(() => {
      vi.advanceTimersByTime(300)
    })
    // What TaskNotes does when a view closes or a drag starts.
    document.querySelectorAll('.tooltip').forEach((el) => el.remove())

    expect(() => {
      fireEvent.mouseOut(button, { relatedTarget: document.body })
    }).not.toThrow()
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('does not show a tooltip for elements without aria-label', () => {
    render(
      <div>
        <button>No label</button>
        <GlobalTooltip />
      </div>,
    )

    fireEvent.mouseOver(screen.getByRole('button'))
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('shows a tooltip on keyboard focus, not just mouse hover', () => {
    render(
      <div>
        <button aria-label="Next Month">→</button>
        <GlobalTooltip />
      </div>,
    )

    fireEvent.focusIn(screen.getByRole('button'))
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(screen.getByRole('tooltip')).toHaveTextContent('Next Month')
  })
})
