/**
 * TagsView component for the Context Panel.
 *
 * Displays all tags found in the vault, sorted alphabetically (case-insensitive),
 * with occurrence counts. Nested tags (`#Rezepte/Hauptspeise`) are grouped into
 * the tree their names describe, so a family of tags collapses into one row.
 * Clicking a tag expands it to show the list of files containing that tag.
 * Clicking a file opens it in a new editor tab.
 *
 * Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7
 */

import { useMemo, useState } from 'react'
import { useTranslation } from '../../i18n'
import type { TagEntry } from '../../state/documentPanelData'
import { buildTagTree, type TagTreeNode } from './utils/tagTree'
import './TagsView.css'

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

/** Every ancestor path of a nested tag: `a/b/c` → `['a', 'a/b']`. */
function ancestorsOf(tagName: string): string[] {
  const segments = tagName.split('/')
  const result: string[] = []
  let path = ''
  for (const segment of segments.slice(0, -1)) {
    path = path === '' ? segment : `${path}/${segment}`
    result.push(path)
  }
  return result
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

  const tree = useMemo(() => buildTagTree(tags), [tags])

  // Branches start collapsed — a nested family reading as one `#Rezepte (12)`
  // row is the point of the tree. A vault with only flat tags has no branches
  // at all and looks exactly as it did.
  const [openBranches, setOpenBranches] = useState<ReadonlySet<string>>(() => new Set())

  // A tag whose file list is open has to be visible, even when the click came
  // from outside this panel — clicking `#Rezepte/Hauptspeise` in the rendered
  // document expands it here (see ViewMode's onTagClick).
  const revealed = useMemo(
    () => new Set(expandedTag === null ? [] : ancestorsOf(expandedTag)),
    [expandedTag],
  )

  const isBranchOpen = (name: string): boolean => openBranches.has(name) || revealed.has(name)

  function toggleBranch(name: string): void {
    // Collapsing a branch has to take the file list inside it along, or the
    // chevron would be a dead control: `revealed` holds the branch open.
    if (revealed.has(name) && expandedTag !== null) {
      onTagClick(expandedTag)
    }
    setOpenBranches((previous) => {
      const next = new Set(previous)
      if (!next.delete(name)) next.add(name)
      return next
    })
  }

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
  if (tree.length === 0) {
    return (
      <div className="context-panel-tags-view context-panel-tags-view--empty">
        <p className="context-panel-tags-placeholder">
          {t('contextPanel.tags.empty')}
        </p>
      </div>
    )
  }

  function renderNodes(nodes: TagTreeNode[], depth: number) {
    return nodes.map((node) => {
      const hasChildren = node.children.length > 0
      const branchOpen = hasChildren && isBranchOpen(node.name)
      const isExpanded = expandedTag === node.name
      // A node no note carries directly (`Rezepte` when only
      // `#Rezepte/Hauptspeise` exists) has no file list to open, so its row
      // works the chevron instead.
      const opensFiles = node.count > 0

      return (
        <li key={node.name} className="context-panel-tags-item">
          <div className="context-panel-tags-row" style={{ paddingLeft: `${depth * 0.75}rem` }}>
            {hasChildren ? (
              <button
                className="context-panel-tags-toggle"
                onClick={() => toggleBranch(node.name)}
                aria-expanded={branchOpen}
                aria-label={t(
                  branchOpen ? 'contextPanel.tags.collapseBranch' : 'contextPanel.tags.expandBranch',
                  { tag: node.name },
                )}
              >
                <span aria-hidden="true">{branchOpen ? '▾' : '▸'}</span>
              </button>
            ) : (
              <span className="context-panel-tags-toggle-spacer" aria-hidden="true" />
            )}
            <button
              className={`context-panel-tags-button${isExpanded ? ' context-panel-tags-button--expanded' : ''}`}
              onClick={() => (opensFiles ? onTagClick(node.name) : toggleBranch(node.name))}
              title={`#${node.name} (${node.totalCount})`}
              aria-expanded={opensFiles ? isExpanded : branchOpen}
            >
              <span className="context-panel-tags-name">
                {depth === 0 ? `#${node.segment}` : node.segment}
              </span>
              <span className="context-panel-tags-count">({node.totalCount})</span>
            </button>
          </div>

          {isExpanded && (
            <ul className="context-panel-tags-files" style={{ paddingLeft: `${depth * 0.75 + 1}rem` }}>
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

          {branchOpen && (
            <ul className="context-panel-tags-list">
              {renderNodes(node.children, depth + 1)}
            </ul>
          )}
        </li>
      )
    })
  }

  return (
    <div className="context-panel-tags-view">
      <ul className="context-panel-tags-list">
        {renderNodes(tree, 0)}
      </ul>
    </div>
  )
}
