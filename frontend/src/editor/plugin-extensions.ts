import { Compartment, type Extension } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'
import type { CompletionSource } from '@codemirror/autocomplete'

/**
 * Manages plugin-provided CM6 extensions via Compartments.
 * Each plugin gets its own Compartment for isolated enable/disable.
 */
export interface IPluginExtensionManager {
  /** Register an extension from a plugin. Applied on next reconfigure. */
  registerExtension(pluginId: string, extension: Extension): void
  /** Remove all extensions for a plugin (on deactivation). */
  removeExtensions(pluginId: string): void
  /** Get all currently active plugin extensions (flattened). */
  getActiveExtensions(): Extension[]
  /** Register an autocomplete provider from a plugin. */
  registerCompletionSource(pluginId: string, source: CompletionSource): void
  /** Remove all completion sources for a plugin. */
  removeCompletionSources(pluginId: string): void
}

interface PluginCompartmentEntry {
  pluginId: string
  compartment: Compartment
  currentExtension: Extension
}

interface PluginCompletionEntry {
  pluginId: string
  source: CompletionSource
}

// Module-level state
const pluginCompartments = new Map<string, PluginCompartmentEntry>()
const pluginCompletions = new Map<string, PluginCompletionEntry[]>()

// Reference to the active EditorView (set by CodeMirrorEditor when it mounts)
let activeView: EditorView | null = null

/**
 * Set the active EditorView instance. Called by CodeMirrorEditor on mount/unmount.
 */
export function setActiveEditorView(view: EditorView | null): void {
  activeView = view
}

/**
 * Register a CM6 extension from a plugin.
 * Creates a new Compartment for the plugin if not already registered.
 * Applies the extension immediately if an editor is active.
 */
export function registerPluginExtension(pluginId: string, extension: Extension): void {
  try {
    let entry = pluginCompartments.get(pluginId)

    if (!entry) {
      // Create a new compartment for this plugin
      const compartment = new Compartment()
      entry = {
        pluginId,
        compartment,
        currentExtension: extension,
      }
      pluginCompartments.set(pluginId, entry)
    } else {
      // Update existing entry with new extension
      entry.currentExtension = extension
    }

    // If there's an active view, dispatch a reconfigure effect
    if (activeView) {
      try {
        activeView.dispatch({
          effects: entry.compartment.reconfigure(wrapExtensionSafe(pluginId, extension)),
        })
      } catch (err) {
        console.error(`[PluginExtensionManager] Failed to apply extension for plugin "${pluginId}":`, err)
      }
    }
  } catch (err) {
    console.error(`[PluginExtensionManager] Error registering extension for plugin "${pluginId}":`, err)
  }
}

/**
 * Remove all extensions registered by a plugin.
 * Reconfigures the plugin's Compartment to empty (no full editor recreate).
 * Keeps the compartment in the map so re-registration works.
 */
export function removePluginExtensions(pluginId: string): void {
  const entry = pluginCompartments.get(pluginId)
  if (!entry) return

  // Clear the stored extension
  entry.currentExtension = []

  // If there's an active view, reconfigure to empty
  if (activeView) {
    try {
      activeView.dispatch({
        effects: entry.compartment.reconfigure([]),
      })
    } catch (err) {
      console.error(`[PluginExtensionManager] Failed to remove extensions for plugin "${pluginId}":`, err)
    }
  }
}

/**
 * Get all currently active plugin extensions (flattened).
 * Returns array of `compartment.of(extension)` for all registered plugins.
 * Used by CodeMirrorEditor when building initial extensions array.
 */
export function getActivePluginExtensions(): Extension[] {
  const extensions: Extension[] = []
  for (const entry of pluginCompartments.values()) {
    extensions.push(entry.compartment.of(wrapExtensionSafe(entry.pluginId, entry.currentExtension)))
  }
  return extensions
}

/**
 * Register an autocomplete provider from a plugin.
 */
export function registerPluginCompletionSource(pluginId: string, source: CompletionSource): void {
  try {
    const existing = pluginCompletions.get(pluginId) ?? []
    existing.push({ pluginId, source })
    pluginCompletions.set(pluginId, existing)
  } catch (err) {
    console.error(`[PluginExtensionManager] Error registering completion source for plugin "${pluginId}":`, err)
  }
}

/**
 * Remove all completion sources for a plugin.
 */
export function removePluginCompletionSources(pluginId: string): void {
  pluginCompletions.delete(pluginId)
}

/**
 * Get all active completion sources (flattened).
 */
export function getActivePluginCompletions(): CompletionSource[] {
  const sources: CompletionSource[] = []
  for (const entries of pluginCompletions.values()) {
    for (const entry of entries) {
      sources.push(wrapCompletionSourceSafe(entry.pluginId, entry.source))
    }
  }
  return sources
}

/**
 * Reset all plugin extension state.
 * Used for testing or full cleanup.
 */
export function resetPluginExtensions(): void {
  pluginCompartments.clear()
  pluginCompletions.clear()
  activeView = null
}

/**
 * Wrap an extension in a try/catch guard so a faulty plugin doesn't crash the editor.
 * For most extensions this is a pass-through since CM6 evaluates them lazily.
 * The real protection is in the registration/reconfiguration calls above.
 */
function wrapExtensionSafe(_pluginId: string, extension: Extension): Extension {
  // CM6 extensions are declarative configuration objects.
  // The try/catch wrapping happens at registration time (registerPluginExtension)
  // and at reconfigure time. The extension itself is returned as-is since
  // CM6 doesn't provide a mechanism to wrap individual extensions in error boundaries.
  // If an extension throws during evaluation, CM6 will surface the error at dispatch time,
  // which is already wrapped in try/catch in our registration functions.
  return extension
}

/**
 * Wrap a completion source so errors in one plugin don't break autocompletion.
 */
function wrapCompletionSourceSafe(pluginId: string, source: CompletionSource): CompletionSource {
  return (context) => {
    try {
      const result = source(context)
      // Handle both sync and async completion sources
      if (result instanceof Promise) {
        return result.catch((err) => {
          console.error(`[PluginExtensionManager] Completion source error for plugin "${pluginId}":`, err)
          return null
        })
      }
      return result
    } catch (err) {
      console.error(`[PluginExtensionManager] Completion source error for plugin "${pluginId}":`, err)
      return null
    }
  }
}
