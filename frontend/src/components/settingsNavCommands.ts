import type { Command } from '../plugins/compat/command-registry'
import type { TranslateFn } from '../i18n'
import type { SettingsCategory, SettingsSection } from '../state/settingsState'

/** Opens the settings dialog, optionally deep-linked to a section. */
type OpenSettings = (nav?: { category: SettingsCategory; section: SettingsSection }) => void

/**
 * Palette commands that open the settings dialog at an account section
 * (profile, sessions, my vaults). Names are translated.
 */
export function buildSettingsNavCommands(t: TranslateFn, onOpenSettings: OpenSettings): Command[] {
  return [
    { id: 'slatebase:navigate-profile', name: t('pages.profile'), section: 'profile' },
    { id: 'slatebase:navigate-sessions', name: t('pages.sessions'), section: 'sessions' },
    { id: 'slatebase:navigate-my-vaults', name: t('pages.myVaults'), section: 'my-vaults' },
  ].map(({ id, name, section }) => ({
    id,
    name,
    callback: () => onOpenSettings({ category: 'account', section: section as SettingsSection }),
    pluginId: 'slatebase',
  }))
}
