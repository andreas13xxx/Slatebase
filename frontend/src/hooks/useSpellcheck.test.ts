import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useSpellcheck } from './useSpellcheck'

describe('useSpellcheck', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  describe('initial state', () => {
    it('defaults to enabled when localStorage is empty (matches browser default)', () => {
      const { result } = renderHook(() => useSpellcheck())
      expect(result.current.enabled).toBe(true)
    })

    it('reads enabled=false from localStorage', () => {
      localStorage.setItem('slatebase:spellcheck', JSON.stringify({ enabled: false }))
      const { result } = renderHook(() => useSpellcheck())
      expect(result.current.enabled).toBe(false)
    })

    it('defaults to enabled when localStorage contains invalid JSON', () => {
      localStorage.setItem('slatebase:spellcheck', 'not-json{{{')
      const { result } = renderHook(() => useSpellcheck())
      expect(result.current.enabled).toBe(true)
    })
  })

  describe('toggle', () => {
    it('toggles from enabled to disabled', () => {
      const { result } = renderHook(() => useSpellcheck())
      expect(result.current.enabled).toBe(true)

      act(() => { result.current.toggle() })
      expect(result.current.enabled).toBe(false)
    })

    it('toggles from disabled to enabled', () => {
      localStorage.setItem('slatebase:spellcheck', JSON.stringify({ enabled: false }))
      const { result } = renderHook(() => useSpellcheck())

      act(() => { result.current.toggle() })
      expect(result.current.enabled).toBe(true)
    })

    it('persists disabled state to localStorage', () => {
      const { result } = renderHook(() => useSpellcheck())

      act(() => { result.current.toggle() })
      const stored = JSON.parse(localStorage.getItem('slatebase:spellcheck')!)
      expect(stored).toEqual({ enabled: false })
    })

    it('silently ignores localStorage write errors', () => {
      const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceededError')
      })
      const { result } = renderHook(() => useSpellcheck())

      act(() => { result.current.toggle() })
      expect(result.current.enabled).toBe(false)
      spy.mockRestore()
    })
  })
})
