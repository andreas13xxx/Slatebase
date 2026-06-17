import { useState, useRef, useCallback } from 'react'
import { FolderOpen, Star, Clock } from 'lucide-react'
import type { SidebarViewId } from '../../state/sidebarPanelState'
import './SidebarPanelTabBar.css'

/** Tab metadata mapping view IDs to icons and labels. */
const TAB_CONFIG: Record<SidebarViewId, { icon: typeof FolderOpen; label: string }> = {
  explorer: { icon: FolderOpen, label: 'Dateien' },
  favorites: { icon: Star, label: 'Favoriten' },
  recent: { icon: Clock, label: 'Zuletzt geöffnet' },
}

export interface SidebarPanelTabBarProps {
  tabs: SidebarViewId[]
  activeTab: SidebarViewId
  sectionId?: string
  onTabClick: (viewId: SidebarViewId) => void
  onTabReorder: (newOrder: SidebarViewId[]) => void
  onTabSplit: (viewId: SidebarViewId) => void
  onTabReceive?: (viewId: SidebarViewId, targetSectionId: string) => void
  panelWidth: number
}

/**
 * Tab bar for the sidebar panel with drag-and-drop reordering and split support.
 * Shows only icons with labels as tooltips on hover.
 * Supports HTML5 Drag API for reordering tabs and splitting into new sections.
 */
export function SidebarPanelTabBar({
  tabs,
  activeTab,
  sectionId,
  onTabClick,
  onTabReorder,
  onTabSplit,
  onTabReceive,
  panelWidth: _panelWidth, // eslint-disable-line @typescript-eslint/no-unused-vars
}: SidebarPanelTabBarProps) {
  const [draggedTab, setDraggedTab] = useState<SidebarViewId | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)
  const tabBarRef = useRef<HTMLDivElement>(null)

  const isDraggable = sectionId !== undefined || tabs.length > 1

  const handleDragStart = useCallback((e: React.DragEvent, viewId: SidebarViewId) => {
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

    // Detect if dragging below the tab bar (30px threshold for split)
    if (draggedTab && e.clientY > tabBarRect.bottom + 30) {
      setDropIndex(null)
      return
    }

    if (
      e.clientX < tabBarRect.left ||
      e.clientX > tabBarRect.right ||
      e.clientY < tabBarRect.top ||
      e.clientY > tabBarRect.bottom
    ) {
      setDropIndex(null)
      return
    }

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

    if (draggedTab) {
      const draggedIndex = tabs.indexOf(draggedTab)
      if (newDropIndex === draggedIndex || newDropIndex === draggedIndex + 1) {
        setDropIndex(null)
      } else {
        setDropIndex(newDropIndex)
      }
    } else {
      setDropIndex(newDropIndex)
    }
  }, [draggedTab, tabs])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    if (!tabBarRef.current?.contains(e.relatedTarget as Node)) {
      setDropIndex(null)
    }
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()

    const droppedViewId = e.dataTransfer.getData('text/plain') as SidebarViewId

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

    // Cross-section move
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

    const draggedIndex = tabs.indexOf(draggedTab)
    if (draggedIndex !== -1 && finalDropIndex !== draggedIndex && finalDropIndex !== draggedIndex + 1) {
      const newOrder = [...tabs]
      newOrder.splice(draggedIndex, 1)
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
      className="sidebar-panel-tab-bar sidebar-panel-tab-bar--icon-only"
      role="tablist"
      aria-label="Sidebar-Panel Ansichten"
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
          <div key={viewId} className="sidebar-panel-tab-wrapper">
            {showInsertBefore && (
              <div className="sidebar-panel-tab-insert-line" aria-hidden="true" />
            )}
            <button
              type="button"
              role="tab"
              data-tab-id={viewId}
              aria-selected={isActive}
              aria-label={config.label}
              title={config.label}
              className={`sidebar-panel-tab${isActive ? ' sidebar-panel-tab--active' : ''}${isDragging ? ' sidebar-panel-tab--dragging' : ''}`}
              onClick={() => onTabClick(viewId)}
              draggable={isDraggable}
              onDragStart={(e) => handleDragStart(e, viewId)}
              onDragEnd={handleDragEnd}
            >
              <Icon size={14} className="sidebar-panel-tab-icon" />
            </button>
          </div>
        )
      })}
      {dropIndex === tabs.length && (
        <div className="sidebar-panel-tab-wrapper">
          <div className="sidebar-panel-tab-insert-line" aria-hidden="true" />
        </div>
      )}
    </div>
  )
}
