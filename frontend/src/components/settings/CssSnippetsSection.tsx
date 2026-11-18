/**
 * CssSnippetsSection — Settings section for per-vault CSS snippets.
 * Lives under the Vault category because snippets are vault data
 * (`data/snippets/<vaultId>/…` on the backend), not account data.
 *
 * @module components/settings/CssSnippetsSection
 */
import { useTranslation } from '../../i18n'
import { SnippetManager } from './SnippetManager'
import { SettingSection } from './ui'

/**
 * Wraps SnippetManager with the section title/description, matching the
 * other vault-scoped settings sections (VaultConfigSection, plugins).
 */
export function CssSnippetsSection() {
  const { t } = useTranslation()
  return (
    <SettingSection title={t('settingsUi.cssSnippetsTitle')} description={t('settingsUi.cssSnippetsDesc')}>
      <SnippetManager />
    </SettingSection>
  )
}
