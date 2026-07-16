/**
 * VaultConfigSection — Settings section for per-vault configuration.
 * Allows the vault owner to configure:
 * - Templates directory (where .md templates are stored)
 * - Daily notes directory (where daily notes are created)
 *
 * @module components/settings/VaultConfigSection
 */

import { useState, useEffect, useCallback } from 'react'
import type { IApiClient, VaultConfig } from '../../api'
import { showToast } from '../ToastNotification'

interface VaultConfigSectionProps {
  apiClient: IApiClient
  vaultId: string
}

/**
 * Vault configuration section embedded in the Settings panel.
 * Loads current config from backend and saves on change (with save button).
 */
export function VaultConfigSection({ apiClient, vaultId }: VaultConfigSectionProps) {
  const [config, setConfig] = useState<VaultConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Form state
  const [templatesDir, setTemplatesDir] = useState('')
  const [dailyNotesDir, setDailyNotesDir] = useState('')

  // Load config on mount / vault change
  useEffect(() => {
    let cancelled = false

    const loadConfig = async () => {
      try {
        const cfg = await apiClient.getVaultConfig(vaultId)
        if (cancelled) return
        setConfig(cfg)
        setTemplatesDir(cfg.templatesDirectory)
        setDailyNotesDir(cfg.dailyNotesDirectory)
        setError(null)
      } catch (err: unknown) {
        if (cancelled) return
        const msg = err instanceof Error ? err.message : 'Fehler beim Laden der Vault-Konfiguration'
        setError(msg)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadConfig()
    return () => { cancelled = true }
  }, [apiClient, vaultId])

  const handleSave = useCallback(async () => {
    setSaving(true)
    setError(null)
    try {
      const updated = await apiClient.saveVaultConfig(vaultId, {
        templatesDirectory: templatesDir.trim(),
        dailyNotesDirectory: dailyNotesDir.trim(),
      })
      setConfig(updated)
      setTemplatesDir(updated.templatesDirectory)
      setDailyNotesDir(updated.dailyNotesDirectory)
      showToast('success', 'Vault-Konfiguration gespeichert')
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'message' in err
        ? (err as { message: string }).message
        : 'Fehler beim Speichern'
      setError(msg)
      showToast('error', msg)
    } finally {
      setSaving(false)
    }
  }, [apiClient, vaultId, templatesDir, dailyNotesDir])

  const hasChanges = config !== null && (
    templatesDir.trim() !== config.templatesDirectory ||
    dailyNotesDir.trim() !== config.dailyNotesDirectory
  )

  if (loading) {
    return <p className="settings-loading">Lade Vault-Konfiguration…</p>
  }

  return (
    <div className="vault-config-section">
      {error && <p className="settings-error">{error}</p>}

      <div className="settings-field">
        <label htmlFor="vault-templates-dir" className="settings-field-label">
          Vorlagen-Verzeichnis
        </label>
        <p className="settings-field-hint">
          Relativer Pfad im Vault für Markdown-Vorlagen. Standard: <code>Templates</code>
        </p>
        <input
          id="vault-templates-dir"
          type="text"
          className="settings-field-input"
          value={templatesDir}
          onChange={(e) => setTemplatesDir(e.target.value)}
          placeholder="Templates"
          disabled={saving}
        />
      </div>

      <div className="settings-field">
        <label htmlFor="vault-daily-notes-dir" className="settings-field-label">
          Tagesnotizen-Verzeichnis
        </label>
        <p className="settings-field-hint">
          Relativer Pfad im Vault für Tagesnotizen. Leer = Vault-Wurzel.
        </p>
        <input
          id="vault-daily-notes-dir"
          type="text"
          className="settings-field-input"
          value={dailyNotesDir}
          onChange={(e) => setDailyNotesDir(e.target.value)}
          placeholder="(Vault-Wurzel)"
          disabled={saving}
        />
      </div>

      <div className="settings-actions">
        <button
          type="button"
          className="settings-save-btn"
          onClick={handleSave}
          disabled={saving || !hasChanges}
        >
          {saving ? 'Speichern…' : 'Speichern'}
        </button>
      </div>
    </div>
  )
}
