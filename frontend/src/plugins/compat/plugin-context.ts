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
import type { ItemView } from './view-registry'
import type { TabState } from '../../state/tabState'

// ─── Context Value ───────────────────────────────────────────────────────────

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
  /** Reload plugins (re-fetch from backend and re-activate) */
  reload(): Promise<void>
  /** Compatibility analyzer for plugin analysis */
  analyzer: ICompatibilityAnalyzer
  /** Active plugin views (view type → DOM container element) */
  activeViews: Map<string, { viewType: string; displayText: string; containerEl: HTMLElement }>
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
  const loadedRef = useRef(false)

  // Shared shim instances per vault (used by all plugins and the event bridge)
  const workspaceShimRef = useRef<WorkspaceShim | null>(null)
  const metadataCacheShimRef = useRef<MetadataCacheShim | null>(null)

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
        void viewRegistryRef.current.clear()
        setPlugins([])
        setActiveViews(new Map())
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
    setActiveViews(new Map())

    // 3. Create new vault-scoped instances
    const registryAdapter = createRegistryApiAdapter(apiClient)
    const settingsAdapter = createSettingsApiAdapter(apiClient)

    const newRegistry = new PluginRegistry(registryAdapter, newVaultId)
    const newSettingsManager = new SettingsManager(settingsAdapter, newVaultId)

    const newSandbox = new PluginSandbox(newVaultId, (pluginId, reason) => {
      console.warn(`[PluginProvider] Plugin "${pluginId}" auto-deactivated: ${reason}`)
      newRegistry.updateStatus(pluginId, 'inactive', reason)
      setPlugins(newRegistry.listPlugins())
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
    // Attach registry to workspace shim (needs a dummy app reference for leaf creation)
    // The app reference will be a minimal shared object — all plugins see the same vault/workspace/metadataCache
    const sharedApp = {
      vault: new VaultShim(newVaultId, vaultName, apiClient, directoryTree ?? { name: vaultName, type: 'directory' as const, children: [], itemCount: 0, path: '' }),
      workspace: newWorkspaceShim,
      metadataCache: newMetadataCacheShim,
    }
    newWorkspaceShim.setViewRegistry(newViewRegistry, sharedApp)

    const newLoader = new PluginLoader({
      appShimFactory: (pluginId: string) => {
        const tree = directoryTree ?? { name: vaultName, type: 'directory' as const, children: [], itemCount: 0, path: '' }
        const vaultShim = new VaultShim(newVaultId, vaultName, apiClient, tree)
        // Use shared WorkspaceShim and MetadataCacheShim so all plugins receive the same events
        const workspaceShim = workspaceShimRef.current!
        const metadataCacheShim = metadataCacheShimRef.current!
        return AppShim.create({
          vault: vaultShim,
          workspace: workspaceShim,
          metadataCache: metadataCacheShim,
          pluginId,
        })
      },
      sandbox: newSandbox,
      onStatusChange: (pluginId: string, status: PluginLoaderStatus, error?: string) => {
        const registryStatus = status === 'active' ? 'active'
          : status === 'error' ? 'error'
            : status === 'deactivated' ? 'inactive'
              : 'loading'
        newRegistry.updateStatus(pluginId, registryStatus, error)
        setPlugins(newRegistry.listPlugins())
      },
      onPluginInstantiated: (pluginId: string, instance) => {
        // Wire addCommand to route to the shared CommandRegistry
        instance.addCommand = (command) => {
          commandRegistryRef.current.addCommand(pluginId, command)
        }
        // Wire addSettingTab to route to the shared SettingTabRegistry
        instance.addSettingTab = (tab: unknown) => {
          settingTabRegistryRef.current.register(pluginId, tab as import('./setting-tab').PluginSettingTab)
        }
        // Wire registerView to route to the workspace shim's view registry
        ;(instance as unknown as { registerView: (viewType: string, creator: unknown) => void }).registerView = (viewType: string, creator: unknown) => {
          if (workspaceShimRef.current) {
            workspaceShimRef.current.registerView(viewType, creator as (leaf: import('./view-registry').WorkspaceLeaf) => unknown)
          }
        }
      },
    })

    pluginRegistryRef.current = newRegistry
    pluginLoaderRef.current = newLoader
    sandboxRef.current = newSandbox
    settingsManagerRef.current = newSettingsManager
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
    if (loadedRef.current) return
    loadedRef.current = true
    setIsLoading(true)

    try {
      // Load registry from backend
      await registry.loadFromBackend()
      setPlugins(registry.listPlugins())

      // Find active plugins and load their bundles
      const activePlugins = registry.listPlugins().filter(p => p.status === 'active')
      const pluginsToLoad: Array<{ pluginId: string; bundle: string; manifest: { id: string; name: string; version: string; minAppVersion?: string; author?: string; description?: string } }> = []

      for (const entry of activePlugins) {
        try {
          const bundle = await apiClient.loadBundle(targetVaultId, entry.pluginId)
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
      if (pluginsToLoad.length > 0) {
        await loader.loadAllActive(pluginsToLoad)
      }

      setPlugins(registry.listPlugins())
    } catch (err) {
      console.error('[PluginProvider] Failed to load plugins:', err)
    } finally {
      setIsLoading(false)
    }
  }

  /**
   * Unload all active plugins from the current loader.
   */
  async function unloadAllPlugins(): Promise<void> {
    const loader = pluginLoaderRef.current
    if (!loader) return

    const loadedPlugins = loader.getPlugins()
    for (const [pluginId] of loadedPlugins) {
      try {
        await loader.deactivatePlugin(pluginId)
      } catch (err) {
        console.error(`[PluginProvider] Error deactivating plugin "${pluginId}":`, err)
      }
    }
  }

  /**
   * Reload plugins: unload all, then reload from backend.
   */
  const reload = useCallback(async (): Promise<void> => {
    if (!vaultId || !pluginRegistryRef.current || !pluginLoaderRef.current) return

    await unloadAllPlugins()
    loadedRef.current = false
    await loadPluginsForVault(vaultId, pluginRegistryRef.current, pluginLoaderRef.current)
  }, [vaultId, apiClient])

  // ─── Event Bridge: connect Slatebase state changes to plugin shim events ──

  usePluginEventBridge({
    tabState,
    directoryTree,
    workspaceShim: workspaceShimRef.current,
    metadataCacheShim: metadataCacheShimRef.current,
  })

  // ─── Update MetadataCacheShim tree when directoryTree changes ────────────

  useEffect(() => {
    if (metadataCacheShimRef.current && directoryTree) {
      metadataCacheShimRef.current.updateTree(directoryTree)
    }
  }, [directoryTree])

  // ─── Keyboard shortcut: Ctrl+P / Cmd+P for Command Palette ──────────────

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
      const modifier = isMac ? e.metaKey : e.ctrlKey

      if (modifier && e.key === 'p') {
        e.preventDefault()
        // Dispatch a custom event that the CommandPalette component listens to
        window.dispatchEvent(new CustomEvent('slatebase:open-command-palette'))
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  // ─── Context value ─────────────────────────────────────────────────────────

  const contextValue: PluginContextValue = {
    commandRegistry: commandRegistryRef.current,
    pluginRegistry: pluginRegistryRef.current ?? new PluginRegistry(createRegistryApiAdapter(apiClient), vaultId ?? ''),
    settingTabRegistry: settingTabRegistryRef.current,
    plugins,
    isLoading,
    reload,
    analyzer: analyzerRef.current,
    activeViews,
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
