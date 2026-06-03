import { useState, useEffect, useCallback } from 'react'
import type { IApiClient, PluginManifest, PluginRegistryData } from '../api'
import {
  Plug, Settings, AlertTriangle, RefreshCw, ChevronDown, ChevronRight,
  CheckCircle2, AlertCircle, HelpCircle, XCircle,
} from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────

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
  error?: string
  hasSettings: boolean
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
  const [plugins, setPlugins] = useState<PluginDisplayItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedPlugin, setExpandedPlugin] = useState<string | null>(null)
  const [togglingPlugins, setTogglingPlugins] = useState<Set<string>>(new Set())
  const [reloadingPlugins, setReloadingPlugins] = useState<Set<string>>(new Set())
  const [registryData, setRegistryData] = useState<PluginRegistryData | null>(null)

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
          status: (regEntry?.status as PluginStatus) ?? 'inactive',
          compatibilityLevel: (regEntry?.compatibilityLevel as CompatibilityLevel) ?? 'unknown',
          error: regEntry?.error,
          hasSettings: false, // Will be determined by actual plugin loading
        }
      })

      setPlugins(merged)
    } catch (err: unknown) {
      const message = err && typeof err === 'object' && 'message' in err
        ? (err as { message: string }).message
        : 'Fehler beim Laden der Plugins'
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [apiClient, vaultId])

  useEffect(() => {
    void loadPlugins()
  }, [loadPlugins])

  // ─── Toggle activation ────────────────────────────────────────────────

  async function handleToggle(pluginId: string): Promise<void> {
    if (togglingPlugins.has(pluginId)) return

    const plugin = plugins.find((p) => p.pluginId === pluginId)
    if (!plugin) return

    const newStatus: PluginStatus = plugin.status === 'active' ? 'inactive' : 'active'

    // Optimistic update
    setPlugins((prev) => prev.map((p) =>
      p.pluginId === pluginId ? { ...p, status: newStatus, error: undefined } : p
    ))
    setTogglingPlugins((prev) => new Set([...prev, pluginId]))

    try {
      // Update registry
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
      // Remove error field if activating
      if (newStatus === 'active' && updatedRegistry.plugins[pluginId]) {
        delete updatedRegistry.plugins[pluginId]!.error
      }
      await apiClient.saveRegistry(vaultId, updatedRegistry)
      setRegistryData(updatedRegistry)
    } catch {
      // Rollback on failure
      setPlugins((prev) => prev.map((p) =>
        p.pluginId === pluginId ? { ...p, status: plugin.status, error: plugin.error } : p
      ))
    } finally {
      setTogglingPlugins((prev) => {
        const next = new Set(prev)
        next.delete(pluginId)
        return next
      })
    }
  }

  // ─── Reload plugin ─────────────────────────────────────────────────────

  async function handleReload(pluginId: string): Promise<void> {
    if (reloadingPlugins.has(pluginId)) return

    setReloadingPlugins((prev) => new Set([...prev, pluginId]))
    setPlugins((prev) => prev.map((p) =>
      p.pluginId === pluginId ? { ...p, status: 'loading' as PluginStatus, error: undefined } : p
    ))

    try {
      // Simulate reload by setting to active
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
      setPlugins((prev) => prev.map((p) =>
        p.pluginId === pluginId ? { ...p, status: 'active', error: undefined } : p
      ))
    } catch {
      setPlugins((prev) => prev.map((p) =>
        p.pluginId === pluginId ? { ...p, status: 'error', error: 'Neu laden fehlgeschlagen' } : p
      ))
    } finally {
      setReloadingPlugins((prev) => {
        const next = new Set(prev)
        next.delete(pluginId)
        return next
      })
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
        <div className="plugin-management-loading" role="status" aria-live="polite">
          <span className="plugin-management-spinner" aria-hidden="true" />
          <span>Plugins werden geladen…</span>
        </div>
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
        <div className="plugin-management-empty">
          <Plug size={32} className="plugin-management-empty-icon" />
          <p className="plugin-management-empty-title">Keine Plugins installiert</p>
          <p className="plugin-management-empty-text">
            Installiere Obsidian Community Plugins, um zusätzliche Funktionen hinzuzufügen.
          </p>
        </div>
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
                {plugin.hasSettings && (
                  <button
                    className="plugin-card-btn plugin-card-btn--settings"
                    title="Einstellungen"
                    aria-label={`Einstellungen für ${plugin.name}`}
                  >
                    <Settings size={14} />
                  </button>
                )}
                <label className="plugin-card-toggle" aria-label={`${plugin.name} ${plugin.status === 'active' ? 'deaktivieren' : 'aktivieren'}`}>
                  <input
                    type="checkbox"
                    checked={plugin.status === 'active'}
                    disabled={togglingPlugins.has(plugin.pluginId) || plugin.status === 'loading'}
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
    </div>
  )
}
