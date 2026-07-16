import { useState, useMemo, useCallback } from 'react'
import { useTranslation } from '../../i18n'
import { computeDiff, isTextFile, groupHunks } from './diff-utils'
import type { DiffHunk, GroupedHunk } from './diff-utils'
import './DiffView.css'

/** Props for the DiffView component. */
export interface DiffViewProps {
  /** Local file content (null if unavailable/deleted). */
  localContent: string | null
  /** Remote file content (null if unavailable/deleted). */
  remoteContent: string | null
  /** File path (used for binary detection and display). */
  filePath: string
  /** Display mode: side-by-side or unified. */
  mode: 'side-by-side' | 'unified'
  /** Callback when user chooses local version. */
  onUseLocal: () => void
  /** Callback when user chooses remote version. */
  onUseRemote: () => void
  /** Callback when user wants to manually merge. */
  onManualMerge: () => void
}

/** Context lines shown above/below changes before collapsing. */
const CONTEXT_LINES = 3

/**
 * DiffView renders a visual diff between local and remote file versions.
 * Supports Side-by-Side and Unified modes, collapsible identical sections,
 * and binary file fallback (metadata only).
 */
export function DiffView({
  localContent,
  remoteContent,
  filePath,
  mode,
  onUseLocal,
  onUseRemote,
  onManualMerge,
}: DiffViewProps) {
  const { t } = useTranslation()

  // Binary file fallback: show metadata only
  if (!isTextFile(filePath) || localContent === null || remoteContent === null) {
    return (
      <div className="diff-view diff-view--binary">
        <p className="diff-view__binary-notice">
          {t('sync.conflictWizard.diffBinaryFile')}
        </p>
        <div className="diff-view__binary-meta" role="presentation">
          {localContent !== null && (
            <div className="diff-view__binary-side">
              <strong>{t('sync.conflictWizard.diffLocalVersion')}</strong>
              <span>{formatByteSize(localContent.length)}</span>
            </div>
          )}
          {remoteContent !== null && (
            <div className="diff-view__binary-side">
              <strong>{t('sync.conflictWizard.diffRemoteVersion')}</strong>
              <span>{formatByteSize(remoteContent.length)}</span>
            </div>
          )}
        </div>
        <DiffActionButtons
          onUseLocal={onUseLocal}
          onUseRemote={onUseRemote}
          onManualMerge={onManualMerge}
          showManualMerge={false}
        />
      </div>
    )
  }

  // Compute diff and group hunks
  const groupedHunks = useMemo(() => {
    const hunks = computeDiff(localContent, remoteContent)
    return groupHunks(hunks, CONTEXT_LINES)
  }, [localContent, remoteContent])

  return (
    <div className="diff-view">
      {/* Diff content */}
      <div className="diff-view__content">
        {mode === 'side-by-side' ? (
          <SideBySideView groupedHunks={groupedHunks} />
        ) : (
          <UnifiedView groupedHunks={groupedHunks} />
        )}
      </div>

      {/* Action buttons */}
      <DiffActionButtons
        onUseLocal={onUseLocal}
        onUseRemote={onUseRemote}
        onManualMerge={onManualMerge}
        showManualMerge={true}
      />
    </div>
  )
}

// ─── Side-by-Side View ───────────────────────────────────────────────────────

interface SideBySideViewProps {
  groupedHunks: GroupedHunk[]
}

/** Side-by-Side diff: local (left) vs remote (right) with line numbers. */
function SideBySideView({ groupedHunks }: SideBySideViewProps) {
  const { t } = useTranslation()
  const [expandedCollapsed, setExpandedCollapsed] = useState<Set<number>>(new Set())

  const toggleCollapsed = useCallback((index: number) => {
    setExpandedCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(index)) {
        next.delete(index)
      } else {
        next.add(index)
      }
      return next
    })
  }, [])

  return (
    <div className="diff-view__side-by-side" role="presentation">
      {/* Header row */}
      <div className="diff-view__side-by-side-header">
        <span className="diff-view__column-label">{t('sync.conflictWizard.diffLocalVersion')}</span>
        <span className="diff-view__column-label">{t('sync.conflictWizard.diffRemoteVersion')}</span>
      </div>

      {/* Content rows */}
      <div className="diff-view__side-by-side-body">
        {groupedHunks.map((group, groupIdx) => {
          // Collapsed section
          if (group.collapsedLineCount != null && group.collapsedLineCount > 0) {
            if (expandedCollapsed.has(groupIdx)) {
              // Expanded — show as equal lines (we don't store original lines in collapsed group)
              // This is a simplified expand that shows the count only — actual expansion
              // would need to re-compute from original hunks. For UX, show a toggle.
              return (
                <button
                  key={`collapsed-${groupIdx}`}
                  className="diff-view__collapsed-btn diff-view__collapsed-btn--expanded"
                  onClick={() => toggleCollapsed(groupIdx)}
                  aria-label={t('sync.conflictWizard.diffIdenticalLines', {
                    count: String(group.collapsedLineCount),
                  })}
                >
                  {t('sync.conflictWizard.diffIdenticalLines', {
                    count: String(group.collapsedLineCount),
                  })}
                </button>
              )
            }
            return (
              <button
                key={`collapsed-${groupIdx}`}
                className="diff-view__collapsed-btn"
                onClick={() => toggleCollapsed(groupIdx)}
                aria-label={t('sync.conflictWizard.diffIdenticalLines', {
                  count: String(group.collapsedLineCount),
                })}
              >
                {t('sync.conflictWizard.diffIdenticalLines', {
                  count: String(group.collapsedLineCount),
                })}
              </button>
            )
          }

          // Regular hunks in this group
          return (
            <div key={`group-${groupIdx}`} className="diff-view__hunk-group">
              {group.hunks.map((hunk, hunkIdx) => (
                <SideBySideHunk key={`${groupIdx}-${hunkIdx}`} hunk={hunk} />
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}

interface SideBySideHunkProps {
  hunk: DiffHunk
}

/** Renders a single hunk in side-by-side mode. */
function SideBySideHunk({ hunk }: SideBySideHunkProps) {
  if (hunk.type === 'equal') {
    return (
      <>
        {hunk.lines.map((line, i) => (
          <div key={i} className="diff-view__row diff-view__row--equal">
            <span className="diff-view__line-number">{hunk.oldStart + i + 1}</span>
            <span className="diff-view__line diff-view__line--equal">{line || '\u00A0'}</span>
            <span className="diff-view__line-number">{hunk.newStart + i + 1}</span>
            <span className="diff-view__line diff-view__line--equal">{line || '\u00A0'}</span>
          </div>
        ))}
      </>
    )
  }

  if (hunk.type === 'delete') {
    return (
      <>
        {hunk.lines.map((line, i) => (
          <div key={i} className="diff-view__row diff-view__row--removed">
            <span className="diff-view__line-number">{hunk.oldStart + i + 1}</span>
            <span className="diff-view__line diff-view__line--removed">{line || '\u00A0'}</span>
            <span className="diff-view__line-number" role="presentation" />
            <span className="diff-view__line diff-view__line--empty" role="presentation" />
          </div>
        ))}
      </>
    )
  }

  // insert
  return (
    <>
      {hunk.lines.map((line, i) => (
        <div key={i} className="diff-view__row diff-view__row--added">
          <span className="diff-view__line-number" role="presentation" />
          <span className="diff-view__line diff-view__line--empty" role="presentation" />
          <span className="diff-view__line-number">{hunk.newStart + i + 1}</span>
          <span className="diff-view__line diff-view__line--added">{line || '\u00A0'}</span>
        </div>
      ))}
    </>
  )
}

// ─── Unified View ────────────────────────────────────────────────────────────

interface UnifiedViewProps {
  groupedHunks: GroupedHunk[]
}

/** Unified diff: single column with +/- prefixes. */
function UnifiedView({ groupedHunks }: UnifiedViewProps) {
  const { t } = useTranslation()
  const [expandedCollapsed, setExpandedCollapsed] = useState<Set<number>>(new Set())

  const toggleCollapsed = useCallback((index: number) => {
    setExpandedCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(index)) {
        next.delete(index)
      } else {
        next.add(index)
      }
      return next
    })
  }, [])

  return (
    <div className="diff-view__unified" role="presentation">
      {groupedHunks.map((group, groupIdx) => {
        // Collapsed section
        if (group.collapsedLineCount != null && group.collapsedLineCount > 0) {
          if (expandedCollapsed.has(groupIdx)) {
            return (
              <button
                key={`collapsed-${groupIdx}`}
                className="diff-view__collapsed-btn diff-view__collapsed-btn--expanded"
                onClick={() => toggleCollapsed(groupIdx)}
                aria-label={t('sync.conflictWizard.diffIdenticalLines', {
                  count: String(group.collapsedLineCount),
                })}
              >
                {t('sync.conflictWizard.diffIdenticalLines', {
                  count: String(group.collapsedLineCount),
                })}
              </button>
            )
          }
          return (
            <button
              key={`collapsed-${groupIdx}`}
              className="diff-view__collapsed-btn"
              onClick={() => toggleCollapsed(groupIdx)}
              aria-label={t('sync.conflictWizard.diffIdenticalLines', {
                count: String(group.collapsedLineCount),
              })}
            >
              {t('sync.conflictWizard.diffIdenticalLines', {
                count: String(group.collapsedLineCount),
              })}
            </button>
          )
        }

        // Regular hunks
        return (
          <div key={`group-${groupIdx}`} className="diff-view__hunk-group">
            {group.hunks.map((hunk, hunkIdx) => (
              <UnifiedHunk key={`${groupIdx}-${hunkIdx}`} hunk={hunk} />
            ))}
          </div>
        )
      })}
    </div>
  )
}

interface UnifiedHunkProps {
  hunk: DiffHunk
}

/** Renders a single hunk in unified mode. */
function UnifiedHunk({ hunk }: UnifiedHunkProps) {
  if (hunk.type === 'equal') {
    return (
      <>
        {hunk.lines.map((line, i) => (
          <div key={i} className="diff-view__row diff-view__row--equal">
            <span className="diff-view__line-number">{hunk.oldStart + i + 1}</span>
            <span className="diff-view__line-number">{hunk.newStart + i + 1}</span>
            <span className="diff-view__prefix" role="presentation">{' '}</span>
            <span className="diff-view__line diff-view__line--equal">{line || '\u00A0'}</span>
          </div>
        ))}
      </>
    )
  }

  if (hunk.type === 'delete') {
    return (
      <>
        {hunk.lines.map((line, i) => (
          <div key={i} className="diff-view__row diff-view__row--removed">
            <span className="diff-view__line-number">{hunk.oldStart + i + 1}</span>
            <span className="diff-view__line-number" role="presentation" />
            <span className="diff-view__prefix">-</span>
            <span className="diff-view__line diff-view__line--removed">{line || '\u00A0'}</span>
          </div>
        ))}
      </>
    )
  }

  // insert
  return (
    <>
      {hunk.lines.map((line, i) => (
        <div key={i} className="diff-view__row diff-view__row--added">
          <span className="diff-view__line-number" role="presentation" />
          <span className="diff-view__line-number">{hunk.newStart + i + 1}</span>
          <span className="diff-view__prefix">+</span>
          <span className="diff-view__line diff-view__line--added">{line || '\u00A0'}</span>
        </div>
      ))}
    </>
  )
}

// ─── Action Buttons ──────────────────────────────────────────────────────────

interface DiffActionButtonsProps {
  onUseLocal: () => void
  onUseRemote: () => void
  onManualMerge: () => void
  showManualMerge: boolean
}

/** Action buttons at the bottom of the diff view. */
function DiffActionButtons({ onUseLocal, onUseRemote, onManualMerge, showManualMerge }: DiffActionButtonsProps) {
  const { t } = useTranslation()

  return (
    <div className="diff-view__actions">
      <button
        className="diff-view__btn diff-view__btn--primary"
        onClick={onUseLocal}
        aria-label={t('sync.conflictWizard.buttonsUseLocal')}
      >
        {t('sync.conflictWizard.buttonsUseLocal')}
      </button>
      <button
        className="diff-view__btn diff-view__btn--primary"
        onClick={onUseRemote}
        aria-label={t('sync.conflictWizard.buttonsUseRemote')}
      >
        {t('sync.conflictWizard.buttonsUseRemote')}
      </button>
      {showManualMerge && (
        <button
          className="diff-view__btn diff-view__btn--secondary"
          onClick={onManualMerge}
          aria-label={t('sync.conflictWizard.buttonsManualMerge')}
        >
          {t('sync.conflictWizard.buttonsManualMerge')}
        </button>
      )}
    </div>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Formats byte count to human-readable size string. */
function formatByteSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
