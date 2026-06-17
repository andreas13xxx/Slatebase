/**
 * SidebarSplitContainer component.
 *
 * Renders split sections as vertically stacked areas with resize handles.
 * Each section displays its own TabBar (if multiple views) and
 * the active view content via the renderView prop.
 *
 * Identical behavior to the right-side SplitSectionContainer but typed
 * for SidebarViewId and SidebarSplitSection.
 */

import { useRef, useState, useCallback, useEffect } from 'react'
import { SidebarPanelTabBar } from './SidebarPanelTabBar'
import type { SidebarSplitSection, SidebarViewId } from '../../state/sidebarPanelState'
import './SidebarSplitContainer.css'

// ─── Constants ───────────────────────────────────────────────────────────────

/** Minimum section height in pixels. */
const MIN_SECTION_HEIGHT = 80

// ─── Props ───────────────────────────────────────────────────────────────────

export interface SidebarSplitContainerProps {
  /** Array of split sections to render. */
  sections: SidebarSplitSection[]
  /** Panel width in pixels (passed to TabBar for responsive behavior). */
  panelWidth: number
  /** Panel body height in pixels (used to compute minimum height fractions during resize). */
  panelHeight: number
  /** Callback when a tab is clicked within a section. */
  onTabClick: (sectionId: string, viewId: SidebarViewId) => void
  /** Callback when tabs are reordered within a section. */
  onTabReorder: (sectionId: string, newOrder: SidebarViewId[]) => void
  /** Callback when a tab is split into a new section. */
  onTabSplit: (viewId: SidebarViewId) => void
  /** Callback when a tab is moved from one section to another. */
  onTabMove: (viewId: SidebarViewId, targetSectionId: string) => void
  /** Callback when section heights change (array of fractions summing to 1). */
  onResize: (heightFractions: number[]) => void
  /** Render function that returns the view component for a given viewId. */
  renderView: (viewId: SidebarViewId) => React.ReactNode
}

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * Renders split sections of the sidebar panel as vertically stacked areas.
 * Each section has its own TabBar (if multiple views) and is separated by
 * a 4px resize handle from adjacent sections.
 */
export function SidebarSplitContainer({
  sections,
  panelWidth,
  panelHeight,
  onTabClick,
  onTabReorder,
  onTabSplit,
  onTabMove,
  onResize,
  renderView,
}: SidebarSplitContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [resizingIndex, setResizingIndex] = useState<number | null>(null)
  const [showDropIndicator, setShowDropIndicator] = useState(false)
  const startYRef = useRef(0)
  const startFractionsRef = useRef<number[]>([])

  // ─── Resize Logic ────────────────────────────────────────────────────────

  const handleResizeStart = useCallback((e: React.MouseEvent, handleIndex: number) => {
    e.preventDefault()
    setResizingIndex(handleIndex)
    startYRef.current = e.clientY
    startFractionsRef.current = sections.map((s) => s.heightFraction)
  }, [sections])

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

      let newTop = topFraction + deltaFraction
      let newBottom = bottomFraction - deltaFraction

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

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'

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

    const viewId = e.dataTransfer.getData('text/plain') as SidebarViewId
    if (viewId) {
      onTabSplit(viewId)
    }
  }, [onTabSplit])

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div
      ref={containerRef}
      className={`sidebar-split-container${resizingIndex !== null ? ' sidebar-split-container--resizing' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {sections.map((section, index) => {
        const heightPercent = section.heightFraction * 100

        return (
          <div key={section.id} className="sidebar-split-wrapper">
            {index > 0 && (
              <div
                className={`sidebar-split-resize-handle${resizingIndex === index - 1 ? ' sidebar-split-resize-handle--active' : ''}`}
                onMouseDown={(e) => handleResizeStart(e, index - 1)}
                role="separator"
                aria-orientation="horizontal"
                aria-label="Bereichsgröße anpassen"
              />
            )}

            <div
              className="sidebar-split-section"
              style={{ height: `${heightPercent}%` }}
              data-section-id={section.id}
            >
              {sections.length > 1 && (
                <SidebarPanelTabBar
                  tabs={section.viewIds}
                  activeTab={section.activeViewId}
                  sectionId={section.id}
                  onTabClick={(viewId) => onTabClick(section.id, viewId)}
                  onTabReorder={(newOrder) => onTabReorder(section.id, newOrder)}
                  onTabSplit={onTabSplit}
                  onTabReceive={onTabMove}
                  panelWidth={panelWidth}
                />
              )}

              <div className="sidebar-split-content">
                {renderView(section.activeViewId)}
              </div>
            </div>
          </div>
        )
      })}

      {showDropIndicator && (
        <div className="sidebar-split-drop-indicator" aria-hidden="true">
          <div className="sidebar-split-drop-indicator-line" />
        </div>
      )}
    </div>
  )
}
