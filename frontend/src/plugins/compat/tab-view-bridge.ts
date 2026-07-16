/**
 * TabViewBridge — Module-level bridge connecting ViewRegistry events to TabProvider dispatching.
 *
 * Problem: ViewRegistry creates/activates plugin views but has no access to React Context
 * (TabProvider). This module provides a callback registry that TabProvider/PluginProvider
 * can subscribe to for receiving plugin view tab lifecycle events.
 *
 * Pattern: Same as realtimeVaultBridge / realtimeChatBridge — module-level mutable Sets.
 *
 * @module tab-view-bridge
 */

// ─── Types ───────────────────────────────────────────────────────────────────

/** Callback invoked when a plugin view should be opened as a tab. */
export type OpenPluginViewTabFn = (
  vaultId: string,
  viewType: string,
  displayText: string,
  icon: string
) => void

/** Callback invoked when a plugin view tab should be closed. */
export type ClosePluginViewTabFn = (vaultId: string, viewType: string) => void

/** Callback invoked when an existing plugin view tab should be activated. */
export type ActivatePluginViewTabFn = (vaultId: string, viewType: string) => void

// ─── Module-Level State ──────────────────────────────────────────────────────

const openSubscribers: Set<OpenPluginViewTabFn> = new Set()
const closeSubscribers: Set<ClosePluginViewTabFn> = new Set()
const activateSubscribers: Set<ActivatePluginViewTabFn> = new Set()

// ─── Registration Functions ──────────────────────────────────────────────────

/**
 * Subscribe to plugin view tab open events.
 * Called by TabProvider/PluginProvider when it mounts.
 */
export function onOpenPluginViewTab(fn: OpenPluginViewTabFn): void {
  openSubscribers.add(fn)
}

/**
 * Unsubscribe from plugin view tab open events.
 * Called by TabProvider/PluginProvider on unmount.
 */
export function offOpenPluginViewTab(fn: OpenPluginViewTabFn): void {
  openSubscribers.delete(fn)
}

/**
 * Subscribe to plugin view tab close events.
 * Called by TabProvider/PluginProvider when it mounts.
 */
export function onClosePluginViewTab(fn: ClosePluginViewTabFn): void {
  closeSubscribers.add(fn)
}

/**
 * Unsubscribe from plugin view tab close events.
 * Called by TabProvider/PluginProvider on unmount.
 */
export function offClosePluginViewTab(fn: ClosePluginViewTabFn): void {
  closeSubscribers.delete(fn)
}

/**
 * Subscribe to plugin view tab activate events (for tab deduplication).
 * Called by TabProvider/PluginProvider when it mounts.
 */
export function onActivatePluginViewTab(fn: ActivatePluginViewTabFn): void {
  activateSubscribers.add(fn)
}

/**
 * Unsubscribe from plugin view tab activate events.
 * Called by TabProvider/PluginProvider on unmount.
 */
export function offActivatePluginViewTab(fn: ActivatePluginViewTabFn): void {
  activateSubscribers.delete(fn)
}

// ─── Dispatch Functions (called by ViewRegistry) ─────────────────────────────

/**
 * Dispatches an open plugin view tab event to all registered subscribers.
 * Called by ViewRegistry when a plugin view should be opened as a new tab.
 */
export function dispatchOpenPluginViewTab(
  vaultId: string,
  viewType: string,
  displayText: string,
  icon: string
): void {
  for (const fn of openSubscribers) {
    fn(vaultId, viewType, displayText, icon)
  }
}

/**
 * Dispatches a close plugin view tab event to all registered subscribers.
 * Called by ViewRegistry when a plugin view tab should be closed.
 */
export function dispatchClosePluginViewTab(vaultId: string, viewType: string): void {
  for (const fn of closeSubscribers) {
    fn(vaultId, viewType)
  }
}

/**
 * Dispatches an activate plugin view tab event to all registered subscribers.
 * Called for tab deduplication — activates an existing tab instead of creating a new one.
 */
export function dispatchActivatePluginViewTab(vaultId: string, viewType: string): void {
  for (const fn of activateSubscribers) {
    fn(vaultId, viewType)
  }
}
