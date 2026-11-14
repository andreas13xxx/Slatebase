import { describe, it, expect, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { BREAKPOINTS, BREAKPOINT_QUERIES, useBreakpoint, useMediaQuery } from './useMediaQuery'

/** A controllable `matchMedia` driven by a window width. */
function installMatchMedia(initialWidth: number) {
  let width = initialWidth
  const listeners = new Map<string, Set<() => void>>()
  const matches = (query: string): boolean => {
    const m = /max-width:\s*(\d+)px/.exec(query)
    return m ? width <= Number(m[1]) : false
  }
  window.matchMedia = ((query: string) => ({
    get matches() { return matches(query) },
    media: query,
    addEventListener: (_: string, cb: () => void) => {
      if (!listeners.has(query)) listeners.set(query, new Set())
      listeners.get(query)!.add(cb)
    },
    removeEventListener: (_: string, cb: () => void) => { listeners.get(query)?.delete(cb) },
  })) as unknown as typeof window.matchMedia
  return {
    resize(next: number) {
      width = next
      for (const set of listeners.values()) for (const cb of [...set]) cb()
    },
    listenerCount: () => [...listeners.values()].reduce((n, s) => n + s.size, 0),
  }
}

const original = window.matchMedia
afterEach(() => {
  window.matchMedia = original
})

describe('BREAKPOINTS', () => {
  it('pins the documented numbers (App.css repeats them)', () => {
    expect(BREAKPOINTS).toEqual({ mobile: 767, tablet: 1024 })
    expect(BREAKPOINT_QUERIES).toEqual({ mobile: '(max-width: 767px)', tablet: '(max-width: 1024px)' })
  })
})

describe('useMediaQuery', () => {
  it('is false without matchMedia (jsdom)', () => {
    window.matchMedia = undefined as never
    expect(renderHook(() => useMediaQuery('(max-width: 767px)')).result.current).toBe(false)
  })

  it('follows the query and unsubscribes on unmount', () => {
    const env = installMatchMedia(1200)
    const { result, unmount } = renderHook(() => useMediaQuery('(max-width: 767px)'))
    expect(result.current).toBe(false)
    act(() => env.resize(500))
    expect(result.current).toBe(true)
    unmount()
    expect(env.listenerCount()).toBe(0)
  })
})

describe('useBreakpoint', () => {
  it.each([
    [375, 'mobile'],
    [767, 'mobile'],
    [768, 'tablet'],
    [1024, 'tablet'],
    [1025, 'desktop'],
    [1440, 'desktop'],
  ] as const)('%ipx is %s', (width, expected) => {
    installMatchMedia(width)
    expect(renderHook(() => useBreakpoint()).result.current).toBe(expected)
  })

  it('moves between ranges when the window is resized', () => {
    const env = installMatchMedia(1440)
    const { result } = renderHook(() => useBreakpoint())
    expect(result.current).toBe('desktop')
    act(() => env.resize(900))
    expect(result.current).toBe('tablet')
    act(() => env.resize(400))
    expect(result.current).toBe('mobile')
  })

  it('renders desktop where matchMedia does not exist', () => {
    window.matchMedia = undefined as never
    expect(renderHook(() => useBreakpoint()).result.current).toBe('desktop')
  })
})
