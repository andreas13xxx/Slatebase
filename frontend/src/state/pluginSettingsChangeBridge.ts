/**
 * Module-level bridge between RealtimeProvider (SSE `plugin-settings:change`
 * events) and the plugin compat layer.
 *
 * Problem: RealtimeProvider sits above PluginProvider in the component tree,
 * so it cannot directly call into the plugin loader. This module provides a
 * callback registry PluginProvider subscribes to instead.
 *
 * Pattern: Same as realtimeVaultBridge.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

/** plugin-settings:change event data from SSE. */
export interface PluginSettingsChangeEvent {
  vaultId: string
  pluginId: string
}

/** Callback for incoming plugin-settings:change events via SSE. */
export type PluginSettingsChangeCallback = (event: PluginSettingsChangeEvent) => void

// ─── Module-Level State ──────────────────────────────────────────────────────

const callbacks: Set<PluginSettingsChangeCallback> = new Set()

// ─── Registration Functions ──────────────────────────────────────────────────

/**
 * Subscribe to incoming plugin-settings:change events.
 * Returns an unsubscribe function.
 */
export function onPluginSettingsChange(cb: PluginSettingsChangeCallback): () => void {
  callbacks.add(cb)
  return () => { callbacks.delete(cb) }
}

// ─── Dispatch Functions (called by RealtimeBridge) ───────────────────────────

/**
 * Dispatches a plugin-settings:change event to all registered callbacks.
 */
export function dispatchPluginSettingsChange(event: PluginSettingsChangeEvent): void {
  for (const cb of callbacks) {
    cb(event)
  }
}
