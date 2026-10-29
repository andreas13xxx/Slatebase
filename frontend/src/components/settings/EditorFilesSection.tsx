/**
 * EditorFilesSection — Settings section for the vault settings Obsidian keeps in
 * `.obsidian/app.json`: where new attachments go and how the editor looks.
 *
 * The file lives in the vault, so these values are the same for everyone who opens it and
 * changing them needs write access. Each control saves at once; a refused save puts the old
 * value back and says why.
 *
 * @module components/settings/EditorFilesSection
 */
import { useState } from 'react'
import { useAppContext } from '../../state'
import { extractErrorMessage } from '../../utils/error'
import { showToast } from '../ToastNotification'
import {
  updateAppConfig,
  useAppConfigValue,
  type AppConfigKey,
  type AppConfigValues,
} from '../../state/vaultAppConfigStore'
import { SettingSection, SettingRow, Button } from './ui'
import { buildAttachmentPath, parseAttachmentPath, type AttachmentMode } from './attachmentPath'

const MODE_LABELS: Record<AttachmentMode, string> = {
  note: 'Im Ordner der Notiz',
  root: 'Im Vault-Stamm',
  subfolder: 'In einem Unterordner der Notiz',
  folder: 'In einem festen Ordner',
}

/**
 * The attachment location form. Mounted with `key={storedPath}`, so it starts from the file's
 * value again whenever that changes elsewhere (Obsidian, sync, another tab) — no effect needed.
 */
function AttachmentSettings({ storedPath, disabled, saving, onSave }: {
  storedPath: string
  disabled: boolean
  saving: boolean
  onSave: (path: string) => void
}) {
  const stored = parseAttachmentPath(storedPath)
  const [mode, setMode] = useState<AttachmentMode>(stored.mode)
  const [name, setName] = useState(stored.name)

  const needsName = mode === 'subfolder' || mode === 'folder'
  const pendingPath = buildAttachmentPath(mode, name)
  const changed = pendingPath !== buildAttachmentPath(stored.mode, stored.name)

  return (
    <SettingSection
      title="Anhänge"
      description="Wohin neue Anhänge kommen (Drag &amp; Drop, Einfügen aus der Zwischenablage, „Anhang einfügen“, Diktat). Gespeichert in .obsidian/app.json, wie in Obsidian."
    >
      <SettingRow label="Speicherort" htmlFor="attachment-mode">
        <select
          id="attachment-mode"
          className="settings-field-input"
          value={mode}
          onChange={(e) => setMode(e.target.value as AttachmentMode)}
          disabled={disabled}
        >
          {(Object.keys(MODE_LABELS) as AttachmentMode[]).map((key) => (
            <option key={key} value={key}>{MODE_LABELS[key]}</option>
          ))}
        </select>
      </SettingRow>

      {needsName && (
        <SettingRow
          label={mode === 'subfolder' ? 'Name des Unterordners' : 'Ordner'}
          htmlFor="attachment-name"
          hint={mode === 'subfolder'
            ? 'Wird im Ordner der jeweiligen Notiz angelegt, zum Beispiel attachments.'
            : 'Pfad im Vault, zum Beispiel Anhänge/Bilder.'}
        >
          <input
            id="attachment-name"
            type="text"
            className="settings-field-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={disabled}
            autoComplete="off"
            spellCheck={false}
          />
        </SettingRow>
      )}

      <div className="settings-actions">
        <Button variant="primary" disabled={disabled || !changed} onClick={() => onSave(pendingPath)}>
          {saving ? 'Speichern…' : 'Speichern'}
        </Button>
      </div>
    </SettingSection>
  )
}

export function EditorFilesSection() {
  const { state } = useAppContext()
  const vaultId = state.selectedVaultId
  const canWrite = state.vaults.find((vault) => vault.id === vaultId)?.permission !== 'read'

  const storedPath = useAppConfigValue('attachmentFolderPath')
  const [saving, setSaving] = useState(false)

  const readable = useAppConfigValue('readableLineLength')
  const lineNumbers = useAppConfigValue('showLineNumber')
  const spellcheck = useAppConfigValue('spellcheck')

  if (!vaultId) {
    return <p className="settings-content-no-vault">Kein Vault aktiv. Bitte wähle einen Vault im Datei-Explorer aus.</p>
  }

  const save = async (patch: { [K in AppConfigKey]?: AppConfigValues[K] | null }): Promise<void> => {
    setSaving(true)
    try {
      await updateAppConfig(patch)
    } catch (error: unknown) {
      showToast('error', `Einstellung konnte nicht gespeichert werden: ${extractErrorMessage(error)}`)
    } finally {
      setSaving(false)
    }
  }

  const disabled = !canWrite || saving

  return (
    <div className="editor-files-section">
      {!canWrite && (
        <p className="settings-field-hint">Diese Einstellungen gehören zum Vault. Ändern darf sie, wer den Vault bearbeiten darf.</p>
      )}

      <AttachmentSettings
        key={storedPath}
        storedPath={storedPath}
        disabled={disabled}
        saving={saving}
        onSave={(path) => void save({ attachmentFolderPath: path })}
      />

      <SettingSection title="Editor">
        <SettingRow label="Lesbare Zeilenlänge" htmlFor="editor-readable" hint="Begrenzt die Textbreite auf ein gut lesbares Maß.">
          <input
            id="editor-readable"
            type="checkbox"
            checked={readable}
            disabled={disabled}
            onChange={(e) => void save({ readableLineLength: e.target.checked })}
          />
        </SettingRow>
        <SettingRow label="Zeilennummern" htmlFor="editor-line-numbers">
          <input
            id="editor-line-numbers"
            type="checkbox"
            checked={lineNumbers}
            disabled={disabled}
            onChange={(e) => void save({ showLineNumber: e.target.checked })}
          />
        </SettingRow>
        <SettingRow label="Rechtschreibprüfung" htmlFor="editor-spellcheck" hint="Die Sprache des Wörterbuchs wählst du weiterhin im Editor, sie gilt nur für dich.">
          <input
            id="editor-spellcheck"
            type="checkbox"
            checked={spellcheck}
            disabled={disabled}
            onChange={(e) => void save({ spellcheck: e.target.checked })}
          />
        </SettingRow>
      </SettingSection>
    </div>
  )
}
