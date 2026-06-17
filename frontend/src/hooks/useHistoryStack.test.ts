import { renderHook, act } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { useHistoryStack } from './useHistoryStack'
import type { HistoryEntry } from './useHistoryStack'

function entry(text: string, start = 0, end = 0): HistoryEntry {
  return { text, selectionStart: start, selectionEnd: end }
}

describe('useHistoryStack', () => {
  describe('initial state', () => {
    it('starts with canUndo and canRedo as false', () => {
      const { result } = renderHook(() => useHistoryStack())
      expect(result.current.canUndo).toBe(false)
      expect(result.current.canRedo).toBe(false)
    })

    it('undo returns null when stack is empty', () => {
      const { result } = renderHook(() => useHistoryStack())
      let returned: HistoryEntry | null = null
      act(() => { returned = result.current.undo() })
      expect(returned).toBeNull()
    })

    it('redo returns null when stack is empty', () => {
      const { result } = renderHook(() => useHistoryStack())
      let returned: HistoryEntry | null = null
      act(() => { returned = result.current.redo() })
      expect(returned).toBeNull()
    })
  })

  describe('pushState', () => {
    it('sets canUndo to true after pushing', () => {
      const { result } = renderHook(() => useHistoryStack())
      act(() => { result.current.pushState(entry('hello')) })
      expect(result.current.canUndo).toBe(true)
    })

    it('clears redo stack on push', () => {
      const { result } = renderHook(() => useHistoryStack())

      // Push, undo (creates redo), then push again
      act(() => { result.current.pushState(entry('a')) })
      act(() => { result.current.pushState(entry('b')) })
      act(() => { result.current.undo() })
      expect(result.current.canRedo).toBe(true)

      act(() => { result.current.pushState(entry('c')) })
      expect(result.current.canRedo).toBe(false)
    })

    it('preserves selection positions', () => {
      const { result } = renderHook(() => useHistoryStack())
      act(() => { result.current.pushState(entry('text', 5, 10)) })

      let returned: HistoryEntry | null = null
      act(() => { returned = result.current.undo() })
      expect(returned).toEqual({ text: 'text', selectionStart: 5, selectionEnd: 10 })
    })
  })

  describe('undo', () => {
    it('returns entries in LIFO order', () => {
      const { result } = renderHook(() => useHistoryStack())

      act(() => { result.current.pushState(entry('first')) })
      act(() => { result.current.pushState(entry('second')) })
      act(() => { result.current.pushState(entry('third')) })

      let returned: HistoryEntry | null = null

      act(() => { returned = result.current.undo() })
      expect(returned!.text).toBe('third')

      act(() => { returned = result.current.undo() })
      expect(returned!.text).toBe('second')

      act(() => { returned = result.current.undo() })
      expect(returned!.text).toBe('first')
    })

    it('sets canUndo to false when stack is emptied', () => {
      const { result } = renderHook(() => useHistoryStack())

      act(() => { result.current.pushState(entry('only')) })
      act(() => { result.current.undo() })
      expect(result.current.canUndo).toBe(false)
    })

    it('sets canRedo to true after undo', () => {
      const { result } = renderHook(() => useHistoryStack())

      act(() => { result.current.pushState(entry('a')) })
      expect(result.current.canRedo).toBe(false)

      act(() => { result.current.undo() })
      expect(result.current.canRedo).toBe(true)
    })
  })

  describe('redo', () => {
    it('returns entries pushed by undo', () => {
      const { result } = renderHook(() => useHistoryStack())

      act(() => { result.current.pushState(entry('a')) })
      act(() => { result.current.pushState(entry('b')) })
      act(() => { result.current.undo() })

      let returned: HistoryEntry | null = null
      act(() => { returned = result.current.redo() })
      expect(returned!.text).toBe('b')
    })

    it('sets canRedo to false when redo stack is emptied', () => {
      const { result } = renderHook(() => useHistoryStack())

      act(() => { result.current.pushState(entry('a')) })
      act(() => { result.current.undo() })
      act(() => { result.current.redo() })
      expect(result.current.canRedo).toBe(false)
    })

    it('sets canUndo to true after redo', () => {
      const { result } = renderHook(() => useHistoryStack())

      act(() => { result.current.pushState(entry('a')) })
      act(() => { result.current.undo() })
      expect(result.current.canUndo).toBe(false)

      act(() => { result.current.redo() })
      expect(result.current.canUndo).toBe(true)
    })
  })

  describe('undo/redo interleave', () => {
    it('supports multiple undo then multiple redo', () => {
      const { result } = renderHook(() => useHistoryStack())

      act(() => { result.current.pushState(entry('a')) })
      act(() => { result.current.pushState(entry('b')) })
      act(() => { result.current.pushState(entry('c')) })

      let returned: HistoryEntry | null = null

      act(() => { returned = result.current.undo() })
      expect(returned!.text).toBe('c')
      act(() => { returned = result.current.undo() })
      expect(returned!.text).toBe('b')

      // Redo should give back in order
      act(() => { returned = result.current.redo() })
      expect(returned!.text).toBe('b')
      act(() => { returned = result.current.redo() })
      expect(returned!.text).toBe('c')
    })
  })

  describe('max entries (FIFO eviction)', () => {
    it('evicts oldest entries when exceeding maxEntries', () => {
      const { result } = renderHook(() => useHistoryStack(3))

      act(() => { result.current.pushState(entry('1')) })
      act(() => { result.current.pushState(entry('2')) })
      act(() => { result.current.pushState(entry('3')) })
      act(() => { result.current.pushState(entry('4')) })

      // Stack should be [2, 3, 4] — oldest (1) evicted
      let returned: HistoryEntry | null = null

      act(() => { returned = result.current.undo() })
      expect(returned!.text).toBe('4')
      act(() => { returned = result.current.undo() })
      expect(returned!.text).toBe('3')
      act(() => { returned = result.current.undo() })
      expect(returned!.text).toBe('2')

      // No more entries
      act(() => { returned = result.current.undo() })
      expect(returned).toBeNull()
    })

    it('defaults to 100 max entries', () => {
      const { result } = renderHook(() => useHistoryStack())

      // Push 101 entries
      act(() => {
        for (let i = 0; i < 101; i++) {
          result.current.pushState(entry(`entry-${i}`))
        }
      })

      // First available should be entry-1 (entry-0 evicted)
      let returned: HistoryEntry | null = null
      act(() => {
        for (let i = 0; i < 100; i++) {
          returned = result.current.undo()
        }
      })
      expect(returned!.text).toBe('entry-1')

      // No more
      act(() => { returned = result.current.undo() })
      expect(returned).toBeNull()
    })
  })

  describe('clear', () => {
    it('resets both stacks', () => {
      const { result } = renderHook(() => useHistoryStack())

      act(() => { result.current.pushState(entry('a')) })
      act(() => { result.current.pushState(entry('b')) })
      act(() => { result.current.undo() })

      expect(result.current.canUndo).toBe(true)
      expect(result.current.canRedo).toBe(true)

      act(() => { result.current.clear() })

      expect(result.current.canUndo).toBe(false)
      expect(result.current.canRedo).toBe(false)
    })

    it('undo returns null after clear', () => {
      const { result } = renderHook(() => useHistoryStack())

      act(() => { result.current.pushState(entry('a')) })
      act(() => { result.current.clear() })

      let returned: HistoryEntry | null = null
      act(() => { returned = result.current.undo() })
      expect(returned).toBeNull()
    })

    it('redo returns null after clear', () => {
      const { result } = renderHook(() => useHistoryStack())

      act(() => { result.current.pushState(entry('a')) })
      act(() => { result.current.undo() })
      act(() => { result.current.clear() })

      let returned: HistoryEntry | null = null
      act(() => { returned = result.current.redo() })
      expect(returned).toBeNull()
    })
  })
})
