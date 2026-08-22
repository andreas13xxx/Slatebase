import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CheckboxPropertyControl } from './CheckboxPropertyControl'

describe('CheckboxPropertyControl', () => {
  it('renders unchecked and shows "false" for a false value', () => {
    render(<CheckboxPropertyControl value={false} onChange={vi.fn()} />)
    expect(screen.getByRole('checkbox')).not.toBeChecked()
    expect(screen.getByText('false')).toBeInTheDocument()
  })

  it('renders checked and shows "true" for a true value', () => {
    render(<CheckboxPropertyControl value={true} onChange={vi.fn()} />)
    expect(screen.getByRole('checkbox')).toBeChecked()
    expect(screen.getByText('true')).toBeInTheDocument()
  })

  it('treats the string "true" as checked (frontmatter values may be strings)', () => {
    render(<CheckboxPropertyControl value="true" onChange={vi.fn()} />)
    expect(screen.getByRole('checkbox')).toBeChecked()
  })

  it('calls onChange with the inverted value when toggled', async () => {
    const onChange = vi.fn()
    render(<CheckboxPropertyControl value={false} onChange={onChange} />)

    await userEvent.click(screen.getByRole('checkbox'))

    expect(onChange).toHaveBeenCalledWith(true)
  })
})
