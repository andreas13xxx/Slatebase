/**
 * Single source of truth for settings navigation labels.
 * Previously duplicated (and drifted — server-restart had two different labels)
 * across SettingsContent.tsx and SettingsNavList.tsx.
 */

import type { SettingsCategory, SettingsSection } from './settingsState'
import { translateNow } from '../i18n'

/** German labels for each settings section, used for headings and nav search matching. */
export const SECTION_LABELS: Record<SettingsSection, string> = {
  get 'profile'() { return translateNow('commonUi.c_sl_profile') },
  get 'password'() { return translateNow('commonUi.c_sl_password') },
  get 'security'() { return translateNow('commonUi.c_sl_security') },
  get 'sessions'() { return translateNow('commonUi.c_sl_sessions') },
  get 'mcp-tokens'() { return translateNow('commonUi.c_sl_mcp_tokens') },
  get 'public-shares'() { return translateNow('commonUi.c_sl_public_shares') },
  get 'keybindings'() { return translateNow('commonUi.c_sl_keybindings') },
  get 'appearance'() { return translateNow('commonUi.c_sl_appearance') },
  get 'my-vaults'() { return translateNow('commonUi.c_sl_my_vaults') },
  get 'delete-account'() { return translateNow('commonUi.c_sl_delete_account') },
  get 'plugins'() { return translateNow('commonUi.c_sl_plugins') },
  get 'vault-config'() { return translateNow('commonUi.c_sl_vault_config') },
  get 'editor-files'() { return translateNow('commonUi.c_sl_editor_files') },
  get 'page-preview'() { return translateNow('commonUi.c_sl_page_preview') },
  get 'keychain'() { return translateNow('commonUi.c_sl_keychain') },
  get 'vault-appearance'() { return translateNow('commonUi.c_sl_vault_appearance') },
  get 'themes'() { return translateNow('commonUi.c_sl_themes') },
  get 'css-snippets'() { return translateNow('commonUi.c_sl_css_snippets') },
  get 'git-sync'() { return translateNow('commonUi.c_sl_git_sync') },
  get 'mail-import'() { return translateNow('commonUi.c_sl_mail_import') },
  get 'server-config'() { return translateNow('commonUi.c_sl_server_config') },
  get 'user-management'() { return translateNow('commonUi.c_sl_user_management') },
  get 'vault-management'() { return translateNow('commonUi.c_sl_vault_management') },
  get 'feature-toggles'() { return translateNow('commonUi.c_sl_feature_toggles') },
  get 'server-restart'() { return translateNow('commonUi.c_sl_server_restart') },
}

/** German labels for category headings in the settings sidebar. */
export const CATEGORY_LABELS: Record<SettingsCategory, string> = {
  get 'account'() { return translateNow('commonUi.c_sl_account') },
  get 'vault'() { return translateNow('commonUi.c_sl_vault') },
  get 'administration'() { return translateNow('commonUi.c_sl_administration') },
}
