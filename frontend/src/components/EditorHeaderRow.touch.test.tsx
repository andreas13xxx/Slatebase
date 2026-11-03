import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useEffect } from 'react'
import { PaneTreeProvider, usePaneTree } from '../state/paneTreeContext'
import { getActivePaneTabState } from '../state/paneTreeState'
import { EditorHeaderRow } from './EditorHeaderRow'
import { AppContext, initialState } from '../state'
import type { IApiClient } from '../api'

vi.mock('../state/navigationHistoryContext', () => ({
  useNavigationHistory: () => ({ goBack: vi.fn(), goForward: vi.fn(), canGoBack: false, canGoForward: false }),
}))

/** Opens one tab in the active pane. */
function Seed({ filePath }: { filePath: string }) {
  const { paneTree, paneTreeDispatch } = usePaneTree()
  useEffect(() => {
    const paneId = paneTree.activePaneId
    paneTreeDispatch({ type: 'PANE_TAB_ACTION', payload: { paneId, action: { type: 'OPEN_TAB', payload: { vaultId: 'v', filePath, fileName: filePath } } } })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const tabState = getActivePaneTabState(paneTree)
  const tab = tabState?.tabs.find((t) => t.id === tabState.activeTabId)
  // A freshly opened tab starts in reading mode until its content has loaded.
  useEffect(() => {
    if (tab && tab.mode === 'reading') {
      paneTreeDispatch({ type: 'PANE_TAB_ACTION', payload: { paneId: paneTree.activePaneId, action: { type: 'SET_MODE', payload: { tabId: tab.id, mode: 'live-preview' } } } })
    }
  }, [tab, paneTree.activePaneId, paneTreeDispatch])
  return null
}

function renderWithTab(filePath: string) {
  return render(
    <PaneTreeProvider>
      <Seed filePath={filePath} />
      <EditorHeaderRow />
    </PaneTreeProvider>,
  )
}

describe('EditorHeaderRow text-actions button', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('asks the editor of the active pane to open its menu', () => {
    const handler = vi.fn()
    window.addEventListener('slatebase:editor-command', handler)
    renderWithTab('note.md')
    fireEvent.click(screen.getByRole('button', { name: /textaktionen|text actions/i }))
    window.removeEventListener('slatebase:editor-command', handler)
    const detail = (handler.mock.calls[0]?.[0] as CustomEvent<{ action: string; paneId: string }>).detail
    expect(detail.action).toBe('showContextMenu')
    expect(typeof detail.paneId).toBe('string')
  })

  it('stays disabled for tabs that are not markdown', () => {
    renderWithTab('board.canvas')
    expect((screen.getByRole('button', { name: /textaktionen|text actions/i }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('stays disabled for a read-only vault', () => {
    const state = { ...initialState, vaults: [{ id: 'v', name: 'V', permission: 'read' }] } as unknown as typeof initialState
    render(
      <AppContext.Provider value={{ state, dispatch: vi.fn(), apiClient: {} as IApiClient }}>
        <PaneTreeProvider>
          <Seed filePath="note.md" />
          <EditorHeaderRow />
        </PaneTreeProvider>
      </AppContext.Provider>,
    )
    expect((screen.getByRole('button', { name: /textaktionen|text actions/i }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('targets the pane named by the paneId prop', () => {
    const handler = vi.fn()
    window.addEventListener('slatebase:editor-command', handler)
    render(
      <PaneTreeProvider>
        <Seed filePath="note.md" />
        <EditorHeaderRow paneId="other-pane" />
      </PaneTreeProvider>,
    )
    // "other-pane" has no tab, so the button is disabled and must not fire.
    const button = screen.getByRole('button', { name: /textaktionen|text actions/i }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
    fireEvent.click(button)
    window.removeEventListener('slatebase:editor-command', handler)
    expect(handler).not.toHaveBeenCalled()
  })
})
