import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useLineNumbers } from './useLineNumbers'

describe('useLineNumbers', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  describe('initial state', () => {
    it('defaults to disabled when localStorage is empty', () => {
      const { result } = renderHook(() => useLineNumbers())
      expect(result.current.enabled).toBe(false)
    })

    it('reads enabled=true from localStorage', () => {
      localStorage.setItem('slatebase:lineNumbers', JSON.stringify({ enabled: true }))
      const { result } = renderHook(() => useLineNumbers())
      expect(result.current.enabled).toBe(true)
    })

    it('reads enabled=false from localStorage', () => {
      localStorage.setItem('slatebase:lineNumbers', JSON.stringify({ enabled: false }))
      const { result } = renderHook(() => useLineNumbers())
      expect(result.current.enabled).toBe(false)
    })

    it('defaults to disabled when localStorage contains invalid JSON', () => {
      localStorage.setItem('slatebase:lineNumbers', 'not-json{{{')
      const { result } = renderHook(() => useLineNumbers())
      expect(result.current.enabled).toBe(false)
    })

    it('defaults to disabled when localStorage contains wrong shape', () => {
      localStorage.setItem('slatebase:lineNumbers', JSON.stringify({ foo: 'bar' }))
      const { result } = renderHook(() => useLineNumbers())
      expect(result.current.enabled).toBe(false)
    })

    it('defaults to disabled when enabled field is not boolean', () => {
      localStorage.setItem('slatebase:lineNumbers', JSON.stringify({ enabled: 'yes' }))
      const { result } = renderHook(() => useLineNumbers())
      expect(result.current.enabled).toBe(false)
    })

    it('defaults to disabled when localStorage throws', () => {
      const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('SecurityError')
      })
      const { result } = renderHook(() => useLineNumbers())
      expect(result.current.enabled).toBe(false)
      spy.mockRestore()
    })
  })

  describe('toggle', () => {
    it('toggles from disabled to enabled', () => {
      const { result } = renderHook(() => useLineNumbers())
      expect(result.current.enabled).toBe(false)

      act(() => { result.current.toggle() })
      expect(result.current.enabled).toBe(true)
    })

    it('toggles from enabled to disabled', () => {
      localStorage.setItem('slatebase:lineNumbers', JSON.stringify({ enabled: true }))
      const { result } = renderHook(() => useLineNumbers())
      expect(result.current.enabled).toBe(true)

      act(() => { result.current.toggle() })
      expect(result.current.enabled).toBe(false)
    })

    it('persists enabled state to localStorage', () => {
      const { result } = renderHook(() => useLineNumbers())

      act(() => { result.current.toggle() })
      const stored = JSON.parse(localStorage.getItem('slatebase:lineNumbers')!)
      expect(stored).toEqual({ enabled: true })
    })

    it('persists disabled state to localStorage', () => {
      localStorage.setItem('slatebase:lineNumbers', JSON.stringify({ enabled: true }))
      const { result } = renderHook(() => useLineNumbers())

      act(() => { result.current.toggle() })
      const stored = JSON.parse(localStorage.getItem('slatebase:lineNumbers')!)
      expect(stored).toEqual({ enabled: false })
    })

    it('toggles multiple times correctly', () => {
      const { result } = renderHook(() => useLineNumbers())

      act(() => { result.current.toggle() })
      expect(result.current.enabled).toBe(true)

      act(() => { result.current.toggle() })
      expect(result.current.enabled).toBe(false)

      act(() => { result.current.toggle() })
      expect(result.current.enabled).toBe(true)
    })

    it('silently ignores localStorage write errors', () => {
      const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceededError')
      })
      const { result } = renderHook(() => useLineNumbers())

      // Should not throw
      act(() => { result.current.toggle() })
      expect(result.current.enabled).toBe(true)
      spy.mockRestore()
    })
  })
})
