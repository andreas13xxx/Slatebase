/**
 * Single source of truth for settings navigation labels.
 * Previously duplicated (and drifted — server-restart had two different labels)
 * across SettingsContent.tsx and SettingsNavList.tsx.
 */

import type { SettingsCategory, SettingsSection } from './settingsState'

/** German labels for each settings section, used for headings and nav search matching. */
export const SECTION_LABELS: Record<SettingsSection, string> = {
  'profile': 'Profil',
  'password': 'Passwort ändern',
  'sessions': 'Sitzungen',
  'mcp-tokens': 'MCP-Tokens',
  'keybindings': 'Tastaturkürzel',
  'appearance': 'Darstellung',
  'my-vaults': 'Meine Vaults',
  'delete-account': 'Konto löschen',
  'plugins': 'Plugins',
  'vault-config': 'Vault-Konfiguration',
  'css-snippets': 'CSS-Snippets',
  'git-sync': 'Git-Synchronisation',
  'mail-import': 'Mail-Import',
  'server-config': 'Serverkonfiguration',
  'user-management': 'Benutzerverwaltung',
  'vault-management': 'Vault-Verwaltung',
  'feature-toggles': 'Feature-Toggles',
  'server-restart': 'Server neu starten',
}

/** German labels for category headings in the settings sidebar. */
export const CATEGORY_LABELS: Record<SettingsCategory, string> = {
  'account': 'Konto',
  'vault': 'Vault',
  'administration': 'Administration',
}
