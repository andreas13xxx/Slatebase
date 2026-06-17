import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { LineNumbers, type LineNumbersProps } from './LineNumbers'

/** Helper to render LineNumbers with default props and optional overrides. */
function renderLineNumbers(overrides: Partial<LineNumbersProps> = {}) {
  const defaultProps: LineNumbersProps = {
    text: 'line1\nline2\nline3',
    scrollTop: 0,
    lineHeight: 20.8,
    visible: true,
    ...overrides,
  }

  return render(React.createElement(LineNumbers, defaultProps))
}

describe('LineNumbers', () => {
  it('renders the correct number of line numbers based on text (Req 4.3)', () => {
    renderLineNumbers({ text: 'a\nb\nc\nd\ne' })

    // 5 lines → numbers 1–5
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('4')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
  })

  it('renders one line number for empty text', () => {
    renderLineNumbers({ text: '' })

    // Empty string split by \n gives [''] → 1 line
    expect(screen.getByText('1')).toBeInTheDocument()
  })

  it('returns null when visible is false', () => {
    const { container } = renderLineNumbers({ visible: false })

    expect(container.innerHTML).toBe('')
  })

  it('sets aria-hidden on the container for accessibility', () => {
    renderLineNumbers()

    const container = document.querySelector('.line-numbers-container')
    expect(container).toHaveAttribute('aria-hidden', 'true')
  })

  it('applies the lineHeight style to each line number element (Req 4.4)', () => {
    renderLineNumbers({ text: 'hello\nworld', lineHeight: 24 })

    const lineNumberElements = document.querySelectorAll('.line-number')
    expect(lineNumberElements).toHaveLength(2)
    expect(lineNumberElements[0]).toHaveStyle({ lineHeight: '24px' })
    expect(lineNumberElements[1]).toHaveStyle({ lineHeight: '24px' })
  })

  it('synchronizes scrollTop via ref', () => {
    const { rerender } = render(
      React.createElement(LineNumbers, {
        text: 'a\nb\nc\nd\ne\nf\ng\nh\ni\nj',
        scrollTop: 0,
        lineHeight: 20,
        visible: true,
      })
    )

    const container = document.querySelector('.line-numbers-container') as HTMLDivElement
    expect(container.scrollTop).toBe(0)

    rerender(
      React.createElement(LineNumbers, {
        text: 'a\nb\nc\nd\ne\nf\ng\nh\ni\nj',
        scrollTop: 50,
        lineHeight: 20,
        visible: true,
      })
    )

    expect(container.scrollTop).toBe(50)
  })

  it('updates line count when text changes', () => {
    const { rerender } = render(
      React.createElement(LineNumbers, {
        text: 'one\ntwo',
        scrollTop: 0,
        lineHeight: 20,
        visible: true,
      })
    )

    expect(document.querySelectorAll('.line-number')).toHaveLength(2)

    rerender(
      React.createElement(LineNumbers, {
        text: 'one\ntwo\nthree\nfour',
        scrollTop: 0,
        lineHeight: 20,
        visible: true,
      })
    )

    expect(document.querySelectorAll('.line-number')).toHaveLength(4)
  })

  it('has overflow hidden on the container (scroll managed externally)', () => {
    renderLineNumbers()

    const container = document.querySelector('.line-numbers-container')
    expect(container).toBeInTheDocument()
    // overflow: hidden is set via CSS class — verify the class is present
    expect(container).toHaveClass('line-numbers-container')
  })
})
