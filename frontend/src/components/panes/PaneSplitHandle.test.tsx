import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PaneSplitHandle } from './PaneSplitHandle'

function setup(direction: 'horizontal' | 'vertical' = 'horizontal') {
  const onResize = vi.fn()
  render(<PaneSplitHandle direction={direction} ratio={0.5} getAxisLengthPx={() => 1000} onResize={onResize} label="Trenner" />)
  return { handle: screen.getByRole('separator'), onResize }
}

describe('PaneSplitHandle pointer input', () => {
  it('resizes with a touch drag', () => {
    const { handle, onResize } = setup()
    fireEvent.pointerDown(handle, { pointerType: 'touch', pointerId: 1, clientX: 500, clientY: 0 })
    fireEvent.pointerMove(document, { pointerType: 'touch', pointerId: 1, clientX: 600, clientY: 0 })
    expect(onResize).toHaveBeenLastCalledWith(0.6)
    fireEvent.pointerUp(document, { pointerType: 'touch', pointerId: 1 })
    onResize.mockClear()
    fireEvent.pointerMove(document, { pointerType: 'touch', pointerId: 1, clientX: 700, clientY: 0 })
    expect(onResize).not.toHaveBeenCalled()
  })

  it('resizes along Y for a vertical split with a mouse drag', () => {
    const { handle, onResize } = setup('vertical')
    fireEvent.pointerDown(handle, { pointerType: 'mouse', pointerId: 1, clientX: 0, clientY: 500 })
    fireEvent.pointerMove(document, { pointerType: 'mouse', pointerId: 1, clientX: 0, clientY: 400 })
    expect(onResize).toHaveBeenLastCalledWith(0.4)
    fireEvent.pointerUp(document, { pointerType: 'mouse', pointerId: 1 })
  })

  it('stops on pointercancel', () => {
    const { handle, onResize } = setup()
    fireEvent.pointerDown(handle, { pointerType: 'touch', pointerId: 1, clientX: 500, clientY: 0 })
    fireEvent.pointerCancel(document, { pointerType: 'touch', pointerId: 1 })
    fireEvent.pointerMove(document, { pointerType: 'touch', pointerId: 1, clientX: 700, clientY: 0 })
    expect(onResize).not.toHaveBeenCalled()
  })
})
