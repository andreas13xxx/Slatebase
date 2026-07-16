/**
 * ViewRegistry — Registry for Obsidian-compatible plugin views (ItemView).
 *
 * Plugins use `workspace.registerView(viewType, viewCreator)` to register custom views.
 * The ViewRegistry stores these factories and manages view instances.
 *
 * When a plugin calls `workspace.getLeaf()` + `leaf.setViewState({ type })`, the
 * registry creates the view instance and provides a container element for rendering.
 *
 * @module view-registry
 */

// ─── Types ─────────────────────────────────────────────────────────────────────

/**
 * ItemView — Base class for Obsidian plugin views.
 *
 * Plugins extend this to create custom views (Calendar, Kanban, etc.).
 * They override `onOpen()`, `onClose()`, `getViewType()`, `getDisplayText()`, `getIcon()`.
 */
export class ItemView {
  /** The root container element for the view */
  containerEl: HTMLElement
  /** The content container (child of containerEl) */
  contentEl: HTMLElement
  /** Reference to the app instance */
  app: unknown
  /** The leaf this view is attached to */
  leaf: WorkspaceLeaf

  constructor(leaf: WorkspaceLeaf) {
    this.leaf = leaf
    this.app = leaf.app
    this.containerEl = document.createElement('div')
    this.containerEl.className = 'view-content'
    this.contentEl = document.createElement('div')
    this.contentEl.className = 'plugin-view-content'
    this.containerEl.appendChild(this.contentEl)
  }

  /** Returns the unique view type identifier. Plugins must override this. */
  getViewType(): string {
    return ''
  }

  /** Returns the human-readable display text for the view tab. */
  getDisplayText(): string {
    return 'Plugin View'
  }

  /** Returns the icon name for the view. */
  getIcon(): string {
    return 'file'
  }

  /** Called when the view is opened/mounted. Plugins override to build UI. */
  async onOpen(): Promise<void> {}

  /** Called when the view is closed/unmounted. Plugins override for cleanup. */
  async onClose(): Promise<void> {}

  /** Called when the view is loaded. */
  onload(): void {}

  /** Called when the view is unloaded. */
  onunload(): void {}

  /**
   * Add an action button to the view header area.
   * Creates a button element with the given icon, title, and click callback.
   */
  addAction(icon: string, title: string, callback: () => void): HTMLElement {
    // Create or find the header actions container
    let actionsEl = this.containerEl.querySelector('.view-actions') as HTMLElement | null
    if (!actionsEl) {
      actionsEl = document.createElement('div')
      actionsEl.className = 'view-actions'
      this.containerEl.insertBefore(actionsEl, this.contentEl)
    }

    const button = document.createElement('button')
    button.className = 'view-action'
    button.setAttribute('aria-label', title)
    button.title = title
    button.dataset.icon = icon
    button.addEventListener('click', callback)
    actionsEl.appendChild(button)

    return button
  }
}

/** Location of a WorkspaceLeaf within the Slatebase UI */
export type LeafLocation = 'main' | 'right-sidebar'

/**
 * WorkspaceLeaf — Stub for Obsidian's WorkspaceLeaf.
 *
 * In Obsidian, a leaf is a slot in the workspace that holds a view.
 * In Slatebase, we use a simplified version that just holds the view instance
 * and provides the `setViewState` / `open` interface.
 */
export class WorkspaceLeaf {
  /** The view currently rendered in this leaf */
  view: ItemView | null = null
  /** Reference to the app instance */
  app: unknown
  /** The location of this leaf in the workspace layout */
  readonly location: LeafLocation

  private readonly registry: ViewRegistry

  constructor(app: unknown, registry: ViewRegistry, location: LeafLocation) {
    this.app = app
    this.registry = registry
    this.location = location
  }

  /**
   * Set the view state — triggers view creation/open.
   * Plugins call `leaf.setViewState({ type: 'my-view' })` to activate a registered view.
   */
  async setViewState(state: { type: string; active?: boolean }): Promise<void> {
    const viewType = state.type
    console.log(`[WorkspaceLeaf] setViewState called: type="${viewType}", location="${this.location}", registered types:`, this.registry.getRegisteredViewTypes())
    const creator = this.registry.getViewCreator(viewType)
    if (!creator) {
      console.warn(`[WorkspaceLeaf] No view registered for type "${viewType}"`)
      return
    }

    // Close existing view if any (Req 2.6: onClose before DOM removal before new view)
    // Capture reference before async call to prevent race condition if onClose nullifies this.view
    if (this.view) {
      const oldView = this.view
      this.view = null
      try {
        await oldView.onClose()
      } catch (err) {
        console.error(`[WorkspaceLeaf] Error closing view "${oldView.getViewType()}":`, err)
      }
      oldView.containerEl.remove()
    }

    // Create and open new view
    const view = creator(this) as ItemView
    this.view = view

    try {
      await view.onOpen()
    } catch (err) {
      // Req 13.3: Log error but keep view in leaf (graceful degradation)
      console.error(`[WorkspaceLeaf] Error opening view "${viewType}":`, err)
    }

    // Notify the registry that a view was activated
    this.registry.notifyViewActivated(viewType, view)
  }

  /** Get the current view type */
  getViewState(): { type: string } {
    return { type: this.view?.getViewType() ?? '' }
  }

  /** Detach the leaf (close view) */
  async detach(): Promise<void> {
    if (this.view) {
      const view = this.view
      this.view = null
      try {
        await view.onClose()
      } catch (err) {
        // Req 13.4: Log error but proceed with leaf removal
        console.error(`[WorkspaceLeaf] Error closing view "${view.getViewType()}":`, err)
      }
      // Remove containerEl from DOM
      view.containerEl.remove()
    }
    this.registry.removeLeaf(this)
  }

  /**
   * Open a file in this leaf (Obsidian API).
   * Plugins (e.g. Calendar) call this to open a newly created file.
   * Delegates to the workspace shim's onOpenFile callback via the app reference.
   */
  async openFile(file: { path: string }): Promise<void> {
    if (!file?.path) return
    try {
      const workspace = (this.app as { workspace?: { openFileDirectly?: (filePath: string) => void; trigger?: (event: string, ...args: unknown[]) => void } })?.workspace
      // Use the direct file-open method if available (bypasses wikilink resolution)
      if (workspace && 'openFileDirectly' in workspace) {
        (workspace as { openFileDirectly: (filePath: string) => void }).openFileDirectly(file.path)
      }
    } catch (err) {
      console.error(`[WorkspaceLeaf] Error opening file "${file.path}":`, err)
    }
  }
}

// ─── View Registry ─────────────────────────────────────────────────────────────

/**
 * A view registration entry storing the view type, creator factory, and owning plugin ID.
 */
export interface ViewRegistration {
  viewType: string
  creator: (leaf: WorkspaceLeaf) => unknown
  pluginId: string
}

/** Callback when a view is activated (for React state updates) */
export type ViewActivatedCallback = (viewType: string, view: ItemView) => void

/** Callback when a view is deactivated */
export type ViewDeactivatedCallback = (viewType: string) => void

/** Callback when a sidebar view is activated */
export type SidebarViewActivatedCallback = (
  viewType: string,
  view: ItemView,
  leaf: WorkspaceLeaf
) => void

/** Callback when a sidebar view is deactivated */
export type SidebarViewDeactivatedCallback = (viewType: string) => void

/**
 * Internal tracking entry for each leaf in the registry.
 */
export interface LeafEntry {
  location: LeafLocation
  pluginId: string | null
  viewType: string | null
}

/**
 * ViewRegistry — Stores view type factories and manages active view instances.
 *
 * Each registration is associated with a pluginId for ownership tracking,
 * enabling cleanup when a plugin is deactivated.
 */
export class ViewRegistry {
  /** Map of view type → view registration (includes creator + pluginId) */
  private readonly registrations: Map<string, ViewRegistration> = new Map()
  /** All active leaves with their metadata */
  private readonly leaves: Map<WorkspaceLeaf, LeafEntry> = new Map()
  /** Callback for UI updates when a main view is activated */
  private onViewActivated: ViewActivatedCallback | null = null
  /** Callback for UI updates when a view is deactivated */
  private onViewDeactivated: ViewDeactivatedCallback | null = null
  /** Callback for UI updates when a sidebar view is activated */
  private onSidebarViewActivated: SidebarViewActivatedCallback | null = null
  /** Callback for UI updates when a sidebar view is deactivated */
  private onSidebarViewDeactivated: SidebarViewDeactivatedCallback | null = null

  /**
   * Register a view type with its factory function.
   * Called by plugins via `workspace.registerView(type, creator)`.
   *
   * Input validation rules:
   * - viewType must be a non-empty, non-whitespace-only string (max 128 chars)
   * - creator must be a callable function
   * Invalid inputs are ignored with a `console.warn`.
   *
   * @param viewType - Unique view type identifier (1–128 chars)
   * @param creator - Factory function that creates a view instance given a leaf
   * @param pluginId - ID of the plugin that owns this registration (defaults to 'unknown')
   */
  registerView(viewType: string, creator: (leaf: WorkspaceLeaf) => unknown, pluginId: string = 'unknown'): void {
    // Validate viewType: must be non-empty string after trimming
    if (typeof viewType !== 'string' || viewType.trim().length === 0) {
      console.warn('[ViewRegistry] registerView ignored: viewType must be a non-empty string')
      return
    }

    // Validate viewType: max 128 characters
    if (viewType.length > 128) {
      console.warn(`[ViewRegistry] registerView ignored: viewType exceeds 128 characters (got ${viewType.length})`)
      return
    }

    // Validate creator: must be callable
    if (typeof creator !== 'function') {
      console.warn('[ViewRegistry] registerView ignored: creator must be a callable function')
      return
    }

    this.registrations.set(viewType, { viewType, creator, pluginId })
  }

  /**
   * Unregister a view type, removing its registration from the registry.
   *
   * @param viewType - The view type to unregister
   */
  unregisterView(viewType: string): void {
    this.registrations.delete(viewType)
  }

  /**
   * Remove all view registrations belonging to the given plugin.
   * Used during plugin deactivation to clean up all registered view types.
   *
   * @param pluginId - The plugin ID whose registrations should be removed
   */
  unregisterAllForPlugin(pluginId: string): void {
    for (const [viewType, registration] of this.registrations) {
      if (registration.pluginId === pluginId) {
        this.registrations.delete(viewType)
      }
    }
  }

  /**
   * Get the creator function for a view type.
   */
  getViewCreator(viewType: string): ((leaf: WorkspaceLeaf) => unknown) | undefined {
    return this.registrations.get(viewType)?.creator
  }

  /**
   * Check if a view type is registered.
   */
  hasViewType(viewType: string): boolean {
    return this.registrations.has(viewType)
  }

  /**
   * Get all registered view types.
   */
  getRegisteredViewTypes(): string[] {
    return [...this.registrations.keys()]
  }

  /**
   * Create a new leaf attached to this registry.
   *
   * @param app - The app instance
   * @param location - Where the leaf should be placed ('main' or 'right-sidebar')
   * @param pluginId - Optional ID of the plugin that owns this leaf
   */
  createLeaf(app: unknown, location: LeafLocation = 'main', pluginId?: string): WorkspaceLeaf {
    const leaf = new WorkspaceLeaf(app, this, location)
    this.leaves.set(leaf, {
      location,
      pluginId: pluginId ?? null,
      viewType: null
    })
    return leaf
  }

  /**
   * Remove a leaf from tracking.
   */
  removeLeaf(leaf: WorkspaceLeaf): void {
    this.leaves.delete(leaf)
  }

  /**
   * Get all leaves that have a view of the given type.
   */
  getLeavesOfType(viewType: string): WorkspaceLeaf[] {
    return [...this.leaves.keys()].filter(l => l.view?.getViewType() === viewType)
  }

  /**
   * Get all tracked leaves.
   */
  getAllLeaves(): WorkspaceLeaf[] {
    return [...this.leaves.keys()]
  }

  /**
   * Get all leaves located in the main area.
   */
  getMainLeaves(): WorkspaceLeaf[] {
    return [...this.leaves.entries()]
      .filter(([, entry]) => entry.location === 'main')
      .map(([leaf]) => leaf)
  }

  /**
   * Get all leaves located in the right sidebar.
   */
  getSidebarLeaves(): WorkspaceLeaf[] {
    return [...this.leaves.entries()]
      .filter(([, entry]) => entry.location === 'right-sidebar')
      .map(([leaf]) => leaf)
  }

  /**
   * Get the first leaf with a view of the given type (for deduplication checks).
   */
  getLeafByViewType(viewType: string): WorkspaceLeaf | undefined {
    for (const [leaf, entry] of this.leaves) {
      if (entry.viewType === viewType || leaf.view?.getViewType() === viewType) {
        return leaf
      }
    }
    return undefined
  }

  /**
   * Detach all leaves with a given view type.
   * Calls `onSidebarViewDeactivated` for sidebar leaves and `onViewDeactivated` for main leaves.
   */
  async detachLeavesOfType(viewType: string): Promise<void> {
    const matching = this.getLeavesOfType(viewType)
    let hasSidebar = false
    let hasMain = false
    for (const leaf of matching) {
      const entry = this.leaves.get(leaf)
      if (entry?.location === 'right-sidebar') {
        hasSidebar = true
      } else {
        hasMain = true
      }
      await leaf.detach()
    }
    if (hasSidebar) {
      this.onSidebarViewDeactivated?.(viewType)
    }
    if (hasMain && matching.length > 0) {
      this.onViewDeactivated?.(viewType)
    }
  }

  /**
   * Detach all leaves belonging to a given plugin.
   * Calls `onClose()` on each view, continues on error for per-leaf isolation.
   * After all leaves are processed, also unregisters all view types for that plugin.
   *
   * Used during plugin deactivation to clean up both active views AND registrations.
   *
   * @param pluginId - The plugin ID whose leaves and registrations should be removed
   */
  async detachAllForPlugin(pluginId: string): Promise<void> {
    const pluginLeaves: WorkspaceLeaf[] = []
    const sidebarViewTypes = new Set<string>()
    const mainViewTypes = new Set<string>()

    for (const [leaf, entry] of this.leaves) {
      if (entry.pluginId === pluginId) {
        pluginLeaves.push(leaf)
        if (entry.viewType) {
          if (entry.location === 'right-sidebar') {
            sidebarViewTypes.add(entry.viewType)
          } else {
            mainViewTypes.add(entry.viewType)
          }
        }
      }
    }

    for (const leaf of pluginLeaves) {
      try {
        await leaf.detach()
      } catch (err) {
        console.error(`[ViewRegistry] Error detaching leaf for plugin "${pluginId}":`, err)
      }
    }

    // Notify React state about deactivated views
    for (const viewType of sidebarViewTypes) {
      this.onSidebarViewDeactivated?.(viewType)
    }
    for (const viewType of mainViewTypes) {
      this.onViewDeactivated?.(viewType)
    }

    // Also remove all view type registrations for this plugin
    this.unregisterAllForPlugin(pluginId)
  }

  /**
   * Notify that a view was activated (called by WorkspaceLeaf).
   * Updates the LeafEntry's viewType and triggers the appropriate callback
   * based on the leaf's location.
   */
  notifyViewActivated(viewType: string, view: ItemView): void {
    // Find the leaf for this view and update its viewType in the entry
    for (const [leaf, entry] of this.leaves) {
      if (leaf.view === view) {
        entry.viewType = viewType
        const registration = this.registrations.get(viewType)
        if (registration) {
          entry.pluginId = registration.pluginId
        }
        if (entry.location === 'right-sidebar') {
          this.onSidebarViewActivated?.(viewType, view, leaf)
        } else {
          this.onViewActivated?.(viewType, view)
        }
        return
      }
    }
    // Fallback: if leaf not found in map (shouldn't happen), still notify main callback
    this.onViewActivated?.(viewType, view)
  }

  /**
   * Set the callback for view activation events (for React integration).
   */
  setOnViewActivated(callback: ViewActivatedCallback | null): void {
    this.onViewActivated = callback
  }

  /**
   * Set the callback for view deactivation events (for React integration).
   */
  setOnViewDeactivated(callback: ViewDeactivatedCallback | null): void {
    this.onViewDeactivated = callback
  }

  /**
   * Set the callback for sidebar view activation events.
   * Called when a view in a right-sidebar leaf is activated.
   */
  setOnSidebarViewActivated(callback: SidebarViewActivatedCallback | null): void {
    this.onSidebarViewActivated = callback
  }

  /**
   * Set the callback for sidebar view deactivation events.
   * Called when a sidebar view is detached.
   */
  setOnSidebarViewDeactivated(callback: SidebarViewDeactivatedCallback | null): void {
    this.onSidebarViewDeactivated = callback
  }

  /**
   * Clear all registrations and detach all leaves.
   * Each leaf's `onClose()` is wrapped in a try/catch for per-leaf error isolation.
   * Errors are logged but do not block cleanup of remaining leaves.
   */
  async clear(): Promise<void> {
    for (const [leaf] of this.leaves) {
      if (leaf.view) {
        const view = leaf.view
        leaf.view = null
        try {
          await view.onClose()
        } catch (err) {
          console.error(`[ViewRegistry] Error closing view "${view.getViewType()}" during clear:`, err)
        }
        view.containerEl.remove()
      }
    }
    this.leaves.clear()
    this.registrations.clear()
  }
}
