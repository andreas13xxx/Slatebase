import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type React from 'react'
import { useTouchTabDrag, TOUCH_DRAG_ARM_MS } from './useTouchTabDrag'

function ptr(x: number, y: number, pointerType = 'touch'): React.PointerEvent<Element> {
  return { pointerType, isPrimary: true, clientX: x, clientY: y } as unknown as React.PointerEvent<Element>
}

describe('useTouchTabDrag', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    document.body.innerHTML = '<div data-tab-bar="p1"><div id="a" data-tab-index="0"></div><div id="b" data-tab-index="1"></div></div>'
    document.elementFromPoint = vi.fn(() => document.getElementById('b'))
  })
  afterEach(() => vi.useRealTimers())

  it('drops on the tab under the finger after hold + move', () => {
    const onDrop = vi.fn()
    const { result } = renderHook(() => useTouchTabDrag({ onDrop }))
    act(() => result.current.onPointerDown(ptr(0, 0), 0))
    act(() => { vi.advanceTimersByTime(TOUCH_DRAG_ARM_MS + 1) })
    act(() => result.current.onPointerMove(ptr(40, 0)))
    expect(result.current.draggingIndex).toBe(0)
    act(() => result.current.onPointerUp(ptr(40, 0)))
    expect(onDrop).toHaveBeenCalledWith(0, { barId: 'p1', index: 1 })
  })

  it('treats a move before the hold as scrolling', () => {
    const onDrop = vi.fn()
    const { result } = renderHook(() => useTouchTabDrag({ onDrop }))
    act(() => result.current.onPointerDown(ptr(0, 0), 0))
    act(() => result.current.onPointerMove(ptr(40, 0)))
    act(() => { vi.advanceTimersByTime(TOUCH_DRAG_ARM_MS + 1) })
    act(() => result.current.onPointerUp(ptr(40, 0)))
    expect(onDrop).not.toHaveBeenCalled()
  })

  it('ignores mouse input', () => {
    const onDrop = vi.fn()
    const { result } = renderHook(() => useTouchTabDrag({ onDrop }))
    act(() => result.current.onPointerDown(ptr(0, 0, 'mouse'), 0))
    act(() => { vi.advanceTimersByTime(TOUCH_DRAG_ARM_MS + 1) })
    act(() => result.current.onPointerMove(ptr(40, 0, 'mouse')))
    act(() => result.current.onPointerUp(ptr(40, 0, 'mouse')))
    expect(onDrop).not.toHaveBeenCalled()
  })
})
