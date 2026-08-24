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

import { useState, useCallback, type ReactNode } from 'react'
import { FileText, FolderOpen, Pencil, Trash2, ChevronDown, ChevronRight } from 'lucide-react'
import { useTranslation } from '../../i18n'
import type { LinkEntry, UnlinkedMentionEntry } from '../../state/documentPanelData'
import { ContextMenu, type ContextMenuItem } from '../ContextMenu'
import { buildTFileFromPath } from '../../plugins/compat/plugin-event-bridge'
import { buildPluginMenuItems } from '../../plugins/compat/plugin-menu-bridge'
import { revealInExplorer, renameInExplorer, deleteInExplorer } from '../../state/fileNavigation'
import './LinksView.css'

/** Builds the shared 'open/reveal/rename/delete + plugin file-menu items' menu for a resolved file path. */
function buildFileMenuItems(path: string, onOpen: () => void): ContextMenuItem[] {
  const file = buildTFileFromPath(path)
  return [
    { id: 'open', label: 'Öffnen', icon: <FileText size={14} />, run: onOpen },
    { id: 'reveal', label: 'Im Explorer zeigen', icon: <FolderOpen size={14} />, run: () => revealInExplorer(path) },
    { id: 'rename', label: 'Umbenennen', icon: <Pencil size={14} />, run: () => renameInExplorer(path) },
    { id: 'delete', label: 'Löschen', icon: <Trash2 size={14} />, run: () => deleteInExplorer(path) },
    ...buildPluginMenuItems('file-menu', [file, 'link-context-menu'], 'links-view-plugin-menu'),
  ]
}

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

// ─── CollapsibleSection Sub-Component ─────────────────────────────────────────

interface CollapsibleSectionProps {
  title: string
  count: number
  children: ReactNode
}

/** A links section with a click-to-collapse header showing the item count. */
function CollapsibleSection({ title, count, children }: CollapsibleSectionProps) {
  const { t } = useTranslation()
  const [collapsed, setCollapsed] = useState(false)

  return (
    <section className="context-panel-links-section">
      <button
        type="button"
        className="context-panel-links-section-header"
        onClick={() => setCollapsed((prev) => !prev)}
        aria-expanded={!collapsed}
        aria-label={
          collapsed
            ? t('contextPanel.links.expandSection', { section: title })
            : t('contextPanel.links.collapseSection', { section: title })
        }
      >
        {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
        <h3 className="context-panel-links-section-title">{title}</h3>
        <span className="context-panel-links-section-count">{count}</span>
      </button>
      {!collapsed && children}
    </section>
  )
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
      <CollapsibleSection title={t('contextPanel.links.forward')} count={forwardLinks.length}>
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
      </CollapsibleSection>

      {/* Backlinks Section */}
      <CollapsibleSection title={t('contextPanel.links.backlinks')} count={backlinks.length}>
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
      </CollapsibleSection>

      {/* Unlinked Mentions Section */}
      <CollapsibleSection title={t('contextPanel.links.unlinkedMentions')} count={unlinkedMentions.length}>
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
      </CollapsibleSection>
    </div>
  )
}

// ─── LinkItem Sub-Component ──────────────────────────────────────────────────

interface LinkItemProps {
  link: LinkEntry
  onLinkClick: (target: string, resolved: boolean) => void
}

function LinkItem({ link, onLinkClick }: LinkItemProps) {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)

  if (link.resolved) {
    return (
      <li className="context-panel-link-item context-panel-link-resolved">
        <button
          className="context-panel-link-button"
          onClick={() => onLinkClick(link.target, true)}
          onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY }) }}
          title={link.target}
          type="button"
        >
          {link.displayName}
        </button>
        {contextMenu && (
          <ContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            items={buildFileMenuItems(link.target, () => onLinkClick(link.target, true))}
            onClose={() => setContextMenu(null)}
            onSelect={() => setContextMenu(null)}
          />
        )}
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
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)

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
        onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY }) }}
        title={entry.filePath}
        type="button"
      >
        <span className="context-panel-unlinked-mention-path">{entry.filePath}</span>
        <span className="context-panel-unlinked-mention-snippet">{entry.snippet}</span>
      </button>
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={buildFileMenuItems(entry.filePath, () => onClick(entry.filePath))}
          onClose={() => setContextMenu(null)}
          onSelect={() => setContextMenu(null)}
        />
      )}
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
