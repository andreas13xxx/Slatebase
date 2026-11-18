/**
 * AppearanceSection — everything that decides how Slatebase looks for one
 * account: colour scheme, language, status bar, toolbar and the explorer's
 * follow-active-file behaviour.
 *
 * Colour scheme and language used to sit under "Profil", which meant the two
 * most visible display settings were not in the section named after display.
 * The status bar, toolbar and explorer toggles used to be device-local
 * `localStorage` values; they are now account settings on the server, so they
 * follow the user to every browser instead of quietly differing per device.
 *
 * The toolbar is also configurable from its own context menu — this section
 * mirrors it rather than replacing it.
 *
 * @module components/settings/AppearanceSection
 */

import { useTranslation, translateNow, type TranslationKey } from '../../i18n'
import { useCallback } from 'react'
import { useStatusBar } from '../../hooks/useStatusBar'
import { useStatusBarItemVisibility, type BuiltinStatusBarItemId } from '../../hooks/useStatusBarItemVisibility'
import { useUiSettings, updateUiSettings } from '../../state/userSettingsStore'
import {
  useToolbarPrefs,
  setToolbarVisible,
  setToolbarPosition,
  resetToolbarLayout,
  DEFAULT_TOOLBAR_PREFS,
  type ToolbarPosition,
} from '../../state/toolbarStore'
import { useAuthContext } from '../../state/authContext'
import { useAppContext } from '../../state'
import { showToast } from '../ToastNotification'
import { extractErrorMessage } from '../../utils/error'
import { SettingSection, SettingRow, Button } from './ui'

const BUILTIN_ITEMS: Array<{ id: BuiltinStatusBarItemId; labelKey: TranslationKey }> = [
  { id: 'clock', labelKey: 'settingsUi.sbClock' },
  { id: 'vaultName', labelKey: 'settingsUi.sbVaultName' },
  { id: 'wordStats', labelKey: 'settingsUi.sbWordStats' },
  { id: 'cursorPosition', labelKey: 'settingsUi.sbCursor' },
  { id: 'linkCounts', labelKey: 'settingsUi.sbLinks' },
  { id: 'theme', labelKey: 'settingsUi.sbTheme' },
]

/** One visibility toggle row for a built-in status bar item. */
function StatusBarItemToggle({ id, label }: { id: BuiltinStatusBarItemId; label: string }) {
  const { visible, toggle } = useStatusBarItemVisibility(id)
  const inputId = `statusbar-item-toggle-${id}`

  return (
    <SettingRow label={label} htmlFor={inputId} nested>
      <input id={inputId} type="checkbox" checked={visible} onChange={toggle} />
    </SettingRow>
  )
}

/** Colour scheme and language — stored on the user record, not in preferences. */
function ProfileDisplaySettings() {
  const { t } = useTranslation()
  const { authState, authDispatch } = useAuthContext()
  const { apiClient } = useAppContext()

  const colorScheme = authState.user?.colorScheme ?? 'system'
  const language = authState.user?.preferredLanguage ?? 'de'

  const save = useCallback(
    async (patch: { colorScheme?: 'light' | 'dark' | 'system'; preferredLanguage?: 'de' | 'en' }) => {
      if (apiClient === null) return
      try {
        const updated = await apiClient.updateProfile(patch)
        authDispatch({ type: 'PROFILE_UPDATED', payload: { user: updated } })
      } catch (err: unknown) {
        showToast('error', extractErrorMessage(err, translateNow('settingsUi.saveFailed')))
      }
    },
    [apiClient, authDispatch],
  )

  return (
    <SettingSection
      title={t('settingsUi.appearanceTitle')}
      description={t('settingsUi.appearanceDesc')}
    >
      <SettingRow
        label={t('settingsUi.colorScheme')}
        htmlFor="appearance-color-scheme"
        hint={t('settingsUi.colorSchemeHint')}
      >
        <select
          id="appearance-color-scheme"
          className="settings-field-input"
          value={colorScheme}
          onChange={(e) => { void save({ colorScheme: e.target.value as 'light' | 'dark' | 'system' }) }}
        >
          <option value="light">{t('settingsUi.light')}</option>
          <option value="dark">{t('settingsUi.dark')}</option>
          <option value="system">{t('settingsUi.system')}</option>
        </select>
      </SettingRow>

      <SettingRow label={t('settingsUi.language')} htmlFor="appearance-language">
        <select
          id="appearance-language"
          className="settings-field-input"
          value={language}
          onChange={(e) => { void save({ preferredLanguage: e.target.value as 'de' | 'en' }) }}
        >
          <option value="de">Deutsch</option>
          <option value="en">English</option>
        </select>
      </SettingRow>
    </SettingSection>
  )
}

/**
 * Appearance settings for the current account.
 */
export function AppearanceSection() {
  const { t } = useTranslation()
  const { visible, toggle } = useStatusBar()
  const uiSettings = useUiSettings()
  const toolbar = useToolbarPrefs()

  // The default layout already hides a button, so "customised" means the
  // layout *differs* from the default — not merely that something is hidden.
  const hiddenDiffers =
    toolbar.hidden.length !== DEFAULT_TOOLBAR_PREFS.hidden.length ||
    toolbar.hidden.some((id) => !DEFAULT_TOOLBAR_PREFS.hidden.includes(id))
  const isCustomised =
    hiddenDiffers || Object.keys(toolbar.colors).length > 0 || toolbar.order.length > 0

  return (
    <div className="appearance-section">
      <ProfileDisplaySettings />

      <SettingSection
        title={t('settingsUi.statusBar')}
        description={t('settingsUi.statusBarDesc')}
      >
        <SettingRow label={t('settingsUi.showStatusBar')} htmlFor="statusbar-toggle">
          <input id="statusbar-toggle" type="checkbox" checked={visible} onChange={toggle} />
        </SettingRow>

        {visible && BUILTIN_ITEMS.map((item) => (
          <StatusBarItemToggle key={item.id} id={item.id} label={t(item.labelKey)} />
        ))}
      </SettingSection>

      <SettingSection
        title={t('settingsUi.toolbar')}
        description={t('settingsUi.toolbarDesc')}
      >
        <SettingRow label={t('settingsUi.showToolbar')} htmlFor="toolbar-visible">
          <input
            id="toolbar-visible"
            type="checkbox"
            checked={toolbar.visible}
            onChange={() => { setToolbarVisible(!toolbar.visible) }}
          />
        </SettingRow>

        <SettingRow label={t('settingsUi.position')} htmlFor="toolbar-position">
          <select
            id="toolbar-position"
            className="settings-field-input"
            value={toolbar.position}
            onChange={(e) => { setToolbarPosition(e.target.value as ToolbarPosition) }}
          >
            <option value="left">{t('settingsUi.left')}</option>
            <option value="right">{t('settingsUi.right')}</option>
          </select>
        </SettingRow>

        <SettingRow
          label={t('settingsUi.resetLayout')}
          hint={
            isCustomised
              ? t('settingsUi.resetLayoutHint')
              : t('settingsUi.layoutUnchanged')
          }
        >
          <Button
            variant="secondary"
            onClick={resetToolbarLayout}
            disabled={!isCustomised}
          >
            {t('settingsUi.reset')}
          </Button>
        </SettingRow>
      </SettingSection>

      <SettingSection title={t('settingsUi.fileExplorer')}>
        <SettingRow
          label={t('settingsUi.followActive')}
          htmlFor="explorer-follow-active-file"
          hint={t('settingsUi.followActiveHint')}
        >
          <input
            id="explorer-follow-active-file"
            type="checkbox"
            checked={uiSettings.explorerFollowActiveFile}
            onChange={() => {
              updateUiSettings({ explorerFollowActiveFile: !uiSettings.explorerFollowActiveFile })
            }}
          />
        </SettingRow>
      </SettingSection>
    </div>
  )
}
