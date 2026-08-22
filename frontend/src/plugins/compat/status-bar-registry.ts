/**
 * StatusBarRegistry — Module-level registry for plugin status bar items.
 *
 * Plugins call `addStatusBarItem()` during their `onload()` and receive an
 * HTMLElement they can manipulate. The registry stores these entries and notifies
 * listeners (StatusBar component) when the set of items changes.
 *
 * Follows the module-level bridge pattern (like ribbon-icon-registry).
 *
 * @module status-bar-registry
 */

// ─── Types ─────────────────────────────────────────────────────────────────────

/** A registered status bar item entry. */
export interface StatusBarItemEntry {
  /** The plugin that registered this item */
  pluginId: string
  /** The HTMLElement the plugin populates with content */
  element: HTMLElement
}

/** Listener notified when status bar items change. */
export type StatusBarChangeListener = (items: StatusBarItemEntry[]) => void

// ─── Module-Level State ────────────────────────────────────────────────────────

/** All registered status bar items (ordered by registration time). */
const items: StatusBarItemEntry[] = []

/** Set of change listeners. */
const listeners = new Set<StatusBarChangeListener>()

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Register a status bar item for a plugin.
 * Returns the HTMLElement that the plugin populates with content.
 * The element is made keyboard-accessible: focusable via tabIndex and
 * Enter/Space trigger a synthetic click (for plugins that attach onClick).
 *
 * @param pluginId - The plugin registering the item
 * @returns HTMLElement the plugin can modify (textContent, innerHTML, children)
 */
export function addStatusBarItem(pluginId: string): HTMLElement {
  const element = document.createElement('div')
  // `status-bar-item` is Obsidian's class for this element and plugin
  // stylesheets target it; `status-bar__plugin-item` is ours and carries the
  // actual styling. Both, so plugin CSS matches without giving up our own.
  element.className = 'status-bar__plugin-item status-bar-item'
  element.dataset.pluginId = pluginId
  element.setAttribute('role', 'button')
  element.tabIndex = 0
  element.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      element.click()
    }
  })

  const entry: StatusBarItemEntry = { pluginId, element }
  items.push(entry)
  notifyListeners()

  return element
}

/**
 * Remove all status bar items for a given plugin.
 * Called during plugin deactivation/cleanup.
 *
 * @param pluginId - The plugin whose items should be removed
 */
export function removeStatusBarItemsForPlugin(pluginId: string): void {
  let changed = false
  for (let i = items.length - 1; i >= 0; i--) {
    if (items[i]?.pluginId === pluginId) {
      items.splice(i, 1)
      changed = true
    }
  }
  if (changed) {
    notifyListeners()
  }
}

/**
 * Get all currently registered status bar items.
 */
export function getStatusBarItems(): StatusBarItemEntry[] {
  return [...items]
}

/**
 * Subscribe to status bar item changes.
 * Returns an unsubscribe function.
 *
 * @param listener - Called with the current items whenever the set changes
 */
export function onStatusBarItemsChange(listener: StatusBarChangeListener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * Clear all status bar items (e.g. on vault switch).
 */
export function clearAllStatusBarItems(): void {
  if (items.length === 0) return
  items.length = 0
  notifyListeners()
}

// ─── Internal ──────────────────────────────────────────────────────────────────

function notifyListeners(): void {
  const snapshot = [...items]
  for (const listener of listeners) {
    try {
      listener(snapshot)
    } catch (err) {
      console.error('[StatusBarRegistry] Listener threw:', err)
    }
  }
}
