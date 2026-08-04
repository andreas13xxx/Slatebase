import type {
  IAppShim,
  IFileManagerShim,
  IMetadataCacheShim,
  IVaultShim,
  IWorkspaceShim,
  PluginInstance,
} from '../types';
import { FileManagerShim } from './file-manager-shim';
import { detectPlatform, readPlatformEnvironment } from '../platform-detection';

/**
 * AppShim — Obsidian App API emulation.
 *
 * Provides the central entry point for plugins to access the emulated Obsidian API:
 * - `vault`: IVaultShim instance bound to the current vault context
 * - `workspace`: IWorkspaceShim instance bound to the current vault context
 * - `metadataCache`: IMetadataCacheShim instance bound to the current vault context
 * - `plugins`: plugin registry with plugins map, enabledPlugins set, and getPlugin method
 *
 * Uses an ES6 Proxy to intercept non-emulated property/method access:
 * - Non-emulated properties return `undefined` with a console warning (once per property per plugin)
 * - Non-emulated methods return a no-op function with a console warning (once per property per plugin)
 *
 * Per-vault-context instances: each vault gets its own AppShim instance with sub-shims
 * bound to that same vault context.
 *
 * @example
 * ```ts
 * const appShim = AppShim.create({
 *   vault: myVaultShim,
 *   workspace: myWorkspaceShim,
 *   metadataCache: myMetadataCacheShim,
 *   pluginId: 'my-plugin',
 * });
 * const file = appShim.vault.getAbstractFileByPath('notes/hello.md');
 * ```
 */
export class AppShim implements IAppShim {
  /** The vault shim bound to the current vault context */
  readonly vault: IVaultShim;

  /** The workspace shim bound to the current vault context */
  readonly workspace: IWorkspaceShim;

  /** The metadata cache shim bound to the current vault context */
  readonly metadataCache: IMetadataCacheShim;

  /** The file manager shim for rename/frontmatter/link operations */
  readonly fileManager: IFileManagerShim;

  /** Plugin registry exposing active plugins, enabled set, and lookup */
  readonly plugins: {
    plugins: Record<string, PluginInstance>;
    enabledPlugins: Set<string>;
    manifests: Record<string, { id: string; name: string; version: string }>;
    getPlugin(id: string): PluginInstance | undefined;
  };

  /** Internal plugins stub (used by obsidian-daily-notes-interface and other plugins) */
  readonly internalPlugins: {
    plugins: Record<string, { enabled: boolean; instance: unknown }>;
    getPluginById(id: string): { enabled: boolean; instance: unknown } | undefined;
  };

  /** Plugin ID used for scoping console warnings */
  private readonly pluginId: string;

  /** Set of property names for which a warning has already been logged */
  private readonly warnedProperties: Set<string> = new Set();

  /** Internal plugins map (mutable for registration/unregistration) */
  private readonly pluginsMap: Record<string, PluginInstance>;

  /** Internal enabled plugins set (mutable for registration/unregistration) */
  private readonly enabledPluginsSet: Set<string>;

  /**
   * Creates an AppShim instance.
   *
   * @param options.vault - Vault shim instance bound to vault context
   * @param options.workspace - Workspace shim instance bound to vault context
   * @param options.metadataCache - MetadataCache shim instance bound to vault context
   * @param options.pluginId - Plugin ID for scoping non-emulated access warnings
   */
  constructor(options: {
    vault: IVaultShim;
    workspace: IWorkspaceShim;
    metadataCache: IMetadataCacheShim;
    pluginId: string;
  }) {
    this.vault = options.vault;
    this.workspace = options.workspace;
    this.metadataCache = options.metadataCache;
    this.fileManager = new FileManagerShim(options.vault);
    this.pluginId = options.pluginId;

    this.pluginsMap = {};
    this.enabledPluginsSet = new Set();

    // Create the plugins property with live references
    this.plugins = {
      plugins: this.pluginsMap,
      enabledPlugins: this.enabledPluginsSet,
      manifests: this.pluginsMap as unknown as Record<string, { id: string; name: string; version: string }>,
      getPlugin: (id: string): PluginInstance | undefined => {
        return this.pluginsMap[id];
      },
    };

    // Internal plugins stub — delegates to window.app.internalPlugins so that
    // vault config updates (e.g. daily-notes folder) are visible to all plugin instances.
    // Falls back to a local default if window.app.internalPlugins is not yet initialized.
    const globalInternalPlugins = (window as unknown as { app?: { internalPlugins?: AppShim['internalPlugins'] } }).app?.internalPlugins;
    if (globalInternalPlugins) {
      this.internalPlugins = globalInternalPlugins;
    } else {
      this.internalPlugins = {
        plugins: {
          'daily-notes': { enabled: true, instance: { options: { format: 'YYYY-MM-DD', folder: '', template: '' } } },
          'templates': { enabled: false, instance: { options: { folder: '' } } },
        },
        getPluginById: (id: string) => {
          const p = this.internalPlugins.plugins[id];
          return p ?? { enabled: false, instance: { options: {} } };
        },
      };
    }
  }

  /**
   * embedRegistry — Obsidian-internal API for creating embedded views.
   * Kanban uses it to extract the MarkdownEditor class from the prototype chain.
   * The FakeEditor creates a real CodeMirror 6 EditorView so Kanban's inline
   * card editors can work (they call .set(), .cm.dispatch(), etc.).
   */
  readonly embedRegistry = {
    embedByExtension: {
      md: () => {
        const FakeEditor = class {
          cm: unknown
          containerEl: HTMLElement
          constructor(containerEl?: unknown) {
            this.containerEl = (containerEl instanceof HTMLElement) ? containerEl : document.createElement('div')
            // Lazy-init CM6: dynamically import to avoid top-level dep issues
            this.cm = null
            try {
              // eslint-disable-next-line @typescript-eslint/no-require-imports
              const cmView = (globalThis as unknown as { __codemirrorView?: { EditorView: unknown } }).__codemirrorView
              const cmState = (globalThis as unknown as { __codemirrorState?: { EditorState: unknown } }).__codemirrorState
              if (cmView && cmState) {
                const EV = cmView.EditorView as new (config: unknown) => { state: { doc: { length: number; toString(): string } }; dispatch(tr: unknown): void; destroy(): void; focus(): void }
                const ES = cmState.EditorState as { create(config: unknown): unknown }
                const state = ES.create({ doc: '' })
                this.cm = new EV({ state, parent: this.containerEl })
              }
            } catch { /* CM6 not available — cm stays null */ }
          }
          set(value: string) {
            const cm = this.cm as { state: { doc: { length: number } }; dispatch(tr: unknown): void } | null
            if (cm) {
              cm.dispatch({ changes: { from: 0, to: cm.state.doc.length, insert: value } })
            }
          }
          get(): string {
            const cm = this.cm as { state: { doc: { toString(): string } } } | null
            return cm ? cm.state.doc.toString() : ''
          }
          destroy() {
            const cm = this.cm as { destroy(): void } | null
            if (cm) cm.destroy()
          }
          getDoc() { return { getValue: () => this.get() } }
          clear() { this.set('') }
          focus() {
            const cm = this.cm as { focus(): void } | null
            if (cm) cm.focus()
          }
        }
        const editMode = Object.create(Object.create(FakeEditor.prototype))
        return {
          load: () => {},
          unload: () => {},
          editable: false,
          showEditor: () => {},
          editMode,
        }
      },
    },
  }

  /**
   * commands — Obsidian-internal command manager.
   * Kanban monkey-patches commands.executeCommand to intercept hotkeys.
   * LiveSync calls executeCommandById('app:reload') to restart.
   */
  readonly commands = {
    commands: {} as Record<string, unknown>,
    executeCommand: (_command: unknown) => {},
    executeCommandById: (id: string) => {
      if (id === 'app:reload') {
        // Simulate Obsidian's app reload by refreshing the page
        window.location.reload()
      }
      return Promise.resolve()
    },
  }

  /**
   * Whether the app is running on a mobile device. Derived from the same
   * detection as `Platform.isMobile`, so the two cannot disagree — plugins read
   * both, and a browser build serves phones as well as desktops.
   */
  readonly isMobile: boolean = detectPlatform(readPlatformEnvironment()).isMobile

  /** Unique app ID (vault identifier). Used by Dataview, Excalidraw for caching. */
  get appId(): string {
    return `slatebase-${this.vault.getName()}`
  }

  /** SecretStorage stub — stores secrets in localStorage (not truly secure, but functional). */
  readonly secretStorage = {
    _secrets: new Map<string, string>(),
    setSecret(id: string, secret: string): void { this._secrets.set(id, secret) },
    getSecret(id: string): string | null { return this._secrets.get(id) ?? null },
    listSecrets(): string[] { return [...this._secrets.keys()] },
  }

  /**
   * Retrieve value from localStorage for this vault (Obsidian API since 1.8.7).
   * Uses a vault-scoped prefix to isolate per-vault data.
   */
  loadLocalStorage(key: string): string | null {
    const vaultName = this.vault.getName()
    const prefixedKey = `slatebase-vault-${vaultName}-${key}`
    return localStorage.getItem(prefixedKey)
  }

  /**
   * Save vault-specific value to localStorage (Obsidian API since 1.8.7).
   * If data is null, the entry will be cleared.
   */
  saveLocalStorage(key: string, data: unknown | null): void {
    const vaultName = this.vault.getName()
    const prefixedKey = `slatebase-vault-${vaultName}-${key}`
    if (data === null || data === undefined) {
      localStorage.removeItem(prefixedKey)
    } else {
      localStorage.setItem(prefixedKey, typeof data === 'string' ? data : JSON.stringify(data))
    }
  }

  /**
   * Register a plugin instance in the plugins map.
   * Makes the plugin accessible via `app.plugins.plugins[id]` and `app.plugins.getPlugin(id)`.
   *
   * @param id - The plugin ID
   * @param instance - The plugin instance to register
   */
  registerPlugin(id: string, instance: PluginInstance): void {
    this.pluginsMap[id] = instance;
    this.enabledPluginsSet.add(id);
  }

  /**
   * Unregister a plugin instance from the plugins map.
   * Removes the plugin from both the plugins map and the enabledPlugins set.
   *
   * @param id - The plugin ID to unregister
   */
  unregisterPlugin(id: string): void {
    delete this.pluginsMap[id];
    this.enabledPluginsSet.delete(id);
  }

  /**
   * Creates a Proxy-wrapped AppShim instance that intercepts non-emulated property access.
   *
   * Non-emulated property access:
   * - Returns `undefined` for property reads
   * - Returns a no-op function for method-like access (callers invoke it as a function)
   * - Logs a console.warn once per property name per plugin instance
   *
   * @param options - Configuration for the AppShim
   * @returns A Proxy-wrapped AppShim instance
   */
  static create(options: {
    vault: IVaultShim;
    workspace: IWorkspaceShim;
    metadataCache: IMetadataCacheShim;
    pluginId: string;
  }): AppShim & Record<string, unknown> {
    const instance = new AppShim(options);
    return AppShim.wrapWithProxy(instance);
  }

  /**
   * Wraps an existing AppShim instance with a Proxy for non-emulated API interception.
   *
   * @param instance - The AppShim instance to wrap
   * @returns The Proxy-wrapped instance
   */
  static wrapWithProxy(instance: AppShim): AppShim & Record<string, unknown> {
    const emulatedProperties = new Set<string | symbol>([
      'vault',
      'workspace',
      'metadataCache',
      'fileManager',
      'plugins',
      'internalPlugins',
      'embedRegistry',
      'commands',
      'loadLocalStorage',
      'saveLocalStorage',
      'isMobile',
      'appId',
      'secretStorage',
      // Internal/utility properties
      'pluginId',
      'warnedProperties',
      'pluginsMap',
      'enabledPluginsSet',
      'registerPlugin',
      'unregisterPlugin',
    ]);

    return new Proxy(instance, {
      get(target: AppShim, prop: string | symbol, receiver: unknown): unknown {
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

        // Non-emulated property: warn once per property name per plugin instance
        if (!target.warnedProperties.has(prop)) {
          target.warnedProperties.add(prop);
          console.warn(
            `[AppShim] Plugin "${target.pluginId}" accessed non-emulated app property/method "${prop}". ` +
            `This API is not supported in Slatebase and will return undefined/no-op.`
          );
        }

        // Return a no-op function that returns undefined
        // This handles both property reads (returns a callable no-op) and method calls
        return () => undefined;
      },
    }) as AppShim & Record<string, unknown>;
  }
}
