/**
 * PagePreviewSection — Settings page "Seitenvorschau": one switch per place that can show a preview,
 * on = the preview only appears while Ctrl (Cmd) is held. Stored in the vault's
 * `.obsidian/page-preview.json`, so it is the same for everyone who opens the vault and changing it
 * needs write access. Plugins add their own rows through `registerHoverLinkSource`.
 *
 * @module components/settings/PagePreviewSection
 */
import { useState } from 'react'
import { useTranslation, translateNow } from '../../i18n'
import { useAppContext } from '../../state'
import { extractErrorMessage } from '../../utils/error'
import { getHoverLinkSources } from '../../plugins/compat/hover-link-bus'
import { PAGE_PREVIEW_SOURCES } from '../../state/pagePreviewSources'
import {
  pagePreviewRequiresMod,
  setPagePreviewRequiresMod,
  usePagePreviewConfigVersion,
} from '../../state/pagePreviewConfigStore'
import { showToast } from '../ToastNotification'
import { SettingSection, SettingRow } from './ui'

export function PagePreviewSection() {
  const { t } = useTranslation()
  const { state } = useAppContext()
  const vaultId = state.selectedVaultId
  const canWrite = state.vaults.find((vault) => vault.id === vaultId)?.permission !== 'read'
  // Re-render when the file changes; the switches read the store directly.
  usePagePreviewConfigVersion()
  const [saving, setSaving] = useState(false)

  if (!vaultId) {
    return <p className="settings-content-no-vault">{t('settingsUi.misc_noVault')}</p>
  }

  const builtIn = new Set(PAGE_PREVIEW_SOURCES.map((source) => source.id))
  const rows = [
    ...PAGE_PREVIEW_SOURCES.map((source) => ({ key: source.id, label: t(source.labelKey) })),
    ...getHoverLinkSources()
      .filter((source) => !builtIn.has(source.id))
      .map((source) => ({ key: source.id, label: source.display })),
  ]

  const change = async (key: string, value: boolean): Promise<void> => {
    setSaving(true)
    try {
      await setPagePreviewRequiresMod(key, value)
    } catch (error: unknown) {
      showToast('error', translateNow('settingsUi.misc_saveFailedWith', { detail: extractErrorMessage(error) }))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="page-preview-section">
      {!canWrite && <p className="settings-field-hint">{t('settingsUi.misc_vaultSettingsHint')}</p>}
      <SettingSection title={t('pagePreview.title')} description={t('pagePreview.hint')}>
        {rows.map((row) => (
          <SettingRow key={row.key} label={row.label} htmlFor={`page-preview-${row.key}`}>
            <input
              id={`page-preview-${row.key}`}
              type="checkbox"
              checked={pagePreviewRequiresMod(row.key)}
              disabled={!canWrite || saving}
              onChange={(e) => void change(row.key, e.target.checked)}
            />
          </SettingRow>
        ))}
      </SettingSection>
    </div>
  )
}
