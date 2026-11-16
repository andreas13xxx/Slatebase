import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OutlineView } from './OutlineView'

const headings = [
  { text: 'Eins', level: 1 as const, anchor: 'eins' },
  { text: 'Unter', level: 2 as const, anchor: 'unter' },
  { text: 'Zwei', level: 1 as const, anchor: 'zwei' },
]

function setup(extra: Partial<React.ComponentProps<typeof OutlineView>> = {}) {
  const props = { onHeadingClick: vi.fn(), onHeadingJump: vi.fn(), onHeadingFoldToggle: vi.fn(), ...extra }
  render(<OutlineView headings={headings} activeAnchor={null} {...props} />)
  return props
}

describe('OutlineView search, jump and fold', () => {
  it('filters headings by the search text', async () => {
    setup()
    await userEvent.type(screen.getByRole('searchbox'), 'unt')
    expect(screen.queryByText('Eins')).toBeNull()
    expect(screen.getByText('Unter')).toBeInTheDocument()
  })

  it('jumps on double click with the original index', async () => {
    const props = setup()
    await userEvent.dblClick(screen.getByText('Zwei'))
    expect(props.onHeadingJump).toHaveBeenCalledWith(2, 'zwei')
  })

  it('hides children of a folded heading and reports the fold', async () => {
    const props = setup()
    await userEvent.click(screen.getByRole('button', { name: /„Eins“ einklappen/ }))
    expect(screen.queryByText('Unter')).toBeNull()
    expect(props.onHeadingFoldToggle).toHaveBeenCalledWith(0, true, 'eins')

    await userEvent.click(screen.getByRole('button', { name: /„Eins“ ausklappen/ }))
    expect(screen.getByText('Unter')).toBeInTheDocument()
    expect(props.onHeadingFoldToggle).toHaveBeenCalledWith(0, false, 'eins')
  })
})
