/**
 * PluginStoreBrowser — Main Plugin Store Browser component.
 *
 * Loads the community plugin list, manages search/filter state,
 * coordinates install/update actions, and integrates PluginStoreSearch,
 * PluginStoreCard, and UpdateBanner sub-components.
 */
import { useState, useEffect, useCallback, useMemo } from 'react'
import { Loader2 } from 'lucide-react'
import type { IApiClient, CommunityPluginEntry, UpdateCheckResult, BulkUpdateResult, PluginManifest } from '../../api'
import { useTranslation } from '../../i18n'
import { extractErrorMessage } from '../../utils/error'
import type { PluginStoreDisplayEntry, PluginStoreStatus } from './types'
import { PluginStoreSearch } from './PluginStoreSearch'
import { PluginStoreCard } from './PluginStoreCard'
import { UpdateBanner } from './UpdateBanner'
import { PluginDetailPanel } from './PluginDetailPanel'
import './PluginStoreBrowser.css'

/** Props for the PluginStoreBrowser component. */
export interface PluginStoreBrowserProps {
  /** Current vault ID to manage plugins for. */
  vaultId: string
  /** API client instance for making authenticated requests. */
  apiClient: IApiClient
}

/**
 * Main Plugin Store Browser component.
 *
 * Responsibilities:
 * 1. Load plugin list on mount via apiClient.getStorePlugins()
 * 2. Manage local state for search, filters, installing/updating sets, errors
 * 3. Client-side filtering of the plugin list
 * 4. Coordinate install/update actions
 * 5. Check for updates via apiClient.checkPluginUpdates(vaultId)
 * 6. Integrate PluginStoreSearch, PluginStoreCard, and UpdateBanner
 */
export function PluginStoreBrowser({ vaultId, apiClient }: PluginStoreBrowserProps) {
  const { t } = useTranslation()

  // ─── State ──────────────────────────────────────────────────────────────────

  const [plugins, setPlugins] = useState<CommunityPluginEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [showCompatibleOnly, setShowCompatibleOnly] = useState(false)
  const [showNotInstalled, setShowNotInstalled] = useState(false)
  const [updateCheck, setUpdateCheck] = useState<UpdateCheckResult | null>(null)
  const [installingPlugins, setInstallingPlugins] = useState<Set<string>>(new Set())
  const [updatingPlugins, setUpdatingPlugins] = useState<Set<string>>(new Set())
  const [pluginErrors, setPluginErrors] = useState<Map<string, string>>(new Map())
  const [bulkResult, setBulkResult] = useState<BulkUpdateResult | null>(null)
  const [isUpdatingAll, setIsUpdatingAll] = useState(false)
  const [installedPlugins, setInstalledPlugins] = useState<PluginManifest[]>([])
  const [selectedPlugin, setSelectedPlugin] = useState<PluginStoreDisplayEntry | null>(null)
  const [selectedCategory, setSelectedCategory] = useState('')
  // ─── Data Loading ───────────────────────────────────────────────────────────

  const loadPlugins = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [storeResult, installedResult] = await Promise.all([
        apiClient.getStorePlugins(),
        apiClient.listPlugins(vaultId),
      ])
      setPlugins(storeResult.plugins)
      setInstalledPlugins(installedResult.plugins)
    } catch (err: unknown) {
      setError(extractErrorMessage(err, t('pluginStore.loadError')))
    } finally {
      setLoading(false)
    }
  }, [apiClient, vaultId, t])

  useEffect(() => {
    void loadPlugins()
  }, [loadPlugins])

  // ─── Derived Data ───────────────────────────────────────────────────────────

  /** Set of installed plugin IDs for quick lookup. */
  const installedPluginIds = useMemo(() => {
    return new Set(installedPlugins.map(p => p.id))
  }, [installedPlugins])

  /** Map of installed plugin ID → version. */
  const installedVersionMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const p of installedPlugins) {
      map.set(p.id, p.version)
    }
    return map
  }, [installedPlugins])

  /** Map of plugin ID → update info from last update check. */
  const updateInfoMap = useMemo(() => {
    if (updateCheck === null) return new Map<string, { latestVersion: string; releaseUrl: string }>()
    const map = new Map<string, { latestVersion: string; releaseUrl: string }>()
    for (const info of updateCheck.plugins) {
      if (info.hasUpdate) {
        map.set(info.pluginId, { latestVersion: info.latestVersion, releaseUrl: info.releaseUrl })
      }
    }
    return map
  }, [updateCheck])

  // ─── Filtering ──────────────────────────────────────────────────────────────

  /** Derive categories from plugin descriptions/names for filtering. */
  const categories = useMemo(() => {
    return deriveCategories(plugins)
  }, [plugins])

  /** Get the category for a specific plugin. */
  const pluginCategoryMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const p of plugins) {
      map.set(p.id, categorizePlugin(p))
    }
    return map
  }, [plugins])

  const filteredPlugins = useMemo(() => {
    return plugins.filter(p => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        if (!p.name.toLowerCase().includes(q) &&
            !p.author.toLowerCase().includes(q) &&
            !p.description.toLowerCase().includes(q)) {
          return false
        }
      }
      if (showNotInstalled && installedPluginIds.has(p.id)) {
        return false
      }
      if (selectedCategory && pluginCategoryMap.get(p.id) !== selectedCategory) {
        return false
      }
      return true
    })
  }, [plugins, searchQuery, showNotInstalled, installedPluginIds, selectedCategory, pluginCategoryMap])

  // ─── Display Entries ────────────────────────────────────────────────────────

  /** Build display entries enriched with local state. */
  const displayEntries: PluginStoreDisplayEntry[] = useMemo(() => {
    return filteredPlugins.map(p => {
      const isInstalled = installedPluginIds.has(p.id)
      const installedVersion = installedVersionMap.get(p.id)
      const updateInfo = updateInfoMap.get(p.id)
      const hasUpdate = updateInfo !== undefined
      const isInstalling = installingPlugins.has(p.id)
      const isUpdating = updatingPlugins.has(p.id)
      const pluginError = pluginErrors.get(p.id)

      let status: PluginStoreStatus = 'available'
      if (isInstalling) status = 'installing'
      else if (isUpdating) status = 'updating'
      else if (hasUpdate) status = 'update-available'
      else if (isInstalled) status = 'installed'

      return {
        id: p.id,
        name: p.name,
        author: p.author,
        description: p.description,
        repo: p.repo,
        isInstalled,
        installedVersion,
        latestVersion: updateInfo?.latestVersion,
        hasUpdate,
        status,
        error: pluginError,
        releaseUrl: updateInfo?.releaseUrl,
      }
    })
  }, [filteredPlugins, installedPluginIds, installedVersionMap, updateInfoMap, installingPlugins, updatingPlugins, pluginErrors])

  // ─── Actions ────────────────────────────────────────────────────────────────

  const handleInstall = useCallback(async (pluginId: string, repo: string) => {
    setInstallingPlugins(prev => new Set(prev).add(pluginId))
    setPluginErrors(prev => {
      const next = new Map(prev)
      next.delete(pluginId)
      return next
    })

    try {
      const result = await apiClient.installFromStore(vaultId, pluginId, repo)
      setInstallingPlugins(prev => {
        const next = new Set(prev)
        next.delete(pluginId)
        return next
      })
      // Add to installed plugins list
      setInstalledPlugins(prev => [...prev, result.manifest as PluginManifest])
    } catch (err: unknown) {
      setInstallingPlugins(prev => {
        const next = new Set(prev)
        next.delete(pluginId)
        return next
      })
      setPluginErrors(prev => {
        const next = new Map(prev)
        next.set(pluginId, extractErrorMessage(err, 'Installation failed'))
        return next
      })
    }
  }, [apiClient, vaultId])

  const handleUpdate = useCallback(async (pluginId: string) => {
    setUpdatingPlugins(prev => new Set(prev).add(pluginId))
    setPluginErrors(prev => {
      const next = new Map(prev)
      next.delete(pluginId)
      return next
    })

    try {
      const result = await apiClient.updatePlugin(vaultId, pluginId)
      setUpdatingPlugins(prev => {
        const next = new Set(prev)
        next.delete(pluginId)
        return next
      })
      // Update installed plugins list with new version
      setInstalledPlugins(prev =>
        prev.map(p => p.id === pluginId ? result.manifest as PluginManifest : p)
      )
      // Remove from update info
      setUpdateCheck(prev => {
        if (prev === null) return null
        return {
          ...prev,
          plugins: prev.plugins.map(p =>
            p.pluginId === pluginId ? { ...p, hasUpdate: false } : p
          ),
        }
      })
    } catch (err: unknown) {
      setUpdatingPlugins(prev => {
        const next = new Set(prev)
        next.delete(pluginId)
        return next
      })
      setPluginErrors(prev => {
        const next = new Map(prev)
        next.set(pluginId, extractErrorMessage(err, 'Update failed'))
        return next
      })
    }
  }, [apiClient, vaultId])

  const handleUpdateAll = useCallback(async () => {
    setIsUpdatingAll(true)
    setBulkResult(null)

    try {
      const result = await apiClient.updateAllPlugins(vaultId)
      setBulkResult(result)
      // Refresh installed plugins after bulk update
      try {
        const installedResult = await apiClient.listPlugins(vaultId)
        setInstalledPlugins(installedResult.plugins)
      } catch {
        // Non-critical: list refresh failed
      }
      // Clear update check to reflect new state
      setUpdateCheck(null)
    } catch (err: unknown) {
      setBulkResult({
        updated: [],
        failed: [{ pluginId: '*', reason: extractErrorMessage(err, 'Bulk update failed') }],
      })
    } finally {
      setIsUpdatingAll(false)
    }
  }, [apiClient, vaultId])

  const handleCheckUpdates = useCallback(async () => {
    try {
      const result = await apiClient.checkPluginUpdates(vaultId)
      setUpdateCheck(result)
    } catch {
      // Silently fail — update check is non-critical
    }
  }, [apiClient, vaultId])

  // Check for updates on mount if there are installed plugins
  useEffect(() => {
    if (installedPlugins.length > 0) {
      void handleCheckUpdates()
    }
  }, [installedPlugins.length, handleCheckUpdates])

  const handleResetFilters = useCallback(() => {
    setSearchQuery('')
    setShowCompatibleOnly(false)
    setShowNotInstalled(false)
    setSelectedCategory('')
  }, [])

  // ─── Update count ───────────────────────────────────────────────────────────

  const updateCount = useMemo(() => {
    if (updateCheck === null) return 0
    return updateCheck.plugins.filter(p => p.hasUpdate).length
  }, [updateCheck])

  // ─── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="plugin-store-browser">
        <div className="plugin-store-browser__loading">
          <Loader2 size={20} className="spin" aria-hidden="true" />
          <span>{t('pluginStore.loading')}</span>
        </div>
      </div>
    )
  }

  if (error !== null) {
    return (
      <div className="plugin-store-browser">
        <div className="plugin-store-browser__error">
          <span className="plugin-store-browser__error-message">{error}</span>
          <button className="plugin-store-browser__retry-button" onClick={() => void loadPlugins()}>
            {t('pluginStore.retry')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="plugin-store-browser">
      <PluginStoreSearch
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        showCompatibleOnly={showCompatibleOnly}
        onCompatibleChange={setShowCompatibleOnly}
        showNotInstalled={showNotInstalled}
        onNotInstalledChange={setShowNotInstalled}
        selectedCategory={selectedCategory}
        onCategoryChange={setSelectedCategory}
        categories={categories}
        totalCount={plugins.length}
        filteredCount={displayEntries.length}
      />

      <UpdateBanner
        updateCount={updateCount}
        isUpdating={isUpdatingAll}
        onUpdateAll={handleUpdateAll}
        bulkResult={bulkResult}
      />

      {displayEntries.length === 0 ? (
        <div className="plugin-store-browser__empty">
          <span>{t('pluginStore.noResults')}</span>
          <button className="plugin-store-browser__reset-button" onClick={handleResetFilters}>
            {t('pluginStore.resetFilters')}
          </button>
        </div>
      ) : (
        <div className="plugin-store-browser__list">
          {displayEntries.map(plugin => (
            <PluginStoreCard
              key={plugin.id}
              plugin={plugin}
              onInstall={handleInstall}
              onUpdate={handleUpdate}
              onClick={setSelectedPlugin}
            />
          ))}
        </div>
      )}

      {selectedPlugin !== null && (
        <PluginDetailPanel
          plugin={selectedPlugin}
          apiClient={apiClient}
          onInstall={handleInstall}
          onUpdate={handleUpdate}
          onClose={() => setSelectedPlugin(null)}
        />
      )}
    </div>
  )
}

// ─── Category Utilities ───────────────────────────────────────────────────────

/** Category keywords mapped to category labels. */
const CATEGORY_RULES: Array<{ label: string; keywords: string[] }> = [
  { label: 'Editor', keywords: ['editor', 'editing', 'markdown', 'writing', 'text', 'format', 'toolbar', 'vim', 'cursor'] },
  { label: 'Navigation', keywords: ['navigation', 'search', 'file', 'folder', 'explorer', 'sidebar', 'tabs', 'workspace'] },
  { label: 'Data & Queries', keywords: ['data', 'database', 'query', 'table', 'csv', 'dataview', 'chart', 'graph'] },
  { label: 'Tasks & Planning', keywords: ['task', 'todo', 'kanban', 'calendar', 'daily', 'agenda', 'planner', 'journal'] },
  { label: 'Appearance', keywords: ['theme', 'css', 'style', 'icon', 'font', 'color', 'banner', 'header'] },
  { label: 'Integration', keywords: ['sync', 'git', 'api', 'import', 'export', 'publish', 'share', 'cloud'] },
  { label: 'Media', keywords: ['image', 'video', 'audio', 'embed', 'pdf', 'draw', 'diagram', 'excalidraw', 'canvas'] },
  { label: 'Templates', keywords: ['template', 'templater', 'snippet', 'macro', 'quickadd'] },
  { label: 'Links & References', keywords: ['link', 'backlink', 'reference', 'citation', 'footnote', 'wikilink', 'url'] },
]

/**
 * Categorize a single plugin based on its name and description.
 * Returns the first matching category or 'Sonstiges' (Other).
 */
function categorizePlugin(plugin: { name: string; description: string }): string {
  const text = `${plugin.name} ${plugin.description}`.toLowerCase()
  for (const rule of CATEGORY_RULES) {
    for (const keyword of rule.keywords) {
      if (text.includes(keyword)) {
        return rule.label
      }
    }
  }
  return 'Sonstiges'
}

/**
 * Derive the sorted list of categories present in the plugin list.
 * Only includes categories that have at least one plugin.
 */
function deriveCategories(plugins: Array<{ name: string; description: string }>): string[] {
  const seen = new Set<string>()
  for (const p of plugins) {
    seen.add(categorizePlugin(p))
  }
  // Sort alphabetically but put "Sonstiges" last
  const sorted = [...seen].sort((a, b) => {
    if (a === 'Sonstiges') return 1
    if (b === 'Sonstiges') return -1
    return a.localeCompare(b)
  })
  return sorted
}
