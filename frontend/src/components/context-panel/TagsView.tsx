/**
 * TagsView component for the Context Panel.
 *
 * Displays all tags found in the vault, sorted alphabetically (case-insensitive),
 * with occurrence counts. Clicking a tag expands it to show the list of files
 * containing that tag. Clicking a file opens it in a new editor tab.
 *
 * Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7
 */

import { useMemo } from 'react'
import { useTranslation } from '../../i18n'
import type { TagEntry } from '../../state/contextPanelState'

// ─── Props ───────────────────────────────────────────────────────────────────

export interface TagsViewProps {
  /** All tags in the vault with occurrence counts */
  tags: TagEntry[]
  /** Whether tags are currently being loaded */
  loading: boolean
  /** Currently expanded tag name, or null if none expanded */
  expandedTag: string | null
  /** Files containing the expanded tag */
  tagFiles: string[]
  /** Callback when a tag is clicked — parent handles toggle + fetching files */
  onTagClick: (tagName: string) => void
  /** Callback when a file in the expanded list is clicked — opens in editor */
  onFileClick: (filePath: string) => void
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Returns a display name for a file path by stripping the .md extension.
 * Non-.md files are displayed as-is.
 */
function getFileDisplayName(filePath: string): string {
  if (filePath.endsWith('.md')) {
    return filePath.slice(0, -3)
  }
  return filePath
}

// ─── Component ───────────────────────────────────────────────────────────────

export function TagsView({
  tags,
  loading,
  expandedTag,
  tagFiles,
  onTagClick,
  onFileClick,
}: TagsViewProps) {
  const { t } = useTranslation()

  // Sort tags alphabetically, case-insensitive
  const sortedTags = useMemo(() => {
    return [...tags].sort((a, b) =>
      a.name.toLowerCase().localeCompare(b.name.toLowerCase())
    )
  }, [tags])

  // Loading state
  if (loading) {
    return (
      <div className="context-panel-tags-view context-panel-tags-view--loading">
        <p className="context-panel-tags-placeholder">
          {t('common.loading')}
        </p>
      </div>
    )
  }

  // Empty state
  if (sortedTags.length === 0) {
    return (
      <div className="context-panel-tags-view context-panel-tags-view--empty">
        <p className="context-panel-tags-placeholder">
          {t('contextPanel.tags.empty')}
        </p>
      </div>
    )
  }

  return (
    <div className="context-panel-tags-view">
      <ul className="context-panel-tags-list">
        {sortedTags.map((tag) => {
          const isExpanded = expandedTag === tag.name

          return (
            <li key={tag.name} className="context-panel-tags-item">
              <button
                className={`context-panel-tags-button${isExpanded ? ' context-panel-tags-button--expanded' : ''}`}
                onClick={() => onTagClick(tag.name)}
                title={`#${tag.name} (${tag.count})`}
                aria-expanded={isExpanded}
              >
                <span className="context-panel-tags-name">{`#${tag.name}`}</span>
                <span className="context-panel-tags-count">({tag.count})</span>
              </button>
              {isExpanded && (
                <ul className="context-panel-tags-files">
                  {tagFiles.map((filePath) => (
                    <li key={filePath} className="context-panel-tags-file-item">
                      <button
                        className="context-panel-tags-file-button"
                        onClick={() => onFileClick(filePath)}
                        title={filePath}
                      >
                        {getFileDisplayName(filePath)}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
