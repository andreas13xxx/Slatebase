import type {
  Hotkey,
  IAppShim,
  IFileManagerShim,
  IMetadataCacheShim,
  IVaultShim,
  IWorkspaceShim,
  PluginInstance,
  PluginManifestData,
} from '../types';
import { FileManagerShim } from './file-manager-shim';
import { detectPlatform, readPlatformEnvironment } from '../platform-detection';
import { recordGapRead, recordGapCall, isObjectPrototypeMember } from '../api-gap-registry';
import type { Command, ICommandRegistry } from '../command-registry';
import { scopeForPlugin } from '../plugin-execution-context';
import { warnNoOp } from '../log';
import { Keymap, Scope, SecretStorage } from '../obsidian-api-extensions';
import { createEmbedRegistryShim } from '../embed-registry';

/** The shape of Obsidian's internal `app.commands`. */
export type CommandManagerShim = ReturnType<typeof createCommandManager>

/**
 * Build Obsidian's internal command manager over a command registry.
 *
 * A standalone factory rather than an AppShim field because `window.app` needs
 * the same manager: AppShim instances are per-plugin, but `window.app` is one
 * global that plugins also reach commands through (Kanban patches
 * `executeCommand`, editing-toolbar reads `findCommand` at startup). Building it
 * from the shared registry is what keeps both paths pointed at one command set.
 *
 * Kanban monkey-patches commands.executeCommand to intercept hotkeys.
 * LiveSync calls executeCommandById('app:reload') to restart.
 */
export function createCommandManager(commandRegistry: ICommandRegistry | undefined) {
  return {
    get commands(): Record<string, Command> {
      const out: Record<string, Command> = {}
      for (const cmd of commandRegistry?.getCommands() ?? []) out[cmd.id] = cmd
      return out
    },
    findCommand: (id: string): Command | undefined => commandRegistry?.getCommand(id),
    listCommands: (): Command[] => commandRegistry?.getCommands() ?? [],
    executeCommand: (command: { id: string }): boolean => {
      if (!commandRegistry?.getCommand(command.id)) return false
      commandRegistry.executeCommand(command.id)
      return true
    },
    executeCommandById: (id: string): boolean => {
      if (id === 'app:reload') {
        // Simulate Obsidian's app reload by refreshing the page
        window.location.reload()
        return true
      }
      if (!commandRegistry?.getCommand(id)) return false
      commandRegistry.executeCommand(id)
      return true
    },
  }
}

/** The shape of Obsidian's internal `app.hotkeyManager`. */
export type HotkeyManagerShim = ReturnType<typeof createHotkeyManager>

/**
 * Build Obsidian's internal hotkey manager over a command registry.
 *
 * Undocumented but widely used — Excalidraw's `addDefaultHotkeys`,
 * editing-toolbar's `customKeys[id]` lookups during startup command-ID
 * migration. `customKeys` holds user-configured overrides: always empty here
 * since Slatebase has no hotkey-customization UI, but it must exist as an object
 * or plugins that index into it directly (`customKeys[id]`) crash on
 * `undefined[id]`.
 */
export function createHotkeyManager(commandRegistry: ICommandRegistry | undefined) {
  const getDefaultKeys = (): Record<string, Hotkey[]> => {
    const out: Record<string, Hotkey[]> = {}
    for (const cmd of commandRegistry?.getCommands() ?? []) {
      if (cmd.hotkeys?.length) out[cmd.id] = cmd.hotkeys
    }
    return out
  }
  return {
    customKeys: {} as Record<string, Hotkey[]>,
    get defaultKeys(): Record<string, Hotkey[]> {
      return getDefaultKeys()
    },
    getHotkeys: (commandId: string): Hotkey[] | undefined => getDefaultKeys()[commandId],
    getDefaultHotkeys: (commandId: string): Hotkey[] | undefined => getDefaultKeys()[commandId],
    // Slatebase has no per-user hotkey customisation to write into, so a
    // plugin's "rebind this command" UI reports success and changes nothing.
    // Warning is the only thing that makes that visible from the outside.
    setHotkeys: (commandId: string, _hotkeys: Hotkey[]): void => {
      warnNoOp('hotkeyManager', 'setHotkeys', `Custom hotkey for "${commandId}" was not persisted.`)
    },
    removeHotkeys: (commandId: string): void => {
      warnNoOp('hotkeyManager', 'removeHotkeys', `Hotkey removal for "${commandId}" had no effect.`)
    },
    addDefaultHotkeys: (commandId: string, hotkeys: Hotkey[]): void => {
      for (const hk of hotkeys) commandRegistry?.registerHotkey(commandId, hk)
    },
    // Obsidian recomputes its hotkey lookup table here. Ours is derived on read
    // (see defaultKeys), so there is nothing to rebuild.
    bake: (): void => {},
  }
}

/**
 * The app-wide `Scope` backing `App.scope`. Real Obsidian has exactly one App
 * instance, so `app.scope.register(...)` calls from different plugins accumulate
 * into the same global hotkey set; sharing one instance here (rather than one per
 * AppShim, since every plugin gets its own AppShim) reproduces that. Pushed onto
 * the shared scope stack once — see `ensureAppScopeActive` — so registrations
 * actually receive keydown events instead of sitting inert.
 */
const appScope = new Scope();
let appScopeActive = false;

/**
 * Push the shared `appScope` onto the scope stack the first time any AppShim is
 * constructed. It is the base of the stack and is never popped, matching real
 * Obsidian where the root scope is active for the lifetime of the app.
 */
function ensureAppScopeActive(keymap: Keymap): void {
  if (appScopeActive) return;
  keymap.pushScope(appScope);
  appScopeActive = true;
}

/**
 * AppShim — Obsidian App API emulation.
 *
 * Provides the central entry point for plugins to access the emulated Obsidian API:
 * - `vault`: IVaultShim instance bound to the current vault context
 * - `workspace`: IWorkspaceShim instance bound to the current vault context
 * - `metadataCache`: IMetadataCacheShim instance bound to the current vault context
 * - `plugins`: plugin registry with plugins map, enabledPlugins set, and getPlugin method
 *
 * Uses an ES6 Proxy to intercept non-emulated property/method access. A `get`
 * trap cannot tell a property read from a method lookup, so both receive the
 * same callable no-op, warned once per property per plugin. Note that a function
 * is truthy, so `if (app.someMissingThing)` takes the wrong branch — every such
 * access is recorded in the api-gap-registry so the gaps stay enumerable.
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
    manifests: Record<string, PluginManifestData>;
    getPlugin(id: string): PluginInstance | undefined;
    loadManifests(): Promise<void>;
    requestSaveConfig(): Promise<void>;
    enablePluginAndSave(pluginId: string): Promise<void>;
    disablePluginAndSave(pluginId: string): Promise<void>;
  };

  /**
   * Internal plugins stub (used by obsidian-daily-notes-interface and other plugins).
   * Most entries are `{ enabled, instance }` wrappers; core plugins that expose their
   * own Component-like API directly (e.g. `canvas`, which Excalidraw reaches into via
   * `._loaded`/`.load()`/`.views.canvas(leaf)`) don't fit that shape, hence `unknown`.
   */
  readonly internalPlugins: {
    plugins: Record<string, unknown>;
    getPluginById(id: string): { enabled: boolean; instance: unknown } | undefined;
    getEnabledPluginById(id: string): unknown;
  };

  /**
   * The App's global `Scope` (documented API: `App.scope`). Plugins call
   * `app.scope.register(modifiers, key, callback)` directly to add app-wide
   * hotkeys — e.g. obsidian-tasks-plugin registers its "toggle done" shortcut
   * this way in onload(). Shared across every plugin's AppShim (see `appScope`
   * above) and kept active on the scope stack for the app's lifetime.
   */
  readonly scope: Scope;

  /** Plugin ID used for scoping console warnings */
  private readonly pluginId: string;

  /** Internal plugins map (mutable for registration/unregistration) */
  private readonly pluginsMap: Record<string, PluginInstance>;

  /** Internal enabled plugins set (mutable for registration/unregistration) */
  private readonly enabledPluginsSet: Set<string>;

  /** Internal id → manifest map (mutable for registration/unregistration) */
  private readonly manifestsMap: Record<string, PluginManifestData>;

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
    commandRegistry?: ICommandRegistry;
    apiClient?: { listPluginSecrets(vaultId: string, pluginId: string): Promise<string[]>; getPluginSecret(vaultId: string, pluginId: string, secretId: string): Promise<string | null>; setPluginSecret(vaultId: string, pluginId: string, secretId: string, value: string): Promise<void>; deletePluginSecret(vaultId: string, pluginId: string, secretId: string): Promise<void> };
    vaultId?: string;
    pluginManager?: {
      /** Re-fetch manifest data for installed plugins from the backend. */
      loadManifests(): Promise<void>;
      /** Wait until any in-flight plugin registry writes have been persisted. */
      requestSaveConfig(): Promise<void>;
      /** Enable (loading it first if needed) and persist the plugin's enabled state. */
      enablePluginAndSave(pluginId: string): Promise<void>;
      /** Disable and persist the plugin's disabled state. */
      disablePluginAndSave(pluginId: string): Promise<void>;
    };
  }) {
    this.vault = options.vault;
    const legacyPrefix = `slatebase-vault-${options.vault.getName()}-secret:`;
    if (options.apiClient && options.vaultId) {
      this.secretStorage = new SecretStorage({
        apiClient: options.apiClient,
        vaultId: options.vaultId,
        pluginId: options.pluginId,
        legacyPrefix,
      });
      this.secretStorage.initialize().catch(() => { /* degraded mode */ });
    } else {
      this.secretStorage = new SecretStorage({
        apiClient: { listPluginSecrets: async () => [], getPluginSecret: async () => null, setPluginSecret: async () => {}, deletePluginSecret: async () => {} },
        vaultId: '',
        pluginId: options.pluginId,
        legacyPrefix,
      });
    }
    // Scoped per-plugin: `on`/`onLayoutReady` bind options.pluginId into a
    // closure so any callback registered through this plugin's `app.workspace`
    // (and its deferred/event-triggered invocations) is tagged correctly for
    // createEl()'s data-plugin-id, regardless of how much async work the
    // plugin's onload() does first. See plugin-execution-context.ts — ambient
    // "currently executing plugin" tracking alone doesn't survive `await`.
    this.workspace = scopeForPlugin(options.workspace, options.pluginId, ['on', 'onLayoutReady']);
    this.metadataCache = options.metadataCache;
    this.fileManager = FileManagerShim.wrapWithProxy(new FileManagerShim(options.vault));
    this.pluginId = options.pluginId;
    // Built here rather than as field initializers: those run before the
    // constructor body, so they would capture commandRegistry as undefined.
    this.commands = createCommandManager(options.commandRegistry);
    this.hotkeyManager = createHotkeyManager(options.commandRegistry);
    this.scope = appScope;
    ensureAppScopeActive(this.keymap);

    // Plugins registry — delegates to window.app.plugins so that every plugin's
    // AppShim (and the `leaf.app` used by opened views) shares one registry.
    // Without this, `app.plugins.getPlugin(id)` — used by plugins to look up
    // their own or another plugin's instance/settings (e.g. Excalidraw) —
    // always returned undefined, since each AppShim otherwise got its own
    // private, never-populated map. Falls back to a local map if window.app
    // isn't initialized yet (e.g. in unit tests constructing AppShim directly).
    const globalPlugins = (window as unknown as {
      app?: {
        plugins?: {
          plugins: Record<string, PluginInstance>;
          enabledPlugins: Set<string>;
          manifests?: Record<string, PluginManifestData>;
        };
      };
    }).app?.plugins;
    this.pluginsMap = globalPlugins?.plugins ?? {};
    this.enabledPluginsSet = globalPlugins?.enabledPlugins ?? new Set();
    // Obsidian's `manifests` maps plugin id → manifest. It used to be aliased
    // to `pluginsMap`, which maps id → plugin *instance*: every read of
    // `app.plugins.manifests[id].version` (or `.id`, `.name`) came back
    // undefined, since an instance carries those under `.manifest`.
    this.manifestsMap = globalPlugins?.manifests ?? {};

    // Create the plugins property with live references
    this.plugins = {
      plugins: this.pluginsMap,
      enabledPlugins: this.enabledPluginsSet,
      manifests: this.manifestsMap,
      getPlugin: (id: string): PluginInstance | undefined => {
        return this.pluginsMap[id];
      },
      loadManifests: async (): Promise<void> => {
        if (options.pluginManager?.loadManifests) {
          await options.pluginManager.loadManifests();
        } else {
          warnNoOp(this.pluginId, 'plugins.loadManifests');
        }
      },
      requestSaveConfig: async (): Promise<void> => {
        if (options.pluginManager?.requestSaveConfig) {
          await options.pluginManager.requestSaveConfig();
        } else {
          warnNoOp(this.pluginId, 'plugins.requestSaveConfig');
        }
      },
      enablePluginAndSave: async (pluginId: string): Promise<void> => {
        if (options.pluginManager?.enablePluginAndSave) {
          await options.pluginManager.enablePluginAndSave(pluginId);
        } else {
          warnNoOp(this.pluginId, 'plugins.enablePluginAndSave');
        }
      },
      disablePluginAndSave: async (pluginId: string): Promise<void> => {
        if (options.pluginManager?.disablePluginAndSave) {
          await options.pluginManager.disablePluginAndSave(pluginId);
        } else {
          warnNoOp(this.pluginId, 'plugins.disablePluginAndSave');
        }
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
          // See installObsidianGlobals() in install-globals.ts for why this stub
          // exists — kept in sync here for the (test-only) path where AppShim
          // constructs its own internalPlugins instead of sharing window.app's.
          'canvas': {
            enabled: false,
            _loaded: true,
            load: () => {},
            views: {
              canvas: (_leaf: unknown) => ({
                canvas: {
                  createFileNode: (_opts: unknown) => ({
                    setFilePath: (_path: string, _subpath?: string) => {},
                    render: () => {},
                    containerEl: document.createElement('div'),
                  }),
                  removeNode: (_node: unknown) => {},
                  setReadonly: (_readonly: boolean) => {},
                },
              }),
            },
          },
        },
        getPluginById: (id: string) => {
          const p = this.internalPlugins.plugins[id] as { enabled: boolean; instance: unknown } | undefined;
          return p ?? { enabled: false, instance: { options: {} } };
        },
        getEnabledPluginById: (id: string) => {
          const p = this.internalPlugins.plugins[id] as { enabled: boolean; instance: unknown } | undefined;
          return p?.enabled ? p.instance : null;
        },
      };
    }
  }

  /**
   * embedRegistry — Obsidian-internal API for rendering custom embed types
   * inline for `![[file.ext]]` (undocumented; not in the public
   * obsidian.d.ts — see ../embed-registry.ts for the full implementation,
   * the real-plugin sources it was cross-checked against, and the
   * `embedByExtension.md` default it seeds for Kanban's card-editor hack).
   * `window.app.embedRegistry` (set up in plugin-context.ts/install-globals.ts)
   * shares the same underlying registrations as `this.app.embedRegistry` here
   * — both are built by `createEmbedRegistryShim()` over one module-level
   * `embedByExtension` record, so a plugin's `registerExtension()` call is
   * visible however a later reader reaches the registry.
   */
  readonly embedRegistry = createEmbedRegistryShim()

  /**
   * commands — Obsidian-internal command manager.
   * Kanban monkey-patches commands.executeCommand to intercept hotkeys.
   * LiveSync calls executeCommandById('app:reload') to restart.
   * editing-toolbar calls commands.findCommand() during startup to migrate command IDs.
   * Backed by the shared CommandRegistry when one is provided, so this reflects the
   * same commands plugins register via `this.addCommand(...)`.
   */
  readonly commands: CommandManagerShim

  /**
   * hotkeyManager — Obsidian-internal hotkey manager (undocumented but widely used
   * by plugins, e.g. Excalidraw's `addDefaultHotkeys`, editing-toolbar's
   * `customKeys[id]` lookups during startup command-ID migration).
   * `customKeys` holds user-configured overrides — always empty here since Slatebase
   * has no hotkey-customization UI yet, but it must exist as an object or plugins
   * that index into it directly (`customKeys[id]`) crash on `undefined[id]`.
   * `defaultKeys` and `addDefaultHotkeys` are backed by the shared CommandRegistry.
   */
  readonly hotkeyManager: HotkeyManagerShim

  /**
   * setting — Obsidian's Settings modal controller (undocumented but used by
   * plugins to steer users to their own settings tab, e.g. Excalidraw calls
   * `app.setting.open()` / `openTabById(id)` on a version mismatch to prompt
   * reconfiguration). Slatebase's settings UI isn't reachable from the shim
   * layer, so these are safe no-ops — they let plugins continue instead of
   * crashing on `app.setting.open is not a function`.
   */
  readonly setting = {
    open: (): void => {},
    close: (): void => {},
    openTabById: (_id: string): boolean => false,
  }

  /**
   * metadataTypeManager — Obsidian-internal registry of frontmatter property
   * types (undocumented; backs the Properties view's type icons/pickers).
   * obsidian-tasks-plugin reads `getAllProperties()` on startup and calls
   * `setType()` to register its own fields (e.g. "due" as a date) so they get
   * the right editor in Obsidian's Properties view. Slatebase has no
   * Properties view to reflect these into, so `setType` just records them —
   * enough that `getAllProperties()`/`getPropertyInfo()` echo back what a
   * plugin registered instead of crashing on a missing method.
   */
  readonly metadataTypeManager = {
    properties: {} as Record<string, { name: string; type: string }>,
    getAllProperties: (): Record<string, { name: string; type: string }> => this.metadataTypeManager.properties,
    getPropertyInfo: (property: string): { name: string; type: string } | undefined =>
      this.metadataTypeManager.properties[property.toLowerCase()],
    setType: (property: string, type: string): void => {
      this.metadataTypeManager.properties[property.toLowerCase()] = { name: property, type };
    },
  }

  /**
   * keymap — Obsidian's hotkey scope manager. Views and modals push their own
   * `Scope` here (typically `app.keymap.pushScope(this.scope)` in `onOpen()`,
   * popped again in `onClose()`) to get first refusal on keydown events while
   * active. `pushScope`/`popScope` operate on a stack shared across every
   * `Keymap` instance (see `obsidian-api-extensions.ts`), matching real
   * Obsidian where hotkey scoping is global to the window, not per-App.
   */
  readonly keymap = new Keymap()

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

  /**
   * Returns the user's configured accent color, resolved from the same
   * `--interactive-accent` CSS variable Slatebase's theme already exposes
   * (see obsidian-compat.css). Excalidraw's dynamic-styling code
   * (`setDynamicStyle` → `app.getAccentColor()`) blends the toolbar's
   * palette against this color — without it the call throws (missing
   * method), `setDynamicStyle`'s try/catch swallows it and logs "Dynamic
   * styling failed", and every CSS variable it would have set on the
   * toolbar (icon fill, button backgrounds, borders, ...) is left unset,
   * which is why several toolbar icons render blank/invisible.
   */
  getAccentColor(): string {
    const value = getComputedStyle(document.documentElement).getPropertyValue('--interactive-accent').trim()
    return value || '#7c3aed'
  }

  /**
   * SecretStorage (Obsidian API since 1.11.4) — vault-scoped, backed by a
   * server-side AES-256-GCM encrypted store; localStorage is only a legacy-
   * migration/offline fallback, not the source of truth.
   * Assigned in the constructor, not here — see the field-initializer-ordering
   * note above `this.commands = createCommandManager(...)`: this needs
   * `this.vault`, which isn't set yet when field initializers run.
   */
  readonly secretStorage: SecretStorage

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
   * Undocumented internal API that opens Obsidian's "what's new" release-notes
   * screen. Slatebase has no such screen, so this is a deliberate no-op rather
   * than a tracked gap — declaring it explicitly (and listing it in
   * `emulatedProperties`) keeps `if (app.showReleaseNotes)` feature-detection
   * from tripping the generic "non-emulated" warning, since the real method is
   * genuinely present, it just does nothing.
   */
  showReleaseNotes(): void {
    warnNoOp('App', 'showReleaseNotes', 'No release notes screen is shown.')
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
    if (instance.manifest) {
      this.manifestsMap[id] = instance.manifest;
    }
  }

  /**
   * Unregister a plugin instance from the plugins map.
   * Removes the plugin from both the plugins map and the enabledPlugins set.
   *
   * @param id - The plugin ID to unregister
   */
  unregisterPlugin(id: string): void {
    delete this.pluginsMap[id];
    delete this.manifestsMap[id];
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
    commandRegistry?: ICommandRegistry;
    apiClient?: { listPluginSecrets(vaultId: string, pluginId: string): Promise<string[]>; getPluginSecret(vaultId: string, pluginId: string, secretId: string): Promise<string | null>; setPluginSecret(vaultId: string, pluginId: string, secretId: string, value: string): Promise<void>; deletePluginSecret(vaultId: string, pluginId: string, secretId: string): Promise<void> };
    vaultId?: string;
    pluginManager?: {
      loadManifests(): Promise<void>;
      requestSaveConfig(): Promise<void>;
      enablePluginAndSave(pluginId: string): Promise<void>;
      disablePluginAndSave(pluginId: string): Promise<void>;
    };
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
      'hotkeyManager',
      'loadLocalStorage',
      'saveLocalStorage',
      'keymap',
      'scope',
      'metadataTypeManager',
      'isMobile',
      'appId',
      'secretStorage',
      'setting',
      'showReleaseNotes',
      // Internal/utility properties
      'pluginId',
      'pluginsMap',
      'enabledPluginsSet',
      'registerPlugin',
      'unregisterPlugin',
    ]);

    return new Proxy(instance, {
      get(target: AppShim, prop: string | symbol): unknown {
        // Allow access to emulated properties directly. `target` (not the
        // Proxy) is passed as the receiver so getters run with `this` bound
        // to the real instance — see WorkspaceShim.wrapWithProxy for why a
        // proxy receiver here silently breaks getters that read un-allowlisted
        // private fields.
        if (emulatedProperties.has(prop)) {
          const value = Reflect.get(target, prop, target);
          if (typeof value === 'function') {
            return value.bind(target);
          }
          return value;
        }

        // Allow symbol properties (iterator, toStringTag, etc.) and standard object properties
        if (typeof prop === 'symbol') {
          return Reflect.get(target, prop, target);
        }

        // A callable `then` makes this object "thenable" — if the proxy is ever
        // returned from an async function or otherwise flows through a Promise,
        // the native Promise resolution algorithm sees a function here and calls
        // it as `then(resolve, reject)` instead of just settling with the proxy.
        // The no-op below never calls resolve/reject, so that await hangs
        // forever. Must stay a plain `undefined`, not fall into the generic
        // callable-no-op path below.
        if (prop === 'then') {
          return undefined;
        }

        // Real Object.prototype members (hasOwnProperty, toString, valueOf, …)
        // must pass through untouched — see isObjectPrototypeMember's doc comment.
        if (isObjectPrototypeMember(prop)) {
          const value = Reflect.get(target, prop, target);
          return typeof value === 'function' ? value.bind(target) : value;
        }

        // Non-emulated property: record the gap and warn once per property name.
        if (recordGapRead('App', prop, target.pluginId)) {
          console.warn(
            `[AppShim] Plugin "${target.pluginId}" accessed non-emulated app property/method "${prop}". ` +
            `Slatebase returns a no-op function here, which is truthy — feature ` +
            `detection like \`if (app.${prop})\` will take the wrong branch. ` +
            `Inspect all gaps with window.__slatebasePluginApiGaps().`
          );
        }

        // Return a callable no-op. This covers both property reads and method
        // calls, since a `get` trap cannot tell them apart. Invoking it is the
        // signal that the plugin actually depended on the API, so record that
        // separately from the read.
        // Invocation is recorded but not warned again — the read already warned
        // once, and the call count is queryable via the registry.
        return () => {
          recordGapCall('App', prop, target.pluginId);
          return undefined;
        };
      },
    }) as AppShim & Record<string, unknown>;
  }
}
