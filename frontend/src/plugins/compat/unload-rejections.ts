/**
 * Containment for plugin errors that surface just after a plugin was unloaded.
 *
 * A plugin's fire-and-forget async work (Excalidraw's `harvestStyles()` after a `css-change`, for one) can resume after
 * `onunload()` has nulled the plugin's own state and fail with a `TypeError` that nobody awaits. Obsidian shows nothing
 * for these; here they would be an uncaught rejection in the console on every vault switch. While a teardown is
 * recent, such rejections are logged as a warning instead.
 *
 * Only `TypeError`s are contained (the signature of "state already torn down"); anything else stays visible.
 *
 * @module unload-rejections
 */

import { warnLog } from './log'

/** How long after a plugin's cleanup its stragglers are still attributed to the unload. */
export const UNLOAD_GRACE_MS = 3000

const activeWindows = new Map<string, number>()
let listening = false

function handleRejection(event: PromiseRejectionEvent): void {
  if (activeWindows.size === 0 || !(event.reason instanceof TypeError)) return
  event.preventDefault()
  warnLog(
    `[PluginLoader] Ignored late error from plugin teardown (${[...activeWindows.keys()].join(', ')}):`,
    event.reason
  )
}

function stopListeningWhenIdle(): void {
  if (activeWindows.size === 0 && listening) {
    window.removeEventListener('unhandledrejection', handleRejection)
    listening = false
  }
}

/**
 * Opens a containment window for a plugin that is being unloaded.
 *
 * @param pluginId - The plugin being torn down
 * @returns A function that ends the window after {@link UNLOAD_GRACE_MS}; call it once the plugin's cleanup is done
 */
export function beginUnloadWindow(pluginId: string): () => void {
  activeWindows.set(pluginId, (activeWindows.get(pluginId) ?? 0) + 1)
  if (!listening) {
    window.addEventListener('unhandledrejection', handleRejection)
    listening = true
  }
  return () => {
    setTimeout(() => {
      const left = (activeWindows.get(pluginId) ?? 1) - 1
      if (left > 0) activeWindows.set(pluginId, left)
      else activeWindows.delete(pluginId)
      stopListeningWhenIdle()
    }, UNLOAD_GRACE_MS)
  }
}
