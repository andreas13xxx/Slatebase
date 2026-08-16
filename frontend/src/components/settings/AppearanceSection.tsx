/**
 * AppearanceSection — Display preferences for the unified settings panel.
 * Contains toggles for visual UI elements like the status bar.
 *
 * @module components/settings/AppearanceSection
 */

import { useStatusBar } from '../../hooks/useStatusBar'
import { useStatusBarItemVisibility, type BuiltinStatusBarItemId } from '../../hooks/useStatusBarItemVisibility'
import { SnippetManager } from './SnippetManager'

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
    <div className="appearance-section__row appearance-section__row--nested">
      <label className="appearance-section__label" htmlFor={inputId}>
        {label}
      </label>
      <input
        id={inputId}
        type="checkbox"
        checked={visible}
        onChange={toggle}
        className="appearance-section__checkbox"
      />
    </div>
  )
}

/**
 * Appearance settings section with toggles for visual UI elements.
 */
export function AppearanceSection() {
  const { visible, toggle } = useStatusBar()

  return (
    <div className="appearance-section">
      <div className="appearance-section__row">
        <label className="appearance-section__label" htmlFor="statusbar-toggle">
          Statusleiste anzeigen
        </label>
        <input
          id="statusbar-toggle"
          type="checkbox"
          checked={visible}
          onChange={toggle}
          className="appearance-section__checkbox"
        />
      </div>
      <p className="appearance-section__description">
        Zeigt eine Leiste am unteren Rand mit Uhrzeit und weiteren Informationen.
      </p>

      {visible && (
        <div className="appearance-section__group">
          <p className="appearance-section__description">Einzelne Elemente der Statusleiste:</p>
          {BUILTIN_ITEMS.map((item) => (
            <StatusBarItemToggle key={item.id} id={item.id} label={item.label} />
          ))}
        </div>
      )}

      <h3 className="appearance-section__subheading">CSS-Snippets</h3>
      <SnippetManager />
    </div>
  )
}
