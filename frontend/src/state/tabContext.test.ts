import { describe, it, expect } from 'vitest'
import { renderHook, act, render } from '@testing-library/react'
import React from 'react'
import type { Dispatch } from 'react'
import { TabProvider, useTabContext } from './tabContext'
import { initialTabState, type TabAction } from './tabState'

describe('TabProvider and useTabContext', () => {
  it('provides initial tab state', () => {
    const { result } = renderHook(() => useTabContext(), {
      wrapper: ({ children }) => React.createElement(TabProvider, null, children),
    })

    expect(result.current.tabState).toEqual(initialTabState)
    expect(result.current.tabDispatch).toBeTypeOf('function')
  })

  it('throws when useTabContext is used outside TabProvider', () => {
    expect(() => {
      renderHook(() => useTabContext())
    }).toThrow('useTabContext must be used within a TabProvider')
  })

  it('dispatches OPEN_TAB and updates state', () => {
    const { result } = renderHook(() => useTabContext(), {
      wrapper: ({ children }) => React.createElement(TabProvider, null, children),
    })

    act(() => {
      result.current.tabDispatch({
        type: 'OPEN_TAB',
        payload: { vaultId: 'v1', filePath: 'notes/hello.md', fileName: 'hello.md' },
      })
    })

    expect(result.current.tabState.tabs).toHaveLength(1)
    expect(result.current.tabState.tabs[0].fileName).toBe('hello.md')
    expect(result.current.tabState.activeTabId).toBe('v1::notes/hello.md')
  })

  it('dispatches CLOSE_TAB and updates state', () => {
    const { result } = renderHook(() => useTabContext(), {
      wrapper: ({ children }) => React.createElement(TabProvider, null, children),
    })

    act(() => {
      result.current.tabDispatch({
        type: 'OPEN_TAB',
        payload: { vaultId: 'v1', filePath: 'a.md', fileName: 'a.md' },
      })
    })

    act(() => {
      result.current.tabDispatch({
        type: 'CLOSE_TAB',
        payload: { tabId: 'v1::a.md' },
      })
    })

    expect(result.current.tabState.tabs).toHaveLength(0)
    expect(result.current.tabState.activeTabId).toBeNull()
  })

  it('mode toggle dispatches correctly through context', () => {
    const { result } = renderHook(() => useTabContext(), {
      wrapper: ({ children }) => React.createElement(TabProvider, null, children),
    })

    act(() => {
      result.current.tabDispatch({
        type: 'OPEN_TAB',
        payload: { vaultId: 'v1', filePath: 'doc.md', fileName: 'doc.md' },
      })
    })

    // Load content so it's a text file (mode starts as 'view' by default)
    act(() => {
      result.current.tabDispatch({
        type: 'TAB_CONTENT_LOADED',
        payload: { tabId: 'v1::doc.md', content: '# Hello', isBinary: false },
      })
    })

    expect(result.current.tabState.tabs[0].mode).toBe('view')

    act(() => {
      result.current.tabDispatch({
        type: 'TOGGLE_MODE',
        payload: { tabId: 'v1::doc.md' },
      })
    })

    expect(result.current.tabState.tabs[0].mode).toBe('edit')
  })

  it('keeps the context value referentially stable across re-renders with unchanged state', () => {
    // Regression test for AP6a: the provider used to build a fresh { tabState,
    // tabDispatch } object literal on every render, so a memoized consumer
    // would re-render even when neither tabState nor tabDispatch had changed
    // (e.g. when TabProvider's own parent re-renders for unrelated reasons).
    const seenValues: unknown[] = []

    function Consumer() {
      const value = useTabContext()
      seenValues.push(value)
      return null
    }
    const MemoConsumer = React.memo(Consumer)

    function Harness({ tick }: { tick: number }) {
      return React.createElement(
        TabProvider,
        null,
        React.createElement('span', null, tick),
        React.createElement(MemoConsumer),
      )
    }

    const { rerender } = render(React.createElement(Harness, { tick: 0 }))
    expect(seenValues).toHaveLength(1)

    // Re-render TabProvider's parent with no dispatch in between — tabState
    // and tabDispatch are unchanged, so the memoized consumer must not
    // receive a new context value (and therefore must not re-render).
    rerender(React.createElement(Harness, { tick: 1 }))

    expect(seenValues).toHaveLength(1)
  })

  it('documents that UPDATE_EDIT_BUFFER (fired per keystroke) still re-renders every consumer', () => {
    // AP6a's memoization fix removes *spurious* re-renders caused by an
    // unrelated parent re-render. It does not and cannot prevent a re-render
    // when tabState genuinely changes on every keystroke of the active tab's
    // editBuffer — that's a legitimate state change, not the bug this AP
    // targets. Recorded here so the limitation is explicit rather than
    // silently assumed away.
    let renderCount = 0
    let dispatchRef: Dispatch<TabAction> | null = null

    function Consumer() {
      const { tabDispatch } = useTabContext()
      dispatchRef = tabDispatch
      renderCount++
      return null
    }
    const MemoConsumer = React.memo(Consumer)

    render(React.createElement(TabProvider, null, React.createElement(MemoConsumer)))
    expect(renderCount).toBe(1)

    act(() => {
      dispatchRef!({
        type: 'OPEN_TAB',
        payload: { vaultId: 'v1', filePath: 'doc.md', fileName: 'doc.md' },
      })
    })
    expect(renderCount).toBe(2)

    // Simulate one keystroke's worth of editing.
    act(() => {
      dispatchRef!({
        type: 'UPDATE_EDIT_BUFFER',
        payload: { tabId: 'v1::doc.md', content: 'a' },
      })
    })
    expect(renderCount).toBe(3)
  })
})
