import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TextPropertyControl } from './TextPropertyControl'

describe('TextPropertyControl', () => {
  it('displays the value as a button when not editing', () => {
    render(<TextPropertyControl value="hello" onChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'hello' })).toBeInTheDocument()
  })

  it('shows a placeholder when the value is empty', () => {
    render(<TextPropertyControl value="" onChange={vi.fn()} />)
    expect(screen.getByText('(leer)')).toBeInTheDocument()
  })

  it('switches to an editable input when clicked, pre-filled with the value', async () => {
    render(<TextPropertyControl value="hello" onChange={vi.fn()} />)
    await userEvent.click(screen.getByRole('button'))
    expect(screen.getByRole('textbox')).toHaveValue('hello')
  })

  it('commits the new value on Enter', async () => {
    const onChange = vi.fn()
    render(<TextPropertyControl value="hello" onChange={onChange} />)
    await userEvent.click(screen.getByRole('button'))

    const input = screen.getByRole('textbox')
    await userEvent.clear(input)
    await userEvent.type(input, 'world{Enter}')

    expect(onChange).toHaveBeenCalledWith('world')
  })

  it('commits the new value on blur', async () => {
    const onChange = vi.fn()
    render(
      <div>
        <TextPropertyControl value="hello" onChange={onChange} />
        <button>elsewhere</button>
      </div>
    )
    await userEvent.click(screen.getByRole('button', { name: 'hello' }))
    const input = screen.getByRole('textbox')
    await userEvent.clear(input)
    await userEvent.type(input, 'blurred')
    await userEvent.click(screen.getByRole('button', { name: 'elsewhere' }))

    expect(onChange).toHaveBeenCalledWith('blurred')
  })

  it('does not call onChange when the value is unchanged', async () => {
    const onChange = vi.fn()
    render(<TextPropertyControl value="hello" onChange={onChange} />)
    await userEvent.click(screen.getByRole('button'))
    await userEvent.keyboard('{Enter}')

    expect(onChange).not.toHaveBeenCalled()
  })

  it('cancels editing on Escape without calling onChange', async () => {
    const onChange = vi.fn()
    render(<TextPropertyControl value="hello" onChange={onChange} />)
    await userEvent.click(screen.getByRole('button'))
    const input = screen.getByRole('textbox')
    await userEvent.type(input, ' extra{Escape}')

    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'hello' })).toBeInTheDocument()
  })
})
