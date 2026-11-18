/**
 * StyleSettingsHint — tells the user, once for the whole list, that themes marked with the settings icon bring their own options (Style Settings blocks) and what to do
 * about it, depending on whether the community plugin "Style Settings" is installed and active in this vault.
 *
 * The state comes from `useStyleSettingsPluginState`; an unknown state gets a hint that makes no claim about the
 * plugin, never "not installed".
 */
import { useTranslation, type TranslationKey } from '../../i18n'
import { SlidersHorizontal } from 'lucide-react'
import type { StyleSettingsPluginState } from './useStyleSettingsPluginState'

const TEXT: Record<Exclude<StyleSettingsPluginState, 'loading'>, TranslationKey> = {
  missing: 'settingsUi.styleMissing',
  inactive: 'settingsUi.styleInactive',
  active: 'settingsUi.styleActive',
  unavailable: 'settingsUi.styleUnavailable',
  unknown: 'settingsUi.styleUnknown',
}

/** The single hint line above the theme list, shown when at least one theme has Style Settings blocks. Renders nothing while the plugin state is loading. */
export function StyleSettingsHint({ state }: { state: StyleSettingsPluginState }) {
  const { t } = useTranslation()
  if (state === 'loading') return null
  return (
    <p className="theme-manager__hint">
      <SlidersHorizontal size={13} aria-hidden="true" /> {t(TEXT[state])}
    </p>
  )
}
