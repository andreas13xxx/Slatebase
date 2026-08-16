import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { EditorView } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { setActiveEditorView } from '../editor/plugin-extensions'
import { useWordStats, countWords, EMPTY_WORD_STATS } from './useWordStats'

function createView(doc: string, selection?: { anchor: number; head?: number }): EditorView {
  const state = EditorState.create({
    doc,
    selection: selection ? { anchor: selection.anchor, head: selection.head ?? selection.anchor } : undefined,
  })
  return new EditorView({ state, parent: document.body })
}

describe('countWords', () => {
  it('counts whitespace-separated tokens', () => {
    expect(countWords('hello world')).toBe(2)
  })

  it('ignores markdown control characters', () => {
    expect(countWords('# Heading **bold** `code` [link]')).toBe(4)
  })

  it('returns 0 for empty or whitespace-only text', () => {
    expect(countWords('')).toBe(0)
    expect(countWords('   \n  ')).toBe(0)
  })
})

describe('useWordStats', () => {
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

  it('returns EMPTY_WORD_STATS when no editor is active', () => {
    const { result } = renderHook(() => useWordStats())
    expect(result.current).toEqual(EMPTY_WORD_STATS)
  })

  it('reports word and character counts for the active editor content', () => {
    view = createView('hello world')
    setActiveEditorView(view)

    const { result } = renderHook(() => useWordStats())
    act(() => {
      vi.advanceTimersByTime(300)
    })

    expect(result.current.words).toBe(2)
    expect(result.current.characters).toBe('hello world'.length)
    expect(result.current.selectedWords).toBeNull()
    expect(result.current.selectedCharacters).toBeNull()
  })

  it('reports selection counts when a non-empty selection exists', () => {
    view = createView('hello world', { anchor: 0, head: 5 })
    setActiveEditorView(view)

    const { result } = renderHook(() => useWordStats())
    act(() => {
      vi.advanceTimersByTime(300)
    })

    expect(result.current.selectedWords).toBe(1)
    expect(result.current.selectedCharacters).toBe(5)
  })

  it('updates after content changes and the next poll tick', () => {
    view = createView('one')
    setActiveEditorView(view)

    const { result } = renderHook(() => useWordStats())
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(result.current.words).toBe(1)

    act(() => {
      view!.dispatch({ changes: { from: 3, insert: ' two three' } })
      vi.advanceTimersByTime(300)
    })

    expect(result.current.words).toBe(3)
  })

  it('resets to EMPTY_WORD_STATS when the active editor becomes null', () => {
    view = createView('hello')
    setActiveEditorView(view)
    const { result } = renderHook(() => useWordStats())
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(result.current.words).toBe(1)

    act(() => {
      setActiveEditorView(null)
      vi.advanceTimersByTime(300)
    })

    expect(result.current).toEqual(EMPTY_WORD_STATS)
  })
})
