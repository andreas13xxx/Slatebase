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

import { renderLucideIconInto } from './lucide-icons'
import { setMarkdownOverride, clearMarkdownOverride } from './file-view-registry'
import { Scope } from './obsidian-api-extensions'
import { getCustomIconSvg, sizeCustomIconSvg } from '../../utils/pluginIcon'
import { EventSystem } from './event-system'
import type { EventRef } from './types'
import { recordGapRead, recordGapCall } from './api-gap-registry'

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
  /**
   * Public hotkey scope (Obsidian API since 1.5.7). Plugins register
   * view-specific hotkeys here and activate them via
   * `app.keymap.pushScope(this.scope)` in `onOpen()` / `popScope()` in `onClose()`.
   */
  readonly scope: Scope = new Scope()
  /** Icon name shown in the tab. Plugins typically set this instead of overriding getIcon(). */
  icon: string = 'file'
  /**
   * Whether this view is intended for navigation (shows up in history, gets a
   * "back" affordance) vs. a static panel like a file explorer or calendar.
   * Defaults to true, matching real Obsidian's default for ItemView subclasses.
   */
  navigation: boolean = true

  constructor(leaf: WorkspaceLeaf) {
    this.leaf = leaf
    this.app = leaf.app
    this.containerEl = document.createElement('div')
    this.containerEl.className = 'view-content'
    // Real Obsidian's ItemView.containerEl always has two children — a
    // header (children[0]) and the content pane (children[1] === contentEl).
    // Kept in sync with the equivalent constructor in install-globals.ts,
    // which is what real plugin bundles actually extend; see the comment
    // there for why this matters (children[1]-reading plugins like
    // obsidian-day-planner's Timeline/TimeTracker views).
    const headerEl = document.createElement('div')
    headerEl.className = 'view-header'
    this.containerEl.appendChild(headerEl)
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

  /** Returns the icon name for the view. Real Obsidian's default reads the `icon` property. */
  getIcon(): string {
    return this.icon
  }

  /** Called when the size of this view is changed. No layout to react to here. */
  onResize(): void {}

  /** Populates the pane's context menu. Plugins override to add menu items. */
  onPaneMenu(_menu: unknown, _source: string): void {}

  /** Called when the view is opened/mounted. Plugins override to build UI. */
  async onOpen(): Promise<void> {}

  /** Called when the view is closed/unmounted. Plugins override for cleanup. */
  async onClose(): Promise<void> {}

  /** Called when the view is loaded. */
  onload(): void {}

  /** Called when the view is unloaded. */
  onunload(): void {}

  /**
   * Get the view state for workspace serialization. Real Obsidian's base `View`
   * always implements this (default `{}`) — plugins routinely call
   * `leaf.view.getState()` on whatever view happens to be active without
   * checking it's overridden, so views that don't need custom state still
   * need this default rather than throwing for unrelated plugins.
   */
  getState(): Record<string, unknown> {
    return {}
  }

  /** Restore view state from workspace serialization. Default no-op. */
  async setState(state: Record<string, unknown>, result: { history?: boolean }): Promise<void> {
    void state
    void result
  }

  /** Get transient UI state (scroll position, etc.) not persisted across sessions. Default `{}`. */
  getEphemeralState(): Record<string, unknown> {
    return {}
  }

  /** Restore transient UI state. Default no-op. */
  setEphemeralState(state: Record<string, unknown>): void {
    void state
  }

  /**
   * Add an action button to the view header area.
   * Creates a button element with the given icon, title, and click callback.
   * Icon is resolved via the custom icon registry first, then Lucide.
   */
  addAction(icon: string, title: string, callback: () => void): HTMLElement {
    // Create or find the header actions container — lives inside the header
    // (children[0]), not inserted as a sibling before contentEl, which would
    // shift contentEl to children[2] and break the children[1]-is-contentEl
    // contract the constructor sets up (see there for why that matters).
    let actionsEl = this.containerEl.querySelector('.view-actions') as HTMLElement | null
    if (!actionsEl) {
      actionsEl = document.createElement('div')
      actionsEl.className = 'view-actions'
      const headerEl = this.containerEl.querySelector('.view-header') ?? this.containerEl
      headerEl.appendChild(actionsEl)
    }

    const button = document.createElement('button')
    button.className = 'view-action'
    button.setAttribute('aria-label', title)
    button.title = title
    button.addEventListener('click', callback)
    actionsEl.appendChild(button)

    // Render icon: custom icon registry first, then Lucide. Sized explicitly —
    // an unsized custom SVG defaults to the browser's intrinsic <svg> size
    // instead of the button's, so it renders invisible or oversized rather
    // than just missing (see sizeCustomIconSvg's doc comment).
    const customSvg = getCustomIconSvg(icon)
    if (customSvg) {
      button.innerHTML = sizeCustomIconSvg(customSvg, 16)
    } else {
      renderLucideIconInto(button, icon)
    }

    return button
  }
}

/** Location of a WorkspaceLeaf within the Slatebase UI */
export type LeafLocation = 'main' | 'right-sidebar'

// ─── TextFileView ────────────────────────────────────────────────────────────

/**
 * TextFileView — Base class for file-backed plugin views.
 *
 * In Obsidian, TextFileView extends FileView (which extends ItemView) and provides:
 * - Automatic file loading (`loadFile` → `onLoadFile` → `setViewData`)
 * - Automatic save coordination (`requestSave` → `getViewData` → vault.modify)
 * - `data` property holding the current file text content
 * - `file` reference to the associated TFile
 *
 * Plugins like Kanban extend this instead of ItemView to get file-backed view semantics.
 * They override `getViewData()`, `setViewData(data, clear)`, and `clear()`.
 */
export class TextFileView extends ItemView {
  /** The file currently open in this view (null until loadFile is called) */
  file: { path: string; name: string; basename: string; extension: string; stat: { mtime: number; ctime: number; size: number }; parent: unknown } | null = null

  /** The raw text content of the file */
  data: string = ''

  /** Whether a save has been requested but not yet flushed */
  private _saveRequested: boolean = false

  /** Timer ID for debounced save */
  private _saveTimerId: ReturnType<typeof setTimeout> | null = null

  /** Save debounce interval in ms */
  private static readonly SAVE_DEBOUNCE_MS = 2000

  /**
   * Returns the view type. Plugins must override.
   */
  getViewType(): string {
    return ''
  }

  /**
   * Returns the display text for the tab (defaults to the file's basename).
   */
  getDisplayText(): string {
    return this.file?.basename ?? 'File View'
  }

  // ─── File Lifecycle ──────────────────────────────────────────────────────

  /**
   * Load a file into this view.
   * Calls `onUnloadFile` for the previous file, reads the new file content,
   * then calls `onLoadFile` → `setViewData(data, clear=true)`.
   *
   * @param file - TFile to load
   */
  async loadFile(file: { path: string; name: string; basename: string; extension: string; stat: { mtime: number; ctime: number; size: number }; parent: unknown }): Promise<void> {
    // Unload the previous file if any
    if (this.file && this.file !== file) {
      await this.onUnloadFile(this.file)
    }

    this.file = file

    // Read file content via vault shim
    try {
      const vault = (this.app as { vault?: { read: (f: unknown) => Promise<string> } })?.vault
      if (vault) {
        this.data = await vault.read(file)
      } else {
        this.data = ''
      }
    } catch (err) {
      console.error(`[TextFileView] Failed to read file "${file.path}":`, err)
      this.data = ''
    }

    // Notify subclass
    await this.onLoadFile(file)
  }

  /**
   * Called when a file is loaded into this view.
   * Default implementation calls `setViewData(data, clear=true)`.
   * Plugins can override to add pre-processing.
   */
  async onLoadFile(file: { path: string; name: string; basename: string; extension: string; stat: { mtime: number; ctime: number; size: number }; parent: unknown }): Promise<void> {
    void file
    this.setViewData(this.data, true)
  }

  /**
   * Called when a file is unloaded from this view (before a new file is loaded or on close).
   * Default implementation saves pending changes.
   * Plugins can override for cleanup.
   */
  async onUnloadFile(file: { path: string; name: string; basename: string; extension: string; stat: { mtime: number; ctime: number; size: number }; parent: unknown }): Promise<void> {
    void file
    // Flush pending save
    await this.save(true)
  }

  // ─── Data Access (plugins override these) ────────────────────────────────

  /**
   * Get the current view data (text content).
   * Plugins override this to serialize their state back to markdown/text.
   */
  getViewData(): string {
    return this.data
  }

  /**
   * Set the view data. Called when a file is first loaded (`clear=true`)
   * or when external changes are detected (`clear=false`).
   * Plugins override this to parse and render the content.
   *
   * @param data - The file content as text
   * @param clear - Whether this is a fresh load (true) or an incremental update (false)
   */
  setViewData(data: string, clear?: boolean): void {
    void clear
    this.data = data
  }

  /**
   * Clear the view's internal state.
   * Called by Obsidian after unloading a file, before loading the next one.
   * Plugins override to reset their internal state.
   */
  clear(): void {
    // Default no-op — plugins override
  }

  // ─── Save Coordination ───────────────────────────────────────────────────

  /**
   * Request a save of the current view data.
   * The save is debounced — multiple calls within the debounce window
   * result in a single save at the end.
   */
  requestSave(): void {
    this._saveRequested = true

    if (this._saveTimerId !== null) {
      clearTimeout(this._saveTimerId)
    }

    this._saveTimerId = setTimeout(() => {
      this._saveTimerId = null
      void this.save(false)
    }, TextFileView.SAVE_DEBOUNCE_MS)
  }

  /**
   * Perform the actual save. Reads `getViewData()` and writes to the vault.
   *
   * @param force - If true, skip the debounce check and save immediately
   */
  async save(force: boolean): Promise<void> {
    if (!force && !this._saveRequested) return
    if (!this.file) return

    // Cancel pending debounce timer
    if (this._saveTimerId !== null) {
      clearTimeout(this._saveTimerId)
      this._saveTimerId = null
    }

    this._saveRequested = false

    const newData = this.getViewData()

    // Only write if data actually changed
    if (newData === this.data && !force) return

    this.data = newData

    try {
      const vault = (this.app as { vault?: { modify: (f: unknown, content: string) => Promise<void> } })?.vault
      if (vault) {
        await vault.modify(this.file, newData)
      }
    } catch (err) {
      console.error(`[TextFileView] Failed to save file "${this.file.path}":`, err)
    }
  }

  // ─── View State (integrates with workspace layout persistence) ───────────

  /**
   * Get the view state for workspace serialization.
   * Includes the file path so the view can be restored.
   */
  getState(): Record<string, unknown> {
    return {
      file: this.file?.path ?? null,
    }
  }

  /**
   * Restore view state from workspace serialization.
   * Loads the file if a path is present in the state.
   */
  async setState(state: Record<string, unknown>, result: { history?: boolean }): Promise<void> {
    void result
    if (state.file && typeof state.file === 'string') {
      // Resolve file from vault
      const vault = (this.app as { vault?: { getAbstractFileByPath: (path: string) => unknown } })?.vault
      if (vault) {
        const file = vault.getAbstractFileByPath(state.file as string) as { path: string; name: string; basename: string; extension: string; stat: { mtime: number; ctime: number; size: number }; parent: unknown } | null
        if (file) {
          await this.loadFile(file)
        }
      }
    }
  }

  // ─── Lifecycle Overrides ─────────────────────────────────────────────────

  /**
   * Called when the view is closed. Flushes pending saves and unloads the file.
   */
  async onClose(): Promise<void> {
    if (this.file) {
      await this.onUnloadFile(this.file)
    }
    if (this._saveTimerId !== null) {
      clearTimeout(this._saveTimerId)
      this._saveTimerId = null
    }
  }

  /**
   * Add a child component to this view.
   * In Obsidian, this tracks child components for lifecycle management.
   * In Slatebase, we just return the child for basic compatibility.
   */
  addChild<T>(child: T): T {
    return child
  }

  /**
   * Remove a child component from this view.
   * No-op in Slatebase (Obsidian uses this for lifecycle cleanup).
   */
  removeChild<T>(child: T): T {
    return child
  }

  /**
   * Register a callback for component cleanup.
   * In Obsidian, this registers cleanup functions called on unload.
   */
  register(cb: unknown): void {
    void cb
  }
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
  /** The location of this leaf in the workspace layout */
  readonly location: LeafLocation
  /** The container element for this leaf (wraps the view's containerEl) */
  readonly containerEl: HTMLElement
  /**
   * Real Obsidian's active hover preview popover anchored to this leaf, if any.
   * Slatebase's hover previews aren't tracked per-leaf (see hover-link-bus.ts),
   * so this stays null — present only so `leaf.hoverPopover` reads don't fail.
   */
  hoverPopover: unknown = null
  /**
   * The leaf's direct parent (a WorkspaceTabs/WorkspaceMobileDrawer in real
   * Obsidian). Slatebase has no such split/tab-group hierarchy to expose, so
   * this stays null — plugins doing `leaf.parent instanceof WorkspaceTabs`
   * (tab-group detection) get a clean `false` instead of a crash.
   */
  parent: unknown = null

  private readonly registry: ViewRegistry
  private readonly leafEvents = new EventSystem()
  private pinned = false

  constructor(app: unknown, registry: ViewRegistry, location: LeafLocation) {
    this.app = app
    this.registry = registry
    this.location = location
    this.containerEl = document.createElement('div')
    this.containerEl.className = 'workspace-leaf'
  }

  /**
   * Leaf-scoped events ('pinned-change', 'group-change'). Real Obsidian's
   * `WorkspaceLeaf` extends `WorkspaceItem extends Events`, so these exist
   * directly on the leaf, separate from the shared workspace-wide event bus.
   */
  on(name: string, callback: (...args: unknown[]) => unknown, ctx?: unknown): EventRef {
    return this.leafEvents.on(name, callback, ctx)
  }

  off(name: string, callback: (...args: unknown[]) => unknown): void {
    this.leafEvents.off(name, callback)
  }

  offref(ref: EventRef): void {
    this.leafEvents.offref(ref)
  }

  trigger(name: string, ...args: unknown[]): void {
    this.leafEvents.trigger(name, ...args)
  }

  /**
   * Pinning/tab-groups have no equivalent in Slatebase's tab model. These
   * track just enough state for `togglePinned()`/`setPinned()` round-trips
   * and fire the real 'pinned-change' event plugins may listen for; the
   * group methods are no-ops since there's nothing to group leaves into.
   */
  togglePinned(): void {
    this.setPinned(!this.pinned)
  }

  setPinned(pinned: boolean): void {
    if (this.pinned === pinned) return
    this.pinned = pinned
    this.leafEvents.trigger('pinned-change', pinned)
  }

  setGroupMember(_other: WorkspaceLeaf): void {}

  setGroup(_group: string): void {}

  /** Called by Obsidian when the leaf is resized. No layout to react to here. */
  onResize(): void {}

  /**
   * Run the view's load lifecycle before onOpen(), matching real Obsidian's
   * Component -> View -> ItemView chain (WorkspaceLeaf calls `view.load()`,
   * which sets the loaded flag and invokes `onload()`, before `onOpen()`).
   * Real plugin views (Component-backed, via the global `obsidian.ItemView`)
   * expose `load()`; our lightweight in-repo ItemView/TextFileView mocks
   * (used by tests) only implement the no-op `onload()`, so fall back to
   * calling that directly and flagging `_loaded` ourselves.
   */
  private runViewLoad(view: ItemView, viewType: string): void {
    const viewAny = view as unknown as Record<string, unknown>
    try {
      if (typeof viewAny.load === 'function') {
        (viewAny.load as () => void).call(view)
      } else {
        (viewAny as { _loaded?: boolean })._loaded = true
        view.onload()
      }
    } catch (err) {
      console.error(`[WorkspaceLeaf] Error in onload for view "${viewType}":`, err)
    }
  }

  /**
   * Counterpart to runViewLoad — real Component-backed views expose `unload()`,
   * which deregisters everything `load()`/`onload()` set up via registerDomEvent/
   * registerInterval/registerEvent/register before calling `onunload()`. Without
   * this, those subscriptions would survive the view closing.
   */
  private runViewUnload(view: ItemView, viewType: string): void {
    const viewAny = view as unknown as Record<string, unknown>
    try {
      if (typeof viewAny.unload === 'function') {
        (viewAny.unload as () => void).call(view)
      } else {
        view.onunload()
      }
    } catch (err) {
      console.error(`[WorkspaceLeaf] Error in onunload for view "${viewType}":`, err)
    }
  }

  /**
   * Set the view state — triggers view creation/open.
   * Plugins call `leaf.setViewState({ type: 'my-view' })` to activate a registered view.
   * For TextFileView-based views, `state.state.file` specifies the file path to load.
   */
  async setViewState(state: { type: string; active?: boolean; state?: Record<string, unknown>; popstate?: boolean }): Promise<void> {
    const viewType = state.type
    const creator = this.registry.getViewCreator(viewType)
    if (!creator) {
      if (viewType === 'markdown') {
        // "markdown" isn't a plugin view — it's Slatebase's native editor, which
        // lives outside the ViewRegistry entirely. Plugins call this to implement
        // "Open as Markdown" (Kanban's board menu, etc.): the file's frontmatter
        // still matches the plugin's file-view matcher, so without an explicit
        // override TabContent would just re-open the plugin view on the very next
        // render. Recording the override here and handing off to the native
        // workspace open is what actually makes the switch stick.
        const filePath = (typeof state.state?.file === 'string' ? state.state.file : null)
          ?? (this.view as unknown as { file?: { path?: string } } | null)?.file?.path
          ?? null
        if (filePath) {
          setMarkdownOverride(filePath)
          const workspace = (this.app as { workspace?: { openFileDirectly?: (filePath: string) => void } })?.workspace
          if (workspace && typeof workspace.openFileDirectly === 'function') {
            workspace.openFileDirectly(filePath)
          }
        }
        return
      }
      console.warn(`[WorkspaceLeaf] No view registered for type "${viewType}"`)
      return
    }

    // Switching to an actual registered plugin view for this file (e.g. Kanban's
    // "Open as Kanban Board") lifts any earlier markdown override so the file
    // opens as the plugin view again next time.
    const targetFilePath = typeof state.state?.file === 'string' ? state.state.file : null
    if (targetFilePath) {
      clearMarkdownOverride(targetFilePath)
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
      this.runViewUnload(oldView, oldView.getViewType())
      oldView.containerEl.remove()
    }

    // Create and open new view
    const view = creator(this) as ItemView
    this.view = view
    // Plugin styles are scoped by CssInjector to the owning plugin's
    // data attribute. Put that attribute on the view root so the styles apply
    // consistently to main, sidebar, and file-backed plugin views.
    const pluginId = this.registry.getPluginIdForView(viewType)
    if (pluginId) {
      view.containerEl.dataset.pluginId = pluginId
    }
    // Mount view's containerEl inside the leaf's containerEl (Obsidian pattern)
    this.containerEl.appendChild(view.containerEl)

    // If the view is a TextFileView (duck-type: has getViewData/setViewData/requestSave)
    // and state includes a file path, load the file before calling onOpen.
    const viewAny = view as unknown as Record<string, unknown>
    const isTextFileView = typeof viewAny.getViewData === 'function'
      && typeof viewAny.setViewData === 'function'
      && typeof viewAny.requestSave === 'function'
    if (isTextFileView && state.state?.file && typeof state.state.file === 'string') {
      // Load then onOpen — matches real Obsidian's Component.load() (which runs
      // onload()) followed by the leaf's own onOpen() call. Some plugins (Excalidraw)
      // do their core setup in onload(); others (Kanban) do it in onOpen(). Both must run.
      this.runViewLoad(view, viewType)
      try {
        await view.onOpen()
      } catch (err) {
        console.error(`[WorkspaceLeaf] Error in onOpen for TextFileView "${viewType}":`, err)
      }
      // Then load the file via setState → loadFile → setViewData
      try {
        await (viewAny as unknown as { setState(state: Record<string, unknown>, result: { history?: boolean }): Promise<void> }).setState(state.state, { history: !!state.popstate })
      } catch (err) {
        console.error(`[WorkspaceLeaf] Error loading file in TextFileView "${viewType}":`, err)
      }
      // Ensure a Slatebase tab is open for this file, same as openFile() does below.
      // TextFileView-based views (Kanban, etc.) render inside the file's own tab —
      // without this, a view opened via setViewState() (e.g. a "new board" command)
      // never becomes visible because no tab exists for it yet.
      try {
        const workspace = (this.app as { workspace?: { openFileDirectly?: (filePath: string) => void } })?.workspace
        if (workspace && typeof workspace.openFileDirectly === 'function') {
          workspace.openFileDirectly(state.state.file)
        }
      } catch (err) {
        console.error(`[WorkspaceLeaf] Error opening tab for TextFileView "${viewType}":`, err)
      }
    } else {
      // Load then onOpen — see comment above.
      this.runViewLoad(view, viewType)
      try {
        await view.onOpen()
      } catch (err) {
        // Req 13.3: Log error but keep view in leaf (graceful degradation)
        console.error(`[WorkspaceLeaf] Error opening view "${viewType}":`, err)
      }
    }

    // Notify the registry that a view was activated
    this.registry.notifyViewActivated(viewType, view)
  }

  /**
   * Attach an already-constructed view instance to this leaf (Obsidian API).
   * Unlike `setViewState()`, which looks up a registered factory by view type,
   * `open()` takes a view the plugin built itself (`new MyView(leaf)`) — Mind
   * Map's `initPreview` does exactly this to attach its markmap preview view
   * directly instead of going through `registerView()` + `setViewState()`.
   * Mirrors the close-old/mount-new/load/onOpen sequence `setViewState()` uses.
   */
  async open(view: ItemView): Promise<ItemView> {
    if (this.view) {
      const oldView = this.view
      this.view = null
      try {
        await oldView.onClose()
      } catch (err) {
        console.error(`[WorkspaceLeaf] Error closing view "${oldView.getViewType()}":`, err)
      }
      this.runViewUnload(oldView, oldView.getViewType())
      oldView.containerEl.remove()
    }

    this.view = view
    const viewType = view.getViewType()
    const pluginId = this.registry.getPluginIdForView(viewType)
    if (pluginId) {
      view.containerEl.dataset.pluginId = pluginId
    }
    this.containerEl.appendChild(view.containerEl)

    this.runViewLoad(view, viewType)
    try {
      await view.onOpen()
    } catch (err) {
      console.error(`[WorkspaceLeaf] Error in onOpen for view "${viewType}":`, err)
    }

    this.registry.notifyViewActivated(viewType, view)
    return view
  }

  /** Get the current view type */
  getViewState(): { type: string } {
    return { type: this.view?.getViewType() ?? '' }
  }

  /**
   * Convenience pass-throughs to the leaf's view. Real Obsidian's `WorkspaceLeaf`
   * exposes these directly (delegating to `this.view`) alongside the view-only
   * `getState()`/`setState()` pair — plugins commonly call the leaf-level
   * shorthand instead of going through `.view` explicitly (Mind Map's
   * `activeLeafName` calls `leaf.getDisplayText()`, not `leaf.view.getDisplayText()`).
   */
  getDisplayText(): string {
    return this.view?.getDisplayText() ?? ''
  }

  getIcon(): string {
    return this.view?.getIcon() ?? 'file'
  }

  getEphemeralState(): Record<string, unknown> {
    return (this.view as unknown as { getEphemeralState?: () => Record<string, unknown> })?.getEphemeralState?.() ?? {}
  }

  setEphemeralState(state: Record<string, unknown>): void {
    (this.view as unknown as { setEphemeralState?: (state: Record<string, unknown>) => void })?.setEphemeralState?.(state)
  }

  /**
   * Returns the root split container this leaf lives in. Real Obsidian plugins
   * (day-planner's `isLeafInSidebar`, etc.) call this and compare the result
   * against `workspace.leftSplit`/`rightSplit`/`rootSplit` to tell sidebar
   * leaves from main-area ones. Slatebase collapses both sidebar sides into a
   * single Context Panel, so any 'right-sidebar' leaf reports `rightSplit`.
   */
  getRoot(): unknown {
    const workspace = (this.app as { workspace?: { rootSplit?: unknown; rightSplit?: unknown } })?.workspace
    if (this.location === 'right-sidebar') {
      return workspace?.rightSplit ?? this
    }
    return workspace?.rootSplit ?? this
  }

  /**
   * Whether this leaf's view is still deferred — created but not yet loaded
   * (Obsidian API since 1.7.2, which defers tab initialization until the tab
   * is actually shown). `setViewState()` above always eagerly creates and
   * opens the view synchronously, so a Slatebase leaf is never in a deferred
   * state; plugins written against the deferred-views guide that check this
   * before doing real work see `false` and proceed normally.
   */
  get isDeferred(): boolean {
    return false
  }

  /**
   * Load a deferred view immediately. Since `isDeferred` is always `false`
   * here, there is never anything to load — this resolves right away.
   */
  async loadIfDeferred(): Promise<void> {}

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
      this.runViewUnload(view, view.getViewType())
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

  /**
   * Wraps a WorkspaceLeaf instance with a Proxy for non-emulated API
   * interception. Mirrors AppShim/WorkspaceShim/VaultShim's pattern.
   *
   * Bound methods run with `this` set to the raw instance (not the proxy) so
   * they can still reach private fields like `registry` — which is why
   * `detach()`'s `this.registry.removeLeaf(this)` passes the raw leaf, and
   * `ViewRegistry` keys its `leaves` map by the raw instance too (see
   * `createLeaf()`/`toExternalLeaf()`), translating to the proxy only at the
   * methods that hand leaves back to plugins.
   */
  static wrapWithProxy(instance: WorkspaceLeaf): WorkspaceLeaf & Record<string, unknown> {
    const emulatedProperties = new Set<string | symbol>([
      'view',
      'app',
      'location',
      'containerEl',
      'hoverPopover',
      'parent',
      'on',
      'off',
      'offref',
      'trigger',
      'togglePinned',
      'setPinned',
      'setGroupMember',
      'setGroup',
      'onResize',
      'setViewState',
      'open',
      'getViewState',
      'getDisplayText',
      'getIcon',
      'getEphemeralState',
      'setEphemeralState',
      'getRoot',
      'isDeferred',
      'loadIfDeferred',
      'detach',
      'openFile',
    ]);

    return new Proxy(instance, {
      get(target: WorkspaceLeaf, prop: string | symbol): unknown {
        // `target` (not the Proxy) is passed as the receiver so getters run
        // with `this` bound to the real instance — see WorkspaceShim.wrapWithProxy
        // for why a proxy receiver here silently breaks getters that read
        // un-allowlisted private fields.
        if (emulatedProperties.has(prop)) {
          const value = Reflect.get(target, prop, target);
          if (typeof value === 'function') {
            return value.bind(target);
          }
          return value;
        }

        if (typeof prop === 'symbol') {
          return Reflect.get(target, prop, target);
        }

        // A callable `then` makes this object "thenable" — leaves are routinely
        // returned from async functions (setViewState/ensureSideLeaf/etc.), and
        // the native Promise resolution algorithm would call it as
        // `then(resolve, reject)` instead of just settling with the leaf. Since
        // the no-op below never calls resolve/reject, that await hangs forever.
        // Must stay a plain `undefined`, not fall into the generic
        // callable-no-op path — this is exactly what broke `ensureSideLeaf()`.
        if (prop === 'then') {
          return undefined;
        }

        if (recordGapRead('WorkspaceLeaf', prop)) {
          console.warn(
            `[WorkspaceLeaf] Access to non-emulated leaf method/property "${prop}". ` +
            `Slatebase returns a no-op function here, which is truthy — feature ` +
            `detection like \`if (leaf.${prop})\` will take the wrong branch. ` +
            `Inspect all gaps with window.__slatebasePluginApiGaps().`
          );
        }

        return (...args: unknown[]) => {
          recordGapCall('WorkspaceLeaf', prop);
          void args;
          return undefined;
        };
      },
    }) as WorkspaceLeaf & Record<string, unknown>;
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
  /**
   * All active leaves with their metadata. Keyed by the raw (unwrapped)
   * WorkspaceLeaf instance — internal methods (`notifyViewActivated()`, the
   * `this.leaves.get(leaf)` lookup in `detachLeavesOfType()`, `WorkspaceLeaf`'s
   * own `detach()` calling `removeLeaf(this)`) all operate on raw identity, so
   * the map has to be too. Methods that hand leaves back to plugins translate
   * to the proxy via `toExternalLeaf()`/`rawToProxy` before returning.
   */
  private readonly leaves: Map<WorkspaceLeaf, LeafEntry> = new Map()
  /** Raw leaf → its Proxy-wrapped external identity (see `leaves` above). */
  private readonly rawToProxy = new WeakMap<WorkspaceLeaf, WorkspaceLeaf>()
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
   * Get the ID of the plugin that registered a view type.
   *
   * This is used to attach the CSS-isolation attribute to a view's DOM root.
   */
  getPluginIdForView(viewType: string): string | undefined {
    return this.registrations.get(viewType)?.pluginId
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
    const proxy = WorkspaceLeaf.wrapWithProxy(leaf)
    this.rawToProxy.set(leaf, proxy)
    return proxy
  }

  /**
   * Translate a raw leaf to the Proxy-wrapped identity plugins hold (falls
   * back to the raw leaf itself if it was never registered through
   * `createLeaf()`, which shouldn't happen outside tests constructing a
   * `WorkspaceLeaf` directly).
   */
  private toExternalLeaf(leaf: WorkspaceLeaf): WorkspaceLeaf {
    return this.rawToProxy.get(leaf) ?? leaf
  }

  /**
   * Remove a leaf from tracking. Takes the raw leaf — always called from
   * `WorkspaceLeaf.detach()` as `this.registry.removeLeaf(this)`, where `this`
   * is raw (see `WorkspaceLeaf.wrapWithProxy()`'s doc comment).
   */
  removeLeaf(leaf: WorkspaceLeaf): void {
    this.leaves.delete(leaf)
  }

  /** Raw-identity leaves matching a view type — for internal use only (see `getLeavesOfType()`). */
  private getRawLeavesOfType(viewType: string): WorkspaceLeaf[] {
    return [...this.leaves.keys()].filter(l => l.view?.getViewType() === viewType)
  }

  /**
   * Get all leaves that have a view of the given type. This is `workspace.
   * getLeavesOfType()` itself (WorkspaceShim delegates straight through), so
   * it returns the plugin-facing Proxy identity — internal callers that need
   * to key back into `this.leaves` (`detachLeavesOfType()`) use
   * `getRawLeavesOfType()` instead.
   */
  getLeavesOfType(viewType: string): WorkspaceLeaf[] {
    return this.getRawLeavesOfType(viewType).map(l => this.toExternalLeaf(l))
  }

  /**
   * Get all tracked leaves.
   */
  getAllLeaves(): WorkspaceLeaf[] {
    return [...this.leaves.keys()].map(l => this.toExternalLeaf(l))
  }

  /**
   * Get all leaves located in the main area.
   */
  getMainLeaves(): WorkspaceLeaf[] {
    return [...this.leaves.entries()]
      .filter(([, entry]) => entry.location === 'main')
      .map(([leaf]) => this.toExternalLeaf(leaf))
  }

  /**
   * Get all leaves located in the right sidebar.
   */
  getSidebarLeaves(): WorkspaceLeaf[] {
    return [...this.leaves.entries()]
      .filter(([, entry]) => entry.location === 'right-sidebar')
      .map(([leaf]) => this.toExternalLeaf(leaf))
  }

  /**
   * Get the first leaf with a view of the given type (for deduplication checks).
   */
  getLeafByViewType(viewType: string): WorkspaceLeaf | undefined {
    for (const [leaf, entry] of this.leaves) {
      if (entry.viewType === viewType || leaf.view?.getViewType() === viewType) {
        return this.toExternalLeaf(leaf)
      }
    }
    return undefined
  }

  /**
   * Notify any open view whose file was just renamed — real Obsidian's
   * counterpart to the vault's own 'rename' event (which plugins listening via
   * `vault.on('rename', ...)` already get independently of this).
   *
   * Matched by `oldPath`, not object identity: `vault.getAbstractFileByPath()`
   * builds a fresh TFile on every call (see treeNodeToTFile in vault-shim.ts),
   * so a view's `.file` is essentially never the exact same object `rename()`
   * was called with, even when they describe the same file. `view.file` is
   * updated to the renamed object unconditionally (matching real Obsidian's
   * guarantee that a FileView's `.file` always reflects the file's current
   * path) — `onRename()` is only the optional notification hook on top.
   */
  notifyFileRenamed(file: { path: string }, oldPath: string): void {
    for (const [leaf] of this.leaves) {
      const view = leaf.view as unknown as {
        file?: { path?: string } | null
        onRename?: (f: unknown) => unknown
        getViewType?: () => string
      } | null
      if (!view || view.file == null || view.file.path !== oldPath) continue

      view.file = file

      if (typeof view.onRename !== 'function') continue
      try {
        const result = view.onRename(file)
        if (result && typeof (result as { catch?: unknown }).catch === 'function') {
          (result as Promise<unknown>).catch((err: unknown) => {
            console.error(`[ViewRegistry] onRename rejected for view "${view.getViewType?.() ?? 'unknown'}":`, err)
          })
        }
      } catch (err) {
        console.error(`[ViewRegistry] onRename threw for view "${view.getViewType?.() ?? 'unknown'}":`, err)
      }
    }
  }

  /**
   * Detach all leaves with a given view type.
   * Calls `onSidebarViewDeactivated` for sidebar leaves and `onViewDeactivated` for main leaves.
   */
  async detachLeavesOfType(viewType: string): Promise<void> {
    const matching = this.getRawLeavesOfType(viewType)
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
          // Proxy identity: this leaf typically ends up in React state and
          // later flows back into workspace.setActiveLeaf()/revealLeaf(),
          // whose `allLeaves.includes(leaf)` check needs the same object
          // reference getAllLeaves() hands out (see toExternalLeaf()).
          this.onSidebarViewActivated?.(viewType, view, this.toExternalLeaf(leaf))
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
          if (typeof view.onClose === 'function') {
            await view.onClose()
          }
        } catch (err) {
          console.error(`[ViewRegistry] Error closing view "${view.getViewType?.() ?? 'unknown'}" during clear:`, err)
        }
        try {
          view.containerEl?.remove()
        } catch {
          // containerEl may already be detached or undefined
        }
      }
    }
    this.leaves.clear()
    this.registrations.clear()
  }
}
