import { Compartment, StateEffect, type Extension } from '@codemirror/state'
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
  /** Accumulated extensions from multiple registerEditorExtension() calls. */
  extensions: Extension[]
  /**
   * Mutable array references passed by plugins (e.g. Dataview's this.cmExtension).
   * Obsidian's pattern: plugin registers an empty array, fills it later, then calls
   * workspace.updateOptions() to trigger reconfiguration. We store these refs and
   * re-read their contents on refresh.
   */
  mutableRefs: Extension[][]
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
  // Debug: expose on window for console debugging
  ;(window as unknown as { __slatebaseEditorView?: EditorView | null }).__slatebaseEditorView = view
}

/**
 * Get the active EditorView instance. Used by EditorShim to route operations through CM6.
 */
export function getActiveEditorView(): EditorView | null {
  return activeView
}

/**
 * Validate whether a value is a real CM6 Extension or a fake stub object.
 *
 * Real CM6 extensions are:
 * - Arrays (nested extension lists)
 * - Objects with an `extension` property (FacetProvider / StateField)
 * - Objects with a `value` property and `compartment` (Compartment output)
 * - Instances of real CM6 classes that have internal Tag symbols
 *
 * Fake stubs from our No-Op shims are plain objects `{}` or objects with
 * custom markers like `__stateField: true` that CM6 cannot process.
 */
function isValidCM6Extension(ext: unknown): boolean {
  if (ext === null || ext === undefined) return false

  // Arrays are valid (nested extension lists) — validate recursively
  if (Array.isArray(ext)) {
    // Empty arrays are valid (no-op extension)
    if (ext.length === 0) return true
    // Check at least one element is valid
    return ext.every(item => isValidCM6Extension(item))
  }

  if (typeof ext !== 'object') return false

  // Plain empty objects `{}` from stubs like ViewPlugin.fromClass() → ({})
  const obj = ext as Record<string, unknown>
  const keys = Object.keys(obj)

  // A real CM6 extension object has internal properties. Our stubs produce:
  // - Empty objects: {} (ViewPlugin.fromClass, EditorView.theme, keymap.of, etc.)
  // - Objects with only custom markers: { __stateField: true, create: fn, update: fn }
  // - Objects with only `value`: { value: ... } (StateEffect.of)
  // - Objects with only `effects`: { effects: ... } (Compartment.reconfigure)

  // Real CM6 extensions have a `extension` getter (FacetProvider) or are tagged
  // internally. The simplest reliable check: real extensions have either:
  // 1. A Symbol-keyed property (CM6 uses Symbols for internal tagging)
  // 2. An `extension` property (FacetProvider pattern)
  // 3. They are instances of classes with a prototype chain (not plain Object)

  // Check for Symbol-keyed properties (CM6 internal markers)
  const symbols = Object.getOwnPropertySymbols(ext)
  if (symbols.length > 0) return true

  // Check for `extension` property (FacetProvider / StateField pattern)
  if ('extension' in obj && obj.extension !== undefined) {
    // But our stubs also have `{ extension: [] }` in test mocks — check deeper
    return true
  }

  // Check prototype chain — real CM6 objects have non-trivial prototypes
  const proto = Object.getPrototypeOf(ext)
  if (proto !== null && proto !== Object.prototype) return true

  // If it's a plain Object with no Symbols, no `extension` property, and only
  // simple keys — it's likely a stub. Reject it.
  // Exception: objects with known CM6 internal keys
  if (keys.includes('compartment') || keys.includes('inner') || keys.includes('prec')) {
    return true
  }

  return false
}

/**
 * Register a CM6 extension from a plugin.
 * Creates a new Compartment for the plugin if not already registered.
 * Applies the extension immediately if an editor is active.
 *
 * Multiple calls from the same plugin ACCUMULATE extensions (like Obsidian's
 * real registerEditorExtension API). This is critical for plugins like Dataview
 * that register a StateField and a ViewPlugin separately — the ViewPlugin
 * references the StateField via `view.state.field(myField)`, so both must be
 * present in the same EditorState.
 *
 * Validates the extension before registration — fake stub objects from the
 * CM6 No-Op shims are rejected with a warning to prevent editor crashes.
 */
export function registerPluginExtension(pluginId: string, extension: Extension): void {
  try {
    // Validate the extension is a real CM6 value, not a stub
    if (!isValidCM6Extension(extension)) {
      console.warn(
        `[PluginExtensionManager] Plugin "${pluginId}" registered a non-CM6 extension (likely a stub). Ignoring to prevent editor crash.`,
        extension
      )
      return
    }

    let entry = pluginCompartments.get(pluginId)

    if (!entry) {
      // Create a new compartment for this plugin
      const compartment = new Compartment()
      entry = {
        pluginId,
        compartment,
        extensions: [],
        mutableRefs: [],
      }
      pluginCompartments.set(pluginId, entry)
    }

    // Detect mutable array pattern: plugin passes an array reference that it
    // fills later (e.g. Dataview: this.cmExtension = []; registerEditorExtension(this.cmExtension))
    // Store the reference so refreshPluginExtensions() can re-read it.
    if (Array.isArray(extension)) {
      entry.mutableRefs.push(extension as Extension[])
      console.log(`[PluginExtensionManager] Plugin "${pluginId}" registered mutable array ref (length: ${(extension as Extension[]).length})`)
      // If the array already has content, also add to extensions
      if ((extension as Extension[]).length > 0) {
        entry.extensions.push(extension)
      }
    } else {
      // Accumulate: add to existing extensions list
      entry.extensions.push(extension)
    }

    // Build the effective extensions (static + mutable refs content)
    const effective = buildEffectiveExtensions(entry)

    // If there's an active view, apply the extensions
    if (activeView && effective.length > 0) {
      try {
        // Check if compartment is already in the state by trying reconfigure.
        // If the compartment was never added to the state (plugin loaded after editor),
        // use appendConfig to add it dynamically.
        if (isCompartmentInState(activeView, entry.compartment)) {
          activeView.dispatch({
            effects: entry.compartment.reconfigure(wrapExtensionSafe(pluginId, effective)),
          })
        } else {
          // Append the compartment to the state (first time)
          activeView.dispatch({
            effects: StateEffect.appendConfig.of(entry.compartment.of(wrapExtensionSafe(pluginId, effective))),
          })
        }
      } catch (err) {
        console.error(`[PluginExtensionManager] Failed to apply extension for plugin "${pluginId}":`, err)
        // Remove the last added extension that caused the crash
        if (!Array.isArray(extension)) {
          entry.extensions.pop()
        }
      }
    }
  } catch (err) {
    console.error(`[PluginExtensionManager] Error registering extension for plugin "${pluginId}":`, err)
  }
}

/**
 * Check if a Compartment is already part of the current EditorState.
 * Uses compartment.get() which returns the extension if present, or throws/returns undefined if not.
 */
function isCompartmentInState(view: EditorView, compartment: Compartment): boolean {
  try {
    // compartment.get() returns the current value if in state, or undefined
    const value = compartment.get(view.state)
    return value !== undefined
  } catch {
    return false
  }
}

/**
 * Build the effective extensions list for a plugin entry.
 * Combines static extensions with current content of mutable array refs.
 */
function buildEffectiveExtensions(entry: PluginCompartmentEntry): Extension[] {
  const effective: Extension[] = [...entry.extensions]
  // Re-read mutable refs (they may have been filled after registration)
  for (const ref of entry.mutableRefs) {
    if (ref.length > 0 && !entry.extensions.includes(ref)) {
      effective.push(ref)
    }
  }
  return effective
}

/**
 * Refresh all plugin extensions by re-reading mutable array references.
 * Called by workspace.updateOptions() when plugins modify their extension arrays
 * after initial registration (e.g. Dataview fills its cmExtension array later).
 */
export function refreshPluginExtensions(): void {
  if (!activeView) {
    console.log('[PluginExtensionManager] refreshPluginExtensions called but no activeView')
    return
  }

  for (const entry of pluginCompartments.values()) {
    // Only refresh if the plugin has mutable refs
    if (entry.mutableRefs.length === 0) continue

    const effective = buildEffectiveExtensions(entry)
    console.log(`[PluginExtensionManager] refreshPluginExtensions for "${entry.pluginId}": effective=${effective.length}, mutableRefs=${entry.mutableRefs.length}, refLengths=[${entry.mutableRefs.map(r => r.length).join(',')}]`)
    // Skip if no effective extensions
    if (effective.length === 0) continue

    // Validate before reconfiguring
    const validExtensions = effective.filter(ext => isValidCM6Extension(ext))
    if (validExtensions.length === 0) continue

    try {
      if (isCompartmentInState(activeView, entry.compartment)) {
        activeView.dispatch({
          effects: entry.compartment.reconfigure(wrapExtensionSafe(entry.pluginId, validExtensions)),
        })
      } else {
        // Compartment not yet in state — append it
        activeView.dispatch({
          effects: StateEffect.appendConfig.of(entry.compartment.of(wrapExtensionSafe(entry.pluginId, validExtensions))),
        })
      }
    } catch (err) {
      console.error(`[PluginExtensionManager] Failed to refresh extensions for plugin "${entry.pluginId}":`, err)
    }
  }

  // After reconfiguring all plugin compartments, dispatch a no-op selection set
  // to trigger ViewPlugin.update() with selectionSet=true. This is needed because
  // plugins like Dataview only recompute their decorations on selectionSet or
  // docChanged — but after async index initialization, neither has occurred yet.
  // Setting the selection to its current value is invisible to the user but
  // triggers the ViewPlugin update cycle.
  try {
    activeView.dispatch({ selection: activeView.state.selection })
  } catch {
    // Ignore — editor may have been destroyed between dispatch calls
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

  // Clear all accumulated extensions and mutable refs
  entry.extensions = []
  entry.mutableRefs = []

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
 *
 * Skips plugins whose extensions are empty or invalid to prevent editor crashes.
 */
export function getActivePluginExtensions(): Extension[] {
  const extensions: Extension[] = []
  for (const entry of pluginCompartments.values()) {
    // Build effective list including mutable refs
    const effective = buildEffectiveExtensions(entry)

    // Always include the compartment in the EditorState — even if currently empty.
    // This is critical: if we skip it, later reconfigure() dispatches won't work
    // because the compartment was never part of the state. Plugins like Dataview
    // register an empty array first and fill it later via workspace.updateOptions().
    if (effective.length === 0) {
      extensions.push(entry.compartment.of([]))
      continue
    }
    // Filter out any invalid extensions from the accumulated list
    const validExtensions = effective.filter(ext => isValidCM6Extension(ext))
    if (validExtensions.length === 0) {
      extensions.push(entry.compartment.of([]))
      continue
    }
    extensions.push(entry.compartment.of(wrapExtensionSafe(entry.pluginId, validExtensions)))
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
