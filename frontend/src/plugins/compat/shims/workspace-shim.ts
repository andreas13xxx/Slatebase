import { EventSystem } from '../event-system';
import { resolveWikilinkTarget } from '../../link-resolver';
import type { DirectoryTree } from '../../../types';
import type { EventRef, IWorkspaceShim, TFile } from '../types';
import type { ViewRegistry, WorkspaceLeaf } from '../view-registry';

/**
 * WorkspaceShim — Obsidian Workspace API emulation.
 *
 * Provides:
 * - `getActiveFile()`: returns the currently active TFile or null
 * - Event system: `on`, `off`, `trigger` for workspace events (file-open, active-leaf-change)
 * - `setActiveFile(file)`: external method to update the active file state
 * - `registerView(type, creator)`: register a custom view type (Calendar, Kanban, etc.)
 * - `getLeaf()` / `getRightLeaf()` / `revealLeaf()`: leaf management for plugin views
 * - `getLeavesOfType()` / `detachLeavesOfType()`: view instance queries
 * - `getActiveLeaf()` / `setActiveLeaf()` / `getUnpinnedLeaf()`: active leaf tracking
 * - `createLeafBySplit()` / `splitActiveLeaf()`: split emulation (creates new tab)
 * - ES6 Proxy for non-emulated property/method access (returns no-op with console.warn, once per property)
 *
 * @example
 * ```ts
 * const workspace = new WorkspaceShim();
 * workspace.on('file-open', (file) => console.log('Opened:', file));
 * workspace.setActiveFile(myTFile);
 * ```
 */
export class WorkspaceShim implements IWorkspaceShim {
  private events: EventSystem;
  private activeFile: TFile | null = null;
  private activeLeaf: WorkspaceLeaf | null = null;
  private fileLeaf: WorkspaceLeaf | null = null;
  private warnedProperties: Set<string> = new Set();
  private viewRegistry: ViewRegistry | null = null;
  private app: unknown = null;
  private directoryTree: DirectoryTree | null = null;
  private onOpenFile: ((filePath: string) => void) | null = null;

  /**
   * Whether the workspace layout is ready. In Slatebase, plugins load after
   * FCP, so the layout is always considered ready when plugins execute.
   */
  readonly layoutReady: boolean = true;

  constructor() {
    this.events = new EventSystem();
  }

  /**
   * Attach a ViewRegistry instance for view management.
   * Called by the PluginProvider after constructing both the WorkspaceShim and ViewRegistry.
   */
  setViewRegistry(registry: ViewRegistry, app: unknown): void {
    this.viewRegistry = registry;
    this.app = app;
  }

  /**
   * Returns the currently active TFile when a file tab is active.
   * Returns null when no file tab is active (settings tab, graph view, no tab).
   */
  getActiveFile(): TFile | null {
    return this.activeFile;
  }

  /**
   * Register a callback for the given workspace event.
   * Supported events: 'file-open', 'active-leaf-change'
   */
  on(event: string, callback: (...args: unknown[]) => void): EventRef {
    return this.events.on(event, callback);
  }

  /**
   * Remove a callback for the given workspace event.
   * Multiple calls with the same callback don't throw.
   */
  off(event: string, callback: (...args: unknown[]) => void): void {
    this.events.off(event, callback);
  }

  /**
   * Trigger a workspace event, dispatching to all registered callbacks.
   */
  trigger(event: string, ...args: unknown[]): void {
    this.events.trigger(event, ...args);
  }

  /**
   * Execute a callback when the workspace layout is ready.
   * In Slatebase, plugins load after FCP, so the layout is always ready.
   * The callback is invoked asynchronously (next microtask) to match Obsidian's behavior.
   */
  onLayoutReady(callback: () => void): void {
    Promise.resolve().then(callback);
  }

  /**
   * Update the active file state externally.
   * Emits 'file-open' and 'active-leaf-change' events when the active file changes.
   * Also updates activeLeaf with a synthetic leaf so plugins accessing
   * workspace.activeLeaf get a valid object instead of null.
   */
  setActiveFile(file: TFile | null): void {
    const previousFile = this.activeFile;
    this.activeFile = file;

    // Update activeLeaf: reuse or create a synthetic leaf for regular file tabs
    if (file !== null) {
      if (!this.fileLeaf && this.viewRegistry && this.app) {
        this.fileLeaf = this.viewRegistry.createLeaf(this.app, 'main');
      }
      if (this.fileLeaf) {
        // Attach a minimal view-like object with the file reference
        (this.fileLeaf as unknown as { view: { file: TFile | null; getViewType: () => string } }).view = {
          file,
          getViewType: () => 'markdown',
        };
        this.activeLeaf = this.fileLeaf;
      }
    } else {
      this.activeLeaf = null;
    }

    // Only emit events if the file actually changed
    if (previousFile !== file) {
      this.events.trigger('active-leaf-change', this.activeLeaf);
      if (file !== null) {
        this.events.trigger('file-open', file);
      }
    }
  }

  // ─── View Registration & Leaf Management ──────────────────────────────────

  /**
   * Register a custom view type with its factory function.
   * Plugins call this in onload() to register their views.
   *
   * @param viewType - Unique string identifier for the view type
   * @param creator - Factory function that creates a view instance given a leaf
   * @param pluginId - Optional plugin ID for ownership tracking
   */
  registerView(viewType: string, creator: (leaf: WorkspaceLeaf) => unknown, pluginId?: string): void {
    if (!this.viewRegistry) {
      console.warn(`[WorkspaceShim] registerView("${viewType}") called before ViewRegistry attached — no-op.`);
      return;
    }
    this.viewRegistry.registerView(viewType, creator, pluginId ?? 'unknown');
  }

  /**
   * Get or create a workspace leaf for hosting a view.
   *
   * - If `newLeaf === true`: always creates a new leaf with location 'main'.
   * - If `newLeaf` is falsy/undefined: returns an existing leaf with null view,
   *   or creates a new leaf with location 'main' if none available.
   */
  getLeaf(newLeaf?: boolean | string): WorkspaceLeaf { // eslint-disable-line @typescript-eslint/no-unused-vars
    if (!this.viewRegistry) {
      // Should not happen in practice — create a leaf anyway if registry is available later
      return this.viewRegistry!.createLeaf(this.app, 'main');
    }

    if (newLeaf === true) {
      return this.viewRegistry.createLeaf(this.app, 'main');
    }

    // Find an existing leaf with no view (null view)
    const allLeaves = this.viewRegistry.getAllLeaves();
    const emptyLeaf = allLeaves.find(l => l.view === null);
    if (emptyLeaf) {
      return emptyLeaf;
    }

    return this.viewRegistry.createLeaf(this.app, 'main');
  }

  /**
   * Get or create a leaf in the right sidebar (Context Panel).
   * Creates a leaf with location 'right-sidebar'.
   */
  getRightLeaf(_split?: boolean): WorkspaceLeaf { // eslint-disable-line @typescript-eslint/no-unused-vars
    if (!this.viewRegistry) {
      return this.viewRegistry!.createLeaf(this.app, 'right-sidebar');
    }
    return this.viewRegistry.createLeaf(this.app, 'right-sidebar');
  }

  /**
   * Get or create a leaf in the left sidebar.
   * Slatebase maps both left and right sidebar to the Context Panel (right-sidebar).
   */
  getLeftLeaf(_split?: boolean): WorkspaceLeaf { // eslint-disable-line @typescript-eslint/no-unused-vars
    if (!this.viewRegistry) {
      return this.viewRegistry!.createLeaf(this.app, 'right-sidebar');
    }
    return this.viewRegistry.createLeaf(this.app, 'right-sidebar');
  }

  /**
   * Returns the currently active leaf, or null if no tab is active.
   */
  getActiveLeaf(): WorkspaceLeaf | null {
    return this.activeLeaf;
  }

  /**
   * Set the given leaf as the active leaf.
   * Activates the associated tab. Warns if the leaf is unknown.
   */
  setActiveLeaf(leaf: WorkspaceLeaf): void {
    if (!this.viewRegistry) {
      console.warn('[WorkspaceShim] setActiveLeaf called before ViewRegistry attached — no-op.');
      return;
    }

    const allLeaves = this.viewRegistry.getAllLeaves();
    if (!allLeaves.includes(leaf)) {
      console.warn('[WorkspaceShim] setActiveLeaf called with unknown leaf — no-op.');
      return;
    }

    this.activeLeaf = leaf;
    this.events.trigger('active-leaf-change', leaf);
  }

  /**
   * Get an unpinned leaf. Slatebase has no pinning concept, so this always
   * creates a new leaf with location 'main'.
   */
  getUnpinnedLeaf(): WorkspaceLeaf {
    if (!this.viewRegistry) {
      return this.viewRegistry!.createLeaf(this.app, 'main');
    }
    return this.viewRegistry.createLeaf(this.app, 'main');
  }

  /**
   * Reveal (activate/focus) a leaf.
   * For main leaves, sets it as the active leaf (triggering tab activation).
   * For sidebar leaves, sets it as the active leaf (triggering section activation).
   * Silently ignores unknown leaves.
   */
  revealLeaf(leaf: WorkspaceLeaf): void {
    if (!this.viewRegistry) return;
    const allLeaves = this.viewRegistry.getAllLeaves();
    if (!allLeaves.includes(leaf)) return;
    this.setActiveLeaf(leaf);
  }

  /**
   * Create a new leaf by splitting an existing leaf.
   * Slatebase does not support split panes — creates a new tab instead.
   */
  createLeafBySplit(_leaf: WorkspaceLeaf): WorkspaceLeaf { // eslint-disable-line @typescript-eslint/no-unused-vars
    console.info('[WorkspaceShim] createLeafBySplit: Slatebase does not support split panes — created new tab instead.');
    if (!this.viewRegistry) {
      return this.viewRegistry!.createLeaf(this.app, 'main');
    }
    return this.viewRegistry.createLeaf(this.app, 'main');
  }

  /**
   * Split the active leaf. Slatebase does not support split panes — creates a new tab instead.
   */
  splitActiveLeaf(): WorkspaceLeaf {
    console.info('[WorkspaceShim] splitActiveLeaf: Slatebase does not support split panes — created new tab instead.');
    if (!this.viewRegistry) {
      return this.viewRegistry!.createLeaf(this.app, 'main');
    }
    return this.viewRegistry.createLeaf(this.app, 'main');
  }

  /**
   * Get all leaves that have a view of the given type.
   */
  getLeavesOfType(viewType: string): WorkspaceLeaf[] {
    if (!this.viewRegistry) return [];
    return this.viewRegistry.getLeavesOfType(viewType);
  }

  /**
   * Get the active view if it is an instance of the given class.
   * Returns the view cast to T if the active leaf's view matches, null otherwise.
   */
  getActiveViewOfType<T>(viewClass: new (...args: unknown[]) => T): T | null {
    if (this.activeLeaf?.view instanceof viewClass) {
      return this.activeLeaf.view as T;
    }
    return null;
  }

  /**
   * Iterate over all active leaves (main + sidebar), calling the callback for each.
   * If a callback throws, the error is logged and iteration continues.
   */
  iterateAllLeaves(callback: (leaf: WorkspaceLeaf) => void): void {
    if (!this.viewRegistry) return;
    const allLeaves = this.viewRegistry.getAllLeaves();
    for (const leaf of allLeaves) {
      try {
        callback(leaf);
      } catch (err) {
        console.error('[WorkspaceShim] iterateAllLeaves: callback threw for leaf:', err);
      }
    }
  }

  /**
   * Iterate over root (main area) leaves only, calling the callback for each.
   * Excludes sidebar leaves created via getRightLeaf()/getLeftLeaf().
   * If a callback throws, the error is logged and iteration continues.
   */
  iterateRootLeaves(callback: (leaf: WorkspaceLeaf) => void): void {
    if (!this.viewRegistry) return;
    const mainLeaves = this.viewRegistry.getMainLeaves();
    for (const leaf of mainLeaves) {
      try {
        callback(leaf);
      } catch (err) {
        console.error('[WorkspaceShim] iterateRootLeaves: callback threw for leaf:', err);
      }
    }
  }

  /**
   * Detach (close) all leaves of the given view type.
   * Emits `layout-change` after leaves are detached.
   */
  detachLeavesOfType(viewType: string): void {
    if (!this.viewRegistry) return;
    void this.viewRegistry.detachLeavesOfType(viewType);
    this.events.trigger('layout-change');
  }

  /**
   * Get the ViewRegistry instance (for external access by PluginProvider).
   */
  getViewRegistry(): ViewRegistry | null {
    return this.viewRegistry;
  }

  /**
   * Set the active leaf internally (called by the event bridge when tab changes).
   * Does not emit events — used for synchronizing state from external tab changes.
   */
  setActiveLeafInternal(leaf: WorkspaceLeaf | null): void {
    this.activeLeaf = leaf;
  }

  // ─── Link Navigation ──────────────────────────────────────────────────────────

  /**
   * Set the vault's directory tree for link resolution.
   * Called by the PluginProvider when the tree changes.
   */
  setDirectoryTree(tree: DirectoryTree | null): void {
    this.directoryTree = tree;
  }

  /**
   * Set the callback for opening a file by path.
   * Called by the PluginProvider to wire to tabActions/OPEN_TAB.
   */
  setOnOpenFile(callback: ((filePath: string) => void) | null): void {
    this.onOpenFile = callback;
  }

  /**
   * Open a file directly by its exact path (no wikilink resolution).
   * Used by WorkspaceLeaf.openFile() for newly created files that may not
   * yet be in the directory tree.
   */
  openFileDirectly(filePath: string): void {
    if (!filePath) return;
    if (this.onOpenFile) {
      this.onOpenFile(filePath);
    }
  }

  /**
   * Open a link by resolving the linkText against the vault's directory tree.
   *
   * - No-op for empty linkText (Req 8.4)
   * - Uses resolveWikilinkTarget for resolution (case-insensitive, .md fallback)
   * - If resolved, dispatches tab open via the onOpenFile callback
   * - If not resolved, logs a console.warn and takes no action (Req 8.3)
   *
   * @param linkText - The wikilink target string to resolve
   * @param _sourcePath - The source file path (unused, reserved for future relative resolution)
   */
  async openLinkText(linkText: string, _sourcePath: string): Promise<void> { // eslint-disable-line @typescript-eslint/no-unused-vars
    // Req 8.4: No-op for empty linkText
    if (!linkText || !linkText.trim()) return;

    // Resolve using the wikilink resolver
    const resolved = resolveWikilinkTarget(linkText, this.directoryTree);
    if (!resolved) {
      // Req 8.3: Not resolved → warn and no action
      console.warn(
        `[WorkspaceShim] openLinkText: could not resolve "${linkText}" — no matching file in vault.`
      );
      return;
    }

    // Open the resolved file as a tab
    if (this.onOpenFile) {
      this.onOpenFile(resolved);
    }
  }

  /**
   * Remove all event listeners. Used during cleanup/deactivation.
   */
  removeAllListeners(): void {
    this.events.removeAllListeners();
  }

  /**
   * Creates a Proxy-wrapped instance that intercepts access to non-emulated properties/methods.
   * Non-emulated accesses return a no-op function and log a console.warn (once per property name).
   */
  static createProxied(): WorkspaceShim & Record<string, unknown> {
    const instance = new WorkspaceShim();
    return WorkspaceShim.wrapWithProxy(instance);
  }

  /**
   * Wraps an existing WorkspaceShim instance with a Proxy for non-emulated API interception.
   */
  static wrapWithProxy(instance: WorkspaceShim): WorkspaceShim & Record<string, unknown> {
    const emulatedProperties = new Set<string | symbol>([
      'getActiveFile',
      'on',
      'off',
      'trigger',
      'setActiveFile',
      'removeAllListeners',
      'setViewRegistry',
      'registerView',
      'getLeaf',
      'getRightLeaf',
      'getLeftLeaf',
      'getActiveLeaf',
      'setActiveLeaf',
      'getUnpinnedLeaf',
      'revealLeaf',
      'createLeafBySplit',
      'splitActiveLeaf',
      'getLeavesOfType',
      'getActiveViewOfType',
      'iterateAllLeaves',
      'iterateRootLeaves',
      'detachLeavesOfType',
      'getViewRegistry',
      'setActiveLeafInternal',
      'setDirectoryTree',
      'setOnOpenFile',
      'openLinkText',
      'onLayoutReady',
      'layoutReady',
      // Internal properties that should not trigger warnings
      'events',
      'activeFile',
      'activeLeaf',
      'fileLeaf',
      'warnedProperties',
      'viewRegistry',
      'app',
      'directoryTree',
      'onOpenFile',
    ]);

    return new Proxy(instance, {
      get(target: WorkspaceShim, prop: string | symbol, receiver: unknown): unknown {
        // Allow access to emulated properties directly
        if (emulatedProperties.has(prop)) {
          const value = Reflect.get(target, prop, receiver);
          if (typeof value === 'function') {
            return value.bind(target);
          }
          return value;
        }

        // Allow symbol properties (iterator, toStringTag, etc.) and standard object properties
        if (typeof prop === 'symbol') {
          return Reflect.get(target, prop, receiver);
        }

        // Non-emulated property: warn once and return no-op function
        if (!target.warnedProperties.has(prop)) {
          target.warnedProperties.add(prop);
          console.warn(
            `[WorkspaceShim] Access to non-emulated workspace method/property "${prop}". ` +
            `This method is not supported in Slatebase and will return a no-op.`
          );
        }

        // Return a no-op function for method calls
        return () => undefined;
      },
    }) as WorkspaceShim & Record<string, unknown>;
  }
}
