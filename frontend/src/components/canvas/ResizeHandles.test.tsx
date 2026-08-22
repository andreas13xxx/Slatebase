import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ResizeHandles } from './ResizeHandles'

describe('ResizeHandles', () => {
  it('renders nothing when not visible', () => {
    const { container } = render(<ResizeHandles visible={false} onResizeStart={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders all 8 resize handles when visible', () => {
    render(<ResizeHandles visible={true} onResizeStart={vi.fn()} />)
    expect(screen.getAllByRole('separator')).toHaveLength(8)
  })

  it('calls onResizeStart with the corresponding handle on mouse down', async () => {
    const onResizeStart = vi.fn()
    render(<ResizeHandles visible={true} onResizeStart={onResizeStart} />)

    const seHandle = screen.getByLabelText('Größe ändern se')
    await userEvent.pointer({ keys: '[MouseLeft>]', target: seHandle })

    expect(onResizeStart).toHaveBeenCalledTimes(1)
    expect(onResizeStart.mock.calls[0]?.[1]).toBe('se')
  })
})
