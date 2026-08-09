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
