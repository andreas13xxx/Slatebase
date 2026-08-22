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
import { getState as getWorkspaceState, update as updateWorkspaceState } from '../../state/workspaceStore'
import { SettingSection, SettingRow, Button } from './ui'

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
  const [dailyNoteTemplateName, setDailyNoteTemplateName] = useState('')

  // Personal display preference (Requirement 4) — client-only, applies instantly,
  // not part of the server-persisted VaultConfig above.
  const [followActiveFile, setFollowActiveFile] = useState(() => getWorkspaceState().explorerFollowActiveFile)
  const handleToggleFollowActiveFile = useCallback(() => {
    const next = !followActiveFile
    setFollowActiveFile(next)
    updateWorkspaceState({ explorerFollowActiveFile: next })
  }, [followActiveFile])

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
        setDailyNoteTemplateName(cfg.dailyNoteTemplateName)
        setError(null)
      } catch (err: unknown) {
        if (cancelled) return
        const msg = err && typeof err === 'object' && 'message' in err
          ? (err as { message: string }).message
          : 'Fehler beim Laden der Vault-Konfiguration'
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
        dailyNoteTemplateName: dailyNoteTemplateName.trim(),
      })
      setConfig(updated)
      setTemplatesDir(updated.templatesDirectory)
      setDailyNotesDir(updated.dailyNotesDirectory)
      setDailyNoteTemplateName(updated.dailyNoteTemplateName)
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
  }, [apiClient, vaultId, templatesDir, dailyNotesDir, dailyNoteTemplateName])

  const hasChanges = config !== null && (
    templatesDir.trim() !== config.templatesDirectory ||
    dailyNotesDir.trim() !== config.dailyNotesDirectory ||
    dailyNoteTemplateName.trim() !== config.dailyNoteTemplateName
  )

  if (loading) {
    return <p className="settings-loading">Lade Vault-Konfiguration…</p>
  }

  return (
    <div className="vault-config-section">
      {error && <p className="settings-error">{error}</p>}

      <SettingSection title="Anzeige">
        <SettingRow
          label="Aktive Datei im Explorer verfolgen"
          htmlFor="vault-explorer-follow-active-file"
          hint="Klappt beim Wechsel des aktiven Tabs automatisch die übergeordneten Ordner der Datei im Datei-Explorer auf und markiert sie — persönliche Anzeigeeinstellung, wirkt sofort und wird nicht mit anderen Geräten synchronisiert."
        >
          <input
            id="vault-explorer-follow-active-file"
            type="checkbox"
            checked={followActiveFile}
            onChange={handleToggleFollowActiveFile}
          />
        </SettingRow>
      </SettingSection>

      <SettingSection title="Verzeichnisse">
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

        <div className="settings-field">
          <label htmlFor="vault-daily-note-template" className="settings-field-label">
            Tagesnotiz-Vorlage
          </label>
          <p className="settings-field-hint">
            Dateiname der Vorlage im Vorlagen-Verzeichnis, die für neue Tagesnotizen verwendet wird. Standard: <code>daily.md</code>
          </p>
          <input
            id="vault-daily-note-template"
            type="text"
            className="settings-field-input"
            value={dailyNoteTemplateName}
            onChange={(e) => setDailyNoteTemplateName(e.target.value)}
            placeholder="daily.md"
            disabled={saving}
          />
        </div>

        <div className="settings-actions">
          <Button variant="primary" onClick={handleSave} disabled={saving || !hasChanges}>
            {saving ? 'Speichern…' : 'Speichern'}
          </Button>
        </div>
      </SettingSection>
    </div>
  )
}
