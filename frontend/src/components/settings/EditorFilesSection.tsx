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
import { useTranslation } from '../../i18n'
import { useState } from 'react'
import { useAppContext } from '../../state'
import { extractErrorMessage } from '../../utils/error'
import { showToast } from '../ToastNotification'
import {
  updateAppConfig,
  useAppConfigValue,
  getAppConfigFileValue,
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
  const { t } = useTranslation()
  const { state } = useAppContext()
  const vaultId = state.selectedVaultId
  const canWrite = state.vaults.find((vault) => vault.id === vaultId)?.permission !== 'read'

  const storedPath = useAppConfigValue('attachmentFolderPath')
  const [saving, setSaving] = useState(false)

  const readable = useAppConfigValue('readableLineLength')
  const lineNumbers = useAppConfigValue('showLineNumber')
  const spellcheck = useAppConfigValue('spellcheck')
  // Subscribes to the key; the value shown is the file's own, since an absent key reads here (see the tab reducer)
  useAppConfigValue('defaultViewMode')
  const defaultViewMode = getAppConfigFileValue('defaultViewMode') === 'source' ? 'source' : 'preview'
  const strictLineBreaks = useAppConfigValue('strictLineBreaks')
  const propertiesInDocument = useAppConfigValue('propertiesInDocument')
  const useTab = useAppConfigValue('useTab')
  const tabSize = useAppConfigValue('tabSize')
  const autoPairBrackets = useAppConfigValue('autoPairBrackets')
  const autoPairMarkdown = useAppConfigValue('autoPairMarkdown')
  const rightToLeft = useAppConfigValue('rightToLeft')
  const foldHeading = useAppConfigValue('foldHeading')
  const foldIndent = useAppConfigValue('foldIndent')
  const newFileLocation = useAppConfigValue('newFileLocation')
  const newFileFolderPath = useAppConfigValue('newFileFolderPath')
  const promptDelete = useAppConfigValue('promptDelete')

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
        <SettingRow label="Notizen öffnen in" htmlFor="editor-view-mode" hint="Gilt beim Öffnen einer Markdown-Datei.">
          <select
            id="editor-view-mode"
            className="settings-field-input"
            value={defaultViewMode}
            disabled={disabled}
            onChange={(e) => void save({ defaultViewMode: e.target.value as AppConfigValues['defaultViewMode'] })}
          >
            <option value="preview">Leseansicht</option>
            <option value="source">Bearbeiten</option>
          </select>
        </SettingRow>
        <SettingRow label={t('propertiesInDocument.label')} htmlFor="editor-properties-in-document" hint={t('propertiesInDocument.hint')}>
          <select
            id="editor-properties-in-document"
            className="settings-field-input"
            value={propertiesInDocument}
            disabled={disabled}
            onChange={(e) => void save({ propertiesInDocument: e.target.value as AppConfigValues['propertiesInDocument'] })}
          >
            <option value="visible">{t('propertiesInDocument.visible')}</option>
            <option value="hidden">{t('propertiesInDocument.hidden')}</option>
            <option value="source">{t('propertiesInDocument.source')}</option>
          </select>
        </SettingRow>
        <SettingRow label="Strikte Zeilenumbrüche" htmlFor="editor-strict-breaks" hint="Aus: ein einzelner Zeilenumbruch erscheint in der Leseansicht als Umbruch. An: er bleibt ein Leerzeichen, wie in CommonMark.">
          <input
            id="editor-strict-breaks"
            type="checkbox"
            checked={strictLineBreaks}
            disabled={disabled}
            onChange={(e) => void save({ strictLineBreaks: e.target.checked })}
          />
        </SettingRow>
        <SettingRow label="Rechts-nach-links-Schrift" htmlFor="editor-rtl">
          <input
            id="editor-rtl"
            type="checkbox"
            checked={rightToLeft}
            disabled={disabled}
            onChange={(e) => void save({ rightToLeft: e.target.checked })}
          />
        </SettingRow>
      </SettingSection>

      <SettingSection title="Einrückung und Eingabe">
        <SettingRow label="Mit Tabulator einrücken" htmlFor="editor-use-tab" hint="Aus: Leerzeichen, so viele wie die Tabulatorbreite.">
          <input
            id="editor-use-tab"
            type="checkbox"
            checked={useTab}
            disabled={disabled}
            onChange={(e) => void save({ useTab: e.target.checked })}
          />
        </SettingRow>
        <SettingRow label="Tabulatorbreite" htmlFor="editor-tab-size" hint="1 bis 16 Zeichen.">
          <input
            key={tabSize}
            id="editor-tab-size"
            type="number"
            min={1}
            max={16}
            className="settings-field-input"
            defaultValue={tabSize}
            disabled={disabled}
            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
            onBlur={(e) => {
              const next = Math.round(Number(e.target.value))
              if (Number.isFinite(next) && next >= 1 && next <= 16 && next !== tabSize) void save({ tabSize: next })
              else e.target.value = String(tabSize)
            }}
          />
        </SettingRow>
        <SettingRow label="Klammern automatisch schließen" htmlFor="editor-pair-brackets">
          <input
            id="editor-pair-brackets"
            type="checkbox"
            checked={autoPairBrackets}
            disabled={disabled}
            onChange={(e) => void save({ autoPairBrackets: e.target.checked })}
          />
        </SettingRow>
        <SettingRow label="Markdown-Zeichen um Auswahl setzen" htmlFor="editor-pair-markdown" hint="Mit markiertem Text umschließen * _ ` die Auswahl.">
          <input
            id="editor-pair-markdown"
            type="checkbox"
            checked={autoPairMarkdown}
            disabled={disabled}
            onChange={(e) => void save({ autoPairMarkdown: e.target.checked })}
          />
        </SettingRow>
        <SettingRow label="Überschriften falten" htmlFor="editor-fold-heading">
          <input
            id="editor-fold-heading"
            type="checkbox"
            checked={foldHeading}
            disabled={disabled}
            onChange={(e) => void save({ foldHeading: e.target.checked })}
          />
        </SettingRow>
        <SettingRow label="Listen falten" htmlFor="editor-fold-indent">
          <input
            id="editor-fold-indent"
            type="checkbox"
            checked={foldIndent}
            disabled={disabled}
            onChange={(e) => void save({ foldIndent: e.target.checked })}
          />
        </SettingRow>
      </SettingSection>

      <SettingSection title="Neue Notizen und Löschen">
        <SettingRow label="Neue Notiz anlegen in" htmlFor="files-new-location">
          <select
            id="files-new-location"
            className="settings-field-input"
            value={newFileLocation}
            disabled={disabled}
            onChange={(e) => void save({ newFileLocation: e.target.value as AppConfigValues['newFileLocation'] })}
          >
            <option value="root">Vault-Stamm</option>
            <option value="current">Ordner der geöffneten Notiz</option>
            <option value="folder">Festem Ordner</option>
          </select>
        </SettingRow>
        {newFileLocation === 'folder' && (
          <SettingRow label="Ordner für neue Notizen" htmlFor="files-new-folder" hint="Pfad im Vault, zum Beispiel Eingang. Gibt es den Ordner nicht, kommt die Notiz in den Vault-Stamm.">
            <input
              key={newFileFolderPath}
              id="files-new-folder"
              type="text"
              className="settings-field-input"
              defaultValue={newFileFolderPath}
              disabled={disabled}
              autoComplete="off"
              spellCheck={false}
              onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
              onBlur={(e) => {
                if (e.target.value !== newFileFolderPath) void save({ newFileFolderPath: e.target.value.trim() })
              }}
            />
          </SettingRow>
        )}
        <SettingRow label="Vor dem Löschen nachfragen" htmlFor="files-prompt-delete" hint="Gelöschtes landet weiterhin im Papierkorb.">
          <input
            id="files-prompt-delete"
            type="checkbox"
            checked={promptDelete}
            disabled={disabled}
            onChange={(e) => void save({ promptDelete: e.target.checked })}
          />
        </SettingRow>
      </SettingSection>
    </div>
  )
}
