import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import React from 'react'
import { TabProvider, useTabContext } from './tabContext'
import { initialTabState } from './tabState'

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
})
