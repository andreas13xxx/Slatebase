import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ContextPanelTabBar } from './ContextPanelTabBar'
import type { ContextPanelViewId } from '../../state/contextPanelState'

const defaultTabs: ContextPanelViewId[] = ['outline', 'links', 'tags', 'properties']

function renderTabBar(overrides: Partial<React.ComponentProps<typeof ContextPanelTabBar>> = {}) {
  const props = {
    tabs: defaultTabs,
    activeTab: 'outline' as ContextPanelViewId,
    onTabClick: vi.fn(),
    onTabReorder: vi.fn(),
    onTabSplit: vi.fn(),
    panelWidth: 300,
    ...overrides,
  }
  return { ...render(<ContextPanelTabBar {...props} />), props }
}

describe('ContextPanelTabBar', () => {
  it('renders all four tabs with correct labels', () => {
    renderTabBar()

    expect(screen.getByRole('tab', { name: 'Gliederung' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Links' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Tags' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Eigenschaften' })).toBeInTheDocument()
  })

  it('marks the active tab with aria-selected', () => {
    renderTabBar({ activeTab: 'tags' })

    expect(screen.getByRole('tab', { name: 'Tags' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Gliederung' })).toHaveAttribute('aria-selected', 'false')
  })

  it('calls onTabClick when a tab is clicked', async () => {
    const user = userEvent.setup()
    const { props } = renderTabBar()

    await user.click(screen.getByRole('tab', { name: 'Links' }))

    expect(props.onTabClick).toHaveBeenCalledWith('links')
  })

  it('applies active class to the active tab', () => {
    renderTabBar({ activeTab: 'properties' })

    const activeTab = screen.getByRole('tab', { name: 'Eigenschaften' })
    expect(activeTab.className).toContain('context-panel-tab--active')
  })

  it('always renders in icon-only mode (no text labels visible)', () => {
    renderTabBar({ panelWidth: 180 })

    // Tab bar always has icon-only class
    const tabBar = screen.getByRole('tablist')
    expect(tabBar.className).toContain('context-panel-tab-bar--icon-only')

    // Tab buttons should still exist (accessible by aria-label)
    expect(screen.getByRole('tab', { name: 'Gliederung' })).toBeInTheDocument()

    // But text labels should not be visible in the DOM
    expect(screen.queryByText('Gliederung')).not.toBeInTheDocument()
    expect(screen.queryByText('Links')).not.toBeInTheDocument()
  })

  it('shows icon-only mode regardless of panelWidth', () => {
    renderTabBar({ panelWidth: 200 })

    // Labels are never rendered as text — only as title/tooltip
    expect(screen.queryByText('Gliederung')).not.toBeInTheDocument()
    expect(screen.queryByText('Links')).not.toBeInTheDocument()
    expect(screen.queryByText('Tags')).not.toBeInTheDocument()
    expect(screen.queryByText('Eigenschaften')).not.toBeInTheDocument()

    // But tabs are accessible via aria-label
    expect(screen.getByRole('tab', { name: 'Gliederung' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Links' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Tags' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Eigenschaften' })).toBeInTheDocument()
  })

  it('sets draggable=false when only one tab', () => {
    renderTabBar({ tabs: ['outline'] })

    const tab = screen.getByRole('tab', { name: 'Gliederung' })
    expect(tab).toHaveAttribute('draggable', 'false')
  })

  it('sets draggable=true when multiple tabs', () => {
    renderTabBar()

    const tab = screen.getByRole('tab', { name: 'Gliederung' })
    expect(tab).toHaveAttribute('draggable', 'true')
  })

  it('renders tabs in the order provided', () => {
    renderTabBar({ tabs: ['properties', 'tags', 'links', 'outline'] })

    const tabs = screen.getAllByRole('tab')
    expect(tabs[0]).toHaveAttribute('aria-label', 'Eigenschaften')
    expect(tabs[1]).toHaveAttribute('aria-label', 'Tags')
    expect(tabs[2]).toHaveAttribute('aria-label', 'Links')
    expect(tabs[3]).toHaveAttribute('aria-label', 'Gliederung')
  })

  it('has a tablist role on the container', () => {
    renderTabBar()

    expect(screen.getByRole('tablist')).toBeInTheDocument()
  })
})
