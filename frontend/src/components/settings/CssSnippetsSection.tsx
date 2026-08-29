/**
 * CssSnippetsSection — Settings section for per-vault CSS snippets.
 * Lives under the Vault category because snippets are vault data
 * (`data/snippets/<vaultId>/…` on the backend), not account data.
 *
 * @module components/settings/CssSnippetsSection
 */
import { SnippetManager } from './SnippetManager'
import { SettingSection } from './ui'

/**
 * Wraps SnippetManager with the section title/description, matching the
 * other vault-scoped settings sections (VaultConfigSection, plugins).
 */
export function CssSnippetsSection() {
  return (
    <SettingSection title="CSS-Snippets" description="Eigene CSS-Snippets zur Anpassung des Erscheinungsbilds dieses Vaults hinzufügen und verwalten.">
      <SnippetManager />
    </SettingSection>
  )
}
