/**
 * Preferences module barrel export.
 */

export { PreferencesStore } from './preferences-store.js'
export { DEFAULT_UI_SETTINGS, DEFAULT_VAULT_SETTINGS } from './types.js'
export type {
  IPreferencesService,
  UserPreferences,
  RecentFileEntry,
  FavoriteEntry,
  KeybindingEntry,
  UserUiSettings,
  UserVaultSettings,
  UserUiSettingsPatch,
  UserVaultSettingsPatch,
  ToolbarSettingsPatch,
} from './types.js'
