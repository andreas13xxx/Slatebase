import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { EditorView } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { setActiveEditorView } from '../editor/plugin-extensions'
import { useCursorPosition, goToLine } from './useCursorPosition'

function createView(doc: string, selection?: { anchor: number; head?: number }): EditorView {
  const state = EditorState.create({
    doc,
    selection: selection ? { anchor: selection.anchor, head: selection.head ?? selection.anchor } : undefined,
  })
  return new EditorView({ state, parent: document.body })
}

describe('useCursorPosition', () => {
  let view: EditorView | undefined

  beforeEach(() => {
    vi.useFakeTimers()
    setActiveEditorView(null)
  })

  afterEach(() => {
    view?.destroy()
    view = undefined
    setActiveEditorView(null)
    vi.useRealTimers()
  })

  it('returns null when no editor is active', () => {
    const { result } = renderHook(() => useCursorPosition())
    expect(result.current).toBeNull()
  })

  it('reports 1-indexed line and column for the cursor', () => {
    view = createView('line one\nline two\nline three', { anchor: 9 }) // start of "line two"
    setActiveEditorView(view)

    const { result } = renderHook(() => useCursorPosition())
    act(() => {
      vi.advanceTimersByTime(100)
    })

    expect(result.current).toEqual({ line: 2, column: 1, selectedLines: null })
  })

  it('reports selectedLines for a multi-line selection', () => {
    view = createView('line one\nline two\nline three', { anchor: 0, head: 20 })
    setActiveEditorView(view)

    const { result } = renderHook(() => useCursorPosition())
    act(() => {
      vi.advanceTimersByTime(100)
    })

    expect(result.current?.selectedLines).toBe(3)
  })

  it('updates when the cursor moves', () => {
    view = createView('line one\nline two')
    setActiveEditorView(view)

    const { result } = renderHook(() => useCursorPosition())
    act(() => {
      vi.advanceTimersByTime(100)
    })
    expect(result.current?.line).toBe(1)

    act(() => {
      view!.dispatch({ selection: { anchor: 9 } })
      vi.advanceTimersByTime(100)
    })

    expect(result.current?.line).toBe(2)
  })
})

describe('goToLine', () => {
  let view: EditorView | undefined

  afterEach(() => {
    view?.destroy()
    view = undefined
    setActiveEditorView(null)
  })

  it('moves the cursor to the start of the requested line', () => {
    view = createView('line one\nline two\nline three')
    setActiveEditorView(view)

    goToLine(2)

    expect(view.state.selection.main.head).toBe(9)
  })

  it('clamps a line number below 1 to the first line', () => {
    view = createView('line one\nline two')
    setActiveEditorView(view)

    goToLine(-5)

    expect(view.state.selection.main.head).toBe(0)
  })

  it('clamps a line number beyond the document to the last line', () => {
    view = createView('line one\nline two\nline three')
    setActiveEditorView(view)

    goToLine(999)

    expect(view.state.selection.main.head).toBe(18) // start of "line three"
  })

  it('is a no-op when no editor is active', () => {
    setActiveEditorView(null)
    expect(() => goToLine(1)).not.toThrow()
  })
})
