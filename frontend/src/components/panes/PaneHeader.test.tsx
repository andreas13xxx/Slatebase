import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PaneTreeProvider } from '../../state/paneTreeContext'
import { createPane } from '../../state/paneTreeState'
import { initialTabState, type TabEntry } from '../../state/tabState'
import type { VaultInfo } from '../../types'
import { PaneHeader } from './PaneHeader'
import { isBreadcrumbPath } from './breadcrumbPath'

vi.mock('../../state/navigationHistoryContext', () => ({
  useNavigationHistory: () => ({ goBack: vi.fn(), goForward: vi.fn(), canGoBack: false, canGoForward: false }),
}))

function makeTab(vaultId: string, filePath: string): TabEntry {
  return {
    id: `${vaultId}::${filePath}`, vaultId, filePath, fileName: filePath, mode: 'view',
    isBinary: false, content: '', editBuffer: null, loading: false, error: null, pinned: false,
  }
}

const vaults = [
  { id: 'v1', name: 'Alpha' },
  { id: 'v2', name: 'Beta' },
] as VaultInfo[]

function renderHeader(tab: TabEntry | null, onSegmentClick = vi.fn()) {
  const tabs = tab ? [tab] : []
  const pane = createPane('p1', { ...initialTabState, tabs, activeTabId: tab?.id ?? null })
  render(
    <PaneTreeProvider>
      <PaneHeader pane={pane} vaults={vaults} onSegmentClick={onSegmentClick} />
    </PaneTreeProvider>,
  )
  return onSegmentClick
}

describe('isBreadcrumbPath', () => {
  it('accepts file paths and rejects the graph and plugin views', () => {
    expect(isBreadcrumbPath('notes/a.md')).toBe(true)
    expect(isBreadcrumbPath('__graph__')).toBe(false)
    expect(isBreadcrumbPath('__view::my-plugin')).toBe(false)
  })
})

describe('PaneHeader', () => {
  it('renders navigation, the pane menu and the breadcrumb of the pane\'s own tab', () => {
    renderHeader(makeTab('v2', 'notes/a.md'))
    expect(screen.getByLabelText('Zurück')).toBeTruthy()
    expect(screen.getByRole('button', { name: /menü|menu/i })).toBeTruthy()
    expect(screen.getByText('Beta')).toBeTruthy()
    expect(screen.getByText('a.md')).toBeTruthy()
  })

  it('reports the pane tab\'s vault with a segment click, not the selected vault', () => {
    const onSegmentClick = renderHeader(makeTab('v2', 'notes/a.md'))
    fireEvent.click(screen.getByText('Beta'))
    expect(onSegmentClick).toHaveBeenCalledWith('', 'v2')
  })

  it('shows no breadcrumb for an empty pane, the graph tab or an unknown vault', () => {
    renderHeader(null)
    expect(screen.queryByText('Beta')).toBeNull()
    expect(screen.getByLabelText('Zurück')).toBeTruthy()
  })

  it('shows no breadcrumb for the graph tab', () => {
    renderHeader(makeTab('v1', '__graph__'))
    expect(screen.queryByText('Alpha')).toBeNull()
  })

  it('shows no breadcrumb when the tab\'s vault is unknown', () => {
    renderHeader(makeTab('gone', 'a.md'))
    expect(screen.queryByText('a.md')).toBeNull()
  })
})
