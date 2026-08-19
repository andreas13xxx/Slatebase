/**
 * PanelSplitContainer component — shared by both the left and right side panels.
 *
 * Renders split sections as vertically stacked areas with resize handles.
 * Each section displays its own TabBar (if it has multiple views) and
 * the active view content via the renderView prop.
 *
 * Supports:
 * - Drag-to-resize between sections (4px handle, 80px minimum height)
 * - Drop indicator when a tab is dragged below the TabBar threshold (30px)
 * - Section merge: removes empty sections when last view is dragged out
 * - Equal height redistribution among remaining sections after removal
 */

import { useRef, useState, useCallback, useEffect } from 'react'
import { PanelTabBar } from './PanelTabBar'
import type { PluginViewMeta } from './PanelTabBar'
import type { PanelSplitSection, PanelViewId } from '../../state/panelState'
import './PanelSplitContainer.css'

// ─── Constants ───────────────────────────────────────────────────────────────

/** Minimum section height in pixels. */
const MIN_SECTION_HEIGHT = 80

// ─── Props ───────────────────────────────────────────────────────────────────

export interface PanelSplitContainerProps {
  /** Array of split sections to render. */
  sections: PanelSplitSection[]
  /** Panel width in pixels (passed to TabBar for responsive behavior). */
  panelWidth: number
  /** Panel body height in pixels (used to compute minimum height fractions during resize). */
  panelHeight: number
  /** Callback when a tab is clicked within a section. */
  onTabClick: (sectionId: string, viewId: PanelViewId) => void
  /** Callback when tabs are reordered within a section. */
  onTabReorder: (sectionId: string, newOrder: PanelViewId[]) => void
  /** Callback when a tab is split into a new section. */
  onTabSplit: (viewId: PanelViewId) => void
  /** Callback when a tab is moved from one section to another. */
  onTabMove: (viewId: PanelViewId, targetSectionId: string) => void
  /** Callback when section heights change (array of fractions summing to 1). */
  onResize: (heightFractions: number[]) => void
  /** Render function that returns the view component for a given viewId. */
  renderView: (viewId: PanelViewId) => React.ReactNode
  /** Metadata for plugin views (icon + label lookup). Keyed by viewType. */
  pluginViewMeta?: Map<string, PluginViewMeta>
}

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * Renders split sections of a side panel as vertically stacked areas.
 * Each section has its own TabBar (if multiple views) and is separated by
 * a 4px resize handle from adjacent sections.
 */
export function PanelSplitContainer({
  sections,
  panelWidth,
  panelHeight,
  onTabClick,
  onTabReorder,
  onTabSplit,
  onTabMove,
  onResize,
  renderView,
  pluginViewMeta,
}: PanelSplitContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [resizingIndex, setResizingIndex] = useState<number | null>(null)
  const [showDropIndicator, setShowDropIndicator] = useState(false)
  const startYRef = useRef(0)
  const startFractionsRef = useRef<number[]>([])

  /** Step size for keyboard-driven resize (fraction of total height). */
  const KEYBOARD_STEP = 10 / (panelHeight || 1)

  // ─── Resize Logic ────────────────────────────────────────────────────────

  /** Handle mousedown on a resize handle between sections. */
  const handleResizeStart = useCallback((e: React.MouseEvent, handleIndex: number) => {
    e.preventDefault()
    setResizingIndex(handleIndex)
    startYRef.current = e.clientY
    startFractionsRef.current = sections.map((s) => s.heightFraction)
  }, [sections])

  /** Handle arrow key resize on a focused separator. */
  const handleResizeKeyDown = useCallback((e: React.KeyboardEvent, handleIndex: number) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
    e.preventDefault()

    const fractions = sections.map((s) => s.heightFraction)
    const topFraction = fractions[handleIndex]
    const bottomFraction = fractions[handleIndex + 1]
    if (topFraction === undefined || bottomFraction === undefined) return

    const delta = e.key === 'ArrowDown' ? KEYBOARD_STEP : -KEYBOARD_STEP
    const containerHeight = panelHeight || 1
    const minFraction = MIN_SECTION_HEIGHT / containerHeight

    let newTop = topFraction + delta
    let newBottom = bottomFraction - delta

    if (newTop < minFraction) {
      newTop = minFraction
      newBottom = topFraction + bottomFraction - minFraction
    }
    if (newBottom < minFraction) {
      newBottom = minFraction
      newTop = topFraction + bottomFraction - minFraction
    }

    fractions[handleIndex] = newTop
    fractions[handleIndex + 1] = newBottom
    onResize(fractions)
  }, [sections, panelHeight, onResize, KEYBOARD_STEP])

  /** Handle mouse movement during resize. Enforces 80px minimum height. */
  useEffect(() => {
    if (resizingIndex === null) return

    const handleMouseMove = (e: MouseEvent) => {
      const containerHeight = panelHeight
      if (containerHeight <= 0) return

      const deltaY = e.clientY - startYRef.current
      const deltaFraction = deltaY / containerHeight

      const fractions = [...startFractionsRef.current]
      const topFraction = fractions[resizingIndex]
      const bottomFraction = fractions[resizingIndex + 1]

      if (topFraction === undefined || bottomFraction === undefined) return

      // Calculate new fractions
      let newTop = topFraction + deltaFraction
      let newBottom = bottomFraction - deltaFraction

      // Enforce minimum height constraint (80px)
      const minFraction = MIN_SECTION_HEIGHT / containerHeight

      if (newTop < minFraction) {
        newTop = minFraction
        newBottom = topFraction + bottomFraction - minFraction
      }
      if (newBottom < minFraction) {
        newBottom = minFraction
        newTop = topFraction + bottomFraction - minFraction
      }

      fractions[resizingIndex] = newTop
      fractions[resizingIndex + 1] = newBottom

      onResize(fractions)
    }

    const handleMouseUp = () => {
      setResizingIndex(null)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [resizingIndex, onResize, panelHeight])

  // ─── Drop Indicator Logic ────────────────────────────────────────────────

  /** Handle dragover on the container body to show drop indicator for tab split. */
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'

    // Show drop indicator when dragging in the lower portion of the container
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect()
      const isInDropZone = e.clientY > rect.top + rect.height * 0.7
      setShowDropIndicator(isInDropZone)
    }
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    if (!containerRef.current?.contains(e.relatedTarget as Node)) {
      setShowDropIndicator(false)
    }
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setShowDropIndicator(false)

    // The tab split is triggered via the dataTransfer payload set by PanelTabBar
    const viewId = e.dataTransfer.getData('text/plain') as PanelViewId
    if (viewId) {
      onTabSplit(viewId)
    }
  }, [onTabSplit])

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div
      ref={containerRef}
      className={`side-panel-split-container${resizingIndex !== null ? ' side-panel-split-container--resizing' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {sections.map((section, index) => {
        const heightPercent = section.heightFraction * 100

        return (
          <div key={section.id} className="side-panel-split-wrapper">
            {/* Resize handle between sections (not before the first one) */}
            {index > 0 && (
              <div
                className={`side-panel-split-resize-handle${resizingIndex === index - 1 ? ' side-panel-split-resize-handle--active' : ''}`}
                onMouseDown={(e) => handleResizeStart(e, index - 1)}
                onKeyDown={(e) => handleResizeKeyDown(e, index - 1)}
                role="separator"
                aria-orientation="horizontal"
                aria-valuenow={Math.round(sections[index - 1]!.heightFraction * 100)}
                aria-valuemin={Math.round((MIN_SECTION_HEIGHT / (panelHeight || 1)) * 100)}
                aria-valuemax={100 - Math.round((MIN_SECTION_HEIGHT / (panelHeight || 1)) * 100)}
                aria-label="Bereichsgröße anpassen"
                tabIndex={0}
              />
            )}

            <div
              className="side-panel-split-section"
              style={{ height: `${heightPercent}%` }}
              data-section-id={section.id}
            >
              {/* Section TabBar — always shown in split mode, hidden in single-section mode */}
              {sections.length > 1 && (
                <PanelTabBar
                  tabs={section.viewIds}
                  activeTab={section.activeViewId}
                  sectionId={section.id}
                  onTabClick={(viewId) => onTabClick(section.id, viewId)}
                  onTabReorder={(newOrder) => onTabReorder(section.id, newOrder)}
                  onTabSplit={onTabSplit}
                  onTabReceive={onTabMove}
                  panelWidth={panelWidth}
                  pluginViewMeta={pluginViewMeta}
                />
              )}

              {/* Section content — renders the active view */}
              <div className="side-panel-split-content">
                {renderView(section.activeViewId)}
              </div>
            </div>
          </div>
        )
      })}

      {/* Drop indicator for creating a new section at the bottom */}
      {showDropIndicator && (
        <div className="side-panel-split-drop-indicator" aria-hidden="true">
          <div className="side-panel-split-drop-indicator-line" />
        </div>
      )}
    </div>
  )
}
