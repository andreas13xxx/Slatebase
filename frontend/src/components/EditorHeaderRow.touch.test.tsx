import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useEffect } from 'react'
import { PaneTreeProvider, usePaneTree } from '../state/paneTreeContext'
import { getActivePaneTabState } from '../state/paneTreeState'
import { EditorHeaderRow } from './EditorHeaderRow'

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
})
