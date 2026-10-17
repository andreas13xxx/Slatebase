import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { useLongPress, LONG_PRESS_MS } from './useLongPress'

function Target({ onClick }: { onClick: () => void }) {
  const longPress = useLongPress()
  return <button data-testid="t" onClick={onClick} {...longPress}>x</button>
}

describe('useLongPress', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  function setup() {
    const onClick = vi.fn()
    const onContextMenu = vi.fn()
    const { getByTestId } = render(<Target onClick={onClick} />)
    const el = getByTestId('t')
    el.addEventListener('contextmenu', onContextMenu)
    return { el, onClick, onContextMenu }
  }

  it('dispatches contextmenu after a touch hold', () => {
    const { el, onContextMenu } = setup()
    fireEvent.pointerDown(el, { pointerType: 'touch', isPrimary: true, clientX: 5, clientY: 6 })
    vi.advanceTimersByTime(LONG_PRESS_MS)
    expect(onContextMenu).toHaveBeenCalledTimes(1)
    const ev = onContextMenu.mock.calls[0]?.[0] as MouseEvent
    expect(ev.clientX).toBe(5)
    expect(ev.clientY).toBe(6)
  })

  it('ignores mouse input', () => {
    const { el, onContextMenu } = setup()
    fireEvent.pointerDown(el, { pointerType: 'mouse', isPrimary: true })
    vi.advanceTimersByTime(LONG_PRESS_MS * 2)
    expect(onContextMenu).not.toHaveBeenCalled()
  })

  it('cancels on release before the threshold', () => {
    const { el, onContextMenu } = setup()
    fireEvent.pointerDown(el, { pointerType: 'touch', isPrimary: true })
    vi.advanceTimersByTime(LONG_PRESS_MS - 100)
    fireEvent.pointerUp(el, { pointerType: 'touch' })
    vi.advanceTimersByTime(500)
    expect(onContextMenu).not.toHaveBeenCalled()
  })

  it('cancels when the finger moves', () => {
    const { el, onContextMenu } = setup()
    fireEvent.pointerDown(el, { pointerType: 'touch', isPrimary: true, clientX: 0, clientY: 0 })
    fireEvent.pointerMove(el, { pointerType: 'touch', clientX: 40, clientY: 0 })
    vi.advanceTimersByTime(LONG_PRESS_MS * 2)
    expect(onContextMenu).not.toHaveBeenCalled()
  })

  it('swallows the click after a long press, but not later ones', () => {
    const { el, onClick } = setup()
    fireEvent.pointerDown(el, { pointerType: 'touch', isPrimary: true })
    vi.advanceTimersByTime(LONG_PRESS_MS)
    fireEvent.pointerUp(el, { pointerType: 'touch' })
    fireEvent.click(el)
    expect(onClick).not.toHaveBeenCalled()
    fireEvent.click(el)
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})
