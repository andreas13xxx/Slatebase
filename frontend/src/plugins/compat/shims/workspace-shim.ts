import { EventSystem } from '../event-system';
import type { EventRef, IWorkspaceShim, TFile } from '../types';

/**
 * WorkspaceShim — Obsidian Workspace API emulation.
 *
 * Provides:
 * - `getActiveFile()`: returns the currently active TFile or null
 * - Event system: `on`, `off`, `trigger` for workspace events (file-open, active-leaf-change)
 * - `setActiveFile(file)`: external method to update the active file state
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

  constructor() {
    this.events = new EventSystem();
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
      // Internal properties that should not trigger warnings
      'events',
      'activeFile',
      'warnedProperties',
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
