/**
 * PluginProvider — React Context Provider for the Obsidian Plugin Compatibility Layer.
 *
 * Instantiates all plugin system components (PluginLoader, PluginRegistry, PluginSandbox,
 * CommandRegistry, SettingsManager, CompatibilityAnalyzer) and exposes them via context.
 *
 * - Loads plugins after FCP (requestIdleCallback / setTimeout fallback)
 * - Handles vault switch (unload all → reload with new context)
 * - Registers Ctrl+P / Cmd+P keyboard shortcut for Command Palette
 *
 * Requirements: 2.5, 3.3, 3.5, 4.5, 4.6, 12.5
 *
 * @module plugin-context
 */

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  type ReactNode,
} from 'react'
import React from 'react'
import type { IApiClient } from '../../api'
import type { DirectoryTree } from '../../types'
import type { PluginInstance, PluginManifestData, PluginRegistryEntry } from './types'
import { PluginLoader } from './plugin-loader'
import type { PluginLoaderStatus } from './plugin-loader'
import { PluginRegistry } from './plugin-registry'
import type { IRegistryApiClient, PluginRegistryData } from './plugin-registry'
import { PluginSandbox } from './sandbox'
import { CommandRegistry } from './command-registry'
import type { ICommandRegistry } from './command-registry'
import { registerCoreEditorCommands } from './core-commands'
import { SettingsManager, wasRecentSettingsWrite } from './settings-manager'
import type { ISettingsApiClient } from './settings-manager'
import { onPluginSettingsChange } from '../../state/pluginSettingsChangeBridge'
import { SettingTabRegistry } from './setting-tab-registry'
import type { ISettingTabRegistry } from './setting-tab-registry'
import { CssInjector } from './css-injector'
import { CompatibilityAnalyzer } from './compatibility-analyzer'
// Installs the global `window.obsidian` namespace the plugin bundles run against.
import { installObsidianGlobals } from './install-globals'
import { useTranslation } from '../../i18n'
import { clearApiGaps } from './api-gap-registry'
import type { ICompatibilityAnalyzer } from './compatibility-analyzer'
import { VaultShim } from './shims/vault-shim'
import { WorkspaceShim } from './shims/workspace-shim'
import { setActiveWorkspaceShim } from './active-workspace-shim'
import { MetadataCacheShim } from './shims/metadata-cache-shim'
import { FileManagerShim } from './shims/file-manager-shim'
import { registerFileViewMatcher, unregisterAllFileViewMatchersForPlugin, removeActiveFileViewsForPlugin, registerExtensionsForPlugin } from './file-view-registry'
import { registerCodeBlockProcessor, registerPostProcessor, unregisterAllForPlugin as unregisterAllCodeBlocksForPlugin } from './code-block-processor-registry'
import { warnNoOp } from './log'
import { AppShim, createCommandManager, createHotkeyManager } from './shims/app-shim'
import { Scope } from './obsidian-api-extensions'
import { setEditorViewAccessor } from './editor-shim'
import { withPluginContextAsync } from './plugin-execution-context'
import { getActiveEditorView, registerPluginExtension, removePluginExtensions, registerPluginCompletionSource, removePluginCompletionSources } from '../../editor/plugin-extensions'
import { registerMarkdownRendererGlobal } from './shims/markdown-renderer-shim'
import { usePluginEventBridge } from './plugin-event-bridge'
import { ViewRegistry } from './view-registry'
import { createEmbedRegistryShim } from './embed-registry'
import type { ItemView, WorkspaceLeaf } from './view-registry'
import type { TabState } from '../../state/tabState'
import { useTabContext } from '../../state/tabContext'
import { openTab } from '../../state/tabActions'
import {
  onOpenPluginViewTab,
  offOpenPluginViewTab,
  onClosePluginViewTab,
  offClosePluginViewTab,
  onActivatePluginViewTab,
  offActivatePluginViewTab,
  dispatchOpenPluginViewTab,
} from './tab-view-bridge'
import type {
  OpenPluginViewTabFn,
  ClosePluginViewTabFn,
  ActivatePluginViewTabFn,
} from './tab-view-bridge'
import {
  removeRibbonIconsForPlugin,
  clearAllRibbonIcons,
  onRibbonIconsChange,
  getRibbonIcons,
  addRibbonIcon,
} from './ribbon-icon-registry'
import {
  removeStatusBarItemsForPlugin,
  clearAllStatusBarItems,
} from './status-bar-registry'
import type { RibbonIconEntry } from './ribbon-icon-registry'
// Static: ToastNotification imports only React, icons and CSS, so there is no
// cycle to break here, and the module is already statically bundled via App.tsx.
// Importing it dynamically only delayed every Notice() by a microtask.
import { showToast, updateToastMessage, dismissToast } from '../../components/ToastNotification'

/** Reads the global `window.app` stub installed by installObsidianGlobals/AppShim. */
function getWindowApp(): { internalPlugins?: unknown; plugins?: unknown; embedRegistry?: unknown; getAccentColor?: () => string } | undefined {
  return (window as unknown as { app?: { internalPlugins?: unknown; plugins?: unknown; embedRegistry?: unknown; getAccentColor?: () => string } }).app
}

// ─── Context Value ───────────────────────────────────────────────────────────

/** Information about an active sidebar view (right-sidebar plugin section). */
export interface SidebarViewInfo {
  viewType: string
  displayText: string
  icon: string
  containerEl: HTMLElement
  leaf: WorkspaceLeaf
}

/** The shape of the PluginContext value exposed to consumers. */
export interface PluginContextValue {
  /** Command registry for Command Palette integration */
  commandRegistry: ICommandRegistry
  /** Plugin registry for the Plugin Management Page */
  pluginRegistry: PluginRegistry
  /** Setting tab registry for native plugin settings UI */
  settingTabRegistry: ISettingTabRegistry
  /** Currently registered plugin entries */
  plugins: PluginRegistryEntry[]
  /** Whether plugins are still loading */
  isLoading: boolean
  /** Reload all enabled plugins from persisted registry state */
  reload(): Promise<void>
  /** Enable or disable one plugin in the running vault context */
  setPluginEnabled(pluginId: string, enabled: boolean): Promise<void>
  /** Compatibility analyzer for plugin analysis */
  analyzer: ICompatibilityAnalyzer
  /** Active plugin views (view type → DOM container element) */
  activeViews: Map<string, { viewType: string; displayText: string; containerEl: HTMLElement }>
  /** Active sidebar plugin views (view type → sidebar view info) */
  sidebarViews: Map<string, SidebarViewInfo>
  /** Active left-sidebar plugin views (view type → sidebar view info) */
  leftSidebarViews: Map<string, SidebarViewInfo>
  /** Moves an active plugin sidebar view to the other side (cross-panel drag-and-drop). No-op if the view isn't currently active on the expected source side. */
  moveSidebarView(viewType: string, targetSide: 'left' | 'right'): void
  /** Plugin ribbon icons (for rendering in the toolbar) */
  ribbonIcons: RibbonIconEntry[]
  /** Create a plugin file view for a given view type and file path. Returns container, leaf, and view or null. */
  createFileView(viewType: string, filePath: string): Promise<{ containerEl: HTMLElement; leaf: WorkspaceLeaf; view: ItemView } | null>
}

// ─── React Context ───────────────────────────────────────────────────────────

/** React Context for plugin system. */
export const PluginContext = createContext<PluginContextValue | null>(null)

// ─── Provider Props ──────────────────────────────────────────────────────────

/** Props for PluginProvider component. */
interface PluginProviderProps {
  children: ReactNode
  /** The current vault ID (null = no vault selected) */
  vaultId: string | null
  /** The current vault name */
  vaultName: string
  /** The API client instance (shared from AppContext) */
  apiClient: IApiClient
  /** The current directory tree for the vault */
  directoryTree: DirectoryTree | null
  /** The current tab state for event bridging */
  tabState: TabState
}

// ─── Adapter ─────────────────────────────────────────────────────────────────

/**
 * Creates an IRegistryApiClient adapter from the IApiClient.
 * Adapts the frontend API client to the minimal interface PluginRegistry expects.
 */
function createRegistryApiAdapter(apiClient: IApiClient): IRegistryApiClient {
  return {
    loadRegistry: async (vaultId: string): Promise<PluginRegistryData | null> => {
      try {
        const data = await apiClient.loadRegistry(vaultId)
        return data as unknown as PluginRegistryData
      } catch (err) {
        // A missing registry (fresh vault) resolves normally from the backend —
        // anything that lands here is a real failure (network, 401, 500) and
        // would otherwise vanish silently, since PluginRegistry.loadFromBackend()
        // only sees the `null` this returns, never the original exception.
        console.error(`[PluginProvider] Failed to load plugin registry for vault "${vaultId}":`, err)
        return null
      }
    },
    saveRegistry: async (vaultId: string, data: PluginRegistryData): Promise<void> => {
      await apiClient.saveRegistry(vaultId, data as unknown as Parameters<typeof apiClient.saveRegistry>[1])
    },
  }
}

/**
 * Creates an ISettingsApiClient adapter from the IApiClient.
 */
function createSettingsApiAdapter(apiClient: IApiClient): ISettingsApiClient {
  return {
    loadSettings: async (vaultId: string, pluginId: string): Promise<string | null> => {
      try {
        const data = await apiClient.loadSettings(vaultId, pluginId)
        if (data === null || data === undefined) return null
        return typeof data === 'string' ? data : JSON.stringify(data)
      } catch (err) {
        // apiClient.loadSettings already resolves to null for "no settings yet"
        // (404) — anything that throws here is a real failure. Logging it is
        // what SettingsManager.loadData()'s own catch (R9.4) is meant to do,
        // but it never sees this exception since it's swallowed to null first.
        console.error(`[PluginProvider] Failed to load settings for plugin "${pluginId}" in vault "${vaultId}":`, err)
        return null
      }
    },
    saveSettings: async (vaultId: string, pluginId: string, data: string): Promise<void> => {
      await apiClient.saveSettings(vaultId, pluginId, JSON.parse(data))
    },
  }
}

/**
 * Safely call a plugin view's `getDisplayText()`/`getIcon()` override.
 *
 * These run from the view-activation callbacks below, outside setViewState()'s
 * own try/catch around onOpen()/onClose()/onload()/onunload() — so a buggy
 * override (e.g. one that assumes a real Obsidian workspace layout Slatebase
 * doesn't fully emulate, like day-planner's release-notes view did) would
 * otherwise throw uncaught inside a React state updater. PluginProvider sits
 * above every other provider in the tree with no error boundary of its own,
 * so an uncaught throw here doesn't just break one view — it blanks the
 * entire app. Every call into plugin-authored code from this file must be
 * guarded like this.
 */
function safeViewCall<T>(viewType: string, method: string, fallback: T, fn: () => T): T {
  try {
    return fn()
  } catch (err) {
    console.error(`[PluginProvider] Plugin view "${viewType}" threw in ${method}():`, err)
    return fallback
  }
}

// ─── Provider Implementation ─────────────────────────────────────────────────

/**
 * PluginProvider — Wraps children with the plugin system context.
 *
 * Creates instances of all plugin system components, loads plugins after FCP,
 * handles vault switches, and registers the Command Palette shortcut.
 */
export function PluginProvider({
  children,
  vaultId,
  vaultName,
  apiClient,
  directoryTree,
  tabState,
}: PluginProviderProps) {
  const { locale } = useTranslation()
  const [isLoading, setIsLoading] = useState(false)
  const [plugins, setPlugins] = useState<PluginRegistryEntry[]>([])
  const [activeViews, setActiveViews] = useState<Map<string, { viewType: string; displayText: string; containerEl: HTMLElement }>>(new Map())
  const [sidebarViews, setSidebarViews] = useState<Map<string, SidebarViewInfo>>(new Map())
  const [leftSidebarViews, setLeftSidebarViews] = useState<Map<string, SidebarViewInfo>>(new Map())
  const [ribbonIcons, setRibbonIcons] = useState<RibbonIconEntry[]>(() => getRibbonIcons())

  // Refs for mutable system instances (stable across renders)
  const commandRegistryRef = useRef<CommandRegistry>(new CommandRegistry())
  const settingTabRegistryRef = useRef<SettingTabRegistry>(new SettingTabRegistry())
  const analyzerRef = useRef<CompatibilityAnalyzer>(new CompatibilityAnalyzer())
  const viewRegistryRef = useRef<ViewRegistry>(new ViewRegistry())

  // Vault-scoped refs (recreated on vault switch)
  const pluginRegistryRef = useRef<PluginRegistry | null>(null)
  const pluginLoaderRef = useRef<PluginLoader | null>(null)
  const sandboxRef = useRef<PluginSandbox | null>(null)
  const settingsManagerRef = useRef<SettingsManager | null>(null)
  const prevVaultIdRef = useRef<string | null>(null)
  const pluginSystemVaultIdRef = useRef<string | null>(null)
  const loadedRef = useRef(false)
  const mountedRef = useRef(true)
  const cancelScheduledLoadRef = useRef<(() => void) | null>(null)

  // Shared shim instances per vault (used by all plugins and the event bridge)
  const workspaceShimRef = useRef<WorkspaceShim | null>(null)
  const metadataCacheShimRef = useRef<MetadataCacheShim | null>(null)
  const vaultShimRef = useRef<VaultShim | null>(null)

  // Kept up to date by an effect below (needs tabDispatch/tabState) so the
  // built-in "markdown" view type registered in handleVaultSwitch can drop the
  // active tab out of a plugin's file view without capturing stale closures.
  const requestSourceViewRef = useRef<() => void>(() => {})

  /** Remove all UI registrations owned by one plugin instance. */
  async function cleanupPluginRegistrations(pluginId: string): Promise<void> {
    commandRegistryRef.current.removeAllForPlugin(pluginId)
    settingTabRegistryRef.current.remove(pluginId)
    removeRibbonIconsForPlugin(pluginId)
    removeStatusBarItemsForPlugin(pluginId)
    unregisterAllFileViewMatchersForPlugin(pluginId)
    await removeActiveFileViewsForPlugin(pluginId)
    await viewRegistryRef.current.detachAllForPlugin(pluginId)
    // Remove CM6 editor extensions and completion sources for this plugin
    removePluginExtensions(pluginId)
    removePluginCompletionSources(pluginId)
    // Remove code block processors and post-processors for this plugin
    unregisterAllCodeBlocksForPlugin(pluginId)
  }

  /**
   * Deactivate one plugin for a normal (responsive-plugin) teardown.
   *
   * Closes the plugin's own views *before* calling unloadPlugin(), not after.
   * A well-behaved plugin's onunload() (e.g. Excalidraw) detaches its own
   * leaves as fire-and-forget async work it never awaits — if we instead ran
   * unloadPlugin() first and closed leftover views afterward (the old order),
   * our onClose() could land on the same view while the plugin's own teardown
   * was still mid-flight, hitting state the plugin had already nulled out.
   * Closing views first means that fire-and-forget call finds nothing left to
   * do. Not used for the auto-deactivate-on-hang path, where the plugin can't
   * be trusted to let an awaited close finish.
   */
  async function deactivatePluginSafely(
    loader: PluginLoader,
    pluginId: string,
    notifyStatusChange = true
  ): Promise<void> {
    await removeActiveFileViewsForPlugin(pluginId)
    await viewRegistryRef.current.detachAllForPlugin(pluginId)
    await loader.unloadPlugin(pluginId, notifyStatusChange)
    await cleanupPluginRegistrations(pluginId)
  }

  // ─── Track mount state to avoid post-unmount state updates ────────────────
  // The post-FCP plugin load is scheduled via requestIdleCallback/setTimeout and
  // may otherwise still fire (and call setState) after the provider has unmounted.

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      cancelScheduledLoadRef.current?.()
      cancelScheduledLoadRef.current = null
    }
  }, [])

  // ─── Vault Switch: unload all → rebuild instances → reload ───────────────

  useEffect(() => {
    // Skip if no vault selected
    if (!vaultId) {
      // If we previously had a vault, clean up
      if (prevVaultIdRef.current) {
        // eslint-disable-next-line react-hooks/immutability
        void unloadAllPlugins()
        pluginRegistryRef.current = null
        pluginLoaderRef.current = null
        sandboxRef.current = null
        settingsManagerRef.current = null
        workspaceShimRef.current = null
        setActiveWorkspaceShim(null)
        metadataCacheShimRef.current = null
        vaultShimRef.current = null
        pluginSystemVaultIdRef.current = null
        void viewRegistryRef.current.clear()
        setPlugins([])
        setActiveViews(new Map())
        setSidebarViews(new Map())
        loadedRef.current = false
      }
      prevVaultIdRef.current = null
      return
    }

    // On vault change: unload old plugins, create new instances for new vault
    if (prevVaultIdRef.current !== vaultId) {
      // eslint-disable-next-line react-hooks/immutability
      void handleVaultSwitch(vaultId)
    }
    prevVaultIdRef.current = vaultId
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vaultId])

  /**
   * Handle vault switch: unload all plugins from old context,
   * create new vault-scoped instances, reload plugins.
   */
  async function handleVaultSwitch(newVaultId: string): Promise<void> {
    console.info(`[PluginProvider] Vault switch: rebuilding plugin registry for vault "${newVaultId}"`)
    pluginSystemVaultIdRef.current = null

    // 1. Unload all plugins from the old loader (if any)
    await unloadAllPlugins()

    // 2. Clear command registry (commands are plugin-scoped)
    // We keep the same instance but remove all commands
    const oldPlugins = pluginRegistryRef.current?.listPlugins() ?? []
    for (const entry of oldPlugins) {
      commandRegistryRef.current.removeAllForPlugin(entry.pluginId)
    }
    // Clear setting tab registry (tabs are plugin-scoped)
    settingTabRegistryRef.current.clear()
    // Clear active views and view registry
    await viewRegistryRef.current.clear()
    // Clear ribbon icons (plugin-scoped)
    clearAllRibbonIcons()
    // Clear status bar items (plugin-scoped)
    clearAllStatusBarItems()
    setActiveViews(new Map())
    setSidebarViews(new Map())

    // 3. Create new vault-scoped instances
    const registryAdapter = createRegistryApiAdapter(apiClient)
    const settingsAdapter = createSettingsApiAdapter(apiClient)

    const newRegistry = new PluginRegistry(registryAdapter, newVaultId)
    const newSettingsManager = new SettingsManager(settingsAdapter, newVaultId)

    const newSandbox = new PluginSandbox(newVaultId, (pluginId, reason) => {
      console.warn(`[PluginProvider] Plugin "${pluginId}" auto-deactivated: ${reason}`)
      void (async () => {
        const loader = pluginLoaderRef.current
        if (pluginRegistryRef.current === newRegistry && loader?.getRecord(pluginId)) {
          await loader.unloadPlugin(pluginId, false)
        }
        if (pluginRegistryRef.current !== newRegistry || pluginSystemVaultIdRef.current !== newVaultId) {
          return
        }
        await cleanupPluginRegistrations(pluginId)
        newRegistry.updateStatus(pluginId, 'inactive', reason)
        setPlugins(newRegistry.listPlugins())
      })()
    })

    // Create shared shim instances for the vault (shared across all plugins).
    // Proxy-wrapped so a plugin calling a non-emulated workspace method/property
    // gets a warned no-op instead of a hard crash (see WorkspaceShim.wrapWithProxy) —
    // this was previously built and tested but never actually wired in here.
    const newWorkspaceShim = WorkspaceShim.createProxied()
    const newMetadataCacheShim = MetadataCacheShim.wrapWithProxy(new MetadataCacheShim(directoryTree))
    workspaceShimRef.current = newWorkspaceShim
    setActiveWorkspaceShim(newWorkspaceShim)
    metadataCacheShimRef.current = newMetadataCacheShim

    // Create a fresh ViewRegistry for this vault and wire it to the WorkspaceShim
    const newViewRegistry = new ViewRegistry()
    viewRegistryRef.current = newViewRegistry

    // Built-in "markdown" view type — real Obsidian's core view. Plugins switch a
    // leaf to it directly (Kanban's "Open as Markdown" menu item calls
    // `leaf.setViewState({ type: 'markdown', ... })` on its own leaf), which
    // otherwise hits "No view registered for type 'markdown'" and silently no-ops.
    // Slatebase has no leaf-hosted markdown view of its own — the raw file is
    // rendered by the tab's edit mode instead — so this creator's only job is to
    // drop the active tab out of the plugin's file view and hand back an inert
    // stand-in view for the leaf's own bookkeeping.
    newViewRegistry.registerView('markdown', (leaf) => {
      requestSourceViewRef.current()
      return {
        containerEl: document.createElement('div'),
        contentEl: document.createElement('div'),
        app: leaf.app,
        leaf,
        getViewType: () => 'markdown',
        getDisplayText: () => 'Markdown',
        getIcon: () => 'document',
        onOpen: async () => {},
        onClose: async () => {},
        onload: () => {},
        onunload: () => {},
        addAction: () => document.createElement('div'),
        // Duck-typed as file-backed (see setOnViewActivated below) so it's
        // treated like Kanban's TextFileView and never surfaces in the
        // plugin-view sidebar — it renders nothing of its own.
        getViewData: () => '',
        setViewData: () => {},
        requestSave: () => {},
        setState: async () => {},
      } as unknown as ItemView
    }, 'core')

    newViewRegistry.setOnViewActivated((viewType: string, view: ItemView) => {
      // Open a tab for main-location plugin views (LiveSync Log, etc.)
      // Skip for TextFileView-based views (Kanban) — they render inside an existing file tab.
      // Duck-type check: TextFileView has getViewData/setViewData/requestSave methods.
      const viewAny = view as unknown as Record<string, unknown>
      const isFileBackedView = typeof viewAny.getViewData === 'function'
        && typeof viewAny.setViewData === 'function'
        && typeof viewAny.requestSave === 'function'

      // Only add non-file-backed views to activeViews (which PluginViewPanel renders).
      // TextFileView-based views are rendered by TabContent via the file-view-registry.
      if (!isFileBackedView) {
        setActiveViews(prev => {
          const next = new Map(prev)
          next.set(viewType, {
            viewType,
            displayText: safeViewCall(viewType, 'getDisplayText', 'Plugin View', () => view.getDisplayText()),
            containerEl: view.containerEl,
          })
          return next
        })
      }
      if (newVaultId && !isFileBackedView) {
        setTimeout(() => {
          const displayText = safeViewCall(viewType, 'getDisplayText', 'Plugin View', () => view.getDisplayText())
          dispatchOpenPluginViewTab(newVaultId, viewType, displayText, '')
        }, 0)
      }
    })
    newViewRegistry.setOnViewDeactivated((viewType: string) => {
      setActiveViews(prev => {
        const next = new Map(prev)
        next.delete(viewType)
        return next
      })
    })
    newViewRegistry.setOnSidebarViewActivated((viewType: string, view: ItemView, leaf: WorkspaceLeaf) => {
      setSidebarViews(prev => {
        const next = new Map(prev)
        next.set(viewType, {
          viewType,
          displayText: safeViewCall(viewType, 'getDisplayText', 'Plugin View', () => view.getDisplayText()),
          icon: safeViewCall(viewType, 'getIcon', 'file', () => view.getIcon()),
          containerEl: view.containerEl,
          leaf,
        })
        return next
      })
    })
    newViewRegistry.setOnSidebarViewDeactivated((viewType: string) => {
      setSidebarViews(prev => {
        const next = new Map(prev)
        next.delete(viewType)
        return next
      })
    })
    newViewRegistry.setOnLeftSidebarViewActivated((viewType: string, view: ItemView, leaf: WorkspaceLeaf) => {
      setLeftSidebarViews(prev => {
        const next = new Map(prev)
        next.set(viewType, {
          viewType,
          displayText: safeViewCall(viewType, 'getDisplayText', 'Plugin View', () => view.getDisplayText()),
          icon: safeViewCall(viewType, 'getIcon', 'file', () => view.getIcon()),
          containerEl: view.containerEl,
          leaf,
        })
        return next
      })
    })
    newViewRegistry.setOnLeftSidebarViewDeactivated((viewType: string) => {
      setLeftSidebarViews(prev => {
        const next = new Map(prev)
        next.delete(viewType)
        return next
      })
    })
    // Attach registry to workspace shim (needs a dummy app reference for leaf creation)
    // The app reference will be a minimal shared object — all plugins see the same vault/workspace/metadataCache
    const newVaultShim = VaultShim.wrapWithProxy(new VaultShim(newVaultId, vaultName, apiClient, directoryTree ?? { name: vaultName, type: 'directory' as const, children: [], itemCount: 0, path: '' }))
    vaultShimRef.current = newVaultShim

    // Wire VaultShim to populate MetadataCache when files are read.
    // Dataview's worker relies on metadataCache.getFileCache() returning frontmatter/tags
    // which are parsed from the file content on demand.
    newVaultShim.onFileRead = (path: string, content: string) => {
      newMetadataCacheShim.populateFromContent(path, content)
    }
    // Same reasoning, the write side: a plugin that calls vault.modify()/create()
    // (append()/process()/fileManager.processFrontMatter() all funnel through
    // these) and immediately reads back getFileCache() must see metadata for
    // what it just wrote, not a stale or empty cache entry.
    newVaultShim.onFileWrite = (file, content: string) => {
      newMetadataCacheShim.refreshFileCache(file, content)
    }
    // Notify any open plugin view whose file was renamed — see
    // ViewRegistry.notifyFileRenamed()'s doc comment for why this can't just
    // compare object identity. Independent of the vault's own 'rename' event,
    // which plugins listening via `vault.on('rename', ...)` already receive.
    newVaultShim.on('rename', (...args: unknown[]) => {
      const [file, oldPath] = args as [{ path: string }, string]
      newViewRegistry.notifyFileRenamed(file, oldPath)
    })
    // Includes fileManager/commands/hotkeyManager, not just vault/workspace/metadataCache:
    // this object becomes `leaf.app`, which ItemView's constructor copies to `this.app`
    // (see view-registry.ts). Plugin views (Kanban's list/table view switch, etc.) call
    // `this.app.fileManager.processFrontMatter(...)` directly, so a leaf app missing
    // fileManager crashes with "fileManager is undefined" the moment such a view is opened.
    // internalPlugins/plugins/embedRegistry are pulled from window.app (set up by
    // installObsidianGlobals/AppShim) rather than re-stubbed here, so a view's `this.app`
    // (e.g. Excalidraw's) shares the same registries as every plugin's onload-time `app` —
    // without this, `this.app.internalPlugins.plugins` and `this.app.plugins.getPlugin(id)`
    // threw/returned undefined inside opened views even though they worked during onload().
    const sharedApp = {
      vault: newVaultShim,
      workspace: newWorkspaceShim,
      metadataCache: newMetadataCacheShim,
      fileManager: FileManagerShim.wrapWithProxy(new FileManagerShim(newVaultShim)),
      commands: createCommandManager(commandRegistryRef.current),
      hotkeyManager: createHotkeyManager(commandRegistryRef.current),
      get internalPlugins() { return getWindowApp()?.internalPlugins },
      get plugins() { return getWindowApp()?.plugins },
      get embedRegistry() { return getWindowApp()?.embedRegistry },
      getAccentColor: () => getWindowApp()?.getAccentColor?.() ?? '#7c3aed',
    }
    newWorkspaceShim.setViewRegistry(newViewRegistry, sharedApp)

    // Wire EditorShim to use CM6 EditorView as backend
    setEditorViewAccessor(getActiveEditorView)

    // Install the base obsidian namespace before the context-specific shims
    // below layer onto it. Idempotent — the PluginLoader calls it too.
    // MarkdownView is registered here too (guarded, Component-chain based) —
    // there is no separate registerMarkdownViewGlobal() call layered on top,
    // since a second, disconnected MarkdownView class would defeat the point:
    // instanceof checks and inherited registerEvent/registerDomEvent/addChild
    // only work if every plugin gets the SAME class.
    installObsidianGlobals()

    // Register MarkdownRenderer on window.obsidian for render() calls
    registerMarkdownRendererGlobal()

    // Modal/SuggestModal/FuzzySuggestModal are registered by installObsidianGlobals()
    // above (guarded, Modal-extending) — no separate registration layered on top.

    // Register the Notice bridge on window so the Notice compat shim (and the
    // require()-shim's fallback Notice) can drive real toasts — including a
    // stable id, so `notice.hide()` dismisses this specific toast rather than
    // being unable to affect the toast system at all, and `duration: 0`
    // (Obsidian's "stays until dismissed") actually suppresses auto-dismiss.
    const noticeWindow = window as unknown as {
      __slatebaseShowNotice?: (msg: string, duration?: number) => string
      __slatebaseUpdateNotice?: (id: string, msg: string) => void
      __slatebaseDismissNotice?: (id: string) => void
    }
    // eslint-disable-next-line react-hooks/immutability
    noticeWindow.__slatebaseShowNotice = (msg: string, duration?: number) => showToast('info', msg, duration)
    // eslint-disable-next-line react-hooks/immutability
    noticeWindow.__slatebaseUpdateNotice = (id: string, msg: string) => updateToastMessage(id, msg)
    // eslint-disable-next-line react-hooks/immutability
    noticeWindow.__slatebaseDismissNotice = (id: string) => dismissToast(id)

    // Wire the editor context resolver for editorCallback commands
    commandRegistryRef.current.setEditorContextResolver(() => {
      const file = newWorkspaceShim.getActiveFile()
      if (!file) return null
      const activeEditorInfo = newWorkspaceShim.activeEditor
      if (!activeEditorInfo) return null
      return { editor: activeEditorInfo.editor, file }
    })

    // Register Obsidian's built-in `editor:*` commands (toggle-code, toggle-checklist-status, ...)
    // so plugins calling app.commands.executeCommandById('editor:...') find a real command
    // instead of silently no-oping. Idempotent — safe to re-run on every vault switch.
    registerCoreEditorCommands(commandRegistryRef.current, locale)

    // Update window.app to reference the real shim instances
    // (many plugins and libraries like obsidian-daily-notes-interface access window.app directly)
    const windowApp = (window as unknown as { app: Record<string, unknown> }).app
    if (windowApp) {
      // eslint-disable-next-line react-hooks/immutability
      windowApp.vault = sharedApp.vault
      // eslint-disable-next-line react-hooks/immutability
      windowApp.workspace = sharedApp.workspace
      // eslint-disable-next-line react-hooks/immutability
      windowApp.metadataCache = sharedApp.metadataCache
      // eslint-disable-next-line react-hooks/immutability
      windowApp.fileManager = sharedApp.fileManager
      // The shim's real command manager, not an empty stub: it was being
      // overwritten here with one whose executeCommand() did nothing and whose
      // command list was always empty, so plugins reaching commands through
      // `window.app` (Kanban patches executeCommand, editing-toolbar reads
      // findCommand at startup) saw a different, dead registry than the one
      // behind their own `this.app.commands`.
      // The real command manager, not an empty stub: this was being overwritten
      // with one whose executeCommand() did nothing and whose command list was
      // always empty, so plugins reaching commands through `window.app` (Kanban
      // patches executeCommand, editing-toolbar reads findCommand at startup)
      // saw a different, dead registry than the one behind `this.app.commands`.
      // eslint-disable-next-line react-hooks/immutability
      windowApp.commands = createCommandManager(commandRegistryRef.current)
      // eslint-disable-next-line react-hooks/immutability
      windowApp.hotkeyManager = createHotkeyManager(commandRegistryRef.current)
      // Was a throwaway inline stub whose `embedByExtension` map started empty
      // on every vault switch — any plugin's registerExtension() call from a
      // previous switch (or from AppShim's `this.app.embedRegistry`, read by
      // views reached through `window.app.embedRegistry`) vanished with it.
      // `createEmbedRegistryShim()` wraps the same shared, module-level
      // `embedByExtension` record every other embedRegistry consumer reads
      // and writes, so registrations made through any of them are visible
      // through all of them.
      // eslint-disable-next-line react-hooks/immutability
      windowApp.embedRegistry = createEmbedRegistryShim()
    }

    // Wire onOpenFile immediately (not deferred to useEffect) so it's available
    // when plugins call leaf.openFile() during their onload() / initial render.
    newWorkspaceShim.setOnOpenFile((filePath: string) => {
      const fileName = filePath.split('/').pop() ?? filePath
      void openTab(tabDispatch, (() => {}) as never, apiClient, newVaultId, filePath, fileName)
    })

    // Load vault config to update daily-notes folder setting for Calendar plugin
    // NOTE: This is now also done synchronously before plugin activation in loadPluginsForVault().
    // This fire-and-forget version ensures the setting is updated even if plugins loaded before the config.
    void apiClient.getVaultConfig(newVaultId).then(config => {
      if (pluginSystemVaultIdRef.current !== newVaultId) return
      const app = (window as unknown as { app?: { internalPlugins?: { plugins?: Record<string, { instance?: { options?: Record<string, string> } }> } } }).app
      const dailyNotesPlugin = app?.internalPlugins?.plugins?.['daily-notes']
      if (dailyNotesPlugin?.instance?.options) {
        dailyNotesPlugin.instance.options.folder = config.dailyNotesDirectory || ''
        dailyNotesPlugin.instance.options.template = config.dailyNoteTemplateName
          ? `${config.templatesDirectory}/${config.dailyNoteTemplateName}`
          : ''
      }
    }).catch(() => { /* vault config unavailable — keep defaults */ })

    const newLoader = new PluginLoader({
      appShimFactory: (pluginId: string) => {
        // All plugins share the same VaultShim instance (matches real Obsidian behavior).
        // The shared vault shim is kept up-to-date via useEffect on directoryTree changes.
        return AppShim.create({
          vault: newVaultShim,
          workspace: newWorkspaceShim,
          metadataCache: newMetadataCacheShim,
          pluginId,
          commandRegistry: commandRegistryRef.current,
          pluginManager: {
            // Re-fetch manifest.json content for every installed plugin — the
            // same refresh loadPluginsForVault() does on startup — so a plugin
            // manager (e.g. an update-checker) sees fresh versions without
            // requiring a full vault reload.
            loadManifests: async (): Promise<void> => {
              try {
                const { plugins: manifests } = await apiClient.listPlugins(newVaultId)
                if (pluginSystemVaultIdRef.current !== newVaultId || pluginRegistryRef.current !== newRegistry) return
                newRegistry.hydrateManifests(manifests)
                const windowApp = (window as unknown as { app?: { plugins?: { manifests?: Record<string, PluginManifestData> } } }).app
                if (windowApp?.plugins?.manifests) {
                  for (const manifest of manifests) {
                    windowApp.plugins.manifests[manifest.id] = manifest
                  }
                }
                setPlugins(newRegistry.listPlugins())
              } catch (err) {
                console.warn('[PluginProvider] plugins.loadManifests() failed:', err)
              }
            },
            // Registry writes are already persisted eagerly on every status/
            // permission change (see PluginRegistry.updateStatus/setPermissions);
            // this just waits for any of those in-flight writes to land.
            requestSaveConfig: async (): Promise<void> => {
              await newRegistry.waitForPersistence()
            },
            // Both delegate to the exact same path the Settings page toggle
            // uses (setPluginEnabled, defined below) — including that
            // disabling reloads the whole page once it completes. That reload
            // is not scoped to the plugin being disabled: any plugin calling
            // disablePluginAndSave(anyId) reloads the app for everyone.
            enablePluginAndSave: async (id: string): Promise<void> => {
              await setPluginEnabled(id, true)
            },
            disablePluginAndSave: async (id: string): Promise<void> => {
              await setPluginEnabled(id, false)
            },
          },
        })
      },
      sandbox: newSandbox,
      onStatusChange: (pluginId: string, status: PluginLoaderStatus, error?: string) => {
        // `loaded` is an internal transition between bundle evaluation and
        // activation. Persisting it as `loading` can orphan the plugin after a
        // reload, because startup intentionally loads only active entries.
        if (status === 'loaded') {
          setPlugins(newRegistry.listPlugins())
          return
        }

        const registryStatus = status === 'active' ? 'active'
          : status === 'error' ? 'error'
            : 'inactive'
        // When a plugin is deactivated, remove all registrations owned by that instance.
        if (status === 'deactivated' || status === 'error') {
          void cleanupPluginRegistrations(pluginId)
        }
        newRegistry.updateStatus(pluginId, registryStatus, error)
        setPlugins(newRegistry.listPlugins())
      },
      onPluginInstantiated: (pluginId: string, instance) => {
        // Supply persistent storage through the Plugin base class. Do not replace
        // loadData/saveData on the instance: many community plugins override
        // them to merge defaults, then delegate with super.loadData(). Replacing
        // the methods prevents that initialization (e.g. Recent Files).
        const persistenceBridge = instance as PluginInstance & {
          __slatebaseLoadData?: () => Promise<unknown>
          __slatebaseSaveData?: (data: unknown) => Promise<void>
        }
        persistenceBridge.__slatebaseLoadData = () => newSettingsManager.loadData(pluginId)
        persistenceBridge.__slatebaseSaveData = (data: unknown) => newSettingsManager.saveData(pluginId, data)

        // Ensure scope exists — a real Scope so `app.keymap.pushScope(this.scope)` in
        // a plugin's onload() actually participates in hotkey dispatch, not just a
        // crash-guard. `.keys()` (Kanban reaching into Obsidian's internals) is a
        // method on Scope itself, see obsidian-api-extensions.ts.
        if (!(instance as unknown as { scope?: unknown }).scope) {
          (instance as unknown as { scope: Scope }).scope = new Scope();
        }
        // Wire addCommand to route to the shared CommandRegistry
        instance.addCommand = (command) => {
          if (pluginSystemVaultIdRef.current !== newVaultId || pluginRegistryRef.current !== newRegistry) {
            return { ...command, pluginId }
          }
          return commandRegistryRef.current.addCommand(pluginId, command)
        }
        // Wire removeCommand to the same registry. Plugins that toggle a feature
        // in their settings withdraw its command this way; leaving it a no-op
        // keeps a dead entry in the command palette that then fails when run.
        ;(instance as unknown as { removeCommand: (commandId: string) => void }).removeCommand = (commandId: string) => {
          if (pluginSystemVaultIdRef.current !== newVaultId || pluginRegistryRef.current !== newRegistry) return
          // Obsidian accepts both the bare id and the `<plugin>:<id>` form.
          const registry = commandRegistryRef.current
          const qualified = commandId.includes(':') ? commandId : `${pluginId}:${commandId}`
          registry.removeCommand(registry.getCommand(qualified) ? qualified : commandId)
        }
        // Wire addSettingTab to route to the shared SettingTabRegistry
        instance.addSettingTab = (tab: unknown) => {
          if (pluginSystemVaultIdRef.current !== newVaultId || pluginRegistryRef.current !== newRegistry) return
          settingTabRegistryRef.current.register(pluginId, tab as import('./setting-tab').PluginSettingTab)
        }
        // Wire addRibbonIcon to route to the shared RibbonIconRegistry
        instance.addRibbonIcon = (icon: string, title: string, callback: () => void) => {
          if (pluginSystemVaultIdRef.current !== newVaultId || pluginRegistryRef.current !== newRegistry) {
            return document.createElement('div')
          }
          return addRibbonIcon(pluginId, icon, title, callback)
        }
        // Wire registerView to route to the workspace shim's view registry
        ;(instance as unknown as { registerView: (viewType: string, creator: unknown) => void }).registerView = (viewType: string, creator: unknown) => {
          if (pluginSystemVaultIdRef.current !== newVaultId || pluginRegistryRef.current !== newRegistry) return
          newWorkspaceShim.registerView(viewType, creator as (leaf: import('./view-registry').WorkspaceLeaf) => unknown, pluginId)

          // Auto-register a file view matcher for TextFileView-based plugins.
          // Convention: if a .md file has a frontmatter key "<viewType>-plugin" or "<pluginId>",
          // this plugin handles the rendering.
          registerFileViewMatcher(viewType, pluginId, (_filePath: string, content: string) => {
            if (!content || !_filePath.endsWith('.md')) return false
            // Quick frontmatter check: look for the view type key in the YAML frontmatter
            const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
            if (!fmMatch) return false
            const frontmatter = fmMatch[1] ?? ''
            // Check for "<viewType>-plugin:" key (e.g. "kanban-plugin: board")
            if (frontmatter.includes(`${viewType}-plugin:`)) return true
            // Check for "<pluginId>:" key (e.g. "obsidian-kanban:")
            if (frontmatter.includes(`${pluginId}:`)) return true
            return false
          })
        }
        // Wire registerExtensions to route to the file-view-registry
        ;(instance as unknown as { registerExtensions: (exts: string[], viewType: string) => void }).registerExtensions = (exts: string[], viewType: string) => {
          if (pluginSystemVaultIdRef.current !== newVaultId || pluginRegistryRef.current !== newRegistry) return
          registerExtensionsForPlugin(exts, viewType, pluginId)
        }
        // Wire registerMarkdownCodeBlockProcessor to route to the code-block-processor-registry
        ;(instance as unknown as { registerMarkdownCodeBlockProcessor: (language: string, handler: unknown, sortOrder?: number) => unknown }).registerMarkdownCodeBlockProcessor = (language: string, handler: unknown, sortOrder?: number) => {
          if (pluginSystemVaultIdRef.current !== newVaultId || pluginRegistryRef.current !== newRegistry) return {}
          registerCodeBlockProcessor(language, handler as import('./code-block-processor-registry').CodeBlockHandler, pluginId, sortOrder)
          return handler
        }
        // Wire registerMarkdownPostProcessor to route to the code-block-processor-registry
        ;(instance as unknown as { registerMarkdownPostProcessor: (processor: unknown, sortOrder?: number) => unknown }).registerMarkdownPostProcessor = (processor: unknown, sortOrder?: number) => {
          if (pluginSystemVaultIdRef.current !== newVaultId || pluginRegistryRef.current !== newRegistry) return processor
          registerPostProcessor(processor as import('./code-block-processor-registry').MarkdownPostProcessor, pluginId, sortOrder)
          return processor
        }
        // Wire registerEditorExtension to route to the CM6 plugin extension manager
        ;(instance as unknown as { registerEditorExtension: (extension: unknown) => void }).registerEditorExtension = (extension: unknown) => {
          if (pluginSystemVaultIdRef.current !== newVaultId || pluginRegistryRef.current !== newRegistry) return
          registerPluginExtension(pluginId, extension as import('@codemirror/state').Extension)
        }
        // Wire registerEditorSuggest to route to the CM6 completion source registry
        ;(instance as unknown as { registerEditorSuggest: (suggest: unknown) => void }).registerEditorSuggest = (suggest: unknown) => {
          if (pluginSystemVaultIdRef.current !== newVaultId || pluginRegistryRef.current !== newRegistry) return
          // Only a CM6-shaped `provider` can be bridged directly. Obsidian's own
          // EditorSuggest interface is onTrigger/getSuggestions/renderSuggestion/
          // selectSuggestion, which has no CM6 equivalent we translate yet — a
          // plugin passing one registers successfully and then never suggests
          // anything, so say so rather than accept it silently.
          const suggestObj = suggest as { provider?: unknown; getSuggestions?: unknown }
          if (typeof suggestObj.provider === 'function') {
            registerPluginCompletionSource(pluginId, suggestObj.provider as import('@codemirror/autocomplete').CompletionSource)
            return
          }
          warnNoOp(
            pluginId,
            'registerEditorSuggest',
            typeof suggestObj.getSuggestions === 'function'
              ? "Obsidian's EditorSuggest interface is not translated to CodeMirror 6; this suggester will never appear."
              : 'The suggester exposes neither a CodeMirror `provider` nor `getSuggestions`, so it cannot be wired up.',
          )
        }
      },
    })

    pluginRegistryRef.current = newRegistry
    pluginLoaderRef.current = newLoader
    sandboxRef.current = newSandbox
    settingsManagerRef.current = newSettingsManager
    pluginSystemVaultIdRef.current = newVaultId
    loadedRef.current = false

    // 4. Load plugins after FCP
    schedulePostFcpLoad(newVaultId, newRegistry, newLoader)
  }

  /**
   * Schedule plugin loading after First Contentful Paint.
   * Uses requestIdleCallback (or setTimeout fallback) to avoid delaying FCP.
   */
  function schedulePostFcpLoad(
    targetVaultId: string,
    registry: PluginRegistry,
    loader: PluginLoader,
  ): void {
    cancelScheduledLoadRef.current?.()

    const doLoad = () => {
      cancelScheduledLoadRef.current = null
      // Guard: component may have unmounted, or vault may have switched again, before this fires
      if (!mountedRef.current || prevVaultIdRef.current !== targetVaultId) return
      void loadPluginsForVault(targetVaultId, registry, loader)
    }

    if (typeof window.requestIdleCallback === 'function') {
      const handle = window.requestIdleCallback(doLoad, { timeout: 2000 })
      cancelScheduledLoadRef.current = () => window.cancelIdleCallback(handle)
    } else {
      const handle = setTimeout(doLoad, 50)
      cancelScheduledLoadRef.current = () => clearTimeout(handle)
    }
  }

  /**
   * Load and activate all stored active plugins for a vault.
   */
  async function loadPluginsForVault(
    targetVaultId: string,
    registry: PluginRegistry,
    loader: PluginLoader,
  ): Promise<void> {
    const isCurrentContext = (): boolean => (
      mountedRef.current
      && pluginSystemVaultIdRef.current === targetVaultId
      && pluginRegistryRef.current === registry
      && pluginLoaderRef.current === loader
    )
    if (loadedRef.current || !isCurrentContext()) return
    loadedRef.current = true
    setIsLoading(true)

    try {
      // Load registry from backend
      await registry.loadFromBackend()
      if (!isCurrentContext()) return

      // Hydrate the entries with the real manifest.json content. _registry.json
      // stores only status/permissions — the backend's registry schema has no
      // manifest field, so anything the frontend puts there is silently dropped
      // and comes back as the id-only placeholder. Without this, every plugin
      // auto-loaded at startup sees version "0.0.0" and its id as its name.
      try {
        const { plugins: manifests } = await apiClient.listPlugins(targetVaultId)
        if (!isCurrentContext()) return
        registry.hydrateManifests(manifests)
      } catch (err) {
        console.warn('[PluginProvider] Failed to load plugin manifests — versions may be inaccurate:', err)
      }
      setPlugins(registry.listPlugins())

      // Find active plugins and load their bundles
      const activePlugins = registry.listPlugins().filter(p => p.status === 'active')
      const pluginsToLoad: Array<{ pluginId: string; bundle: string; manifest: PluginManifestData }> = []
      const cssInjector = new CssInjector()

      for (const entry of activePlugins) {
        try {
          const bundle = await apiClient.loadBundle(targetVaultId, entry.pluginId)
          if (!isCurrentContext()) return

          // Load and inject plugin CSS (fire-and-forget, non-blocking)
          apiClient.loadStyles(targetVaultId, entry.pluginId).then((css) => {
            if (css && isCurrentContext()) {
              cssInjector.inject(entry.pluginId, css)
            }
          }).catch(() => { /* No styles or fetch failed — ignore */ })

          // Pass the manifest through whole rather than re-picking known fields:
          // plugins read manifest entries we do not model (fundingUrl, helpUrl,
          // isDesktopOnly, …), and a field-by-field copy silently drops them.
          pluginsToLoad.push({
            pluginId: entry.pluginId,
            bundle,
            manifest: { ...entry.manifest, id: entry.manifest?.id ?? entry.pluginId },
          })
        } catch (err) {
          console.error(`[PluginProvider] Failed to load bundle for "${entry.pluginId}":`, err)
          registry.updateStatus(entry.pluginId, 'error', 'Failed to load bundle')
        }
      }

      // Activate all loaded plugins in order
      if (pluginsToLoad.length > 0 && isCurrentContext()) {
        // Ensure vault config (daily-notes folder, etc.) is loaded BEFORE plugins activate.
        // Calendar plugin reads internalPlugins.daily-notes.options.folder during onload(),
        // so the folder must be set before activation to correctly detect existing daily notes.
        try {
          const config = await apiClient.getVaultConfig(targetVaultId)
          if (!isCurrentContext()) {
            await unloadLoaderPlugins(loader)
            return
          }
          const app = (window as unknown as { app?: { internalPlugins?: { plugins?: Record<string, { instance?: { options?: Record<string, string> } }> } } }).app
          const dailyNotesPlugin = app?.internalPlugins?.plugins?.['daily-notes']
          if (dailyNotesPlugin?.instance?.options) {
            // eslint-disable-next-line react-hooks/immutability
            dailyNotesPlugin.instance.options.folder = config.dailyNotesDirectory || ''
            // eslint-disable-next-line react-hooks/immutability
            dailyNotesPlugin.instance.options.template = config.dailyNoteTemplateName
              ? `${config.templatesDirectory}/${config.dailyNoteTemplateName}`
              : ''
          }
        } catch {
          // Vault config unavailable — keep defaults (folder='')
        }

        await loader.loadAllActive(pluginsToLoad)
        if (!isCurrentContext()) {
          await unloadLoaderPlugins(loader)
          return
        }
        await registry.waitForPersistence()
      }

      if (isCurrentContext()) {
        setPlugins(registry.listPlugins())
      }
    } catch (err) {
      console.error('[PluginProvider] Failed to load plugins:', err)
    } finally {
      if (isCurrentContext()) {
        setIsLoading(false)
      }
    }
  }

  /** Unload all instances from a specific loader without changing enabled state. */
  async function unloadLoaderPlugins(loader: PluginLoader): Promise<void> {
    const loadedPlugins = loader.getPlugins()
    for (const [pluginId] of loadedPlugins) {
      try {
        await deactivatePluginSafely(loader, pluginId, false)
      } catch (err) {
        console.error(`[PluginProvider] Error unloading plugin "${pluginId}":`, err)
      }
    }
  }

  /**
   * Unload all active plugins from the current loader.
   */
  async function unloadAllPlugins(): Promise<void> {
    const loader = pluginLoaderRef.current
    if (!loader) return
    await unloadLoaderPlugins(loader)
    // Recorded gaps belong to the plugins that just went away.
    clearApiGaps()
  }

  /**
   * Reload plugins: unload all, then reload from backend.
   */
  const reload = async (): Promise<void> => {
    if (!vaultId || !pluginRegistryRef.current || !pluginLoaderRef.current) return

    await unloadAllPlugins()
    loadedRef.current = false
    await loadPluginsForVault(vaultId, pluginRegistryRef.current, pluginLoaderRef.current)
  }

  /** Enable or disable one plugin and apply the change to the running vault. */
  const setPluginEnabled = useCallback(async (pluginId: string, enabled: boolean): Promise<void> => {
    const targetVaultId = vaultId
    const registry = pluginRegistryRef.current
    const loader = pluginLoaderRef.current
    const isCurrentContext = (): boolean => (
      pluginSystemVaultIdRef.current === targetVaultId
      && pluginRegistryRef.current === registry
      && pluginLoaderRef.current === loader
    )
    if (!targetVaultId || !registry || !loader || !isCurrentContext()) {
      throw new Error('Plugin system is not ready')
    }

    if (!enabled) {
      if (loader.getRecord(pluginId)) {
        await deactivatePluginSafely(loader, pluginId)
      } else {
        registry.updateStatus(pluginId, 'inactive')
      }
      // Remove plugin CSS when deactivated
      const cssInjector = new CssInjector()
      cssInjector.remove(pluginId)
      await registry.waitForPersistence()
      if (isCurrentContext()) {
        setPlugins(registry.listPlugins())
      }
      // Reload page to ensure clean state — some plugins (e.g. LiveSync) cannot
      // reinitialize within the same session after unload due to IndexedDB/PouchDB state.
      window.location.reload()
      return
    }

    if (!loader.getRecord(pluginId)) {
      const manifest = await apiClient.getPlugin(targetVaultId, pluginId)
      if (!isCurrentContext()) {
        throw new Error('Vault changed while enabling plugin')
      }
      if (!registry.listPlugins().some(entry => entry.pluginId === pluginId)) {
        registry.register(manifest, 'inactive')
      }
      const bundle = await apiClient.loadBundle(targetVaultId, pluginId)
      if (!isCurrentContext()) {
        throw new Error('Vault changed while enabling plugin')
      }

      // Load and inject plugin CSS
      apiClient.loadStyles(targetVaultId, pluginId).then((css) => {
        if (css && isCurrentContext()) {
          const cssInjector = new CssInjector()
          cssInjector.inject(pluginId, css)
        }
      }).catch(() => { /* No styles — ignore */ })

      await loader.loadPlugin(pluginId, bundle, manifest)
      if (!isCurrentContext()) {
        await deactivatePluginSafely(loader, pluginId, false)
        throw new Error('Vault changed while enabling plugin')
      }
    }

    if (loader.getStatus(pluginId) === 'active') {
      registry.updateStatus(pluginId, 'active')
    } else {
      await loader.activatePlugin(pluginId)
      // Only reached via this user-driven toggle, never via loadPluginsForVault's
      // startup auto-load of already-active plugins — matching Obsidian, where
      // onUserEnable() fires once for a real enable action, not every load.
      if (isCurrentContext()) {
        try {
          await loader.getPlugin(pluginId)?.onUserEnable?.()
        } catch (err) {
          console.error(`[PluginProvider] Plugin "${pluginId}" onUserEnable() threw:`, err)
        }
      }
    }
    if (!isCurrentContext()) {
      await deactivatePluginSafely(loader, pluginId, false)
      throw new Error('Vault changed while enabling plugin')
    }
    await registry.waitForPersistence()
    if (isCurrentContext()) {
      setPlugins(registry.listPlugins())
    }
  }, [apiClient, vaultId])

  // ─── Event Bridge: connect Slatebase state changes to plugin shim events ──

  // eslint-disable-next-line react-hooks/refs
  usePluginEventBridge({
    tabState,
    directoryTree,
    workspaceShim: workspaceShimRef.current, // eslint-disable-line react-hooks/refs
    metadataCacheShim: metadataCacheShimRef.current, // eslint-disable-line react-hooks/refs
    vaultShim: vaultShimRef.current, // eslint-disable-line react-hooks/refs
    currentVaultId: vaultId ?? null,
  })

  // ─── Realtime: plugin settings changed externally (another tab/device) ────
  //
  // Obsidian API since 1.5.7 (Plugin#onExternalSettingsChange). The backend
  // broadcasts on every saveSettings() write, including the echo of a write
  // this tab itself just made — wasRecentSettingsWrite() suppresses that,
  // same pattern as markPluginWrite() for vault file writes.
  useEffect(() => {
    return onPluginSettingsChange(({ vaultId: eventVaultId, pluginId }) => {
      if (eventVaultId !== vaultId) return
      if (wasRecentSettingsWrite(eventVaultId, pluginId)) return
      const instance = pluginLoaderRef.current?.getPlugin(pluginId)
      if (!instance?.onExternalSettingsChange) return
      void (async () => {
        try {
          await instance.onExternalSettingsChange?.()
        } catch (err) {
          console.error(`[PluginProvider] Plugin "${pluginId}" onExternalSettingsChange() threw:`, err)
        }
      })()
    })
  }, [vaultId])

  // ─── TabViewBridge: connect plugin view lifecycle events to TabProvider ────

  const { tabDispatch } = useTabContext()

  // Keeps the "markdown" view creator (registered in handleVaultSwitch, which
  // closes over refs rather than this render's tabState/tabDispatch) pointed at
  // the current tab list so it always toggles the actually-active tab.
  useEffect(() => {
    requestSourceViewRef.current = () => {
      const tabId = tabState.activeTabId
      if (!tabId) return
      const tab = tabState.tabs.find(t => t.id === tabId)
      if (tab && tab.mode !== 'edit') {
        tabDispatch({ type: 'TOGGLE_MODE', payload: { tabId } })
      }
    }
  }, [tabState, tabDispatch])

  useEffect(() => {
    const currentVaultId = vaultId
    if (!currentVaultId) return

    const handleOpen: OpenPluginViewTabFn = (_vaultId, viewType, displayText, icon) => {
      const virtualPath = `__view::${viewType}`
      // Deduplication: check if tab with same virtual path already exists
      const existingTab = tabState.tabs.find(
        t => t.filePath === virtualPath && t.vaultId === currentVaultId
      )
      if (existingTab) {
        // Activate existing tab instead of creating a new one
        tabDispatch({ type: 'ACTIVATE_TAB', payload: { tabId: existingTab.id } })
        return
      }
      tabDispatch({
        type: 'OPEN_TAB',
        payload: { vaultId: currentVaultId, filePath: virtualPath, fileName: displayText, icon },
      })
    }

    const handleClose: ClosePluginViewTabFn = (_vaultId, viewType) => {
      const virtualPath = `__view::${viewType}`
      const tab = tabState.tabs.find(
        t => t.filePath === virtualPath && t.vaultId === currentVaultId
      )
      if (tab) {
        tabDispatch({ type: 'CLOSE_TAB', payload: { tabId: tab.id } })
      }
    }

    const handleActivate: ActivatePluginViewTabFn = (_vaultId, viewType) => {
      const virtualPath = `__view::${viewType}`
      const tab = tabState.tabs.find(
        t => t.filePath === virtualPath && t.vaultId === currentVaultId
      )
      if (tab) {
        tabDispatch({ type: 'ACTIVATE_TAB', payload: { tabId: tab.id } })
      }
    }

    onOpenPluginViewTab(handleOpen)
    onClosePluginViewTab(handleClose)
    onActivatePluginViewTab(handleActivate)

    return () => {
      offOpenPluginViewTab(handleOpen)
      offClosePluginViewTab(handleClose)
      offActivatePluginViewTab(handleActivate)
    }
  }, [vaultId, tabState.tabs, tabDispatch])

  // ─── Update MetadataCacheShim tree when directoryTree changes ────────────

  useEffect(() => {
    if (metadataCacheShimRef.current && directoryTree) {
      metadataCacheShimRef.current.updateTree(directoryTree)
    }
  }, [directoryTree])

  // ─── Update WorkspaceShim directory tree for openLinkText resolution ──────

  useEffect(() => {
    if (workspaceShimRef.current) {
      workspaceShimRef.current.setDirectoryTree(directoryTree)
    }
  }, [directoryTree])

  // ─── Update VaultShim tree when directoryTree changes ─────────────────────

  useEffect(() => {
    if (vaultShimRef.current && directoryTree) {
      vaultShimRef.current.updateTree(directoryTree)
    }

    // After plugins are loaded and the tree becomes available (or updates),
    // emit events so plugins like Calendar re-scan their cached data:
    // - 'resolved' on MetadataCacheShim: signals metadata is ready
    // - 'layout-change' on WorkspaceShim: triggers Calendar to re-render (calls getAllDailyNotes fresh)
    if (directoryTree && loadedRef.current) {
      if (metadataCacheShimRef.current) {
        metadataCacheShimRef.current.trigger('resolved')
      }
      if (workspaceShimRef.current) {
        workspaceShimRef.current.trigger('layout-change')
      }
    }
  }, [directoryTree])

  // ─── Subscribe to RibbonIconRegistry changes ──────────────────────────────

  useEffect(() => {
    const unsubscribe = onRibbonIconsChange((icons) => {
      setRibbonIcons(icons)
    })
    return unsubscribe
  }, [])

  // ─── Wire WorkspaceShim onOpenFile to tab opening ─────────────────────────

  useEffect(() => {
    const currentVaultId = vaultId
    if (!workspaceShimRef.current || !currentVaultId) {
      return
    }
    const workspaceShim = workspaceShimRef.current
    workspaceShim.setOnOpenFile((filePath: string) => {
      const fileName = filePath.split('/').pop() ?? filePath
      void openTab(tabDispatch, (() => {}) as never, apiClient, currentVaultId, filePath, fileName)
    })
    return () => {
      workspaceShim.setOnOpenFile(null)
    }
  }, [vaultId, tabDispatch])

  // NOTE: Ctrl+P / Cmd+P shortcut moved to CommandPaletteContainer (always active).
  // PluginProvider no longer handles this shortcut to avoid duplicate event dispatches.

  // ─── Context value ─────────────────────────────────────────────────────────

  // Refs are read during render to provide stable singleton instances to consumers.
  // This is intentional: these refs hold long-lived objects that outlive renders.
   
  const contextValue: PluginContextValue = {
    commandRegistry: commandRegistryRef.current, // eslint-disable-line react-hooks/refs
    pluginRegistry: pluginRegistryRef.current ?? new PluginRegistry(createRegistryApiAdapter(apiClient), vaultId ?? ''), // eslint-disable-line react-hooks/refs
    settingTabRegistry: settingTabRegistryRef.current, // eslint-disable-line react-hooks/refs
    plugins,
    isLoading,
    reload,
    setPluginEnabled,
    analyzer: analyzerRef.current, // eslint-disable-line react-hooks/refs
    activeViews,
    sidebarViews,
    leftSidebarViews,
    moveSidebarView: (viewType: string, targetSide: 'left' | 'right'): void => {
      const workspace = workspaceShimRef.current
      const viewRegistry = workspace?.getViewRegistry() ?? viewRegistryRef.current
      if (!viewRegistry) return
      const sourceInfo = targetSide === 'left' ? sidebarViews.get(viewType) : leftSidebarViews.get(viewType)
      if (!sourceInfo) return
      viewRegistry.moveLeafToSide(sourceInfo.leaf, targetSide)
    },
    ribbonIcons,
    createFileView: async (viewType: string, filePath: string): Promise<{ containerEl: HTMLElement; leaf: WorkspaceLeaf; view: ItemView } | null> => {
      const workspace = workspaceShimRef.current
      const viewRegistry = workspace?.getViewRegistry() ?? viewRegistryRef.current
      if (!viewRegistry || !workspace) return null
      // See the `sharedApp` construction above for why fileManager/commands/hotkeyManager
      // (and internalPlugins/plugins/embedRegistry) must be included here too — this
      // becomes `leaf.app` / `this.app` inside the view.
      const sharedApp = {
        vault: vaultShimRef.current,
        workspace,
        metadataCache: metadataCacheShimRef.current,
        fileManager: vaultShimRef.current ? FileManagerShim.wrapWithProxy(new FileManagerShim(vaultShimRef.current)) : undefined,
        commands: createCommandManager(commandRegistryRef.current),
        hotkeyManager: createHotkeyManager(commandRegistryRef.current),
        get internalPlugins() { return getWindowApp()?.internalPlugins },
        get plugins() { return getWindowApp()?.plugins },
        get embedRegistry() { return getWindowApp()?.embedRegistry },
        getAccentColor: () => getWindowApp()?.getAccentColor?.() ?? '#7c3aed',
      }
      // Unlike a plugin-initiated setViewState() call (already running inside
      // withPluginContext from onload/a command/an event handler), this view
      // is constructed by Slatebase's own TabContent effect — nothing has the
      // owning plugin marked as "currently executing". Without this wrapper,
      // any setTimeout/setInterval the view's onload() schedules (e.g.
      // Excalidraw's autosave reset) is scheduled with a null pluginId, so
      // trackPluginTimer() never records it and sandbox.cleanup() can't
      // cancel it on plugin unload — it fires later against a torn-down
      // plugin and throws. withPluginContextAsync keeps the plugin marked
      // as current across every await in setViewState (onClose/onload/onOpen).
      const pluginId = viewRegistry.getPluginIdForView(viewType) ?? null
      return withPluginContextAsync(pluginId, async () => {
        const leaf = viewRegistry.createLeaf(sharedApp, 'main')
        await leaf.setViewState({ type: viewType, state: { file: filePath } })
        if (leaf.view) {
          return { containerEl: leaf.containerEl, leaf, view: leaf.view }
        }
        return null
      })
    },
  }

  return React.createElement(
    PluginContext.Provider,
    { value: contextValue }, // eslint-disable-line react-hooks/refs
    children,
  )
}

// ─── Hook ────────────────────────────────────────────────────────────────────

/**
 * Hook to access the PluginContext. Throws if used outside PluginProvider.
 */
export function usePluginContext(): PluginContextValue {
  const context = useContext(PluginContext)
  if (context === null) {
    throw new Error('usePluginContext must be used within a PluginProvider')
  }
  return context
}
