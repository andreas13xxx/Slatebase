/**
 * LinksView component for the Context Panel.
 *
 * Displays two sections: "Ausgehende Links" (forward links) and
 * "Eingehende Links" (backlinks). Resolved links are clickable and
 * open the target document in a new editor tab. Unresolved links
 * are rendered with reduced opacity and strikethrough, non-interactive.
 *
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.9, 3.10, 1.4
 */

import { useTranslation } from '../../i18n'
import type { LinkEntry } from '../../state/contextPanelState'

// ─── Props ───────────────────────────────────────────────────────────────────

export interface LinksViewProps {
  /** Forward links extracted from the active document */
  forwardLinks: LinkEntry[]
  /** Backlinks fetched from the backend */
  backlinks: LinkEntry[]
  /** Whether backlinks are currently being loaded */
  backlinksLoading: boolean
  /** Error message if backlinks API failed, or null */
  backlinksError: string | null
  /** Callback when a resolved link is clicked */
  onLinkClick: (target: string, resolved: boolean) => void
  /** Whether a document is currently open */
  hasDocument?: boolean
}

// ─── Component ───────────────────────────────────────────────────────────────

export function LinksView({
  forwardLinks,
  backlinks,
  backlinksLoading,
  backlinksError,
  onLinkClick,
  hasDocument = true,
}: LinksViewProps) {
  const { t } = useTranslation()

  // No document open
  if (!hasDocument) {
    return (
      <div className="context-panel-links-view">
        <p className="context-panel-links-placeholder">
          {t('contextPanel.links.noDocument')}
        </p>
      </div>
    )
  }

  return (
    <div className="context-panel-links-view">
      {/* Forward Links Section */}
      <section className="context-panel-links-section">
        <h3 className="context-panel-links-section-title">
          {t('contextPanel.links.forward')}
        </h3>
        {forwardLinks.length === 0 ? (
          <p className="context-panel-links-placeholder">
            {t('contextPanel.links.emptyForward')}
          </p>
        ) : (
          <ul className="context-panel-links-list">
            {forwardLinks.map((link, index) => (
              <LinkItem
                key={`forward-${link.target}-${index}`}
                link={link}
                onLinkClick={onLinkClick}
              />
            ))}
          </ul>
        )}
      </section>

      {/* Backlinks Section */}
      <section className="context-panel-links-section">
        <h3 className="context-panel-links-section-title">
          {t('contextPanel.links.backlinks')}
        </h3>
        {backlinksLoading ? (
          <p className="context-panel-links-loading">
            {t('contextPanel.links.backlinksLoading')}
          </p>
        ) : backlinksError ? (
          <p className="context-panel-links-error">
            {t('contextPanel.links.backlinksError')}
          </p>
        ) : backlinks.length === 0 ? (
          <p className="context-panel-links-placeholder">
            {t('contextPanel.links.emptyBacklinks')}
          </p>
        ) : (
          <ul className="context-panel-links-list">
            {backlinks.map((link, index) => (
              <LinkItem
                key={`backlink-${link.target}-${index}`}
                link={link}
                onLinkClick={onLinkClick}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

// ─── LinkItem Sub-Component ──────────────────────────────────────────────────

interface LinkItemProps {
  link: LinkEntry
  onLinkClick: (target: string, resolved: boolean) => void
}

function LinkItem({ link, onLinkClick }: LinkItemProps) {
  if (link.resolved) {
    return (
      <li className="context-panel-link-item context-panel-link-resolved">
        <button
          className="context-panel-link-button"
          onClick={() => onLinkClick(link.target, true)}
          title={link.target}
          type="button"
        >
          {link.displayName}
        </button>
      </li>
    )
  }

  return (
    <li className="context-panel-link-item context-panel-link-unresolved">
      <span title={link.target}>
        {link.displayName}
      </span>
    </li>
  )
}
