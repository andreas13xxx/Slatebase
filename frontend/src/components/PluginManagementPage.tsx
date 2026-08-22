import { useState, useEffect, useCallback, useRef, useContext } from 'react'
import { createPortal } from 'react-dom'
import type { IApiClient, PluginManifest, PluginRegistryData } from '../api'
import { PluginUpload } from './PluginUpload'
import { CompatibilityAnalyzer } from '../plugins/compat/compatibility-analyzer'
import type { ApiCallClassification } from '../plugins/compat/compatibility-analyzer'
import { PluginContext } from '../plugins/compat/plugin-context'
import {
  Plug, Settings, AlertTriangle, RefreshCw, ChevronDown, ChevronRight,
  CheckCircle2, AlertCircle, HelpCircle, XCircle, X, Save, Trash2, Loader2,
} from 'lucide-react'
import { ConfirmModal } from './ConfirmModal'
import { extractErrorMessage } from '../utils/error'
import { useTranslation } from '../i18n'
import { PluginStoreBrowser } from './plugin-store'

// ─── Types ───────────────────────────────────────────────────────────────────

/** Tab for plugin management page */
type PluginTab = 'installed' | 'available'

/** Plugin status types */
type PluginStatus = 'active' | 'inactive' | 'error' | 'loading'

/** Compatibility levels */
type CompatibilityLevel = 'full' | 'partial' | 'unsupported' | 'unknown'

/** Merged plugin data for display */
interface PluginDisplayItem {
  pluginId: string
  name: string
  version: string
  author: string
  description: string
  status: PluginStatus
  compatibilityLevel: CompatibilityLevel
  compatibilityReasons: string[]
  compatibilityApiCalls: ApiCallClassification[]
  error?: string
  hasSettings: boolean
  hasEvalUsage: boolean
}

/** Props for the PluginManagementPage component. */
export interface PluginManagementPageProps {
  /** API client instance for making authenticated requests. */
  apiClient: IApiClient
  /** Current vault ID to manage plugins for. */
  vaultId: string
}

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * Plugin management page displaying installed plugins with controls for
 * activation/deactivation, settings, and compatibility details.
 */
export function PluginManagementPage({ apiClient, vaultId }: PluginManagementPageProps) {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<PluginTab>('installed')
  const [plugins, setPlugins] = useState<PluginDisplayItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedPlugin, setExpandedPlugin] = useState<string | null>(null)
  const [togglingPlugins, setTogglingPlugins] = useState<Set<string>>(new Set())
  const [reloadingPlugins, setReloadingPlugins] = useState<Set<string>>(new Set())
  const [registryData, setRegistryData] = useState<PluginRegistryData | null>(null)
  const [settingsModal, setSettingsModal] = useState<{ pluginId: string; pluginName: string } | null>(null)
  const [settingsJson, setSettingsJson] = useState('')
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [settingsError, setSettingsError] = useState<string | null>(null)
  const [settingsLoading, setSettingsLoading] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<{ pluginId: string; pluginName: string } | null>(null)
  const [deletingPlugins, setDeletingPlugins] = useState<Set<string>>(new Set())
  const [evalWarningConfirm, setEvalWarningConfirm] = useState<{ pluginId: string; pluginName: string } | null>(null)
  const [updateCount, setUpdateCount] = useState<number>(0)
  const [checkingUpdates, setCheckingUpdates] = useState(false)
  const [updateInfo, setUpdateInfo] = useState<Map<string, { latestVersion: string; repo: string }>>(new Map())
  const [hasCheckedUpdates, setHasCheckedUpdates] = useState(false)
  const [updatingPlugins, setUpdatingPlugins] = useState<Set<string>>(new Set())
  const [isUpdatingAll, setIsUpdatingAll] = useState(false)

  const analyzerRef = useRef(new CompatibilityAnalyzer())
  const settingsContainerRef = useRef<HTMLDivElement>(null)
  const pluginContext = useContext(PluginContext)

  // ─── Background: Analyze compatibility + detect settings ───────────────

  /**
   * Fetches bundles for all plugins, runs compatibility analysis, and checks
   * if settings exist. Updates both the display list and the persisted registry.
   */
  const analyzeAndDetectSettings = useCallback(async (
    manifests: PluginManifest[],
    _registry: PluginRegistryData | null,
  ): Promise<void> => {
    const updates: Array<{
      pluginId: string
      compatibilityLevel?: CompatibilityLevel
      compatibilityReasons?: string[]
      compatibilityApiCalls?: ApiCallClassification[]
      hasSettings?: boolean
    }> = []

    await Promise.all(manifests.map(async (manifest) => {
      const update: {
        pluginId: string
        compatibilityLevel?: CompatibilityLevel
        compatibilityReasons?: string[]
        compatibilityApiCalls?: ApiCallClassification[]
        hasSettings?: boolean
      } = {
        pluginId: manifest.id,
      }

      // 1. Compatibility analysis (always run to populate reasons/apiCalls)
      try {
        const bundle = await apiClient.loadBundle(vaultId, manifest.id)
        const report = analyzerRef.current.analyze(bundle, manifest)
        update.compatibilityLevel = report.level
        update.compatibilityReasons = report.reasons
        update.compatibilityApiCalls = report.apiCalls
      } catch {
        // Bundle load failed — leave as unknown
      }

      // 2. Settings: always available for installed plugins
      // Plugins can always be configured (empty {} if no data.json exists yet)
      update.hasSettings = true

      updates.push(update)
    }))

    // Apply updates to display list
    if (updates.length > 0) {
      setPlugins(prev => prev.map(p => {
        const upd = updates.find(u => u.pluginId === p.pluginId)
        if (!upd) return p
        return {
          ...p,
          compatibilityLevel: upd.compatibilityLevel ?? p.compatibilityLevel,
          compatibilityReasons: upd.compatibilityReasons ?? p.compatibilityReasons,
          compatibilityApiCalls: upd.compatibilityApiCalls ?? p.compatibilityApiCalls,
          hasSettings: upd.hasSettings ?? p.hasSettings,
        }
      }))

      // Compatibility analysis is display-only. Persisting a full registry
      // snapshot here can overwrite newer activation state from the loader.
    }
  }, [apiClient, vaultId])

  // ─── Load plugins ──────────────────────────────────────────────────────

  const loadPlugins = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [manifestsResult, registry] = await Promise.all([
        apiClient.listPlugins(vaultId),
        apiClient.loadRegistry(vaultId).catch(() => null),
      ])

      const manifests: PluginManifest[] = manifestsResult.plugins ?? []
      setRegistryData(registry)

      const merged: PluginDisplayItem[] = manifests.map((manifest) => {
        const regEntry = registry?.plugins?.[manifest.id]
        return {
          pluginId: manifest.id,
          name: manifest.name,
          version: manifest.version,
          author: manifest.author ?? 'Unbekannt',
          description: manifest.description ?? '',
          status: regEntry?.status === 'loading'
            ? 'active'
            : (regEntry?.status as PluginStatus) ?? 'inactive',
          compatibilityLevel: (regEntry?.compatibilityLevel as CompatibilityLevel) ?? 'unknown',
          compatibilityReasons: [],
          compatibilityApiCalls: [],
          error: regEntry?.error,
          hasSettings: true, // All installed plugins can be configured
          hasEvalUsage: regEntry?.hasEvalUsage === true,
        }
      })

      setPlugins(merged)

      // Background: Analyze compatibility and detect settings for each plugin
      void analyzeAndDetectSettings(manifests, registry)
    } catch (err: unknown) {
      setError(extractErrorMessage(err, 'Fehler beim Laden der Plugins'))
    } finally {
      setLoading(false)
    }
  }, [apiClient, vaultId, analyzeAndDetectSettings])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadPlugins()
  }, [loadPlugins])

  // Check for available updates on mount (for badge on "Verfügbare Plugins" tab)
  useEffect(() => {
    void (async () => {
      try {
        const result = await apiClient.checkPluginUpdates(vaultId)
        const count = result.plugins.filter(p => p.hasUpdate).length
        setUpdateCount(count)
      } catch {
        // Non-critical: update check failure doesn't affect page functionality
      }
    })()
  }, [apiClient, vaultId])

  // ─── Check for updates handler ─────────────────────────────────────────

  const handleCheckUpdates = async () => {
    setCheckingUpdates(true)
    try {
      const result = await apiClient.checkPluginUpdates(vaultId)
      const map = new Map<string, { latestVersion: string; repo: string }>()
      let count = 0
      for (const info of result.plugins) {
        if (info.hasUpdate) {
          map.set(info.pluginId, { latestVersion: info.latestVersion, repo: info.repo })
          count++
        }
      }
      setUpdateInfo(map)
      setUpdateCount(count)
      setHasCheckedUpdates(true)
    } catch {
      // Silently fail
    } finally {
      setCheckingUpdates(false)
    }
  }

  // ─── Update single plugin handler ───────────────────────────────────────

  async function handleUpdatePlugin(pluginId: string): Promise<void> {
    setUpdatingPlugins(prev => new Set(prev).add(pluginId))
    try {
      await apiClient.updatePlugin(vaultId, pluginId)
      // Remove from updateInfo after successful update
      setUpdateInfo(prev => {
        const next = new Map(prev)
        next.delete(pluginId)
        return next
      })
      setUpdateCount(prev => Math.max(0, prev - 1))
      // Reload plugins to show new version
      void loadPlugins()
    } catch (err: unknown) {
      setError(extractErrorMessage(err, t('pluginStore.update') + ' fehlgeschlagen'))
    } finally {
      setUpdatingPlugins(prev => {
        const next = new Set(prev)
        next.delete(pluginId)
        return next
      })
    }
  }

  // ─── Update all plugins handler ────────────────────────────────────────

  async function handleUpdateAllInstalled(): Promise<void> {
    setIsUpdatingAll(true)
    try {
      await apiClient.updateAllPlugins(vaultId)
      setUpdateInfo(new Map())
      setUpdateCount(0)
      // Reload to reflect new versions
      void loadPlugins()
    } catch (err: unknown) {
      setError(extractErrorMessage(err, t('pluginStore.updateAll') + ' fehlgeschlagen'))
    } finally {
      setIsUpdatingAll(false)
    }
  }

  // ─── Settings modal handlers ───────────────────────────────────────────

  async function openSettings(pluginId: string, pluginName: string): Promise<void> {
    setSettingsModal({ pluginId, pluginName })
    setSettingsError(null)
    setSettingsLoading(true)

    // Check if the plugin has a native settings tab registered
    const settingTab = pluginContext?.settingTabRegistry.get(pluginId)
    if (settingTab) {
      // Native settings: try declarative definitions first, then fall back to display()
      try {
        settingTab.containerEl.innerHTML = ''

        // Check for declarative settings (Obsidian 1.13+)
        const defs = (settingTab as unknown as { getSettingDefinitions?: () => unknown[] }).getSettingDefinitions?.()
        if (defs && Array.isArray(defs) && defs.length > 0) {
          // Use declarative renderer
          const { renderSettingDefinitions } = await import('../plugins/compat/declarative-settings-renderer')
          renderSettingDefinitions(
            defs as import('../plugins/compat/declarative-settings-renderer').SettingDefinitionItem[],
            settingTab.containerEl,
            settingTab as import('../plugins/compat/declarative-settings-renderer').IDeclarativeSettingTab,
          )
        } else {
          // Classic imperative display()
          settingTab.display()
        }
      } catch (err) {
        console.error(`[PluginSettings] Error rendering settings for "${pluginId}":`, err)
        const detail = extractErrorMessage(err, 'Unbekannter Fehler')
        // If the error is about uninitialized state (common during async plugin startup),
        // show a retry-friendly message instead of a permanent error
        if (detail.includes('not ready') || detail.includes('not initialized') || detail.includes('not ready yet')) {
          setSettingsError(`Plugin wird noch initialisiert. Bitte in wenigen Sekunden erneut versuchen.`)
        } else {
          setSettingsError(`Plugin-Einstellungen konnten nicht gerendert werden: ${detail}`)
        }
      }
      setSettingsLoading(false)
      // Mount containerEl in the next render via ref
      requestAnimationFrame(() => {
        if (settingsContainerRef.current && settingTab.containerEl) {
          settingsContainerRef.current.innerHTML = ''
          settingsContainerRef.current.appendChild(settingTab.containerEl)
        }
      })
      return
    }

    // Fallback: JSON editor
    try {
      const data = await apiClient.loadSettings(vaultId, pluginId)
      setSettingsJson(data !== null && data !== undefined ? JSON.stringify(data, null, 2) : '{}')
    } catch {
      setSettingsJson('{}')
      setSettingsError('Einstellungen konnten nicht geladen werden.')
    } finally {
      setSettingsLoading(false)
    }
  }

  async function saveSettings(): Promise<void> {
    if (!settingsModal) return
    setSettingsSaving(true)
    setSettingsError(null)
    try {
      const parsed = JSON.parse(settingsJson)
      await apiClient.saveSettings(vaultId, settingsModal.pluginId, parsed)
      setSettingsModal(null)
    } catch (err: unknown) {
      if (err instanceof SyntaxError) {
        setSettingsError('Ungültiges JSON-Format.')
      } else {
        setSettingsError(extractErrorMessage(err, 'Speichern fehlgeschlagen.'))
      }
    } finally {
      setSettingsSaving(false)
    }
  }

  // ─── Toggle activation ────────────────────────────────────────────────

  async function handleToggle(pluginId: string): Promise<void> {
    if (togglingPlugins.has(pluginId)) return

    const plugin = plugins.find((p) => p.pluginId === pluginId)
    if (!plugin) return

    const newStatus: PluginStatus = plugin.status === 'active' ? 'inactive' : 'active'

    // Show eval usage warning before activation (not deactivation)
    if (newStatus === 'active' && plugin.hasEvalUsage) {
      setEvalWarningConfirm({ pluginId, pluginName: plugin.name })
      return
    }

    await performToggle(pluginId, plugin, newStatus)
  }

  /** Performs the actual toggle after any confirmation. */
  async function performToggle(pluginId: string, plugin: PluginDisplayItem, newStatus: PluginStatus): Promise<void> {

    // Optimistic update
    setPlugins((prev) => prev.map((p) =>
      p.pluginId === pluginId ? { ...p, status: newStatus, error: undefined } : p
    ))
    setTogglingPlugins((prev) => new Set([...prev, pluginId]))

    try {
      if (pluginContext) {
        await pluginContext.setPluginEnabled(pluginId, newStatus === 'active')
        // Deactivation reloads the whole page (plugin-context.ts setPluginEnabled) once it
        // resolves, so fetching fresh registry data here would race the navigation: the GET
        // gets aborted mid-flight and surfaces as a spurious "NetworkError when attempting to
        // fetch resource" that this function's catch block then reports as a failed toggle.
        if (newStatus === 'active') {
          setRegistryData(await apiClient.loadRegistry(vaultId))
        }
      } else {
        // Fallback for isolated rendering without PluginProvider.
        const currentRegistry = registryData ?? { version: 1 as const, plugins: {} }
        const updatedRegistry: PluginRegistryData = {
          ...currentRegistry,
          plugins: {
            ...currentRegistry.plugins,
            [pluginId]: {
              ...currentRegistry.plugins[pluginId],
              status: newStatus,
              permissions: currentRegistry.plugins[pluginId]?.permissions ?? {
                network: false,
                networkAllowlist: [],
                filesystemWrite: false,
                domManipulation: false,
              },
              compatibilityLevel: currentRegistry.plugins[pluginId]?.compatibilityLevel ?? 'unknown',
              installedAt: currentRegistry.plugins[pluginId]?.installedAt ?? new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          },
        }
        if (newStatus === 'active' && updatedRegistry.plugins[pluginId]) {
          delete updatedRegistry.plugins[pluginId]!.error
        }
        await apiClient.saveRegistry(vaultId, updatedRegistry)
        setRegistryData(updatedRegistry)
      }
    } catch (err: unknown) {
      console.error(`[PluginManagementPage] Failed to ${newStatus === 'active' ? 'activate' : 'deactivate'} plugin "${pluginId}":`, err)
      const detail = extractErrorMessage(err, 'Aktivierung fehlgeschlagen')
      // Rollback on failure, but surface what actually went wrong instead of
      // silently reverting to the previous (usually empty) error state.
      setPlugins((prev) => prev.map((p) =>
        p.pluginId === pluginId ? { ...p, status: newStatus === 'active' ? 'error' : plugin.status, error: detail } : p
      ))
    } finally {
      setTogglingPlugins((prev) => {
        const next = new Set(prev)
        next.delete(pluginId)
        return next
      })
    }
  }

  /** Confirms activation of a plugin with eval usage after user acknowledged the warning. */
  function handleEvalWarningConfirm(): void {
    if (!evalWarningConfirm) return
    const plugin = plugins.find((p) => p.pluginId === evalWarningConfirm.pluginId)
    if (!plugin) {
      setEvalWarningConfirm(null)
      return
    }
    setEvalWarningConfirm(null)
    void performToggle(evalWarningConfirm.pluginId, plugin, 'active')
  }

  // ─── Reload plugin ─────────────────────────────────────────────────────

  async function handleReload(pluginId: string): Promise<void> {
    if (reloadingPlugins.has(pluginId)) return

    setReloadingPlugins((prev) => new Set([...prev, pluginId]))
    setPlugins((prev) => prev.map((p) =>
      p.pluginId === pluginId ? { ...p, status: 'loading' as PluginStatus, error: undefined } : p
    ))

    try {
      if (pluginContext) {
        // reloadPlugin() reloads the whole page once the unload completes (see
        // plugin-context.ts), so there's no point fetching fresh registry data
        // here — it would just race the navigation like the toggle path did.
        await pluginContext.reloadPlugin(pluginId)
      } else {
        const currentRegistry = registryData ?? { version: 1 as const, plugins: {} }
        const updatedRegistry: PluginRegistryData = {
          ...currentRegistry,
          plugins: {
            ...currentRegistry.plugins,
            [pluginId]: {
              ...currentRegistry.plugins[pluginId],
              status: 'active',
              permissions: currentRegistry.plugins[pluginId]?.permissions ?? {
                network: false,
                networkAllowlist: [],
                filesystemWrite: false,
                domManipulation: false,
              },
              compatibilityLevel: currentRegistry.plugins[pluginId]?.compatibilityLevel ?? 'unknown',
              installedAt: currentRegistry.plugins[pluginId]?.installedAt ?? new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          },
        }
        delete updatedRegistry.plugins[pluginId]!.error
        await apiClient.saveRegistry(vaultId, updatedRegistry)
        setRegistryData(updatedRegistry)
      }
      setPlugins((prev) => prev.map((p) =>
        p.pluginId === pluginId ? { ...p, status: 'active', error: undefined } : p
      ))
    } catch (err: unknown) {
      const detail = extractErrorMessage(err, 'Neu laden fehlgeschlagen')
      setPlugins((prev) => prev.map((p) =>
        p.pluginId === pluginId ? { ...p, status: 'error', error: `Neu laden fehlgeschlagen: ${detail}` } : p
      ))
    } finally {
      setReloadingPlugins((prev) => {
        const next = new Set(prev)
        next.delete(pluginId)
        return next
      })
    }
  }

  // ─── Delete plugin ──────────────────────────────────────────────────────

  async function handleDelete(pluginId: string): Promise<void> {
    if (deletingPlugins.has(pluginId)) return

    setDeletingPlugins((prev) => new Set([...prev, pluginId]))

    try {
      // Deactivate first to clean up runtime registrations (icons, commands, views)
      if (pluginContext) {
        await pluginContext.setPluginEnabled(pluginId, false)
      }

      await apiClient.deletePlugin(vaultId, pluginId)

      // Remove from registry
      if (registryData) {
        const updatedRegistry: PluginRegistryData = {
          ...registryData,
          plugins: { ...registryData.plugins },
        }
        delete updatedRegistry.plugins[pluginId]
        await apiClient.saveRegistry(vaultId, updatedRegistry).catch(() => { /* non-critical */ })
        setRegistryData(updatedRegistry)
      }

      // Remove from display list
      setPlugins((prev) => prev.filter((p) => p.pluginId !== pluginId))
    } catch (err: unknown) {
      setError(extractErrorMessage(err, 'Deinstallation fehlgeschlagen.'))
    } finally {
      setDeletingPlugins((prev) => {
        const next = new Set(prev)
        next.delete(pluginId)
        return next
      })
      setDeleteConfirm(null)
    }
  }

  // ─── Compatibility level helpers ───────────────────────────────────────

  function getCompatibilityIcon(level: CompatibilityLevel) {
    switch (level) {
      case 'full': return <CheckCircle2 size={14} className="plugin-compat-icon plugin-compat-icon--full" />
      case 'partial': return <AlertCircle size={14} className="plugin-compat-icon plugin-compat-icon--partial" />
      case 'unsupported': return <XCircle size={14} className="plugin-compat-icon plugin-compat-icon--unsupported" />
      case 'unknown': return <HelpCircle size={14} className="plugin-compat-icon plugin-compat-icon--unknown" />
    }
  }

  function getCompatibilityLabel(level: CompatibilityLevel): string {
    switch (level) {
      case 'full': return 'Voll kompatibel'
      case 'partial': return 'Teilweise kompatibel'
      case 'unsupported': return 'Nicht unterstützt'
      case 'unknown': return 'Unbekannt'
    }
  }

  function getStatusLabel(status: PluginStatus): string {
    switch (status) {
      case 'active': return 'Aktiv'
      case 'inactive': return 'Inaktiv'
      case 'error': return 'Fehler'
      case 'loading': return 'Laden…'
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────

  // Tab bar component (reused across states)
  const tabBar = (
    <div className="plugin-management-tabs">
      <button
        className={`plugin-management-tab ${activeTab === 'installed' ? 'plugin-management-tab--active' : ''}`}
        onClick={() => setActiveTab('installed')}
      >
        {t('pluginStore.tabInstalled')}
      </button>
      <button
        className={`plugin-management-tab ${activeTab === 'available' ? 'plugin-management-tab--active' : ''}`}
        onClick={() => setActiveTab('available')}
      >
        {t('pluginStore.tabAvailable')}{updateCount > 0 && <span className="plugin-management-tab__badge">{updateCount}</span>}
      </button>
    </div>
  )

  // Loading state
  if (loading) {
    return (
      <div className="plugin-management-page">
        <div className="plugin-management-header">
          <h1 className="plugin-management-title">
            <Plug size={20} />
            Plugins
          </h1>
        </div>
        {tabBar}
        {activeTab === 'installed' ? (
          <div className="plugin-management-loading" role="status" aria-live="polite">
            <span className="plugin-management-spinner" aria-hidden="true" />
            <span>Plugins werden geladen…</span>
          </div>
        ) : (
          <PluginStoreBrowser vaultId={vaultId} apiClient={apiClient} onPluginInstalled={() => void loadPlugins()} />
        )}
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="plugin-management-page">
        <div className="plugin-management-header">
          <h1 className="plugin-management-title">
            <Plug size={20} />
            Plugins
          </h1>
        </div>
        {tabBar}
        {activeTab === 'installed' ? (
          <div className="plugin-management-error" role="alert">
            <AlertTriangle size={16} />
            <span>{error}</span>
            <button
              className="plugin-management-btn plugin-management-btn--small"
              onClick={() => void loadPlugins()}
            >
              <RefreshCw size={12} />
              Erneut versuchen
            </button>
          </div>
        ) : (
          <PluginStoreBrowser vaultId={vaultId} apiClient={apiClient} onPluginInstalled={() => void loadPlugins()} />
        )}
      </div>
    )
  }

  // Empty state
  if (plugins.length === 0) {
    return (
      <div className="plugin-management-page">
        <div className="plugin-management-header">
          <h1 className="plugin-management-title">
            <Plug size={20} />
            Plugins
          </h1>
        </div>
        {tabBar}
        {activeTab === 'installed' ? (
          <>
            <PluginUploadSection apiClient={apiClient} vaultId={vaultId} onPluginInstalled={() => void loadPlugins()} />
            <div className="plugin-management-empty">
              <Plug size={32} className="plugin-management-empty-icon" />
              <p className="plugin-management-empty-title">Keine Plugins installiert</p>
              <p className="plugin-management-empty-text">
                Installiere Obsidian Community Plugins, um zusätzliche Funktionen hinzuzufügen.
              </p>
            </div>
          </>
        ) : (
          <PluginStoreBrowser vaultId={vaultId} apiClient={apiClient} onPluginInstalled={() => void loadPlugins()} />
        )}
      </div>
    )
  }

  // Plugin list
  return (
    <div className="plugin-management-page">
      <div className="plugin-management-header">
        <h1 className="plugin-management-title">
          <Plug size={20} />
          Plugins
        </h1>
        <span className="plugin-management-count">{plugins.length} installiert</span>
      </div>

      {tabBar}

      {activeTab === 'installed' ? (
        <>
          <PluginUploadSection apiClient={apiClient} vaultId={vaultId} onPluginInstalled={() => void loadPlugins()} />

          <div className="plugin-management-warning" role="status">
            <AlertTriangle size={14} />
            <span>
              <strong>Experimentell:</strong> Die Plugin-Kompatibilitätsschicht befindet sich in aktiver Entwicklung.
              Nur browser-kompatible Plugins können ausgeführt werden. Plugins die Node.js-Module benötigen
              (z.B. IMAP, Git, Datenbank-Zugriff) werden erst mit serverseitiger Plugin-Ausführung unterstützt.
            </span>
          </div>

          <div className="plugin-management-update-actions">
            <button
              className="plugin-management-check-updates-button"
              onClick={() => void handleCheckUpdates()}
              disabled={checkingUpdates}
            >
              {checkingUpdates && <Loader2 size={14} className="plugin-spinning" />}
              {t('pluginStore.checkUpdates')}
            </button>
            {updateInfo.size > 0 && !checkingUpdates && (
              <>
                <span className="plugin-management-update-summary">
                  {updateCount} {t('pluginStore.updatesAvailable').replace('{count}', '')}
                </span>
                <button
                  className="plugin-management-update-all-button"
                  onClick={() => void handleUpdateAllInstalled()}
                  disabled={isUpdatingAll}
                >
                  {isUpdatingAll && <Loader2 size={14} className="plugin-spinning" />}
                  {t('pluginStore.updateAll')}
                </button>
              </>
            )}
            {updateInfo.size === 0 && !checkingUpdates && hasCheckedUpdates && updateCount === 0 && plugins.length > 0 && (
              <span className="plugin-management-all-up-to-date">
                <CheckCircle2 size={13} />
                {t('pluginStore.allUpToDate')}
              </span>
            )}
          </div>

      <div className="plugin-management-list">
        {plugins.map((plugin) => (
          <div
            key={plugin.pluginId}
            className={`plugin-card plugin-card--${plugin.status}`}
          >
            {/* Plugin header row */}
            <div className="plugin-card-header">
              <div className="plugin-card-info">
                <div className="plugin-card-name-row">
                  <span className="plugin-card-name">{plugin.name}</span>
                  <span className="plugin-card-version">v{plugin.version}</span>
                  {updateInfo.has(plugin.pluginId) && (
                    <span className="plugin-management-update-hint">
                      {plugin.version} → {updateInfo.get(plugin.pluginId)!.latestVersion}
                    </span>
                  )}
                  <span className={`plugin-card-status plugin-card-status--${plugin.status}`}>
                    {getStatusLabel(plugin.status)}
                  </span>
                </div>
                <div className="plugin-card-meta">
                  <span className="plugin-card-author">{plugin.author}</span>
                  <span className="plugin-card-compat">
                    {getCompatibilityIcon(plugin.compatibilityLevel)}
                    {getCompatibilityLabel(plugin.compatibilityLevel)}
                  </span>
                </div>
              </div>

              <div className="plugin-card-actions">
                {updateInfo.has(plugin.pluginId) && (
                  <button
                    className="plugin-card-btn plugin-card-btn--update"
                    onClick={() => void handleUpdatePlugin(plugin.pluginId)}
                    disabled={updatingPlugins.has(plugin.pluginId)}
                    title={t('pluginStore.update')}
                    aria-label={`${plugin.name} aktualisieren`}
                  >
                    {updatingPlugins.has(plugin.pluginId) ? <Loader2 size={14} className="plugin-spinning" /> : <RefreshCw size={14} />}
                    {t('pluginStore.update')}
                  </button>
                )}
                {plugin.hasSettings && plugin.status === 'active' && (
                  <button
                    className="plugin-card-btn plugin-card-btn--settings"
                    title="Einstellungen"
                    aria-label={`Einstellungen für ${plugin.name}`}
                    onClick={() => void openSettings(plugin.pluginId, plugin.name)}
                  >
                    <Settings size={14} />
                  </button>
                )}
                <button
                  className="plugin-card-btn plugin-card-btn--delete"
                  title="Deinstallieren"
                  aria-label={`${plugin.name} deinstallieren`}
                  onClick={() => setDeleteConfirm({ pluginId: plugin.pluginId, pluginName: plugin.name })}
                  disabled={deletingPlugins.has(plugin.pluginId)}
                >
                  <Trash2 size={14} />
                </button>
                <label className="plugin-card-toggle" aria-label={`${plugin.name} ${plugin.status === 'active' ? 'deaktivieren' : 'aktivieren'}`}>
                  <input
                    type="checkbox"
                    checked={plugin.status === 'active'}
                    disabled={togglingPlugins.has(plugin.pluginId)}
                    onChange={() => void handleToggle(plugin.pluginId)}
                  />
                  <span className="plugin-card-toggle-slider" />
                </label>
              </div>
            </div>

            {/* Description */}
            {plugin.description && (
              <p className="plugin-card-description">
                {plugin.description.length > 200
                  ? `${plugin.description.slice(0, 200)}…`
                  : plugin.description
                }
              </p>
            )}

            {/* Error display */}
            {plugin.status === 'error' && plugin.error && (
              <div className="plugin-card-error">
                <AlertTriangle size={13} />
                <span className="plugin-card-error-message">{plugin.error}</span>
                <button
                  className="plugin-card-btn plugin-card-btn--reload"
                  onClick={() => void handleReload(plugin.pluginId)}
                  disabled={reloadingPlugins.has(plugin.pluginId)}
                  title="Neu laden"
                >
                  <RefreshCw size={12} className={reloadingPlugins.has(plugin.pluginId) ? 'plugin-spinning' : ''} />
                  Neu laden
                </button>
              </div>
            )}

            {/* Eval usage warning indicator */}
            {plugin.hasEvalUsage && plugin.status !== 'error' && (
              <div className="plugin-card-eval-warning">
                <AlertTriangle size={13} />
                <span>{t('pluginStore.evalWarningTitle')}: {t('pluginStore.evalWarningMessage')}</span>
              </div>
            )}

            {/* Expandable compatibility details */}
            <button
              className="plugin-card-expand-btn"
              onClick={() => setExpandedPlugin(expandedPlugin === plugin.pluginId ? null : plugin.pluginId)}
              aria-expanded={expandedPlugin === plugin.pluginId}
            >
              {expandedPlugin === plugin.pluginId
                ? <ChevronDown size={12} />
                : <ChevronRight size={12} />
              }
              Kompatibilitätsdetails
            </button>

            {expandedPlugin === plugin.pluginId && (
              <div className="plugin-card-details">
                <div className="plugin-card-detail-row">
                  <span className="plugin-card-detail-label">Kompatibilität:</span>
                  <span className="plugin-card-detail-value">
                    {getCompatibilityIcon(plugin.compatibilityLevel)}
                    {getCompatibilityLabel(plugin.compatibilityLevel)}
                  </span>
                </div>

                {/* Compatibility reasons */}
                {plugin.compatibilityReasons.length > 0 && (
                  <div className="plugin-card-detail-reasons">
                    <span className="plugin-card-detail-label">Begründung:</span>
                    <ul className="plugin-card-reasons-list">
                      {plugin.compatibilityReasons.map((reason, idx) => (
                        <li key={idx} className="plugin-card-reasons-item">{reason}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Detected API calls */}
                {plugin.compatibilityApiCalls.length > 0 && (
                  <div className="plugin-card-detail-apicalls">
                    <span className="plugin-card-detail-label">Erkannte API-Aufrufe:</span>
                    <div className="plugin-card-apicalls-grid">
                      {plugin.compatibilityApiCalls.map((call) => (
                        <div key={call.method} className={`plugin-card-apicall plugin-card-apicall--${call.classification}`}>
                          <code className="plugin-card-apicall-method">{call.method}</code>
                          <span className={`plugin-card-apicall-badge plugin-card-apicall-badge--${call.classification}`}>
                            {call.classification === 'supported' && 'unterstützt'}
                            {call.classification === 'partial' && 'teilweise'}
                            {call.classification === 'unsupported' && 'nicht unterstützt'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="plugin-card-detail-row">
                  <span className="plugin-card-detail-label">Plugin-ID:</span>
                  <span className="plugin-card-detail-value plugin-card-detail-value--mono">{plugin.pluginId}</span>
                </div>
                <div className="plugin-card-detail-row">
                  <span className="plugin-card-detail-label">Version:</span>
                  <span className="plugin-card-detail-value">{plugin.version}</span>
                </div>
                {plugin.author && (
                  <div className="plugin-card-detail-row">
                    <span className="plugin-card-detail-label">Autor:</span>
                    <span className="plugin-card-detail-value">{plugin.author}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Settings modal */}
      {settingsModal && createPortal(
        <div className="plugin-settings-overlay" onClick={() => setSettingsModal(null)}>
          <div className="plugin-settings-modal" onClick={(e) => e.stopPropagation()}>
            <div className="plugin-settings-modal-header">
              <h2 className="plugin-settings-modal-title">
                <Settings size={16} />
                Einstellungen: {settingsModal.pluginName}
              </h2>
              <button
                className="plugin-settings-modal-close"
                onClick={() => setSettingsModal(null)}
                aria-label="Schließen"
              >
                <X size={16} />
              </button>
            </div>
            <div className="plugin-settings-modal-body">
              {settingsLoading ? (
                <div className="plugin-settings-loading">
                  <span className="plugin-management-spinner" aria-hidden="true" />
                  <span>Einstellungen werden geladen…</span>
                </div>
              ) : pluginContext?.settingTabRegistry.has(settingsModal.pluginId) ? (
                /* Native plugin settings tab UI */
                <div ref={settingsContainerRef} className="plugin-settings-native" data-plugin-id={settingsModal.pluginId} />
              ) : (
                /* Fallback: JSON editor */
                <>
                  <label className="plugin-settings-label" htmlFor="plugin-settings-editor">
                    Plugin-Daten (JSON):
                  </label>
                  <textarea
                    id="plugin-settings-editor"
                    className="plugin-settings-textarea"
                    value={settingsJson}
                    onChange={(e) => setSettingsJson(e.target.value)}
                    spellCheck={false}
                    rows={16}
                  />
                </>
              )}
              {settingsError && (
                <div className="plugin-settings-error" role="alert">
                  <AlertTriangle size={13} />
                  <span>{settingsError}</span>
                </div>
              )}
            </div>
            <div className="plugin-settings-modal-footer">
              <button
                className="plugin-management-btn plugin-management-btn--secondary"
                onClick={() => {
                  // Call hide() on the setting tab if it exists
                  const tab = pluginContext?.settingTabRegistry.get(settingsModal.pluginId)
                  if (tab) { try { tab.hide() } catch { /* ignore */ } }
                  setSettingsModal(null)
                }}
              >
                {pluginContext?.settingTabRegistry.has(settingsModal.pluginId) ? 'Schließen' : 'Abbrechen'}
              </button>
              {!pluginContext?.settingTabRegistry.has(settingsModal.pluginId) && (
                <button
                  className="plugin-management-btn plugin-management-btn--primary"
                  onClick={() => void saveSettings()}
                  disabled={settingsSaving || settingsLoading}
                >
                  <Save size={13} />
                  {settingsSaving ? 'Speichern…' : 'Speichern'}
                </button>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
      {/* Delete confirmation modal */}
      <ConfirmModal
        open={deleteConfirm !== null}
        title="Plugin deinstallieren"
        message={`Möchtest du das Plugin „${deleteConfirm?.pluginName ?? ''}" wirklich deinstallieren? Alle Plugin-Daten (Bundle, Styles, Einstellungen) werden unwiderruflich gelöscht.`}
        confirmLabel="Deinstallieren"
        variant="danger"
        onConfirm={() => { if (deleteConfirm) void handleDelete(deleteConfirm.pluginId) }}
        onCancel={() => setDeleteConfirm(null)}
      />
      {/* Eval usage warning modal */}
      <ConfirmModal
        open={evalWarningConfirm !== null}
        title={t('pluginStore.evalWarningTitle')}
        message={`${evalWarningConfirm?.pluginName ?? ''}: ${t('pluginStore.evalWarningMessage')}`}
        confirmLabel={t('pluginStore.evalWarningConfirm')}
        cancelLabel={t('pluginStore.evalWarningCancel')}
        variant="danger"
        onConfirm={handleEvalWarningConfirm}
        onCancel={() => setEvalWarningConfirm(null)}
      />
        </>
      ) : (
        <PluginStoreBrowser vaultId={vaultId} apiClient={apiClient} onPluginInstalled={() => void loadPlugins()} />
      )}
    </div>
  )
}

// ─── Helper: Upload section with directory tree from context ─────────────────

/** Props for the upload section wrapper. */
interface PluginUploadSectionProps {
  apiClient: IApiClient
  vaultId: string
  onPluginInstalled: () => void
}

/**
 * Wraps PluginUpload with access to the API client.
 */
function PluginUploadSection({ apiClient, vaultId, onPluginInstalled }: PluginUploadSectionProps) {
  return (
    <PluginUpload
      apiClient={apiClient}
      vaultId={vaultId}
      onPluginInstalled={onPluginInstalled}
    />
  )
}
