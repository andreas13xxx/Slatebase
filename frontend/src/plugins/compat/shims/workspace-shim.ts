import { EventSystem } from '../event-system';
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
  private warnedProperties: Set<string> = new Set();
  private viewRegistry: ViewRegistry | null = null;
  private app: unknown = null;

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
   * Update the active file state externally.
   * Emits 'file-open' and 'active-leaf-change' events when the active file changes.
   */
  setActiveFile(file: TFile | null): void {
    const previousFile = this.activeFile;
    this.activeFile = file;

    // Only emit events if the file actually changed
    if (previousFile !== file) {
      this.events.trigger('active-leaf-change', file);
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
   */
  registerView(viewType: string, creator: (leaf: WorkspaceLeaf) => unknown): void {
    if (!this.viewRegistry) {
      console.warn(`[WorkspaceShim] registerView("${viewType}") called before ViewRegistry attached — no-op.`);
      return;
    }
    this.viewRegistry.registerView(viewType, creator);
  }

  /**
   * Get a leaf to host a view. Creates a new leaf in the right panel.
   * Obsidian supports 'split', 'tab', 'window' — we always create in the right panel.
   */
  getLeaf(_newLeaf?: boolean | string): WorkspaceLeaf | undefined { // eslint-disable-line @typescript-eslint/no-unused-vars
    if (!this.viewRegistry) return undefined;
    return this.viewRegistry.createLeaf(this.app);
  }

  /**
   * Get or create a leaf in the right panel (sidebar).
   * This is what most sidebar-plugins (Calendar, Outline) use.
   */
  getRightLeaf(_split?: boolean): WorkspaceLeaf | undefined { // eslint-disable-line @typescript-eslint/no-unused-vars
    if (!this.viewRegistry) return undefined;
    return this.viewRegistry.createLeaf(this.app);
  }

  /**
   * Get or create a leaf in the left panel (sidebar).
   */
  getLeftLeaf(_split?: boolean): WorkspaceLeaf | undefined { // eslint-disable-line @typescript-eslint/no-unused-vars
    if (!this.viewRegistry) return undefined;
    return this.viewRegistry.createLeaf(this.app);
  }

  /**
   * Reveal (activate/focus) a leaf. In Slatebase this is a no-op since we auto-show plugin views.
   */
  revealLeaf(_leaf: WorkspaceLeaf): void { // eslint-disable-line @typescript-eslint/no-unused-vars
    // Views are automatically shown when setViewState is called
  }

  /**
   * Get all leaves that have a view of the given type.
   */
  getLeavesOfType(viewType: string): WorkspaceLeaf[] {
    if (!this.viewRegistry) return [];
    return this.viewRegistry.getLeavesOfType(viewType);
  }

  /**
   * Detach (close) all leaves of the given view type.
   */
  detachLeavesOfType(viewType: string): void {
    if (!this.viewRegistry) return;
    void this.viewRegistry.detachLeavesOfType(viewType);
  }

  /**
   * Get the ViewRegistry instance (for external access by PluginProvider).
   */
  getViewRegistry(): ViewRegistry | null {
    return this.viewRegistry;
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
      'revealLeaf',
      'getLeavesOfType',
      'detachLeavesOfType',
      'getViewRegistry',
      // Internal properties that should not trigger warnings
      'events',
      'activeFile',
      'warnedProperties',
      'viewRegistry',
      'app',
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
