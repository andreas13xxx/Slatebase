import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DatePropertyControl } from './DatePropertyControl'

describe('DatePropertyControl', () => {
  it('renders a date input with the given value', () => {
    render(<DatePropertyControl value="2026-01-15" onChange={vi.fn()} />)
    expect(screen.getByDisplayValue('2026-01-15')).toBeInTheDocument()
  })

  it('renders a datetime-local input when includeTime is set', () => {
    const { container } = render(<DatePropertyControl value="2026-01-15T10:00" onChange={vi.fn()} includeTime />)
    const input = container.querySelector('input')
    expect(input?.type).toBe('datetime-local')
  })

  it('uses type="date" when includeTime is not set', () => {
    const { container } = render(<DatePropertyControl value="2026-01-15" onChange={vi.fn()} />)
    const input = container.querySelector('input')
    expect(input?.type).toBe('date')
  })

  it('calls onChange with the new value when changed', () => {
    const onChange = vi.fn()
    const { container } = render(<DatePropertyControl value="2026-01-15" onChange={onChange} />)
    const input = container.querySelector('input')!

    fireEvent.change(input, { target: { value: '2026-02-20' } })

    expect(onChange).toHaveBeenCalledWith('2026-02-20')
  })

  it('does not call onChange when cleared to an empty value', () => {
    const onChange = vi.fn()
    const { container } = render(<DatePropertyControl value="2026-01-15" onChange={onChange} />)
    const input = container.querySelector('input')!

    fireEvent.change(input, { target: { value: '' } })

    expect(onChange).not.toHaveBeenCalled()
  })

  it('renders an empty string when value is falsy', () => {
    const { container } = render(<DatePropertyControl value="" onChange={vi.fn()} />)
    const input = container.querySelector('input')!
    expect(input.value).toBe('')
  })
})
