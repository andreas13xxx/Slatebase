import { describe, it, expect, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
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

  it('commits an open draft when the control is unmounted without a blur', async () => {
    // The frontmatter editor is rebuilt whenever the document changes, which
    // unmounts this control mid-edit — and React fires no blur then, so the
    // draft has to be flushed explicitly or the typed value is lost.
    const onChange = vi.fn()
    const { unmount } = render(<TextPropertyControl value="hello" onChange={onChange} />)
    await userEvent.click(screen.getByRole('button'))
    const input = screen.getByRole('textbox')
    await userEvent.clear(input)
    await userEvent.type(input, 'typed but not committed')

    unmount()
    await act(async () => {})

    expect(onChange).toHaveBeenCalledWith('typed but not committed')
  })

  it('does not re-commit on unmount after the draft was already committed', async () => {
    const onChange = vi.fn()
    const { unmount } = render(<TextPropertyControl value="hello" onChange={onChange} />)
    await userEvent.click(screen.getByRole('button'))
    const input = screen.getByRole('textbox')
    await userEvent.clear(input)
    await userEvent.type(input, 'world{Enter}')

    unmount()
    await act(async () => {})

    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('does not commit on unmount after Escape', async () => {
    const onChange = vi.fn()
    const { unmount } = render(<TextPropertyControl value="hello" onChange={onChange} />)
    await userEvent.click(screen.getByRole('button'))
    await userEvent.type(screen.getByRole('textbox'), ' extra{Escape}')

    unmount()
    await act(async () => {})

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
