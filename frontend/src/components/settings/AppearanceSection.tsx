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

import { useCallback } from 'react'
import { useStatusBar } from '../../hooks/useStatusBar'
import { useStatusBarItemVisibility, type BuiltinStatusBarItemId } from '../../hooks/useStatusBarItemVisibility'
import { useUiSettings, updateUiSettings } from '../../state/userSettingsStore'
import {
  useToolbarPrefs,
  setToolbarVisible,
  setToolbarPosition,
  resetToolbarLayout,
  type ToolbarPosition,
} from '../../state/toolbarStore'
import { useAuthContext } from '../../state/authContext'
import { useAppContext } from '../../state'
import { showToast } from '../ToastNotification'
import { extractErrorMessage } from '../../utils/error'
import { SettingSection, SettingRow, Button } from './ui'

const BUILTIN_ITEMS: Array<{ id: BuiltinStatusBarItemId; label: string }> = [
  { id: 'clock', label: 'Uhr' },
  { id: 'vaultName', label: 'Vault-Name' },
  { id: 'wordStats', label: 'Wort- und Zeichenanzahl' },
  { id: 'cursorPosition', label: 'Cursor-Position' },
  { id: 'linkCounts', label: 'Aus-/eingehende Links' },
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
        showToast('error', extractErrorMessage(err, 'Einstellung konnte nicht gespeichert werden'))
      }
    },
    [apiClient, authDispatch],
  )

  return (
    <SettingSection
      title="Erscheinungsbild"
      description="Gilt für dein Konto auf allen Geräten."
    >
      <SettingRow
        label="Farbschema"
        htmlFor="appearance-color-scheme"
        hint="„System“ folgt der Einstellung deines Betriebssystems."
      >
        <select
          id="appearance-color-scheme"
          className="settings-field-input"
          value={colorScheme}
          onChange={(e) => { void save({ colorScheme: e.target.value as 'light' | 'dark' | 'system' }) }}
        >
          <option value="light">Hell</option>
          <option value="dark">Dunkel</option>
          <option value="system">System</option>
        </select>
      </SettingRow>

      <SettingRow label="Sprache" htmlFor="appearance-language">
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
  const { visible, toggle } = useStatusBar()
  const uiSettings = useUiSettings()
  const toolbar = useToolbarPrefs()

  const hiddenCount = toolbar.hidden.length
  const customisedCount = hiddenCount + Object.keys(toolbar.colors).length + toolbar.order.length

  return (
    <div className="appearance-section">
      <ProfileDisplaySettings />

      <SettingSection
        title="Statusleiste"
        description="Zeigt eine Leiste am unteren Rand mit Uhrzeit und weiteren Informationen."
      >
        <SettingRow label="Statusleiste anzeigen" htmlFor="statusbar-toggle">
          <input id="statusbar-toggle" type="checkbox" checked={visible} onChange={toggle} />
        </SettingRow>

        {visible && BUILTIN_ITEMS.map((item) => (
          <StatusBarItemToggle key={item.id} id={item.id} label={item.label} />
        ))}
      </SettingSection>

      <SettingSection
        title="Werkzeugleiste"
        description="Reihenfolge, Farben und einzelne Schaltflächen änderst du direkt über das Kontextmenü der Leiste."
      >
        <SettingRow label="Werkzeugleiste anzeigen" htmlFor="toolbar-visible">
          <input
            id="toolbar-visible"
            type="checkbox"
            checked={toolbar.visible}
            onChange={() => { setToolbarVisible(!toolbar.visible) }}
          />
        </SettingRow>

        <SettingRow label="Position" htmlFor="toolbar-position">
          <select
            id="toolbar-position"
            className="settings-field-input"
            value={toolbar.position}
            onChange={(e) => { setToolbarPosition(e.target.value as ToolbarPosition) }}
          >
            <option value="left">Links</option>
            <option value="right">Rechts</option>
          </select>
        </SettingRow>

        <SettingRow
          label="Anordnung zurücksetzen"
          hint={
            customisedCount === 0
              ? 'Die Leiste ist unverändert.'
              : `Stellt Reihenfolge, Farben und ${hiddenCount} ausgeblendete Schaltfläche(n) wieder her.`
          }
        >
          <Button
            variant="secondary"
            onClick={resetToolbarLayout}
            disabled={customisedCount === 0}
          >
            Zurücksetzen
          </Button>
        </SettingRow>
      </SettingSection>

      <SettingSection title="Datei-Explorer">
        <SettingRow
          label="Aktive Datei im Explorer verfolgen"
          htmlFor="explorer-follow-active-file"
          hint="Klappt beim Wechsel des aktiven Tabs automatisch die übergeordneten Ordner der Datei auf und markiert sie."
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
