import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { computeKeyboardInset, useKeyboardViewport } from './useKeyboardViewport'

describe('computeKeyboardInset', () => {
  it('is the layout height the visual viewport lost', () => {
    expect(computeKeyboardInset({ innerHeight: 1000, visualViewport: { height: 650, offsetTop: 0, scale: 1 } })).toBe(350)
  })

  it('subtracts the offset iOS pans the page by', () => {
    expect(computeKeyboardInset({ innerHeight: 1000, visualViewport: { height: 650, offsetTop: 100, scale: 1 } })).toBe(250)
  })

  it('ignores small differences (browser chrome) and pinch zoom', () => {
    expect(computeKeyboardInset({ innerHeight: 1000, visualViewport: { height: 950, offsetTop: 0, scale: 1 } })).toBe(0)
    expect(computeKeyboardInset({ innerHeight: 1000, visualViewport: { height: 500, offsetTop: 0, scale: 2 } })).toBe(0)
  })

  it('is 0 without a visual viewport', () => {
    expect(computeKeyboardInset({ innerHeight: 1000, visualViewport: null })).toBe(0)
  })
})

describe('useKeyboardViewport', () => {
  afterEach(() => { vi.unstubAllGlobals(); document.documentElement.removeAttribute('style'); document.documentElement.className = '' })

  it('publishes the inset and the keyboard-open class, and cleans up', () => {
    const listeners = new Map<string, () => void>()
    const vv = { height: 1000, offsetTop: 0, scale: 1, addEventListener: (t: string, f: () => void) => listeners.set(t, f), removeEventListener: vi.fn() }
    vi.stubGlobal('visualViewport', vv)
    vi.stubGlobal('scrollTo', vi.fn())
    Object.defineProperty(window, 'innerHeight', { value: 1000, configurable: true })
    const { unmount } = renderHook(() => useKeyboardViewport())
    const root = document.documentElement
    expect(root.style.getPropertyValue('--keyboard-inset')).toBe('0px')
    expect(root.classList.contains('keyboard-open')).toBe(false)

    vv.height = 640
    listeners.get('resize')?.()
    expect(root.style.getPropertyValue('--keyboard-inset')).toBe('360px')
    expect(root.classList.contains('keyboard-open')).toBe(true)

    unmount()
    expect(root.style.getPropertyValue('--keyboard-inset')).toBe('')
    expect(root.classList.contains('keyboard-open')).toBe(false)
  })
})
