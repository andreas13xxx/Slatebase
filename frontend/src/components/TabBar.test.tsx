import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TabBar, TAB_DRAG_MIME } from './TabBar'
import { TabContext } from '../state/tabContext'
import { I18nProvider } from '../i18n'
import { initialTabState, type TabState, type TabEntry, type TabAction } from '../state/tabState'

function makeTab(vaultId: string, filePath: string): TabEntry {
  return {
    id: `${vaultId}::${filePath}`,
    vaultId,
    filePath,
    fileName: filePath,
    mode: 'view',
    isBinary: false,
    content: '',
    editBuffer: null,
    loading: false,
    error: null,
    pinned: false,
  }
}

/** Mount a pane-local TabBar with the given tab state and a captured dispatch. */
function renderPaneBar(
  tabs: TabEntry[],
  paneId: string,
  onMoveTabToPane: ReturnType<typeof vi.fn>,
  dispatch: ReturnType<typeof vi.fn>,
) {
  const tabState: TabState = { ...initialTabState, tabs, activeTabId: tabs[0]?.id ?? null }
  return render(
    <I18nProvider>
      <TabContext.Provider value={{ tabState, tabDispatch: dispatch as unknown as (a: TabAction) => void }}>
        <TabBar
          settingsTabs={[]}
          isShowingSettings={false}
          onActivateFileTab={() => {}}
          paneId={paneId}
          onMoveTabToPane={onMoveTabToPane}
        />
      </TabContext.Provider>
    </I18nProvider>,
  )
}

/** A minimal dataTransfer mock carrying a cross-pane tab payload. */
function tabDataTransfer(payload: { paneId: string; tabId: string }) {
  const store: Record<string, string> = {
    [TAB_DRAG_MIME]: JSON.stringify(payload),
    'text/plain': '0',
  }
  return {
    types: Object.keys(store),
    getData: (type: string) => store[type] ?? '',
    setData: (type: string, value: string) => { store[type] = value },
    dropEffect: 'none',
    effectAllowed: 'all',
  }
}

describe('TabBar cross-pane drag', () => {
  it('calls onMoveTabToPane when a tab from another pane is dropped on this bar', () => {
    const onMove = vi.fn()
    const dispatch = vi.fn()
    renderPaneBar([makeTab('v', 'b.md')], 'p2', onMove, dispatch)
    const tab = screen.getByRole('tab', { name: 'b.md' })
    // A foreign payload (from p1) dropped onto p2's tab → move, not reorder.
    fireEvent.drop(tab, { dataTransfer: tabDataTransfer({ paneId: 'p1', tabId: 'v::a.md' }) })
    expect(onMove).toHaveBeenCalledWith('p1', 'p2', 'v::a.md', 0)
    // It must NOT be treated as a same-pane reorder.
    expect(dispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'REORDER_TABS' }),
    )
  })

  it('reorders within the pane when the drop comes from the same pane', () => {
    const onMove = vi.fn()
    const dispatch = vi.fn()
    renderPaneBar([makeTab('v', 'a.md'), makeTab('v', 'b.md')], 'p1', onMove, dispatch)
    const tabs = screen.getAllByRole('tab')
    // Start dragging the first tab (sets dragIndexRef = 0), then drop on the second.
    fireEvent.dragStart(tabs[0]!, { dataTransfer: tabDataTransfer({ paneId: 'p1', tabId: 'v::a.md' }) })
    fireEvent.drop(tabs[1]!, { dataTransfer: tabDataTransfer({ paneId: 'p1', tabId: 'v::a.md' }) })
    expect(dispatch).toHaveBeenCalledWith({ type: 'REORDER_TABS', payload: { fromIndex: 0, toIndex: 1 } })
    expect(onMove).not.toHaveBeenCalled()
  })

  it('renders an empty pane-local bar as a drop target (does not collapse to null)', () => {
    const { container } = renderPaneBar([], 'p3', vi.fn(), vi.fn())
    expect(container.querySelector('.tab-bar')).not.toBeNull()
  })
})
