import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ListPropertyControl } from './ListPropertyControl'

describe('ListPropertyControl', () => {
  it('renders each value as a chip', () => {
    render(<ListPropertyControl value={['alpha', 'beta']} onChange={vi.fn()} />)
    expect(screen.getByText('alpha')).toBeInTheDocument()
    expect(screen.getByText('beta')).toBeInTheDocument()
  })

  it('adds a new item on Enter and clears the input', async () => {
    const onChange = vi.fn()
    render(<ListPropertyControl value={['alpha']} onChange={onChange} />)

    const input = screen.getByRole('textbox')
    await userEvent.type(input, 'gamma{Enter}')

    expect(onChange).toHaveBeenCalledWith(['alpha', 'gamma'])
    expect(input).toHaveValue('')
  })

  it('trims whitespace from a new item', async () => {
    const onChange = vi.fn()
    render(<ListPropertyControl value={[]} onChange={onChange} />)

    await userEvent.type(screen.getByRole('textbox'), '  spaced  {Enter}')

    expect(onChange).toHaveBeenCalledWith(['spaced'])
  })

  it('does not add a duplicate item', async () => {
    const onChange = vi.fn()
    render(<ListPropertyControl value={['alpha']} onChange={onChange} />)

    await userEvent.type(screen.getByRole('textbox'), 'alpha{Enter}')

    expect(onChange).not.toHaveBeenCalled()
  })

  it('does not add an empty item', async () => {
    const onChange = vi.fn()
    render(<ListPropertyControl value={[]} onChange={onChange} />)

    await userEvent.type(screen.getByRole('textbox'), '{Enter}')

    expect(onChange).not.toHaveBeenCalled()
  })

  it('removes an item when its chip remove button is clicked', async () => {
    const onChange = vi.fn()
    render(<ListPropertyControl value={['alpha', 'beta']} onChange={onChange} />)

    await userEvent.click(screen.getByRole('button', { name: /alpha/ }))

    expect(onChange).toHaveBeenCalledWith(['beta'])
  })

  it('removes the last chip on Backspace when the input is empty', async () => {
    const onChange = vi.fn()
    render(<ListPropertyControl value={['alpha', 'beta']} onChange={onChange} />)

    await userEvent.type(screen.getByRole('textbox'), '{Backspace}')

    expect(onChange).toHaveBeenCalledWith(['alpha'])
  })

  it('does not remove a chip on Backspace when the input has text', async () => {
    const onChange = vi.fn()
    render(<ListPropertyControl value={['alpha']} onChange={onChange} />)

    await userEvent.type(screen.getByRole('textbox'), 'x{Backspace}')

    expect(onChange).not.toHaveBeenCalled()
  })

  it('shows filtered suggestions matching the current input', async () => {
    render(<ListPropertyControl value={[]} onChange={vi.fn()} suggestions={['project', 'personal', 'work']} />)

    await userEvent.type(screen.getByRole('textbox'), 'pro')

    expect(screen.getByRole('option', { name: 'project' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'work' })).not.toBeInTheDocument()
  })

  it('excludes already-selected values from suggestions', async () => {
    render(<ListPropertyControl value={['project']} onChange={vi.fn()} suggestions={['project', 'personal']} />)

    await userEvent.type(screen.getByRole('textbox'), 'p')

    expect(screen.queryByRole('option', { name: 'project' })).not.toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'personal' })).toBeInTheDocument()
  })

  it('adds a suggestion when clicked', async () => {
    const onChange = vi.fn()
    render(<ListPropertyControl value={[]} onChange={onChange} suggestions={['project']} />)

    await userEvent.type(screen.getByRole('textbox'), 'pro')
    await userEvent.click(screen.getByRole('option', { name: 'project' }))

    expect(onChange).toHaveBeenCalledWith(['project'])
  })
})
