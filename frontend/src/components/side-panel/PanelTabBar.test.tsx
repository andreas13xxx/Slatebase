import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PanelTabBar } from './PanelTabBar'
import type { PanelViewId } from '../../state/panelState'

const leftTabs: PanelViewId[] = ['explorer', 'favorites', 'recent']
const rightTabs: PanelViewId[] = ['outline', 'links', 'tags', 'properties', 'search']

function renderTabBar(overrides: Partial<React.ComponentProps<typeof PanelTabBar>> = {}) {
  const props = {
    tabs: leftTabs,
    activeTab: 'explorer' as PanelViewId,
    onTabClick: vi.fn(),
    onTabReorder: vi.fn(),
    onTabSplit: vi.fn(),
    panelWidth: 260,
    ...overrides,
  }
  return { ...render(<PanelTabBar {...props} />), props }
}

describe('PanelTabBar', () => {
  it('renders all left-side built-in tabs with correct labels', () => {
    renderTabBar()

    expect(screen.getByRole('tab', { name: 'Dateien' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Favoriten' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Zuletzt geöffnet' })).toBeInTheDocument()
  })

  // The whole point of unifying TabBar: a right-side built-in (previously only
  // ever passed to ContextPanelTabBar) must render identically here — this is
  // the same component instance either panel uses.
  it('renders all right-side built-in tabs with correct labels', () => {
    renderTabBar({ tabs: rightTabs, activeTab: 'outline' })

    expect(screen.getByRole('tab', { name: 'Gliederung' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Links' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Tags' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Eigenschaften' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Suche' })).toBeInTheDocument()
  })

  // Regression guard for the cross-panel-move feature: since a built-in view
  // can now show up in tabs it "shouldn't" originally belong to (e.g. explorer
  // dragged into a section that also lists outline), TAB_CONFIG must cover all
  // 8 built-ins in one map — this mixed list would previously only have been
  // possible in ContextPanelTabBar (missing explorer) or SidebarPanelTabBar
  // (missing outline), each of which would return null / render nothing for
  // the other side's id.
  it('renders a mixed left+right tab list without gaps', () => {
    renderTabBar({ tabs: ['explorer', 'outline'], activeTab: 'explorer' })

    expect(screen.getByRole('tab', { name: 'Dateien' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Gliederung' })).toBeInTheDocument()
  })

  it('marks the active tab with aria-selected', () => {
    renderTabBar({ activeTab: 'favorites' })

    expect(screen.getByRole('tab', { name: 'Favoriten' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Dateien' })).toHaveAttribute('aria-selected', 'false')
  })

  it('calls onTabClick when a tab is clicked', async () => {
    const user = userEvent.setup()
    const { props } = renderTabBar()

    await user.click(screen.getByRole('tab', { name: 'Favoriten' }))

    expect(props.onTabClick).toHaveBeenCalledWith('favorites')
  })

  // Regression test: TAB_CONFIG[viewId] used to be looked up unconditionally
  // for every tab id — a `plugin:${string}` id has no entry, so `config.icon`
  // threw on render instead of falling back to plugin metadata.
  it('renders a plugin tab using its display text and does not crash', () => {
    renderTabBar({
      tabs: ['explorer', 'plugin:my-view'],
      activeTab: 'plugin:my-view',
      pluginViewMeta: new Map([
        ['my-view', { viewType: 'my-view', displayText: 'My Plugin View', icon: 'star' }],
      ]),
    })

    expect(screen.getByRole('tab', { name: 'My Plugin View' })).toBeInTheDocument()
  })

  it('falls back to the view type as the label when no plugin metadata is provided', () => {
    renderTabBar({
      tabs: ['plugin:my-view'],
      activeTab: 'plugin:my-view',
    })

    expect(screen.getByRole('tab', { name: 'my-view' })).toBeInTheDocument()
  })
})
