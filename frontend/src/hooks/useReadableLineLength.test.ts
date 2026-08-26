import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useReadableLineLength } from './useReadableLineLength'

describe('useReadableLineLength', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  describe('initial state', () => {
    it('defaults to enabled when localStorage is empty (preserves existing constrained-width look)', () => {
      const { result } = renderHook(() => useReadableLineLength())
      expect(result.current.enabled).toBe(true)
    })

    it('reads enabled=false from localStorage', () => {
      localStorage.setItem('slatebase:readableLineLength', JSON.stringify({ enabled: false }))
      const { result } = renderHook(() => useReadableLineLength())
      expect(result.current.enabled).toBe(false)
    })

    it('reads enabled=true from localStorage', () => {
      localStorage.setItem('slatebase:readableLineLength', JSON.stringify({ enabled: true }))
      const { result } = renderHook(() => useReadableLineLength())
      expect(result.current.enabled).toBe(true)
    })

    it('defaults to enabled when localStorage contains invalid JSON', () => {
      localStorage.setItem('slatebase:readableLineLength', 'not-json{{{')
      const { result } = renderHook(() => useReadableLineLength())
      expect(result.current.enabled).toBe(true)
    })
  })

  describe('toggle', () => {
    it('toggles from enabled to disabled', () => {
      const { result } = renderHook(() => useReadableLineLength())
      expect(result.current.enabled).toBe(true)

      act(() => { result.current.toggle() })
      expect(result.current.enabled).toBe(false)
    })

    it('toggles from disabled to enabled', () => {
      localStorage.setItem('slatebase:readableLineLength', JSON.stringify({ enabled: false }))
      const { result } = renderHook(() => useReadableLineLength())

      act(() => { result.current.toggle() })
      expect(result.current.enabled).toBe(true)
    })

    it('persists disabled state to localStorage', () => {
      const { result } = renderHook(() => useReadableLineLength())

      act(() => { result.current.toggle() })
      const stored = JSON.parse(localStorage.getItem('slatebase:readableLineLength')!)
      expect(stored).toEqual({ enabled: false })
    })

    it('silently ignores localStorage write errors', () => {
      const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceededError')
      })
      const { result } = renderHook(() => useReadableLineLength())

      act(() => { result.current.toggle() })
      expect(result.current.enabled).toBe(false)
      spy.mockRestore()
    })
  })
})
