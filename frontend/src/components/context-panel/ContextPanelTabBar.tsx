import { useState, useRef, useCallback } from 'react'
import { List, Link, Tag, FileText, Search, icons } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { isPluginViewId, getPluginViewType } from '../../state/contextPanelState'
import type { ContextPanelViewId, BuiltinViewId } from '../../state/contextPanelState'
import './ContextPanelTabBar.css'

/** Tab metadata mapping built-in view IDs to icons and labels. */
const TAB_CONFIG: Record<BuiltinViewId, { icon: typeof List; label: string }> = {
  outline: { icon: List, label: 'Gliederung' },
  links: { icon: Link, label: 'Links' },
  tags: { icon: Tag, label: 'Tags' },
  properties: { icon: FileText, label: 'Eigenschaften' },
  search: { icon: Search, label: 'Suche' },
}

/** Known Obsidian icon name → Lucide key mappings. */
const OBSIDIAN_ICON_MAP: Record<string, string> = {
  'calendar-with-checkmark': 'CalendarCheck',
  'calendar': 'Calendar',
  'lucide-calendar': 'Calendar',
  'file-text': 'FileText',
  'folder': 'Folder',
  'search': 'Search',
  'settings': 'Settings',
  'star': 'Star',
  'trash': 'Trash2',
  'link': 'Link',
  'eye': 'Eye',
  'pencil': 'Pencil',
  'clock': 'Clock',
  'check': 'Check',
  'list': 'List',
  'hash': 'Hash',
  'tag': 'Tag',
  'book': 'Book',
  'image': 'Image',
  'code': 'Code',
  'quote': 'Quote',
  'table': 'Table',
}

/** Resolve an Obsidian icon name to a Lucide React component, or null if not found. */
function resolvePluginIcon(iconName: string): LucideIcon | null {
  const mapped = OBSIDIAN_ICON_MAP[iconName]
  if (mapped && mapped in icons) {
    return icons[mapped as keyof typeof icons]
  }
  // Generic: kebab-case → PascalCase
  const pascalCase = iconName.split('-').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('')
  if (pascalCase in icons) {
    return icons[pascalCase as keyof typeof icons]
  }
  return null
}

/** Plugin view metadata provided externally for label/icon resolution. */
export interface PluginViewMeta {
  viewType: string
  displayText: string
  icon: string
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
  /** Metadata for plugin views (icon + label lookup). Keyed by viewType. */
  pluginViewMeta?: Map<string, PluginViewMeta>
}

/**
 * Tab bar for the context panel with drag-and-drop reordering and split support.
 * Renders both built-in and plugin tabs from the unified tabs list.
 * Shows only icons with labels as tooltips on hover.
 */
export function ContextPanelTabBar({
  tabs,
  activeTab,
  sectionId,
  onTabClick,
  onTabReorder,
  onTabSplit,
  onTabReceive,
  panelWidth: _panelWidth, // eslint-disable-line @typescript-eslint/no-unused-vars
  pluginViewMeta,
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

  /** Render a single tab (built-in or plugin). */
  function renderTab(viewId: ContextPanelViewId, index: number) {
    const isActive = viewId === activeTab
    const isDragging = viewId === draggedTab
    const showInsertBefore = dropIndex === index

    if (isPluginViewId(viewId)) {
      const viewType = getPluginViewType(viewId)
      const meta = pluginViewMeta?.get(viewType)
      const label = meta?.displayText ?? viewType
      const PluginIcon = meta?.icon ? resolvePluginIcon(meta.icon) : null

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
            aria-label={label}
            title={label}
            className={`context-panel-tab${isActive ? ' context-panel-tab--active' : ''}${isDragging ? ' context-panel-tab--dragging' : ''}`}
            onClick={() => onTabClick(viewId)}
            draggable={isDraggable}
            onDragStart={(e) => handleDragStart(e, viewId)}
            onDragEnd={handleDragEnd}
          >
            {PluginIcon ? <PluginIcon size={14} className="context-panel-tab-icon" /> : <span className="context-panel-tab-icon">{viewType}</span>}
          </button>
        </div>
      )
    }

    // Built-in tab
    const config = TAB_CONFIG[viewId as BuiltinViewId]
    if (!config) return null
    const Icon = config.icon

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
  }

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
      {tabs.map((viewId, index) => renderTab(viewId, index))}
      {dropIndex === tabs.length && (
        <div className="context-panel-tab-wrapper">
          <div className="context-panel-tab-insert-line" aria-hidden="true" />
        </div>
      )}
    </div>
  )
}
