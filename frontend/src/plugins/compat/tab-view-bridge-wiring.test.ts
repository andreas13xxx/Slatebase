/**
 * Tests for the TabViewBridge → TabProvider wiring in PluginProvider.
 *
 * Verifies that plugin view lifecycle events (open/close/activate) dispatched
 * through the TabViewBridge correctly create/remove/activate tabs.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  onOpenPluginViewTab,
  offOpenPluginViewTab,
  onClosePluginViewTab,
  offClosePluginViewTab,
  onActivatePluginViewTab,
  offActivatePluginViewTab,
  dispatchOpenPluginViewTab,
  dispatchClosePluginViewTab,
  dispatchActivatePluginViewTab,
} from './tab-view-bridge'
import type {
  OpenPluginViewTabFn,
  ClosePluginViewTabFn,
  ActivatePluginViewTabFn,
} from './tab-view-bridge'
import { tabReducer, initialTabState, generateTabId } from '../../state/tabState'
import type { TabState, TabAction } from '../../state/tabState'

describe('TabViewBridge wiring', () => {
  // Simulate what PluginProvider does: subscribe to bridge events and dispatch tab actions.
  // We use a manual dispatch that feeds into the reducer.
  let state: TabState
  let actions: TabAction[]
  let openHandler: OpenPluginViewTabFn
  let closeHandler: ClosePluginViewTabFn
  let activateHandler: ActivatePluginViewTabFn

  const vaultId = 'test-vault-123'

  function dispatch(action: TabAction) {
    actions.push(action)
    state = tabReducer(state, action)
  }

  beforeEach(() => {
    state = initialTabState
    actions = []

    // Simulate the wiring logic from PluginProvider
    openHandler = (_vaultId, viewType, displayText, _icon) => {
      const virtualPath = `__view::${viewType}`
      const existingTab = state.tabs.find(
        t => t.filePath === virtualPath && t.vaultId === vaultId
      )
      if (existingTab) {
        dispatch({ type: 'ACTIVATE_TAB', payload: { tabId: existingTab.id } })
        return
      }
      dispatch({
        type: 'OPEN_TAB',
        payload: { vaultId, filePath: virtualPath, fileName: displayText },
      })
    }

    closeHandler = (_vaultId, viewType) => {
      const virtualPath = `__view::${viewType}`
      const tab = state.tabs.find(
        t => t.filePath === virtualPath && t.vaultId === vaultId
      )
      if (tab) {
        dispatch({ type: 'CLOSE_TAB', payload: { tabId: tab.id } })
      }
    }

    activateHandler = (_vaultId, viewType) => {
      const virtualPath = `__view::${viewType}`
      const tab = state.tabs.find(
        t => t.filePath === virtualPath && t.vaultId === vaultId
      )
      if (tab) {
        dispatch({ type: 'ACTIVATE_TAB', payload: { tabId: tab.id } })
      }
    }

    onOpenPluginViewTab(openHandler)
    onClosePluginViewTab(closeHandler)
    onActivatePluginViewTab(activateHandler)
  })

  afterEach(() => {
    offOpenPluginViewTab(openHandler)
    offClosePluginViewTab(closeHandler)
    offActivatePluginViewTab(activateHandler)
  })

  it('opens a new tab when dispatchOpenPluginViewTab is called', () => {
    dispatchOpenPluginViewTab(vaultId, 'calendar', 'Calendar', 'calendar-icon')

    expect(state.tabs).toHaveLength(1)
    expect(state.tabs[0].filePath).toBe('__view::calendar')
    expect(state.tabs[0].fileName).toBe('Calendar')
    expect(state.tabs[0].vaultId).toBe(vaultId)
    expect(state.activeTabId).toBe(generateTabId(vaultId, '__view::calendar'))
  })

  it('deduplicates: activates existing tab instead of creating a new one', () => {
    // Open the tab first
    dispatchOpenPluginViewTab(vaultId, 'calendar', 'Calendar', 'calendar-icon')
    expect(state.tabs).toHaveLength(1)

    // Open the same view type again — should NOT create a second tab
    dispatchOpenPluginViewTab(vaultId, 'calendar', 'Calendar', 'calendar-icon')
    expect(state.tabs).toHaveLength(1)

    // Should have dispatched ACTIVATE_TAB for the second call
    expect(actions[1].type).toBe('ACTIVATE_TAB')
  })

  it('closes a plugin view tab when dispatchClosePluginViewTab is called', () => {
    dispatchOpenPluginViewTab(vaultId, 'kanban', 'Kanban Board', 'kanban-icon')
    expect(state.tabs).toHaveLength(1)

    dispatchClosePluginViewTab(vaultId, 'kanban')
    expect(state.tabs).toHaveLength(0)
    expect(state.activeTabId).toBeNull()
  })

  it('activates an existing tab when dispatchActivatePluginViewTab is called', () => {
    // Open two plugin views
    dispatchOpenPluginViewTab(vaultId, 'calendar', 'Calendar', 'calendar-icon')
    dispatchOpenPluginViewTab(vaultId, 'kanban', 'Kanban Board', 'kanban-icon')
    expect(state.activeTabId).toBe(generateTabId(vaultId, '__view::kanban'))

    // Activate the first one
    dispatchActivatePluginViewTab(vaultId, 'calendar')
    expect(state.activeTabId).toBe(generateTabId(vaultId, '__view::calendar'))
  })

  it('does nothing when closing a non-existent plugin view tab', () => {
    const initialActions = actions.length
    dispatchClosePluginViewTab(vaultId, 'nonexistent')
    expect(actions.length).toBe(initialActions)
    expect(state.tabs).toHaveLength(0)
  })

  it('does nothing when activating a non-existent plugin view tab', () => {
    const initialActions = actions.length
    dispatchActivatePluginViewTab(vaultId, 'nonexistent')
    expect(actions.length).toBe(initialActions)
  })

  it('unsubscribes correctly on cleanup', () => {
    // Remove subscribers
    offOpenPluginViewTab(openHandler)
    offClosePluginViewTab(closeHandler)
    offActivatePluginViewTab(activateHandler)

    // Dispatching should not reach our handlers
    dispatchOpenPluginViewTab(vaultId, 'calendar', 'Calendar', 'icon')
    expect(state.tabs).toHaveLength(0)
    expect(actions).toHaveLength(0)

    // Re-register for the afterEach cleanup to work cleanly
    onOpenPluginViewTab(openHandler)
    onClosePluginViewTab(closeHandler)
    onActivatePluginViewTab(activateHandler)
  })

  it('uses __view:: prefix for virtual path consistently', () => {
    dispatchOpenPluginViewTab(vaultId, 'my-custom-view', 'My View', 'icon')

    const tab = state.tabs[0]
    expect(tab.filePath).toBe('__view::my-custom-view')
    expect(tab.id).toBe(`${vaultId}::__view::my-custom-view`)
  })
})
