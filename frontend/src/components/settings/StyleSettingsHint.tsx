/**
 * StyleSettingsHint — tells the user that a theme brings its own options (Style Settings blocks) and what to do
 * about it, depending on whether the community plugin "Style Settings" is installed and active in this vault.
 *
 * The state comes from `useStyleSettingsPluginState`; an unknown state gets a hint that makes no claim about the
 * plugin, never "not installed".
 */
import { SlidersHorizontal } from 'lucide-react'
import type { StyleSettingsPluginState } from './useStyleSettingsPluginState'

const TEXT: Record<Exclude<StyleSettingsPluginState, 'loading'>, string> = {
  missing: 'Dieses Theme bringt eigene Einstellungen mit. Installiere dafür unter Einstellungen → Plugins das Plugin „Style Settings“.',
  inactive: 'Dieses Theme bringt eigene Einstellungen mit. Aktiviere dafür unter Einstellungen → Plugins das Plugin „Style Settings“.',
  active: 'Dieses Theme bringt eigene Einstellungen mit. Du findest sie unter Einstellungen → Plugins → Style Settings → Einstellungen.',
  unavailable: 'Dieses Theme bringt eigene Einstellungen mit. Sie lassen sich über das Plugin „Style Settings“ ändern; dafür muss ein Administrator die Plugin-Kompatibilität aktivieren.',
  unknown: 'Dieses Theme bringt eigene Einstellungen mit. Sie lassen sich über das Plugin „Style Settings“ ändern; ob es in diesem Vault installiert ist, konnte nicht geprüft werden.',
}

/** One hint line for a theme that has Style Settings blocks. Renders nothing while the plugin state is loading. */
export function StyleSettingsHint({ state }: { state: StyleSettingsPluginState }) {
  if (state === 'loading') return null
  return (
    <p className="theme-manager__hint">
      <SlidersHorizontal size={13} aria-hidden="true" /> {TEXT[state]}
    </p>
  )
}
