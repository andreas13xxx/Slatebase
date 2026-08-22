import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NumberPropertyControl } from './NumberPropertyControl'

describe('NumberPropertyControl', () => {
  it('displays the numeric value as a button when not editing', () => {
    render(<NumberPropertyControl value={42} onChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: '42' })).toBeInTheDocument()
  })

  it('parses a string value into a number for display', () => {
    render(<NumberPropertyControl value="3.5" onChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: '3.5' })).toBeInTheDocument()
  })

  it('falls back to 0 for an unparseable string value', () => {
    render(<NumberPropertyControl value="not-a-number" onChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: '0' })).toBeInTheDocument()
  })

  it('switches to an editable input when clicked', async () => {
    render(<NumberPropertyControl value={5} onChange={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: '5' }))
    expect(screen.getByRole('spinbutton')).toHaveValue(5)
  })

  it('commits a changed value on Enter', async () => {
    const onChange = vi.fn()
    render(<NumberPropertyControl value={5} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: '5' }))

    const input = screen.getByRole('spinbutton')
    await userEvent.clear(input)
    await userEvent.type(input, '10{Enter}')

    expect(onChange).toHaveBeenCalledWith(10)
  })

  it('commits a changed value on blur', async () => {
    const onChange = vi.fn()
    render(
      <div>
        <NumberPropertyControl value={5} onChange={onChange} />
        <button>elsewhere</button>
      </div>
    )
    await userEvent.click(screen.getByRole('button', { name: '5' }))
    const input = screen.getByRole('spinbutton')
    await userEvent.clear(input)
    await userEvent.type(input, '7')
    await userEvent.click(screen.getByRole('button', { name: 'elsewhere' }))

    expect(onChange).toHaveBeenCalledWith(7)
  })

  it('does not call onChange when the value is unchanged', async () => {
    const onChange = vi.fn()
    render(<NumberPropertyControl value={5} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: '5' }))
    await userEvent.keyboard('{Enter}')

    expect(onChange).not.toHaveBeenCalled()
  })

  it('cancels editing on Escape without calling onChange', async () => {
    const onChange = vi.fn()
    render(<NumberPropertyControl value={5} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: '5' }))
    const input = screen.getByRole('spinbutton')
    await userEvent.clear(input)
    await userEvent.type(input, '99{Escape}')

    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: '5' })).toBeInTheDocument()
  })
})
