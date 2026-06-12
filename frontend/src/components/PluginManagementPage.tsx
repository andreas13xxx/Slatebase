import { useState, useEffect, useCallback, useRef, useContext } from 'react'
import type { IApiClient, PluginManifest, PluginRegistryData } from '../api'
import { PluginUpload } from './PluginUpload'
import { CompatibilityAnalyzer } from '../plugins/compat/compatibility-analyzer'
import { PluginContext } from '../plugins/compat/plugin-context'
import {
  Plug, Settings, AlertTriangle, RefreshCw, ChevronDown, ChevronRight,
  CheckCircle2, AlertCircle, HelpCircle, XCircle, X, Save, Trash2,
} from 'lucide-react'
import { ConfirmModal } from './ConfirmModal'

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
  const [settingsModal, setSettingsModal] = useState<{ pluginId: string; pluginName: string } | null>(null)
  const [settingsJson, setSettingsJson] = useState('')
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [settingsError, setSettingsError] = useState<string | null>(null)
  const [settingsLoading, setSettingsLoading] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<{ pluginId: string; pluginName: string } | null>(null)
  const [deletingPlugins, setDeletingPlugins] = useState<Set<string>>(new Set())

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
    registry: PluginRegistryData | null,
  ): Promise<void> => {
    const updates: Array<{ pluginId: string; compatibilityLevel?: CompatibilityLevel; hasSettings?: boolean }> = []

    await Promise.all(manifests.map(async (manifest) => {
      const update: { pluginId: string; compatibilityLevel?: CompatibilityLevel; hasSettings?: boolean } = {
        pluginId: manifest.id,
      }

      // 1. Compatibility analysis (only if currently 'unknown')
      const existingLevel = registry?.plugins?.[manifest.id]?.compatibilityLevel
      if (!existingLevel || existingLevel === 'unknown') {
        try {
          const bundle = await apiClient.loadBundle(vaultId, manifest.id)
          const report = analyzerRef.current.analyze(bundle, manifest)
          update.compatibilityLevel = report.level
        } catch {
          // Bundle load failed — leave as unknown
        }
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
          hasSettings: upd.hasSettings ?? p.hasSettings,
        }
      }))

      // Persist updated compatibility levels to registry
      const compatUpdates = updates.filter(u => u.compatibilityLevel && u.compatibilityLevel !== 'unknown')
      if (compatUpdates.length > 0 && registry) {
        const updatedRegistry: PluginRegistryData = { ...registry, plugins: { ...registry.plugins } }
        for (const upd of compatUpdates) {
          if (upd.compatibilityLevel && updatedRegistry.plugins[upd.pluginId]) {
            updatedRegistry.plugins[upd.pluginId] = {
              ...updatedRegistry.plugins[upd.pluginId]!,
              compatibilityLevel: upd.compatibilityLevel,
            }
          }
        }
        try {
          await apiClient.saveRegistry(vaultId, updatedRegistry)
          setRegistryData(updatedRegistry)
        } catch {
          // Non-critical — next load will re-analyze
        }
      }
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
          status: (regEntry?.status as PluginStatus) ?? 'inactive',
          compatibilityLevel: (regEntry?.compatibilityLevel as CompatibilityLevel) ?? 'unknown',
          error: regEntry?.error,
          hasSettings: true, // All installed plugins can be configured
        }
      })

      setPlugins(merged)

      // Background: Analyze compatibility and detect settings for each plugin
      void analyzeAndDetectSettings(manifests, registry)
    } catch (err: unknown) {
      const message = err && typeof err === 'object' && 'message' in err
        ? (err as { message: string }).message
        : 'Fehler beim Laden der Plugins'
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [apiClient, vaultId, analyzeAndDetectSettings])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadPlugins()
  }, [loadPlugins])

  // ─── Settings modal handlers ───────────────────────────────────────────

  async function openSettings(pluginId: string, pluginName: string): Promise<void> {
    setSettingsModal({ pluginId, pluginName })
    setSettingsError(null)
    setSettingsLoading(true)

    // Check if the plugin has a native settings tab registered
    const settingTab = pluginContext?.settingTabRegistry.get(pluginId)
    if (settingTab) {
      // Native settings: call display() to populate containerEl
      try {
        settingTab.containerEl.innerHTML = ''
        settingTab.display()
      } catch (err) {
        console.error(`[PluginSettings] Error rendering settings for "${pluginId}":`, err)
        setSettingsError('Plugin-Einstellungen konnten nicht gerendert werden.')
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
        const message = err && typeof err === 'object' && 'message' in err
          ? (err as { message: string }).message
          : 'Speichern fehlgeschlagen.'
        setSettingsError(message)
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

  // ─── Delete plugin ──────────────────────────────────────────────────────

  async function handleDelete(pluginId: string): Promise<void> {
    if (deletingPlugins.has(pluginId)) return

    setDeletingPlugins((prev) => new Set([...prev, pluginId]))

    try {
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
      const message = err && typeof err === 'object' && 'message' in err
        ? (err as { message: string }).message
        : 'Deinstallation fehlgeschlagen.'
      setError(message)
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
        <PluginUploadSection apiClient={apiClient} vaultId={vaultId} onPluginInstalled={() => void loadPlugins()} />
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

      <PluginUploadSection apiClient={apiClient} vaultId={vaultId} onPluginInstalled={() => void loadPlugins()} />

      <div className="plugin-management-warning" role="status">
        <AlertTriangle size={14} />
        <span>
          <strong>Experimentell:</strong> Die Plugin-Kompatibilitätsschicht befindet sich in aktiver Entwicklung.
          Nur browser-kompatible Plugins können ausgeführt werden. Plugins die Node.js-Module benötigen
          (z.B. IMAP, Git, Datenbank-Zugriff) werden erst mit serverseitiger Plugin-Ausführung unterstützt.
        </span>
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

      {/* Settings modal */}
      {settingsModal && (
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
                <div ref={settingsContainerRef} className="plugin-settings-native" />
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
        </div>
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
