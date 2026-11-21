import { describe, it, expect, afterEach } from 'vitest'
import { findTabHeaderEl, findTabTitleEl, findTabIconEl } from './tab-header-dom'
import { ViewRegistry, WorkspaceLeaf } from './view-registry'

function mountTab(path: string, active = false): HTMLElement {
  const tab = document.createElement('div')
  tab.className = `tab-bar-tab${active ? ' tab-bar-tab--active' : ''}`
  tab.setAttribute('aria-label', path)
  tab.innerHTML = '<span class="tab-bar-tab-icon"></span><span class="tab-bar-tab-label"></span>'
  document.body.appendChild(tab)
  return tab
}

describe('tab-header-dom', () => {
  afterEach(() => { document.body.innerHTML = '' })

  it('finds the tab by path and prefers the active one', () => {
    mountTab('a.md')
    const active = mountTab('a.md', true)
    expect(findTabHeaderEl('a.md')).toBe(active)
    expect(findTabHeaderEl('missing.md')).toBeNull()
    expect(findTabHeaderEl(null)).toBeNull()
  })

  it('finds title and icon inside a tab', () => {
    const tab = mountTab('a.md')
    expect(findTabTitleEl(tab)).toBe(tab.querySelector('.tab-bar-tab-label'))
    expect(findTabIconEl(tab)).toBe(tab.querySelector('.tab-bar-tab-icon'))
  })

  it('leaf.tabHeaderEl returns the real tab for a plugin view and a placeholder otherwise', () => {
    const registry = new ViewRegistry()
    const leaf = new WorkspaceLeaf({}, registry, 'main')
    leaf.view = { getViewType: () => 'my-view' } as unknown as WorkspaceLeaf['view']
    const placeholder = leaf.tabHeaderEl
    expect(placeholder).toBeInstanceOf(HTMLElement)
    expect(placeholder.isConnected).toBe(false)

    const tab = mountTab('__view::my-view', true)
    expect(leaf.tabHeaderEl).toBe(tab)
    expect(leaf.tabHeaderInnerTitleEl).toBe(tab.querySelector('.tab-bar-tab-label'))
    expect(leaf.tabHeaderInnerIconEl).toBe(tab.querySelector('.tab-bar-tab-icon'))
  })
})
