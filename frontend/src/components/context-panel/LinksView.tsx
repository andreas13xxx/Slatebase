/**
 * LinksView component for the Context Panel.
 *
 * Displays three sections: "Ausgehende Links" (forward links), "Eingehende
 * Links" (backlinks), and "Ungelinkte Erwähnungen" (unlinked mentions).
 * Resolved links are clickable and open the target document in a new editor
 * tab. Unresolved links are rendered with reduced opacity and strikethrough,
 * non-interactive.
 *
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.9, 3.10, 1.4
 * Ungelinkte Erwähnungen — Requirements 2.1, 2.5, 2.6, 2.7, 2.8
 */

import { useState, useCallback } from 'react'
import { useTranslation } from '../../i18n'
import type { LinkEntry, UnlinkedMentionEntry } from '../../state/documentPanelData'
import './LinksView.css'

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
  /** Ungelinkte_Erwähnungen found for the active document */
  unlinkedMentions: UnlinkedMentionEntry[]
  /** Whether the unlinked-mentions search is currently in flight */
  unlinkedMentionsLoading: boolean
  /** Error message if the unlinked-mentions search failed, or null */
  unlinkedMentionsError: string | null
  /** Callback when a resolved link is clicked */
  onLinkClick: (target: string, resolved: boolean) => void
  /** Callback when an unlinked mention is clicked (opens the file) */
  onUnlinkedMentionClick: (filePath: string) => void
  /** Callback when the "Verlinken" action is triggered for an unlinked mention */
  onLinkMention: (entry: UnlinkedMentionEntry) => Promise<void>
  /** Whether a document is currently open */
  hasDocument?: boolean
}

// ─── Component ───────────────────────────────────────────────────────────────

export function LinksView({
  forwardLinks,
  backlinks,
  backlinksLoading,
  backlinksError,
  unlinkedMentions,
  unlinkedMentionsLoading,
  unlinkedMentionsError,
  onLinkClick,
  onUnlinkedMentionClick,
  onLinkMention,
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

      {/* Unlinked Mentions Section */}
      <section className="context-panel-links-section">
        <h3 className="context-panel-links-section-title">
          {t('contextPanel.links.unlinkedMentions')}
        </h3>
        {unlinkedMentionsLoading ? (
          <p className="context-panel-links-loading">
            {t('contextPanel.links.unlinkedMentionsLoading')}
          </p>
        ) : unlinkedMentionsError ? (
          <p className="context-panel-links-error">
            {t('contextPanel.links.unlinkedMentionsError')}
          </p>
        ) : unlinkedMentions.length === 0 ? (
          <p className="context-panel-links-placeholder">
            {t('contextPanel.links.emptyUnlinkedMentions')}
          </p>
        ) : (
          <ul className="context-panel-links-list">
            {unlinkedMentions.map((entry) => (
              <UnlinkedMentionItem
                key={entry.filePath}
                entry={entry}
                onClick={onUnlinkedMentionClick}
                onLinkMention={onLinkMention}
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

// ─── UnlinkedMentionItem Sub-Component ────────────────────────────────────────

interface UnlinkedMentionItemProps {
  entry: UnlinkedMentionEntry
  onClick: (filePath: string) => void
  onLinkMention: (entry: UnlinkedMentionEntry) => Promise<void>
}

function UnlinkedMentionItem({ entry, onClick, onLinkMention }: UnlinkedMentionItemProps) {
  const { t } = useTranslation()
  const [linking, setLinking] = useState(false)

  const handleLinkClick = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation()
    setLinking(true)
    try {
      await onLinkMention(entry)
    } finally {
      setLinking(false)
    }
  }, [entry, onLinkMention])

  return (
    <li className="context-panel-link-item context-panel-unlinked-mention-item">
      <button
        className="context-panel-link-button context-panel-unlinked-mention-button"
        onClick={() => onClick(entry.filePath)}
        title={entry.filePath}
        type="button"
      >
        <span className="context-panel-unlinked-mention-path">{entry.filePath}</span>
        <span className="context-panel-unlinked-mention-snippet">{entry.snippet}</span>
      </button>
      <button
        className="context-panel-unlinked-mention-link-button"
        onClick={(e) => void handleLinkClick(e)}
        disabled={linking}
        type="button"
      >
        {linking ? t('contextPanel.links.linking') : t('contextPanel.links.linkMention')}
      </button>
    </li>
  )
}
