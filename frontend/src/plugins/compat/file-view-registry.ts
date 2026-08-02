/**
 * FileViewRegistry — Module-level registry for plugin file view matchers.
 *
 * Plugins that render file-backed views (like Kanban for .md files with specific frontmatter)
 * register a matcher here. TabContent checks this registry before rendering EditMode/ViewMode.
 *
 * Pattern: Module-level mutable state (same as realtimeVaultBridge, tab-view-bridge).
 *
 * @module file-view-registry
 */

import type { WorkspaceLeaf, ItemView } from './view-registry'

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * FileViewMatcher — Determines if a plugin should handle rendering a file.
 *
 * @param filePath - The vault-relative file path
 * @param content - The file's text content (may be empty during initial load)
 * @returns true if the plugin wants to render this file
 */
export type FileViewMatcherFn = (filePath: string, content: string) => boolean

/**
 * FileViewRegistration — A registered file view handler.
 */
export interface FileViewRegistration {
  /** The view type identifier (e.g. 'kanban') */
  viewType: string
  /** Plugin ID that owns this registration */
  pluginId: string
  /** Function to determine if this plugin handles a given file */
  match: FileViewMatcherFn
}

/**
 * ActiveFileView — An active plugin file view instance for a specific tab.
 */
export interface ActiveFileView {
  /** Unique key for this file view (vaultId::filePath) */
  key: string
  /** The view type */
  viewType: string
  /** The workspace leaf holding the view */
  leaf: WorkspaceLeaf
  /** The view instance */
  view: ItemView
  /** The container element to mount in the DOM */
  containerEl: HTMLElement
}

// ─── Module-Level State ──────────────────────────────────────────────────────

/** All registered file view matchers */
const registrations: Map<string, FileViewRegistration> = new Map()

/** Currently active file views (keyed by vaultId::filePath) */
const activeFileViews: Map<string, ActiveFileView> = new Map()

// ─── Registration API ────────────────────────────────────────────────────────

/**
 * Register a file view matcher for a plugin view type.
 * When a file is opened in a tab and the matcher returns true,
 * TabContent will render the plugin's view instead of EditMode/ViewMode.
 *
 * @param viewType - The registered view type (must match a workspace.registerView type)
 * @param pluginId - The owning plugin ID
 * @param match - Function that determines if this plugin handles a given file
 */
export function registerFileViewMatcher(
  viewType: string,
  pluginId: string,
  match: FileViewMatcherFn
): void {
  registrations.set(viewType, { viewType, pluginId, match })
}

/**
 * Unregister a file view matcher.
 */
export function unregisterFileViewMatcher(viewType: string): void {
  registrations.delete(viewType)
}

/**
 * Remove all file view matchers for a given plugin.
 * Called during plugin deactivation.
 */
export function unregisterAllFileViewMatchersForPlugin(pluginId: string): void {
  for (const [viewType, reg] of registrations) {
    if (reg.pluginId === pluginId) {
      registrations.delete(viewType)
    }
  }
}

// ─── Query API (used by TabContent) ─────────────────────────────────────────

/**
 * Find a registered file view that matches the given file.
 * Returns the first matching registration, or null if no plugin handles this file.
 *
 * @param filePath - Vault-relative file path
 * @param content - The file's text content
 * @returns The matching registration or null
 */
export function findFileViewMatch(filePath: string, content: string): FileViewRegistration | null {
  for (const reg of registrations.values()) {
    try {
      if (reg.match(filePath, content)) {
        return reg
      }
    } catch {
      // Matcher threw — skip this registration
    }
  }
  return null
}

// ─── Active File View Management ─────────────────────────────────────────────

/**
 * Get an active file view for a specific tab.
 */
export function getActiveFileView(vaultId: string, filePath: string): ActiveFileView | null {
  return activeFileViews.get(`${vaultId}::${filePath}`) ?? null
}

/**
 * Store an active file view.
 */
export function setActiveFileView(vaultId: string, filePath: string, view: ActiveFileView): void {
  activeFileViews.set(`${vaultId}::${filePath}`, view)
}

/**
 * Remove and cleanup an active file view.
 * Calls onClose on the view for proper lifecycle management.
 */
export async function removeActiveFileView(vaultId: string, filePath: string): Promise<void> {
  const key = `${vaultId}::${filePath}`
  const active = activeFileViews.get(key)
  if (!active) return

  activeFileViews.delete(key)

  try {
    await active.leaf.detach()
  } catch (err) {
    console.error(`[FileViewRegistry] Error detaching file view for "${filePath}":`, err)
  }
}

/**
 * Remove all active file views (e.g. during vault switch or plugin deactivation).
 */
export async function removeAllActiveFileViews(): Promise<void> {
  for (const [key, active] of activeFileViews) {
    try {
      await active.leaf.detach()
    } catch (err) {
      console.error(`[FileViewRegistry] Error detaching file view "${key}":`, err)
    }
  }
  activeFileViews.clear()
}

/**
 * Remove all active file views owned by a specific plugin.
 */
export async function removeActiveFileViewsForPlugin(pluginId: string): Promise<void> {
  const toRemove: string[] = []
  for (const [key, active] of activeFileViews) {
    if (active.viewType && registrations.get(active.viewType)?.pluginId === pluginId) {
      toRemove.push(key)
    }
  }
  for (const key of toRemove) {
    const active = activeFileViews.get(key)
    if (active) {
      activeFileViews.delete(key)
      try {
        await active.leaf.detach()
      } catch (err) {
        console.error(`[FileViewRegistry] Error detaching file view "${key}":`, err)
      }
    }
  }
}

// ─── Extension-Based Registration (Obsidian registerExtensions API) ──────────

/**
 * Map of file extension → viewType for extension-based view routing.
 * Populated by `registerExtensionsForPlugin()`.
 */
const extensionMap: Map<string, { viewType: string; pluginId: string }> = new Map()

/**
 * Register file extensions that should be handled by a specific view type.
 * This is the Obsidian `plugin.registerExtensions(['excalidraw'], 'excalidraw')` API.
 *
 * When a file with one of these extensions is opened, the associated view type
 * will be used instead of the default markdown editor.
 *
 * @param extensions - Array of file extensions (without dot, e.g. ['excalidraw', 'kanban'])
 * @param viewType - The registered view type to use for these files
 * @param pluginId - The owning plugin ID
 */
export function registerExtensionsForPlugin(extensions: string[], viewType: string, pluginId: string): void {
  for (const ext of extensions) {
    const normalized = ext.toLowerCase().replace(/^\./, '')
    extensionMap.set(normalized, { viewType, pluginId })

    // Also register a file view matcher using extension-based matching
    // This integrates with the existing findFileViewMatch system
    registerFileViewMatcher(
      `${viewType}::ext::${normalized}`,
      pluginId,
      (filePath: string) => {
        const lastDot = filePath.lastIndexOf('.')
        if (lastDot < 0) return false
        const fileExt = filePath.slice(lastDot + 1).toLowerCase()
        return fileExt === normalized
      }
    )
  }
}

/**
 * Unregister all extension mappings for a plugin.
 * Called during plugin deactivation.
 */
export function unregisterExtensionsForPlugin(pluginId: string): void {
  for (const [ext, entry] of extensionMap) {
    if (entry.pluginId === pluginId) {
      extensionMap.delete(ext)
    }
  }
}

/**
 * Get the view type registered for a file extension.
 * Returns null if no plugin has claimed this extension.
 */
export function getViewTypeForExtension(extension: string): string | null {
  const normalized = extension.toLowerCase().replace(/^\./, '')
  return extensionMap.get(normalized)?.viewType ?? null
}
