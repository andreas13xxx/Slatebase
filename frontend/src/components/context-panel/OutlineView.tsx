/**
 * OutlineView component for the Context Panel.
 *
 * Displays the heading hierarchy of the active document as a navigable
 * nested list. Headings are indented by 12px per level, the active heading
 * is highlighted, and clicking a heading triggers smooth scrolling to it.
 */

import { useTranslation } from '../../i18n'
import type { OutlineHeading } from '../../state/contextPanelState'

// ─── Props ───────────────────────────────────────────────────────────────────

export interface OutlineViewProps {
  /** Parsed headings from the active document */
  headings: OutlineHeading[]
  /** Anchor of the currently visible (topmost) heading, or null */
  activeAnchor: string | null
  /** Callback when a heading is clicked — parent handles scrolling */
  onHeadingClick: (anchor: string) => void
  /** Whether a document is currently open */
  hasDocument?: boolean
}

// ─── Component ───────────────────────────────────────────────────────────────

export function OutlineView({ headings, activeAnchor, onHeadingClick, hasDocument = true }: OutlineViewProps) {
  const { t } = useTranslation()

  // No document open
  if (!hasDocument) {
    return (
      <div className="outline-view outline-view--empty">
        <p className="outline-view__placeholder">
          {t('contextPanel.noDocument')}
        </p>
      </div>
    )
  }

  // Document open but no headings found
  if (headings.length === 0) {
    return (
      <div className="outline-view outline-view--empty">
        <p className="outline-view__placeholder">
          {t('contextPanel.noHeadings')}
        </p>
      </div>
    )
  }

  return (
    <nav className="outline-view" aria-label={t('contextPanel.outlineAriaLabel')}>
      <ul className="outline-view__list">
        {headings.map((heading, index) => {
          const isActive = heading.anchor === activeAnchor
          const indentation = (heading.level - 1) * 12

          return (
            <li
              key={`${heading.anchor}-${index}`}
              className={`outline-view__item${isActive ? ' outline-view__item--active' : ''}`}
              style={{ paddingLeft: `${indentation}px` }}
            >
              <button
                className="outline-view__button"
                onClick={() => onHeadingClick(heading.anchor)}
                title={heading.text}
                aria-current={isActive ? 'location' : undefined}
              >
                {heading.text}
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
