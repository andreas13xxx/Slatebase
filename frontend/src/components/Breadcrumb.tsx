import { useState, useRef, useEffect, useCallback } from 'react'
import { ChevronRight, MoreHorizontal, Code2, Eye, BookOpen } from 'lucide-react'
import { useTranslation } from '../i18n'
import type { TranslationKey } from '../i18n'
import type { TabMode } from '../state/tabState'
import { useAppConfigValue } from '../state/vaultAppConfigStore'

export interface BreadcrumbProps {
  vaultName: string
  /** Path of the active file, relative to the vault root. Null hides the breadcrumb (Requirement 7.5). */
  filePath: string | null
  /** Called with a folder path ('' = vault root) when a segment is clicked. */
  onSegmentClick: (folderPath: string) => void
  /**
   * Current editor mode of the active tab. When set together with `onModeChange`,
   * the breadcrumb renders the Source/Live-Preview/Reading switcher at its right
   * end. Omit both for tabs that have no mode (binary, graph, canvas, plugin view).
   */
  mode?: TabMode
  /** Switches the active tab's mode. See `mode`. */
  onModeChange?: (mode: TabMode) => void
  /** Restricts the rotation to these modes, in order (a `.base` only has `reading` and `source`). */
  modes?: ReadonlyArray<TabMode>
}

interface Segment {
  label: string
  /** Folder path this segment reveals when clicked ('' = vault root). */
  path: string
}

/** Max segments (excluding the vault name and the filename) shown before collapsing into a "…" dropdown. */
const MAX_VISIBLE_MIDDLE_SEGMENTS = 2

/**
 * Breadcrumb — shows the active file's folder path as a chain of clickable segments,
 * each revealing the corresponding folder in the File Explorer when clicked.
 *
 * Validates: Requirements 7.1–7.7 of navigation-link-polish
 */
export function Breadcrumb({ vaultName, filePath, onSegmentClick, mode, onModeChange, modes }: BreadcrumbProps) {
  const showInlineTitle = useAppConfigValue('showInlineTitle')
  const [collapsedOpen, setCollapsedOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!collapsedOpen) return
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setCollapsedOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [collapsedOpen])

  const handleSegmentClick = useCallback((path: string) => {
    setCollapsedOpen(false)
    onSegmentClick(path)
  }, [onSegmentClick])

  if (filePath === null) return null

  const parts = filePath.split('/').filter(Boolean)
  const fileName = parts[parts.length - 1] ?? filePath
  const folderParts = parts.slice(0, -1)

  // Requirement 7.2: root-level files show only the vault name + filename.
  const folderSegments: Segment[] = []
  let acc = ''
  for (const part of folderParts) {
    acc = acc ? `${acc}/${part}` : part
    folderSegments.push({ label: part, path: acc })
  }

  // Requirement 7.6: collapse middle segments when there are too many, keeping the
  // vault name and the last two folder segments visible.
  const needsCollapse = folderSegments.length > MAX_VISIBLE_MIDDLE_SEGMENTS + 1
  const visibleTail = needsCollapse ? folderSegments.slice(-MAX_VISIBLE_MIDDLE_SEGMENTS) : folderSegments
  const hiddenMiddle = needsCollapse ? folderSegments.slice(0, folderSegments.length - MAX_VISIBLE_MIDDLE_SEGMENTS) : []

  return (
    <div className="breadcrumb" ref={containerRef} aria-label="Dateipfad">
      <button type="button" className="breadcrumb-segment" onClick={() => handleSegmentClick('')}>
        {vaultName}
      </button>

      {needsCollapse && (
        <>
          <ChevronRight size={12} className="breadcrumb-separator" aria-hidden="true" />
          <div className="breadcrumb-collapsed">
            <button
              type="button"
              className="breadcrumb-segment breadcrumb-segment--collapsed"
              onClick={() => setCollapsedOpen((v) => !v)}
              aria-expanded={collapsedOpen}
              aria-label="Weitere Ordner anzeigen"
              title="Weitere Ordner anzeigen"
            >
              <MoreHorizontal size={14} />
            </button>
            {collapsedOpen && (
              <ul className="breadcrumb-collapsed-menu" role="menu">
                {hiddenMiddle.map((segment) => (
                  <li key={segment.path} role="none">
                    <button
                      type="button"
                      role="menuitem"
                      className="breadcrumb-collapsed-item"
                      onClick={() => handleSegmentClick(segment.path)}
                    >
                      {segment.label}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      {visibleTail.map((segment) => (
        <div key={segment.path} className="breadcrumb-item">
          <ChevronRight size={12} className="breadcrumb-separator" aria-hidden="true" />
          <button type="button" className="breadcrumb-segment" onClick={() => handleSegmentClick(segment.path)}>
            {segment.label}
          </button>
        </div>
      ))}

      {/* A note's name is shown as the title at the top of the editor instead (inline title). */}
      {!(showInlineTitle && /\.md$/i.test(fileName)) && (
        <>
          <ChevronRight size={12} className="breadcrumb-separator" aria-hidden="true" />
          <span className="breadcrumb-filename" title={fileName}>{fileName}</span>
        </>
      )}

      {mode !== undefined && onModeChange && (
        <BreadcrumbModeSwitcher mode={mode} onModeChange={onModeChange} {...(modes ? { modes } : {})} />
      )}
    </div>
  )
}

/** Editor modes in rotation order, with their icon + i18n key. */
const MODE_ORDER: ReadonlyArray<{ mode: TabMode; icon: typeof Code2; labelKey: TranslationKey }> = [
  { mode: 'source', icon: Code2, labelKey: 'tabs.modeSource' },
  { mode: 'live-preview', icon: Eye, labelKey: 'tabs.modeLivePreview' },
  { mode: 'reading', icon: BookOpen, labelKey: 'tabs.modeReading' },
]

/**
 * Single editor-mode button at the right end of the breadcrumb. It shows the current mode's icon
 * and rotates to the next mode on each click (Source → Live Preview → Reading → Source). With
 * `modes` the rotation is restricted to those modes, in that order (a base: view ⇄ source).
 */
function BreadcrumbModeSwitcher({ mode, onModeChange, modes }: { mode: TabMode; onModeChange: (mode: TabMode) => void; modes?: ReadonlyArray<TabMode> }) {
  const { t } = useTranslation()
  const order = modes
    ? modes.flatMap((m) => MODE_ORDER.filter((entry) => entry.mode === m))
    : MODE_ORDER
  const currentIndex = Math.max(0, order.findIndex((entry) => entry.mode === mode))
  const current = order[currentIndex]
  const next = order[(currentIndex + 1) % order.length]
  if (!current || !next) return null
  const Icon = current.icon
  const label = `${t(current.labelKey)} → ${t(next.labelKey)}`
  return (
    <div className="breadcrumb-mode-switcher">
      <button type="button" aria-label={label} title={label} className="breadcrumb-mode-btn" onClick={() => onModeChange(next.mode)}>
        <Icon size={14} aria-hidden="true" />
      </button>
    </div>
  )
}
