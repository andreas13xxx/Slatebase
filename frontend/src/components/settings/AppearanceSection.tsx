/**
 * AppearanceSection — Display preferences for the unified settings panel.
 * Contains toggles for visual UI elements like the status bar.
 *
 * @module components/settings/AppearanceSection
 */

import { useStatusBar } from '../../hooks/useStatusBar'
import { useStatusBarItemVisibility, type BuiltinStatusBarItemId } from '../../hooks/useStatusBarItemVisibility'
import { SnippetManager } from './SnippetManager'
import { SettingSection, SettingRow } from './ui'

const BUILTIN_ITEMS: Array<{ id: BuiltinStatusBarItemId; label: string }> = [
  { id: 'clock', label: 'Uhr' },
  { id: 'vaultName', label: 'Vault-Name' },
  { id: 'wordStats', label: 'Wort- und Zeichenanzahl' },
  { id: 'cursorPosition', label: 'Cursor-Position' },
]

/** One visibility toggle row for a built-in status bar item (Requirement 6.1). */
function StatusBarItemToggle({ id, label }: { id: BuiltinStatusBarItemId; label: string }) {
  const { visible, toggle } = useStatusBarItemVisibility(id)
  const inputId = `statusbar-item-toggle-${id}`

  return (
    <SettingRow label={label} htmlFor={inputId} nested>
      <input id={inputId} type="checkbox" checked={visible} onChange={toggle} />
    </SettingRow>
  )
}

/**
 * Appearance settings section with toggles for visual UI elements.
 */
export function AppearanceSection() {
  const { visible, toggle } = useStatusBar()

  return (
    <div className="appearance-section">
      <SettingSection title="Statusleiste" description="Zeigt eine Leiste am unteren Rand mit Uhrzeit und weiteren Informationen.">
        <SettingRow label="Statusleiste anzeigen" htmlFor="statusbar-toggle">
          <input id="statusbar-toggle" type="checkbox" checked={visible} onChange={toggle} />
        </SettingRow>

        {visible && BUILTIN_ITEMS.map((item) => (
          <StatusBarItemToggle key={item.id} id={item.id} label={item.label} />
        ))}
      </SettingSection>

      <SettingSection title="CSS-Snippets" description="Eigene CSS-Snippets zur Anpassung des Erscheinungsbilds hinzufügen und verwalten.">
        <SnippetManager />
      </SettingSection>
    </div>
  )
}
