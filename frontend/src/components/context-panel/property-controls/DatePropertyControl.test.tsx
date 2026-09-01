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

  it('does not commit while the value is still being edited', () => {
    const onChange = vi.fn()
    const { container } = render(<DatePropertyControl value="2026-01-15T10:00" onChange={onChange} includeTime />)
    const input = container.querySelector('input')!

    // A native date input fires one change per segment; none of them may reach
    // the document, or the rewrite would unmount the field mid-edit.
    fireEvent.change(input, { target: { value: '2026-02-15T10:00' } })
    fireEvent.change(input, { target: { value: '2026-02-20T10:00' } })
    fireEvent.change(input, { target: { value: '2026-02-20T18:45' } })

    expect(onChange).not.toHaveBeenCalled()
    expect(input.value).toBe('2026-02-20T18:45')
  })

  it('commits the finished value on blur', () => {
    const onChange = vi.fn()
    const { container } = render(<DatePropertyControl value="2026-01-15" onChange={onChange} />)
    const input = container.querySelector('input')!

    fireEvent.change(input, { target: { value: '2026-02-20' } })
    fireEvent.blur(input)

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith('2026-02-20')
  })

  it('commits on Enter', () => {
    const onChange = vi.fn()
    const { container } = render(<DatePropertyControl value="2026-01-15" onChange={onChange} />)
    const input = container.querySelector('input')!

    fireEvent.change(input, { target: { value: '2026-02-20' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onChange).toHaveBeenCalledWith('2026-02-20')
  })

  it('reverts the draft on Escape without committing', () => {
    const onChange = vi.fn()
    const { container } = render(<DatePropertyControl value="2026-01-15" onChange={onChange} />)
    const input = container.querySelector('input')!

    fireEvent.change(input, { target: { value: '2026-02-20' } })
    fireEvent.keyDown(input, { key: 'Escape' })

    expect(input.value).toBe('2026-01-15')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('commits null when cleared, so the property stays but goes blank', () => {
    const onChange = vi.fn()
    const { container } = render(<DatePropertyControl value="2026-01-15" onChange={onChange} />)
    const input = container.querySelector('input')!

    fireEvent.change(input, { target: { value: '' } })
    fireEvent.blur(input)

    expect(onChange).toHaveBeenCalledWith(null)
  })

  it('does not commit when the value was not changed', () => {
    const onChange = vi.fn()
    const { container } = render(<DatePropertyControl value="2026-01-15" onChange={onChange} />)
    fireEvent.blur(container.querySelector('input')!)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('renders an empty string when value is falsy', () => {
    const { container } = render(<DatePropertyControl value="" onChange={vi.fn()} />)
    const input = container.querySelector('input')!
    expect(input.value).toBe('')
  })

  it('follows the value when it changes underneath the control', () => {
    const { container, rerender } = render(<DatePropertyControl value="2026-01-15" onChange={vi.fn()} />)
    rerender(<DatePropertyControl value="2026-03-01" onChange={vi.fn()} />)
    expect(container.querySelector('input')!.value).toBe('2026-03-01')
  })
})
