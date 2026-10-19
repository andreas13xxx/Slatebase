/**
 * ThemesSection — Settings section for the vault's Obsidian themes.
 * Lives under the Vault category: themes are vault content (`.obsidian/themes/`) and the
 * selection applies to everyone who opens the vault.
 *
 * @module components/settings/ThemesSection
 */
import { ThemeManager } from './ThemeManager'
import { SettingSection } from './ui'

/** Wraps ThemeManager with the section title/description. */
export function ThemesSection() {
  return (
    <SettingSection title="Themes" description="Obsidian-Themes für diesen Vault installieren und auswählen.">
      <ThemeManager />
    </SettingSection>
  )
}
