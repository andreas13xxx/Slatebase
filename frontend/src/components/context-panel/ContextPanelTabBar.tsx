import { useState, useRef, useCallback } from 'react'
import { List, Link, Tag, FileText } from 'lucide-react'
import type { ContextPanelViewId } from '../../state/contextPanelState'
import './ContextPanelTabBar.css'

/** Tab metadata mapping view IDs to icons and labels. */
const TAB_CONFIG: Record<ContextPanelViewId, { icon: typeof List; label: string }> = {
  outline: { icon: List, label: 'Gliederung' },
  links: { icon: Link, label: 'Links' },
  tags: { icon: Tag, label: 'Tags' },
  properties: { icon: FileText, label: 'Eigenschaften' },
}

export interface ContextPanelTabBarProps {
  tabs: ContextPanelViewId[]
  activeTab: ContextPanelViewId
  sectionId?: string
  onTabClick: (viewId: ContextPanelViewId) => void
  onTabReorder: (newOrder: ContextPanelViewId[]) => void
  onTabSplit: (viewId: ContextPanelViewId) => void
  onTabReceive?: (viewId: ContextPanelViewId, targetSectionId: string) => void
  panelWidth: number
}

/**
 * Tab bar for the context panel with drag-and-drop reordering and split support.
 * Shows only icons with labels as tooltips on hover.
 * Supports HTML5 Drag API for reordering tabs and splitting into new sections.
 */
export function ContextPanelTabBar({
  tabs,
  activeTab,
  sectionId,
  onTabClick,
  onTabReorder,
  onTabSplit,
  onTabReceive,
  panelWidth: _panelWidth,
}: ContextPanelTabBarProps) {
  const [draggedTab, setDraggedTab] = useState<ContextPanelViewId | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)
  const tabBarRef = useRef<HTMLDivElement>(null)

  // Tabs are always draggable in split mode (sectionId provided) or when multiple tabs exist
  const isDraggable = sectionId !== undefined || tabs.length > 1

  const handleDragStart = useCallback((e: React.DragEvent, viewId: ContextPanelViewId) => {
    if (!isDraggable) {
      e.preventDefault()
      return
    }
    setDraggedTab(viewId)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', viewId)
  }, [isDraggable])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'

    if (!tabBarRef.current) return

    const tabBarRect = tabBarRef.current.getBoundingClientRect()

    // Detect if dragging below the tab bar (30px threshold for split) — only for local drags
    if (draggedTab && e.clientY > tabBarRect.bottom + 30) {
      setDropIndex(null)
      return
    }

    // Detect if outside tab bar boundaries horizontally or above
    if (
      e.clientX < tabBarRect.left ||
      e.clientX > tabBarRect.right ||
      e.clientY < tabBarRect.top ||
      e.clientY > tabBarRect.bottom
    ) {
      setDropIndex(null)
      return
    }

    // Calculate drop index based on pointer position relative to tab elements
    const tabElements = tabBarRef.current.querySelectorAll('[data-tab-id]')
    let newDropIndex = tabs.length

    for (let i = 0; i < tabElements.length; i++) {
      const tabEl = tabElements[i] as HTMLElement
      const rect = tabEl.getBoundingClientRect()
      const midX = rect.left + rect.width / 2

      if (e.clientX < midX) {
        newDropIndex = i
        break
      }
    }

    // Don't show insertion line at the dragged tab's current position or adjacent
    if (draggedTab) {
      const draggedIndex = tabs.indexOf(draggedTab)
      if (newDropIndex === draggedIndex || newDropIndex === draggedIndex + 1) {
        setDropIndex(null)
      } else {
        setDropIndex(newDropIndex)
      }
    } else {
      // Cross-section drag — always show insertion indicator
      setDropIndex(newDropIndex)
    }
  }, [draggedTab, tabs])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    // Only reset if actually leaving the tab bar (not entering a child)
    if (!tabBarRef.current?.contains(e.relatedTarget as Node)) {
      setDropIndex(null)
    }
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()

    const droppedViewId = e.dataTransfer.getData('text/plain') as ContextPanelViewId

    if (!tabBarRef.current) {
      setDraggedTab(null)
      setDropIndex(null)
      return
    }

    const tabBarRect = tabBarRef.current.getBoundingClientRect()

    // Check if dropped 30px below the tab bar → split
    if (draggedTab && e.clientY > tabBarRect.bottom + 30) {
      onTabSplit(draggedTab)
      setDraggedTab(null)
      setDropIndex(null)
      return
    }

    // Check if dropped outside tab bar boundaries → no-op
    if (
      e.clientX < tabBarRect.left ||
      e.clientX > tabBarRect.right ||
      e.clientY < tabBarRect.top ||
      e.clientY > tabBarRect.bottom
    ) {
      setDraggedTab(null)
      setDropIndex(null)
      return
    }

    // If the dropped tab is from another section (not in our tabs), handle cross-section move
    if (droppedViewId && !tabs.includes(droppedViewId) && sectionId && onTabReceive) {
      onTabReceive(droppedViewId, sectionId)
      setDraggedTab(null)
      setDropIndex(null)
      return
    }

    // Same-section reorder
    if (!draggedTab) {
      setDraggedTab(null)
      setDropIndex(null)
      return
    }

    // Calculate final drop index
    const tabElements = tabBarRef.current.querySelectorAll('[data-tab-id]')
    let finalDropIndex = tabs.length

    for (let i = 0; i < tabElements.length; i++) {
      const tabEl = tabElements[i] as HTMLElement
      const rect = tabEl.getBoundingClientRect()
      const midX = rect.left + rect.width / 2

      if (e.clientX < midX) {
        finalDropIndex = i
        break
      }
    }

    // Perform reorder
    const draggedIndex = tabs.indexOf(draggedTab)
    if (draggedIndex !== -1 && finalDropIndex !== draggedIndex && finalDropIndex !== draggedIndex + 1) {
      const newOrder = [...tabs]
      newOrder.splice(draggedIndex, 1)
      // Adjust index after removal
      const insertAt = finalDropIndex > draggedIndex ? finalDropIndex - 1 : finalDropIndex
      newOrder.splice(insertAt, 0, draggedTab)
      onTabReorder(newOrder)
    }

    setDraggedTab(null)
    setDropIndex(null)
  }, [draggedTab, tabs, sectionId, onTabReorder, onTabSplit, onTabReceive])

  const handleDragEnd = useCallback(() => {
    setDraggedTab(null)
    setDropIndex(null)
  }, [])

  return (
    <div
      ref={tabBarRef}
      className="context-panel-tab-bar context-panel-tab-bar--icon-only"
      role="tablist"
      aria-label="Kontext-Panel Ansichten"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {tabs.map((viewId, index) => {
        const config = TAB_CONFIG[viewId]
        const Icon = config.icon
        const isActive = viewId === activeTab
        const isDragging = viewId === draggedTab
        const showInsertBefore = dropIndex === index

        return (
          <div key={viewId} className="context-panel-tab-wrapper">
            {showInsertBefore && (
              <div className="context-panel-tab-insert-line" aria-hidden="true" />
            )}
            <button
              type="button"
              role="tab"
              data-tab-id={viewId}
              aria-selected={isActive}
              aria-label={config.label}
              title={config.label}
              className={`context-panel-tab${isActive ? ' context-panel-tab--active' : ''}${isDragging ? ' context-panel-tab--dragging' : ''}`}
              onClick={() => onTabClick(viewId)}
              draggable={isDraggable}
              onDragStart={(e) => handleDragStart(e, viewId)}
              onDragEnd={handleDragEnd}
            >
              <Icon size={14} className="context-panel-tab-icon" />
            </button>
          </div>
        )
      })}
      {dropIndex === tabs.length && (
        <div className="context-panel-tab-wrapper">
          <div className="context-panel-tab-insert-line" aria-hidden="true" />
        </div>
      )}
    </div>
  )
}
