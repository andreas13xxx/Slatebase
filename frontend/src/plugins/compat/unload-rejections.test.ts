import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { beginUnloadWindow, UNLOAD_GRACE_MS } from './unload-rejections'

function rejection(reason: unknown): PromiseRejectionEvent {
  const event = new Event('unhandledrejection', { cancelable: true }) as PromiseRejectionEvent
  Object.defineProperty(event, 'reason', { value: reason })
  return event
}

describe('beginUnloadWindow', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.advanceTimersByTime(UNLOAD_GRACE_MS + 1)
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('swallows a TypeError during the window and logs a warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const end = beginUnloadWindow('excalidraw')
    const event = rejection(new TypeError('this.plugin is null'))
    window.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    expect(warn).toHaveBeenCalledTimes(1)
    end()
  })

  it('leaves other error types alone', () => {
    const end = beginUnloadWindow('excalidraw')
    const event = rejection(new Error('real problem'))
    window.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)
    end()
  })

  it('stops containing after the grace period', () => {
    beginUnloadWindow('excalidraw')()
    vi.advanceTimersByTime(UNLOAD_GRACE_MS + 1)
    const event = rejection(new TypeError('late'))
    window.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)
  })
})
