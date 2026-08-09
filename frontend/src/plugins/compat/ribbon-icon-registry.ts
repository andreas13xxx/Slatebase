/**
 * RibbonIconRegistry — Module-level registry for plugin ribbon icons.
 *
 * Plugins call `addRibbonIcon(icon, title, callback)` during their `onload()`.
 * The registry stores these entries and notifies listeners (SidebarToolbar)
 * when the set of ribbon icons changes.
 *
 * Follows the module-level bridge pattern (like tab-view-bridge, realtimeVaultBridge).
 *
 * @module ribbon-icon-registry
 */

// ─── Types ─────────────────────────────────────────────────────────────────────

/** A registered ribbon icon entry. */
export interface RibbonIconEntry {
  /** The plugin that registered this icon */
  pluginId: string
  /** Lucide icon name (or Obsidian icon name) */
  icon: string
  /** Tooltip text for the icon button */
  title: string
  /** Callback invoked when the icon is clicked */
  callback: () => void
  /** The HTMLElement returned to the plugin (for compatibility) */
  element: HTMLElement
}

/** Listener notified when ribbon icons change. */
export type RibbonIconChangeListener = (icons: RibbonIconEntry[]) => void

// ─── Module-Level State ────────────────────────────────────────────────────────

/** All registered ribbon icons (ordered by registration time). */
const icons: RibbonIconEntry[] = []

/** Set of change listeners. */
const listeners = new Set<RibbonIconChangeListener>()

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Register a ribbon icon for a plugin.
 * Returns the HTMLElement stub (for Obsidian API compatibility).
 *
 * @param pluginId - The plugin registering the icon
 * @param icon - Icon name (Lucide/Obsidian icon identifier)
 * @param title - Tooltip text
 * @param callback - Click handler
 * @returns HTMLElement (stub for compat, not rendered in DOM)
 */
export function addRibbonIcon(
  pluginId: string,
  icon: string,
  title: string,
  callback: () => void,
): HTMLElement {
  const element = document.createElement('div')
  element.setAttribute('aria-label', title)

  const entry: RibbonIconEntry = { pluginId, icon, title, callback, element }
  icons.push(entry)
  notifyListeners()

  return element
}

/**
 * Remove all ribbon icons for a given plugin.
 * Called during plugin deactivation/cleanup.
 *
 * @param pluginId - The plugin whose icons should be removed
 */
export function removeRibbonIconsForPlugin(pluginId: string): void {
  let changed = false
  for (let i = icons.length - 1; i >= 0; i--) {
    if (icons[i]?.pluginId === pluginId) {
      icons.splice(i, 1)
      changed = true
    }
  }
  if (changed) {
    notifyListeners()
  }
}

/**
 * Get all currently registered ribbon icons.
 */
export function getRibbonIcons(): RibbonIconEntry[] {
  return [...icons]
}

/**
 * Subscribe to ribbon icon changes.
 * Returns an unsubscribe function.
 *
 * @param listener - Called with the current icons whenever the set changes
 */
export function onRibbonIconsChange(listener: RibbonIconChangeListener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * Clear all ribbon icons (e.g. on vault switch).
 */
export function clearAllRibbonIcons(): void {
  if (icons.length === 0) return
  icons.length = 0
  notifyListeners()
}

// ─── Internal ──────────────────────────────────────────────────────────────────

function notifyListeners(): void {
  const snapshot = [...icons]
  for (const listener of listeners) {
    try {
      listener(snapshot)
    } catch (err) {
      console.error('[RibbonIconRegistry] Listener threw:', err)
    }
  }
}
