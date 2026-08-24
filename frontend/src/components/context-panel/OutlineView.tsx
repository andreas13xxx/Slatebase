/**
 * OutlineView component for the Context Panel.
 *
 * Displays the heading hierarchy of the active document as a navigable
 * nested list. Headings are indented by 12px per level, the active heading
 * is highlighted, and clicking a heading triggers smooth scrolling to it.
 */

import { useState } from 'react'
import { Copy, Link2 } from 'lucide-react'
import { useTranslation } from '../../i18n'
import type { OutlineHeading } from '../../state/documentPanelData'
import { ContextMenu, type ContextMenuItem } from '../ContextMenu'
import './OutlineView.css'

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
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; heading: OutlineHeading } | null>(null)

  /**
   * A heading isn't a `TAbstractFile` — there's no `file-menu`/plugin hook for
   * it in real Obsidian either — so this stays a small, local menu rather
   * than going through the plugin-menu-bridge used by file-backed surfaces.
   */
  function buildHeadingMenuItems(heading: OutlineHeading): ContextMenuItem[] {
    return [
      { id: 'copy-text', label: 'Überschrift kopieren', icon: <Copy size={14} />, run: () => { void navigator.clipboard.writeText(heading.text).catch(() => {}) } },
      { id: 'copy-link', label: 'Link zur Überschrift kopieren', icon: <Link2 size={14} />, run: () => { void navigator.clipboard.writeText(`#${heading.anchor}`).catch(() => {}) } },
    ]
  }

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
                onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, heading }) }}
                title={heading.text}
                aria-current={isActive ? 'location' : undefined}
              >
                {heading.text}
              </button>
            </li>
          )
        })}
      </ul>
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={buildHeadingMenuItems(contextMenu.heading)}
          onClose={() => setContextMenu(null)}
          onSelect={() => setContextMenu(null)}
        />
      )}
    </nav>
  )
}
