import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'

describe('zoomStore', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.resetModules()
  })

  it('defaults to 1.0 (100%) when localStorage is empty', async () => {
    const { useZoom } = await import('./zoomStore')
    const { result } = renderHook(() => useZoom())
    expect(result.current).toBe(1)
  })

  it('zoomIn increases by the step and notifies subscribers', async () => {
    const { useZoom, zoomIn } = await import('./zoomStore')
    const { result } = renderHook(() => useZoom())

    act(() => { zoomIn() })

    expect(result.current).toBeCloseTo(1.1)
  })

  it('zoomOut decreases by the step', async () => {
    const { useZoom, zoomOut } = await import('./zoomStore')
    const { result } = renderHook(() => useZoom())

    act(() => { zoomOut() })

    expect(result.current).toBeCloseTo(0.9)
  })

  it('clamps zoomIn at MAX_ZOOM', async () => {
    const { useZoom, zoomIn, MAX_ZOOM } = await import('./zoomStore')
    const { result } = renderHook(() => useZoom())

    act(() => { for (let i = 0; i < 50; i++) zoomIn() })

    expect(result.current).toBe(MAX_ZOOM)
  })

  it('clamps zoomOut at MIN_ZOOM', async () => {
    const { useZoom, zoomOut, MIN_ZOOM } = await import('./zoomStore')
    const { result } = renderHook(() => useZoom())

    act(() => { for (let i = 0; i < 50; i++) zoomOut() })

    expect(result.current).toBe(MIN_ZOOM)
  })

  it('resetZoom returns to 1.0 regardless of current level', async () => {
    const { useZoom, zoomIn, resetZoom } = await import('./zoomStore')
    const { result } = renderHook(() => useZoom())

    act(() => { zoomIn(); zoomIn(); resetZoom() })

    expect(result.current).toBe(1)
  })

  it('persists the zoom level to localStorage', async () => {
    const { zoomIn } = await import('./zoomStore')

    zoomIn()

    expect(JSON.parse(localStorage.getItem('slatebase:zoom')!)).toBeCloseTo(1.1)
  })

  it('reads a persisted zoom level on next load', async () => {
    localStorage.setItem('slatebase:zoom', JSON.stringify(1.3))
    const { useZoom } = await import('./zoomStore')

    const { result } = renderHook(() => useZoom())

    expect(result.current).toBeCloseTo(1.3)
  })

  it('falls back to 1.0 for corrupted localStorage data', async () => {
    localStorage.setItem('slatebase:zoom', 'not-json')
    const { useZoom } = await import('./zoomStore')

    const { result } = renderHook(() => useZoom())

    expect(result.current).toBe(1)
  })
})
