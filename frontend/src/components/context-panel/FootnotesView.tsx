/**
 * FootnotesView component for the Context/Side Panel.
 *
 * Lists every footnote in the active document — its number, label, a preview of
 * its definition text, and (for referenced ones) how many times it is used.
 * Clicking an entry scrolls the note to the footnote's first reference marker,
 * so a reader can jump to where a footnote is used without losing their place
 * in a long note. Obsidian 1.9.10 added the equivalent "Footnotes" core-plugin
 * sidebar tab; this is its counterpart.
 */

import { useTranslation } from '../../i18n'
import type { FootnoteEntry } from './utils/extractFootnotes'
import './FootnotesView.css'

// ─── Props ───────────────────────────────────────────────────────────────────

export interface FootnotesViewProps {
  /** Footnotes parsed from the active document, in rendered order. */
  footnotes: FootnoteEntry[]
  /** Callback when an entry is clicked — parent scrolls to the anchor. */
  onFootnoteClick: (anchor: string) => void
  /** Whether a markdown document is currently open. */
  hasDocument?: boolean
}

// ─── Component ───────────────────────────────────────────────────────────────

export function FootnotesView({ footnotes, onFootnoteClick, hasDocument = true }: FootnotesViewProps) {
  const { t } = useTranslation()

  if (!hasDocument) {
    return (
      <div className="footnotes-view footnotes-view--empty">
        <p className="footnotes-view__placeholder">{t('contextPanel.footnotes.noDocument')}</p>
      </div>
    )
  }

  if (footnotes.length === 0) {
    return (
      <div className="footnotes-view footnotes-view--empty">
        <p className="footnotes-view__placeholder">{t('contextPanel.footnotes.empty')}</p>
      </div>
    )
  }

  return (
    <nav className="footnotes-view" aria-label={t('contextPanel.footnotes.ariaLabel')}>
      <ul className="footnotes-view__list">
        {footnotes.map((footnote) => (
          <li key={footnote.identifier} className="footnotes-view__item">
            <button
              className="footnotes-view__button"
              onClick={() => onFootnoteClick(footnote.anchor)}
              title={footnote.text || footnote.identifier}
            >
              <span className="footnotes-view__number">{footnote.number}</span>
              <span className="footnotes-view__body">
                <span className="footnotes-view__text">
                  {footnote.text || t('contextPanel.footnotes.noText')}
                </span>
                {!footnote.referenced && (
                  <span className="footnotes-view__badge footnotes-view__badge--orphan">
                    {t('contextPanel.footnotes.unreferenced')}
                  </span>
                )}
                {footnote.refCount > 1 && (
                  <span className="footnotes-view__badge">
                    {t('contextPanel.footnotes.refCount', { count: String(footnote.refCount) })}
                  </span>
                )}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  )
}
