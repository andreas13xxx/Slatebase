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
import { SettingSection, SettingRow, Button } from './ui'
import { useWebEmbed } from '../../hooks/useWebEmbed'

interface VaultConfigSectionProps {
  apiClient: IApiClient
  vaultId: string
}

/**
 * Vault configuration section embedded in the Settings panel.
 * Loads current config from backend and saves on change (with save button).
 */
export function VaultConfigSection({ apiClient, vaultId }: VaultConfigSectionProps) {
  const { enabled: webEmbedEnabled, setEnabled: setWebEmbedEnabled } = useWebEmbed()
  const [config, setConfig] = useState<VaultConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Form state
  const [templatesDir, setTemplatesDir] = useState('')
  const [dailyNotesDir, setDailyNotesDir] = useState('')
  const [dailyNoteTemplate, setDailyNoteTemplate] = useState('')
  const [uniqueNoteDir, setUniqueNoteDir] = useState('')

  // "Aktive Datei im Explorer verfolgen" used to live here. It is an account
  // preference that applies to every vault, so it moved to
  // Einstellungen → Darstellung — this section is only the vault's own config.

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
        setDailyNoteTemplate(cfg.dailyNoteTemplate)
        setUniqueNoteDir(cfg.uniqueNoteDirectory ?? '')
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
        dailyNoteTemplate: dailyNoteTemplate.trim(),
        uniqueNoteDirectory: uniqueNoteDir.trim(),
      })
      setConfig(updated)
      setTemplatesDir(updated.templatesDirectory)
      setDailyNotesDir(updated.dailyNotesDirectory)
      setDailyNoteTemplate(updated.dailyNoteTemplate)
      setUniqueNoteDir(updated.uniqueNoteDirectory ?? '')
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
  }, [apiClient, vaultId, templatesDir, dailyNotesDir, dailyNoteTemplate, uniqueNoteDir])

  const hasChanges = config !== null && (
    templatesDir.trim() !== config.templatesDirectory ||
    dailyNotesDir.trim() !== config.dailyNotesDirectory ||
    dailyNoteTemplate.trim() !== config.dailyNoteTemplate ||
    uniqueNoteDir.trim() !== (config.uniqueNoteDirectory ?? '')
  )

  if (loading) {
    return <p className="settings-loading">Lade Vault-Konfiguration…</p>
  }

  return (
    <div className="vault-config-section">
      {error && <p className="settings-error">{error}</p>}

      <SettingSection
        title="Verzeichnisse"
        description="Vorlagen- und Tagesnotizen-Ordner und die Tagesnotiz-Vorlage stehen in den Obsidian-Dateien .obsidian/templates.json und .obsidian/daily-notes.json, der Rest in .slatebase/config.json."
      >
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
            Pfad der Vorlage im Vault für neue Tagesnotizen, zum Beispiel <code>Templates/daily.md</code>. Leer = keine Vorlage.
          </p>
          <input
            id="vault-daily-note-template"
            type="text"
            className="settings-field-input"
            value={dailyNoteTemplate}
            onChange={(e) => setDailyNoteTemplate(e.target.value)}
            placeholder="Templates/daily.md"
            disabled={saving}
          />
        </div>

        {config?.dailyNoteFormat != null && config.dailyNoteFormat !== 'YYYY-MM-DD' && (
          <p className="settings-error" role="status">
            Die Tagesnotizen-Einstellung dieses Vaults (Obsidian) benennt Notizen nach <code>{config.dailyNoteFormat}</code>.
            Slatebase legt sie immer als <code>JJJJ-MM-TT.md</code> an und kann dieses Format nicht verwenden.
          </p>
        )}

        <div className="settings-field">
          <label htmlFor="vault-unique-note-dir" className="settings-field-label">
            Verzeichnis für eindeutige Notizen
          </label>
          <p className="settings-field-hint">
            Relativer Pfad im Vault, in dem der Befehl „Eindeutige Notiz anlegen“ neue Notizen mit Zeitstempel-Namen (<code>JJJJMMTThhmmss</code>) erstellt. Leer = Vault-Wurzel.
          </p>
          <input
            id="vault-unique-note-dir"
            type="text"
            className="settings-field-input"
            value={uniqueNoteDir}
            onChange={(e) => setUniqueNoteDir(e.target.value)}
            placeholder="(Vault-Wurzel)"
            disabled={saving}
          />
        </div>

        <div className="settings-actions">
          <Button variant="primary" onClick={handleSave} disabled={saving || !hasChanges}>
            {saving ? 'Speichern…' : 'Speichern'}
          </Button>
        </div>
      </SettingSection>

      <SettingSection title="Web-Embeds">
        <SettingRow
          label="Webseiten in Notizen einbetten"
          htmlFor="vault-web-embed-toggle"
          hint="Wenn aktiviert, wird `![](https://…)` in einer Notiz als eingebettete Webseite (sandboxed iframe) angezeigt. Standard aus: Das automatische Laden fremder URLs aus einem Dokument ist eine Tracking-/Clickjacking-Fläche und lädt in einem geteilten Vault beim Lesen ungefragt fremde Seiten. Aus = als normaler Link anzeigen."
        >
          <input
            id="vault-web-embed-toggle"
            type="checkbox"
            checked={webEmbedEnabled}
            onChange={(e) => setWebEmbedEnabled(e.target.checked)}
          />
        </SettingRow>
      </SettingSection>
    </div>
  )
}
