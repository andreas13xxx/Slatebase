import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAnchorJump } from './useAnchorJump'
import { clearAnchorJumps, peekAnchorJump, requestAnchorJump } from '../state/anchorJumpBridge'

const heading = { kind: 'heading' as const, text: 'Titel' }

describe('useAnchorJump', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    clearAnchorJumps()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('applies a parked anchor once the tab is ready, then forgets it', () => {
    const apply = vi.fn().mockReturnValue(true)
    requestAnchorJump('t1', heading)
    renderHook(() => useAnchorJump('t1', true, apply, 'reading'))
    expect(apply).toHaveBeenCalledWith(heading)
    expect(peekAnchorJump('t1')).toBeNull()
  })

  it('waits while the tab is not ready', () => {
    const apply = vi.fn().mockReturnValue(true)
    requestAnchorJump('t1', heading)
    const { rerender } = renderHook(({ ready }) => useAnchorJump('t1', ready, apply, 'reading'), { initialProps: { ready: false } })
    expect(apply).not.toHaveBeenCalled()
    expect(peekAnchorJump('t1')).toEqual(heading)
    rerender({ ready: true })
    expect(apply).toHaveBeenCalledTimes(1)
  })

  it('retries while the note is still rendering', () => {
    const apply = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(false).mockReturnValue(true)
    requestAnchorJump('t1', heading)
    renderHook(() => useAnchorJump('t1', true, apply, 'reading'))
    expect(apply).toHaveBeenCalledTimes(1)
    act(() => { vi.advanceTimersByTime(50) })
    act(() => { vi.advanceTimersByTime(50) })
    expect(apply).toHaveBeenCalledTimes(3)
    expect(peekAnchorJump('t1')).toBeNull()
  })

  it('gives up after a bounded number of attempts so a stale anchor never fires later', () => {
    const apply = vi.fn().mockReturnValue(false)
    requestAnchorJump('t1', heading)
    renderHook(() => useAnchorJump('t1', true, apply, 'reading'))
    act(() => { vi.advanceTimersByTime(10_000) })
    expect(apply.mock.calls.length).toBe(40)
    expect(peekAnchorJump('t1')).toBeNull()
  })

  it('reacts to a request that arrives while the tab is already open', () => {
    const apply = vi.fn().mockReturnValue(true)
    renderHook(() => useAnchorJump('t1', true, apply, 'reading'))
    expect(apply).not.toHaveBeenCalled()
    act(() => { requestAnchorJump('t1', heading) })
    expect(apply).toHaveBeenCalledWith(heading)
  })

  it('ignores requests for other tabs', () => {
    const apply = vi.fn().mockReturnValue(true)
    renderHook(() => useAnchorJump('t1', true, apply, 'reading'))
    act(() => { requestAnchorJump('t2', heading) })
    expect(apply).not.toHaveBeenCalled()
    expect(peekAnchorJump('t2')).toEqual(heading)
  })

  it('stops retrying when the tab changes', () => {
    const apply = vi.fn().mockReturnValue(false)
    requestAnchorJump('t1', heading)
    const { rerender } = renderHook(({ id }) => useAnchorJump(id, true, apply, 'reading'), { initialProps: { id: 't1' } })
    rerender({ id: 't2' })
    const calls = apply.mock.calls.length
    act(() => { vi.advanceTimersByTime(500) })
    expect(apply.mock.calls.length).toBe(calls)
  })
})
