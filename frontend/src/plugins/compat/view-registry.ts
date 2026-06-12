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
    this.containerEl.className = 'plugin-view-container'
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
}

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

  private readonly registry: ViewRegistry

  constructor(app: unknown, registry: ViewRegistry) {
    this.app = app
    this.registry = registry
  }

  /**
   * Set the view state — triggers view creation/open.
   * Plugins call `leaf.setViewState({ type: 'my-view' })` to activate a registered view.
   */
  async setViewState(state: { type: string; active?: boolean }): Promise<void> {
    const viewType = state.type
    const creator = this.registry.getViewCreator(viewType)
    if (!creator) {
      console.warn(`[WorkspaceLeaf] No view registered for type "${viewType}"`)
      return
    }

    // Close existing view if any
    if (this.view) {
      try { await this.view.onClose() } catch { /* ignore */ }
    }

    // Create and open new view
    const view = creator(this) as ItemView
    this.view = view

    try {
      await view.onOpen()
    } catch (err) {
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
      try { await this.view.onClose() } catch { /* ignore */ }
      this.view = null
    }
    this.registry.removeLeaf(this)
  }
}

// ─── View Registry ─────────────────────────────────────────────────────────────

/** Callback when a view is activated (for React state updates) */
export type ViewActivatedCallback = (viewType: string, view: ItemView) => void

/** Callback when a view is deactivated */
export type ViewDeactivatedCallback = (viewType: string) => void

/**
 * ViewRegistry — Stores view type factories and manages active view instances.
 */
export class ViewRegistry {
  /** Map of view type → view creator factory */
  private readonly creators: Map<string, (leaf: WorkspaceLeaf) => unknown> = new Map()
  /** All active leaves */
  private readonly leaves: Set<WorkspaceLeaf> = new Set()
  /** Callback for UI updates when a view is activated */
  private onViewActivated: ViewActivatedCallback | null = null
  /** Callback for UI updates when a view is deactivated */
  private onViewDeactivated: ViewDeactivatedCallback | null = null

  /**
   * Register a view type with its factory function.
   * Called by plugins via `workspace.registerView(type, creator)`.
   */
  registerView(viewType: string, creator: (leaf: WorkspaceLeaf) => unknown): void {
    this.creators.set(viewType, creator)
  }

  /**
   * Get the creator function for a view type.
   */
  getViewCreator(viewType: string): ((leaf: WorkspaceLeaf) => unknown) | undefined {
    return this.creators.get(viewType)
  }

  /**
   * Check if a view type is registered.
   */
  hasViewType(viewType: string): boolean {
    return this.creators.has(viewType)
  }

  /**
   * Get all registered view types.
   */
  getRegisteredViewTypes(): string[] {
    return [...this.creators.keys()]
  }

  /**
   * Create a new leaf attached to this registry.
   */
  createLeaf(app: unknown): WorkspaceLeaf {
    const leaf = new WorkspaceLeaf(app, this)
    this.leaves.add(leaf)
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
    return [...this.leaves].filter(l => l.view?.getViewType() === viewType)
  }

  /**
   * Detach all leaves with a given view type.
   */
  async detachLeavesOfType(viewType: string): Promise<void> {
    const matching = this.getLeavesOfType(viewType)
    for (const leaf of matching) {
      await leaf.detach()
    }
    if (matching.length > 0) {
      this.onViewDeactivated?.(viewType)
    }
  }

  /**
   * Notify that a view was activated (called by WorkspaceLeaf).
   * Triggers the callback for React state update.
   */
  notifyViewActivated(viewType: string, view: ItemView): void {
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
   * Clear all registrations and detach all leaves.
   */
  async clear(): Promise<void> {
    for (const leaf of this.leaves) {
      if (leaf.view) {
        try { await leaf.view.onClose() } catch { /* ignore */ }
      }
    }
    this.leaves.clear()
    this.creators.clear()
  }
}
