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
import type { PluginRegistryEntry } from './types'
import { PluginLoader } from './plugin-loader'
import type { PluginLoaderStatus } from './plugin-loader'
import { PluginRegistry } from './plugin-registry'
import type { IRegistryApiClient, PluginRegistryData } from './plugin-registry'
import { PluginSandbox } from './sandbox'
import { CommandRegistry } from './command-registry'
import type { ICommandRegistry } from './command-registry'
import { SettingsManager } from './settings-manager'
import type { ISettingsApiClient } from './settings-manager'
import { SettingTabRegistry } from './setting-tab-registry'
import type { ISettingTabRegistry } from './setting-tab-registry'
import { CompatibilityAnalyzer } from './compatibility-analyzer'
// Import setting-tab module to register global obsidian shims (PluginSettingTab, Setting)
import './setting-tab'
import type { ICompatibilityAnalyzer } from './compatibility-analyzer'
import { VaultShim } from './shims/vault-shim'
import { WorkspaceShim } from './shims/workspace-shim'
import { MetadataCacheShim } from './shims/metadata-cache-shim'
import { AppShim } from './shims/app-shim'
import { usePluginEventBridge } from './plugin-event-bridge'
import { ViewRegistry } from './view-registry'
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
} from './ribbon-icon-registry'
import type { RibbonIconEntry } from './ribbon-icon-registry'

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
  /** Plugin ribbon icons (for rendering in the toolbar) */
  ribbonIcons: RibbonIconEntry[]
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
      } catch {
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
      } catch {
        return null
      }
    },
    saveSettings: async (vaultId: string, pluginId: string, data: string): Promise<void> => {
      await apiClient.saveSettings(vaultId, pluginId, JSON.parse(data))
    },
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
  const [isLoading, setIsLoading] = useState(false)
  const [plugins, setPlugins] = useState<PluginRegistryEntry[]>([])
  const [activeViews, setActiveViews] = useState<Map<string, { viewType: string; displayText: string; containerEl: HTMLElement }>>(new Map())
  const [sidebarViews, setSidebarViews] = useState<Map<string, SidebarViewInfo>>(new Map())
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

  // Shared shim instances per vault (used by all plugins and the event bridge)
  const workspaceShimRef = useRef<WorkspaceShim | null>(null)
  const metadataCacheShimRef = useRef<MetadataCacheShim | null>(null)
  const vaultShimRef = useRef<VaultShim | null>(null)

  /** Remove all UI registrations owned by one plugin instance. */
  async function cleanupPluginRegistrations(pluginId: string): Promise<void> {
    commandRegistryRef.current.removeAllForPlugin(pluginId)
    settingTabRegistryRef.current.remove(pluginId)
    removeRibbonIconsForPlugin(pluginId)
    await viewRegistryRef.current.detachAllForPlugin(pluginId)
  }

  // ─── Vault Switch: unload all → rebuild instances → reload ───────────────

  useEffect(() => {
    // Skip if no vault selected
    if (!vaultId) {
      // If we previously had a vault, clean up
      if (prevVaultIdRef.current) {
        void unloadAllPlugins()
        pluginRegistryRef.current = null
        pluginLoaderRef.current = null
        sandboxRef.current = null
        settingsManagerRef.current = null
        workspaceShimRef.current = null
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

    // Create shared shim instances for the vault (shared across all plugins)
    const newWorkspaceShim = new WorkspaceShim()
    const newMetadataCacheShim = new MetadataCacheShim(directoryTree)
    workspaceShimRef.current = newWorkspaceShim
    metadataCacheShimRef.current = newMetadataCacheShim

    // Create a fresh ViewRegistry for this vault and wire it to the WorkspaceShim
    const newViewRegistry = new ViewRegistry()
    viewRegistryRef.current = newViewRegistry
    newViewRegistry.setOnViewActivated((viewType: string, view: ItemView) => {
      setActiveViews(prev => {
        const next = new Map(prev)
        next.set(viewType, {
          viewType,
          displayText: view.getDisplayText(),
          containerEl: view.containerEl,
        })
        return next
      })
    })
    newViewRegistry.setOnViewDeactivated((viewType: string) => {
      setActiveViews(prev => {
        const next = new Map(prev)
        next.delete(viewType)
        return next
      })
    })
    newViewRegistry.setOnSidebarViewActivated((viewType: string, view: ItemView, leaf: WorkspaceLeaf) => {
      console.log('[PluginProvider] Sidebar view activated:', viewType, view.getDisplayText())
      setSidebarViews(prev => {
        const next = new Map(prev)
        next.set(viewType, {
          viewType,
          displayText: view.getDisplayText(),
          icon: view.getIcon(),
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
    // Attach registry to workspace shim (needs a dummy app reference for leaf creation)
    // The app reference will be a minimal shared object — all plugins see the same vault/workspace/metadataCache
    const newVaultShim = new VaultShim(newVaultId, vaultName, apiClient, directoryTree ?? { name: vaultName, type: 'directory' as const, children: [], itemCount: 0, path: '' })
    vaultShimRef.current = newVaultShim
    const sharedApp = {
      vault: newVaultShim,
      workspace: newWorkspaceShim,
      metadataCache: newMetadataCacheShim,
    }
    newWorkspaceShim.setViewRegistry(newViewRegistry, sharedApp)

    // Update window.app to reference the real shim instances
    // (many plugins and libraries like obsidian-daily-notes-interface access window.app directly)
    const windowApp = (window as unknown as { app: Record<string, unknown> }).app
    if (windowApp) {
      windowApp.vault = sharedApp.vault
      windowApp.workspace = sharedApp.workspace
      windowApp.metadataCache = sharedApp.metadataCache
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
        // Wire addCommand to route to the shared CommandRegistry
        instance.addCommand = (command) => {
          if (pluginSystemVaultIdRef.current !== newVaultId || pluginRegistryRef.current !== newRegistry) return
          commandRegistryRef.current.addCommand(pluginId, command)
        }
        // Wire addSettingTab to route to the shared SettingTabRegistry
        instance.addSettingTab = (tab: unknown) => {
          if (pluginSystemVaultIdRef.current !== newVaultId || pluginRegistryRef.current !== newRegistry) return
          settingTabRegistryRef.current.register(pluginId, tab as import('./setting-tab').PluginSettingTab)
        }
        // Wire registerView to route to the workspace shim's view registry
        ;(instance as unknown as { registerView: (viewType: string, creator: unknown) => void }).registerView = (viewType: string, creator: unknown) => {
          console.log(`[PluginProvider] registerView called: viewType="${viewType}", pluginId="${pluginId}", guardCheck: vaultRef=${pluginSystemVaultIdRef.current}, newVaultId=${newVaultId}, registryMatch=${pluginRegistryRef.current === newRegistry}`)
          if (pluginSystemVaultIdRef.current !== newVaultId || pluginRegistryRef.current !== newRegistry) return
          newWorkspaceShim.registerView(viewType, creator as (leaf: import('./view-registry').WorkspaceLeaf) => unknown, pluginId)
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
    const doLoad = () => {
      // Guard: vault may have switched again before this fires
      if (prevVaultIdRef.current !== targetVaultId) return
      void loadPluginsForVault(targetVaultId, registry, loader)
    }

    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(doLoad, { timeout: 2000 })
    } else {
      setTimeout(doLoad, 50)
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
      pluginSystemVaultIdRef.current === targetVaultId
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
      setPlugins(registry.listPlugins())

      // Find active plugins and load their bundles
      const activePlugins = registry.listPlugins().filter(p => p.status === 'active')
      const pluginsToLoad: Array<{ pluginId: string; bundle: string; manifest: { id: string; name: string; version: string; minAppVersion?: string; author?: string; description?: string } }> = []

      for (const entry of activePlugins) {
        try {
          const bundle = await apiClient.loadBundle(targetVaultId, entry.pluginId)
          if (!isCurrentContext()) return
          pluginsToLoad.push({
            pluginId: entry.pluginId,
            bundle,
            manifest: {
              id: entry.manifest?.id ?? entry.pluginId,
              name: entry.manifest?.name ?? entry.pluginId,
              version: entry.manifest?.version ?? '0.0.0',
              minAppVersion: entry.manifest?.minAppVersion,
              author: entry.manifest?.author,
              description: entry.manifest?.description,
            },
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
            dailyNotesPlugin.instance.options.folder = config.dailyNotesDirectory || ''
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
        await loader.unloadPlugin(pluginId, false)
        await cleanupPluginRegistrations(pluginId)
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
        await loader.unloadPlugin(pluginId)
        await cleanupPluginRegistrations(pluginId)
      } else {
        registry.updateStatus(pluginId, 'inactive')
      }
      await registry.waitForPersistence()
      if (isCurrentContext()) {
        setPlugins(registry.listPlugins())
      }
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
      await loader.loadPlugin(pluginId, bundle, manifest)
      if (!isCurrentContext()) {
        await loader.unloadPlugin(pluginId, false)
        await cleanupPluginRegistrations(pluginId)
        throw new Error('Vault changed while enabling plugin')
      }
    }

    if (loader.getStatus(pluginId) === 'active') {
      registry.updateStatus(pluginId, 'active')
    } else {
      await loader.activatePlugin(pluginId)
    }
    if (!isCurrentContext()) {
      await loader.unloadPlugin(pluginId, false)
      await cleanupPluginRegistrations(pluginId)
      throw new Error('Vault changed while enabling plugin')
    }
    await registry.waitForPersistence()
    if (isCurrentContext()) {
      setPlugins(registry.listPlugins())
    }
  }, [apiClient, vaultId])

  // ─── Event Bridge: connect Slatebase state changes to plugin shim events ──

  usePluginEventBridge({
    tabState,
    directoryTree,
    workspaceShim: workspaceShimRef.current,
    metadataCacheShim: metadataCacheShimRef.current,
  })

  // ─── TabViewBridge: connect plugin view lifecycle events to TabProvider ────

  const { tabDispatch } = useTabContext()

  useEffect(() => {
    const currentVaultId = vaultId
    if (!currentVaultId) return

    const handleOpen: OpenPluginViewTabFn = (_vaultId, viewType, displayText, _icon) => {
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
        payload: { vaultId: currentVaultId, filePath: virtualPath, fileName: displayText },
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

  const contextValue: PluginContextValue = {
    commandRegistry: commandRegistryRef.current,
    pluginRegistry: pluginRegistryRef.current ?? new PluginRegistry(createRegistryApiAdapter(apiClient), vaultId ?? ''),
    settingTabRegistry: settingTabRegistryRef.current,
    plugins,
    isLoading,
    reload,
    setPluginEnabled,
    analyzer: analyzerRef.current,
    activeViews,
    sidebarViews,
    ribbonIcons,
  }

  return React.createElement(
    PluginContext.Provider,
    { value: contextValue },
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
