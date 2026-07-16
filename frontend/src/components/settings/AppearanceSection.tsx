/**
 * AppearanceSection — Display preferences for the unified settings panel.
 * Contains toggles for visual UI elements like the status bar.
 *
 * @module components/settings/AppearanceSection
 */

import { useStatusBar } from '../../hooks/useStatusBar'

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
    </div>
  )
}
