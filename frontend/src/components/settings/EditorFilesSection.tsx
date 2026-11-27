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
import { useTranslation, translateNow, type TranslationKey } from '../../i18n'
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
import { vaultSpellcheckLanguage, withVaultSpellcheckLanguage } from '../../hooks/useSpellcheck'
import { isSpellcheckLanguage } from '../../editor/spellcheck/protocol'
import { buildAttachmentPath, parseAttachmentPath, type AttachmentMode } from './attachmentPath'

const MODE_LABELS: Record<AttachmentMode, TranslationKey> = {
  note: 'settingsUi.misc_attNote',
  root: 'settingsUi.misc_attRoot',
  subfolder: 'settingsUi.misc_attSubfolder',
  folder: 'settingsUi.misc_attFolder',
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
  const { t } = useTranslation()
  const stored = parseAttachmentPath(storedPath)
  const [mode, setMode] = useState<AttachmentMode>(stored.mode)
  const [name, setName] = useState(stored.name)

  const needsName = mode === 'subfolder' || mode === 'folder'
  const pendingPath = buildAttachmentPath(mode, name)
  const changed = pendingPath !== buildAttachmentPath(stored.mode, stored.name)

  return (
    <SettingSection
      title={t('settingsUi.misc_attachments')}
      description={t('settingsUi.misc_attachmentsDesc')}
    >
      <SettingRow label={t('settingsUi.misc_location')} htmlFor="attachment-mode">
        <select
          id="attachment-mode"
          className="settings-field-input"
          value={mode}
          onChange={(e) => setMode(e.target.value as AttachmentMode)}
          disabled={disabled}
        >
          {(Object.keys(MODE_LABELS) as AttachmentMode[]).map((key) => (
            <option key={key} value={key}>{t(MODE_LABELS[key])}</option>
          ))}
        </select>
      </SettingRow>

      {needsName && (
        <SettingRow
          label={mode === 'subfolder' ? t('settingsUi.misc_subfolderName') : t('settingsUi.misc_folder')}
          htmlFor="attachment-name"
          hint={mode === 'subfolder'
            ? t('settingsUi.misc_subfolderHint')
            : t('settingsUi.misc_folderHint')}
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
          {saving ? t('settingsUi.misc_saving') : t('settingsUi.misc_save')}
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
  const livePreview = useAppConfigValue('livePreview')
  const strictLineBreaks = useAppConfigValue('strictLineBreaks')
  const propertiesInDocument = useAppConfigValue('propertiesInDocument')
  const useTab = useAppConfigValue('useTab')
  const tabSize = useAppConfigValue('tabSize')
  const autoPairBrackets = useAppConfigValue('autoPairBrackets')
  const autoPairMarkdown = useAppConfigValue('autoPairMarkdown')
  const rightToLeft = useAppConfigValue('rightToLeft')
  const smartIndentList = useAppConfigValue('smartIndentList')
  const vimMode = useAppConfigValue('vimMode')
  const showIndentGuide = useAppConfigValue('showIndentGuide')
  const showInlineTitle = useAppConfigValue('showInlineTitle')
  const autoConvertHtml = useAppConfigValue('autoConvertHtml')
  // Slatebase shows every file unless the key is explicitly false (see FileExplorer). So the checkbox
  // (“show unsupported files”) is on whenever the file does not say false, and turning it off writes an
  // explicit false; turning it on removes the key (back to Slatebase's show-everything behaviour).
  useAppConfigValue('showUnsupportedFiles')
  const showUnsupportedFiles = getAppConfigFileValue('showUnsupportedFiles') !== false
  const spellcheckLanguages = useAppConfigValue('spellcheckLanguages')
  const foldHeading = useAppConfigValue('foldHeading')
  const foldIndent = useAppConfigValue('foldIndent')
  const newFileLocation = useAppConfigValue('newFileLocation')
  const newFileFolderPath = useAppConfigValue('newFileFolderPath')
  const promptDelete = useAppConfigValue('promptDelete')

  if (!vaultId) {
    return <p className="settings-content-no-vault">{t('settingsUi.misc_noVault')}</p>
  }

  const save = async (patch: { [K in AppConfigKey]?: AppConfigValues[K] | null }): Promise<void> => {
    setSaving(true)
    try {
      await updateAppConfig(patch)
    } catch (error: unknown) {
      showToast('error', translateNow('settingsUi.misc_saveFailedWith', { detail: extractErrorMessage(error) }))
    } finally {
      setSaving(false)
    }
  }

  const disabled = !canWrite || saving

  return (
    <div className="editor-files-section">
      {!canWrite && (
        <p className="settings-field-hint">{t('settingsUi.misc_vaultSettingsHint')}</p>
      )}

      <AttachmentSettings
        key={storedPath}
        storedPath={storedPath}
        disabled={disabled}
        saving={saving}
        onSave={(path) => void save({ attachmentFolderPath: path })}
      />

      <SettingSection title={t('settingsUi.misc_editor')}>
        <SettingRow label={t('settingsUi.misc_readableLength')} htmlFor="editor-readable" hint={t('settingsUi.misc_readableLengthHint')}>
          <input
            id="editor-readable"
            type="checkbox"
            checked={readable}
            disabled={disabled}
            onChange={(e) => void save({ readableLineLength: e.target.checked })}
          />
        </SettingRow>
        <SettingRow label={t('settingsUi.misc_lineNumbers')} htmlFor="editor-line-numbers">
          <input
            id="editor-line-numbers"
            type="checkbox"
            checked={lineNumbers}
            disabled={disabled}
            onChange={(e) => void save({ showLineNumber: e.target.checked })}
          />
        </SettingRow>
        <SettingRow label={t('settingsUi.misc_spellcheck')} htmlFor="editor-spellcheck" hint={t('settingsUi.misc_spellcheckHint')}>
          <input
            id="editor-spellcheck"
            type="checkbox"
            checked={spellcheck}
            disabled={disabled}
            onChange={(e) => void save({ spellcheck: e.target.checked })}
          />
        </SettingRow>
        <SettingRow label={t('settingsUi.misc_openNotesIn')} htmlFor="editor-view-mode" hint={t('settingsUi.misc_openNotesInHint')}>
          <select
            id="editor-view-mode"
            className="settings-field-input"
            value={defaultViewMode}
            disabled={disabled}
            onChange={(e) => void save({ defaultViewMode: e.target.value as AppConfigValues['defaultViewMode'] })}
          >
            <option value="preview">{t('settingsUi.misc_readingView')}</option>
            <option value="source">{t('settingsUi.misc_edit')}</option>
          </select>
        </SettingRow>
        <SettingRow label={t('settingsUi.misc_defaultEditMode')} htmlFor="editor-default-edit-mode" hint={t('settingsUi.misc_defaultEditModeHint')}>
          <select
            id="editor-default-edit-mode"
            className="settings-field-input"
            value={livePreview ? 'live-preview' : 'source'}
            disabled={disabled}
            onChange={(e) => void save({ livePreview: e.target.value === 'live-preview' })}
          >
            <option value="live-preview">{t('settingsUi.misc_livePreview')}</option>
            <option value="source">{t('settingsUi.misc_sourceMode')}</option>
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
        <SettingRow label={t('settingsUi.misc_strictBreaks')} htmlFor="editor-strict-breaks" hint={t('settingsUi.misc_strictBreaksHint')}>
          <input
            id="editor-strict-breaks"
            type="checkbox"
            checked={strictLineBreaks}
            disabled={disabled}
            onChange={(e) => void save({ strictLineBreaks: e.target.checked })}
          />
        </SettingRow>
        <SettingRow label={t('editorSettings.spellcheckLanguage')} htmlFor="editor-spellcheck-language" hint={t('editorSettings.spellcheckLanguageHint')}>
          <select
            id="editor-spellcheck-language"
            className="settings-field-input"
            value={vaultSpellcheckLanguage(spellcheckLanguages) ?? ''}
            disabled={disabled}
            onChange={(e) => void save({ spellcheckLanguages: withVaultSpellcheckLanguage(spellcheckLanguages, isSpellcheckLanguage(e.target.value) ? e.target.value : null) })}
          >
            <option value="">{t('editorSettings.spellcheckPersonal')}</option>
            <option value="de">{t('settingsUi.misc_german')}</option>
            <option value="en">English</option>
          </select>
        </SettingRow>
        <SettingRow label={t('settingsUi.misc_rtl')} htmlFor="editor-rtl">
          <input
            id="editor-rtl"
            type="checkbox"
            checked={rightToLeft}
            disabled={disabled}
            onChange={(e) => void save({ rightToLeft: e.target.checked })}
          />
        </SettingRow>
        <SettingRow label={t('editorSettings.showInlineTitle')} htmlFor="editor-inline-title" hint={t('editorSettings.showInlineTitleHint')}>
          <input
            id="editor-inline-title"
            type="checkbox"
            checked={showInlineTitle}
            disabled={disabled}
            onChange={(e) => void save({ showInlineTitle: e.target.checked })}
          />
        </SettingRow>
        <SettingRow label={t('editorSettings.autoConvertHtml')} htmlFor="editor-auto-convert-html" hint={t('editorSettings.autoConvertHtmlHint')}>
          <input
            id="editor-auto-convert-html"
            type="checkbox"
            checked={autoConvertHtml}
            disabled={disabled}
            onChange={(e) => void save({ autoConvertHtml: e.target.checked })}
          />
        </SettingRow>
      </SettingSection>

      <SettingSection title={t('settingsUi.misc_indentInput')}>
        <SettingRow label={t('editorSettings.smartIndentList')} htmlFor="editor-smart-indent-list" hint={t('editorSettings.smartIndentListHint')}>
          <input
            id="editor-smart-indent-list"
            type="checkbox"
            checked={smartIndentList}
            disabled={disabled}
            onChange={(e) => void save({ smartIndentList: e.target.checked })}
          />
        </SettingRow>
        <SettingRow label={t('editorSettings.vimMode')} htmlFor="editor-vim-mode" hint={t('editorSettings.vimModeHint')}>
          <input
            id="editor-vim-mode"
            type="checkbox"
            checked={vimMode}
            disabled={disabled}
            onChange={(e) => void save({ vimMode: e.target.checked })}
          />
        </SettingRow>
        <SettingRow label={t('editorSettings.showIndentGuide')} htmlFor="editor-show-indent-guide" hint={t('editorSettings.showIndentGuideHint')}>
          <input
            id="editor-show-indent-guide"
            type="checkbox"
            checked={showIndentGuide}
            disabled={disabled}
            onChange={(e) => void save({ showIndentGuide: e.target.checked })}
          />
        </SettingRow>
        <SettingRow label={t('settingsUi.misc_useTab')} htmlFor="editor-use-tab" hint={t('settingsUi.misc_useTabHint')}>
          <input
            id="editor-use-tab"
            type="checkbox"
            checked={useTab}
            disabled={disabled}
            onChange={(e) => void save({ useTab: e.target.checked })}
          />
        </SettingRow>
        <SettingRow label={t('settingsUi.misc_tabSize')} htmlFor="editor-tab-size" hint={t('settingsUi.misc_tabSizeHint')}>
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
        <SettingRow label={t('settingsUi.misc_pairBrackets')} htmlFor="editor-pair-brackets">
          <input
            id="editor-pair-brackets"
            type="checkbox"
            checked={autoPairBrackets}
            disabled={disabled}
            onChange={(e) => void save({ autoPairBrackets: e.target.checked })}
          />
        </SettingRow>
        <SettingRow label={t('settingsUi.misc_pairMarkdown')} htmlFor="editor-pair-markdown" hint={t('settingsUi.misc_pairMarkdownHint')}>
          <input
            id="editor-pair-markdown"
            type="checkbox"
            checked={autoPairMarkdown}
            disabled={disabled}
            onChange={(e) => void save({ autoPairMarkdown: e.target.checked })}
          />
        </SettingRow>
        <SettingRow label={t('settingsUi.misc_foldHeading')} htmlFor="editor-fold-heading">
          <input
            id="editor-fold-heading"
            type="checkbox"
            checked={foldHeading}
            disabled={disabled}
            onChange={(e) => void save({ foldHeading: e.target.checked })}
          />
        </SettingRow>
        <SettingRow label={t('settingsUi.misc_foldIndent')} htmlFor="editor-fold-indent">
          <input
            id="editor-fold-indent"
            type="checkbox"
            checked={foldIndent}
            disabled={disabled}
            onChange={(e) => void save({ foldIndent: e.target.checked })}
          />
        </SettingRow>
      </SettingSection>

      <SettingSection title={t('settingsUi.misc_newNotesDelete')}>
        <SettingRow label={t('settingsUi.misc_newNoteIn')} htmlFor="files-new-location">
          <select
            id="files-new-location"
            className="settings-field-input"
            value={newFileLocation}
            disabled={disabled}
            onChange={(e) => void save({ newFileLocation: e.target.value as AppConfigValues['newFileLocation'] })}
          >
            <option value="root">Vault-Stamm</option>
            <option value="current">{t('settingsUi.misc_currentFolder')}</option>
            <option value="folder">{t('settingsUi.misc_fixedFolder')}</option>
          </select>
        </SettingRow>
        {newFileLocation === 'folder' && (
          <SettingRow label={t('settingsUi.misc_newNoteFolder')} htmlFor="files-new-folder" hint={t('settingsUi.misc_newNoteFolderHint')}>
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
        <SettingRow label={t('settingsUi.misc_promptDelete')} htmlFor="files-prompt-delete" hint={t('settingsUi.misc_promptDeleteHint')}>
          <input
            id="files-prompt-delete"
            type="checkbox"
            checked={promptDelete}
            disabled={disabled}
            onChange={(e) => void save({ promptDelete: e.target.checked })}
          />
        </SettingRow>
        <SettingRow label={t('editorSettings.showUnsupportedFiles')} htmlFor="files-show-unsupported" hint={t('editorSettings.showUnsupportedFilesHint')}>
          <input
            id="files-show-unsupported"
            type="checkbox"
            checked={showUnsupportedFiles}
            disabled={disabled}
            onChange={(e) => void save({ showUnsupportedFiles: e.target.checked ? null : false })}
          />
        </SettingRow>
      </SettingSection>
    </div>
  )
}
