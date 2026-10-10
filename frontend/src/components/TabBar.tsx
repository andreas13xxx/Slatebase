import { useRef, useState, type ReactNode } from 'react'
import { useTabContext } from '../state/tabContext'
import { useTranslation } from '../i18n'
import { Eye, Pencil, X, Share2, Puzzle, Pin } from 'lucide-react'
import { getFileIcon, getFileIconClass, getDisplayName } from '../utils/fileIcons'
import { getCustomIconSvg, sizeCustomIconSvg, useIconResolutionTick } from '../utils/pluginIcon'
import { resolveIconMarkupSync } from '../plugins/compat/lucide-icons'
import { ContextMenu, type ContextMenuItem } from './ContextMenu'
import { buildTabContextMenuItems } from './tab-context-menu'

/** A single settings-page tab shown ahead of the file tabs (not draggable). */
export interface SettingsTabDescriptor {
  /** Stable identifier for the React key — the AppPage value. */
  key: string
  label: string
  icon?: ReactNode
  isActive: boolean
  onActivate: () => void
  onClose: () => void
  closeAriaLabel: string
  closeTitle: string
}

/** Props for the TabBar component. */
export interface TabBarProps {
  /** Settings pages currently open as tabs (e.g. Profile, Sessions, Admin panels). */
  settingsTabs: SettingsTabDescriptor[]
  /** True while a settings tab is the active content (no file tab shows as active). */
  isShowingSettings: boolean
  /** Called when a file tab is clicked, before activating it — lets the caller deactivate any settings tab. */
  onActivateFileTab: () => void
  /**
   * Pane-aware tab drag (Split Panes). When set, this tab bar belongs to the
   * pane `paneId`, and dragging a tab onto ANOTHER pane's tab bar triggers a
   * cross-pane move via `onMoveTabToPane`. Unset = the legacy single-row bar
   * (reorder only), so the component is backward-compatible.
   */
  paneId?: string
  /** Move a tab from one pane to another at a target index (append when omitted). */
  onMoveTabToPane?: (fromPaneId: string, toPaneId: string, tabId: string, toIndex?: number) => void
}

/** MIME type carrying a cross-pane tab drag payload (`{ paneId, tabId }`). */
export const TAB_DRAG_MIME = 'application/x-slatebase-tab'

/**
 * TabBar renders the unified horizontal tab strip: settings-page tabs first
 * (not draggable), then open file tabs (draggable/reorderable), in one row.
 * Each file tab shows the filename (truncated to fit), a mode toggle icon,
 * and a close button. The active tab is visually distinguished.
 */
export function TabBar({ settingsTabs, isShowingSettings, onActivateFileTab, paneId, onMoveTabToPane }: TabBarProps) {
  const { t } = useTranslation()
  // Re-renders once any icon's (async, per-icon) Lucide resolution lands —
  // see PluginRibbonIcon.tsx for why this is needed.
  useIconResolutionTick()
  const { tabState, tabDispatch } = useTabContext()
  const { tabs, activeTabId } = tabState
  const dragIndexRef = useRef<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; items: ContextMenuItem[] } | null>(null)

  // A pane-local bar always renders (even empty) so an empty pane stays a valid
  // drop target for a cross-pane move; the legacy single row collapses when empty.
  if (paneId === undefined && settingsTabs.length === 0 && tabs.length === 0) {
    return null
  }

  function handleActivate(tabId: string) {
    onActivateFileTab()
    tabDispatch({ type: 'ACTIVATE_TAB', payload: { tabId } })
  }

  function handleClose(e: React.MouseEvent, tabId: string) {
    e.stopPropagation()
    tabDispatch({ type: 'CLOSE_TAB', payload: { tabId } })
  }

  function handleToggleMode(e: React.MouseEvent, tabId: string) {
    e.stopPropagation()
    tabDispatch({ type: 'TOGGLE_MODE', payload: { tabId } })
  }

  function handleTogglePin(e: React.MouseEvent, tabId: string) {
    e.stopPropagation()
    tabDispatch({ type: 'TOGGLE_PIN', payload: { tabId } })
  }

  function handleDragStart(e: React.DragEvent, index: number) {
    dragIndexRef.current = index
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(index))
    // Cross-pane payload: identifies the source pane + tab so another pane's
    // bar (or an edge-drop zone) can claim the tab. Only when pane-aware.
    const tab = tabs[index]
    if (paneId && tab) {
      e.dataTransfer.setData(TAB_DRAG_MIME, JSON.stringify({ paneId, tabId: tab.id }))
    }
  }

  /** Read a cross-pane tab payload from a drag, or null if it isn't one. */
  function readTabDrag(e: React.DragEvent): { paneId: string; tabId: string } | null {
    const raw = e.dataTransfer.getData(TAB_DRAG_MIME)
    if (!raw) return null
    try {
      const parsed = JSON.parse(raw) as { paneId?: unknown; tabId?: unknown }
      if (typeof parsed.paneId === 'string' && typeof parsed.tabId === 'string') {
        return { paneId: parsed.paneId, tabId: parsed.tabId }
      }
    } catch { /* malformed payload — treat as not a tab drag */ }
    return null
  }

  /** True while a cross-pane drag from ANOTHER pane hovers this bar. */
  function isForeignTabDrag(e: React.DragEvent): boolean {
    // During dragover the payload is not readable (browser security), so fall
    // back to the type list; the source pane can't be told apart here, so an
    // own-pane reorder still works through dragIndexRef.
    return paneId !== undefined && e.dataTransfer.types.includes(TAB_DRAG_MIME)
  }

  function handleDragOver(e: React.DragEvent, index: number) {
    if (dragIndexRef.current === null && !isForeignTabDrag(e)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (dragIndexRef.current !== index) {
      setDragOverIndex(index)
    }
  }

  function handleDragLeave() {
    setDragOverIndex(null)
  }

  function handleDrop(e: React.DragEvent, toIndex: number) {
    e.preventDefault()
    e.stopPropagation()
    setDragOverIndex(null)
    const payload = readTabDrag(e)
    // Cross-pane move: payload from a different pane than this one.
    if (payload && paneId && onMoveTabToPane && payload.paneId !== paneId) {
      onMoveTabToPane(payload.paneId, paneId, payload.tabId, toIndex)
      dragIndexRef.current = null
      return
    }
    // Same-pane reorder (either no pane context, or same-pane payload).
    const fromIndex = dragIndexRef.current
    if (fromIndex !== null && fromIndex !== toIndex) {
      tabDispatch({ type: 'REORDER_TABS', payload: { fromIndex, toIndex } })
    }
    dragIndexRef.current = null
  }

  function handleDragEnd() {
    dragIndexRef.current = null
    setDragOverIndex(null)
  }

  function handleTabContextMenu(e: React.MouseEvent, index: number) {
    e.preventDefault()
    const tab = tabs[index]
    if (!tab) return
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      items: buildTabContextMenuItems(tab, index === tabs.length - 1, tabDispatch),
    })
  }

  /** Dropping in the row's empty space moves/appends the tab to the end. */
  function handleRowDragOver(e: React.DragEvent) {
    if (dragIndexRef.current !== null || isForeignTabDrag(e)) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
    }
  }

  function handleRowDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOverIndex(null)
    const payload = readTabDrag(e)
    if (payload && paneId && onMoveTabToPane && payload.paneId !== paneId) {
      // Append to the end of this pane.
      onMoveTabToPane(payload.paneId, paneId, payload.tabId)
      dragIndexRef.current = null
      return
    }
    const fromIndex = dragIndexRef.current
    const lastIndex = tabs.length - 1
    if (fromIndex !== null && fromIndex !== lastIndex) {
      tabDispatch({ type: 'REORDER_TABS', payload: { fromIndex, toIndex: lastIndex } })
    }
    dragIndexRef.current = null
  }

  return (
    <>
    <div
      className="tab-bar"
      role="tablist"
      aria-label={t('tabs.ariaLabel')}
      onDragOver={handleRowDragOver}
      onDrop={handleRowDrop}
    >
      {settingsTabs.map((settingsTab) => (
        <div
          key={`settings-${settingsTab.key}`}
          role="tab"
          aria-selected={settingsTab.isActive}
          className={`tab-bar-tab${settingsTab.isActive ? ' tab-bar-tab--active' : ''}`}
          onClick={settingsTab.onActivate}
          title={settingsTab.label}
          tabIndex={settingsTab.isActive ? 0 : -1}
        >
          {settingsTab.icon && <span style={{ flexShrink: 0 }}>{settingsTab.icon}</span>}
          <span className="tab-bar-tab-label">{settingsTab.label}</span>
          <button
            type="button"
            className="tab-bar-close-btn"
            aria-label={settingsTab.closeAriaLabel}
            title={settingsTab.closeTitle}
            onClick={(e) => { e.stopPropagation(); settingsTab.onClose() }}
          >
            <X size={12} />
          </button>
        </div>
      ))}

      {tabs.map((tab, index) => {
        const isActive = !isShowingSettings && tab.id === activeTabId
        const hasUnsaved = tab.editBuffer !== null && tab.editBuffer !== tab.content
        const modeLabel = tab.mode === 'edit' ? t('tabs.showPreview') : t('tabs.edit')
        const ModeIcon = tab.mode === 'edit' ? Eye : Pencil
        const isGraphTab = tab.filePath === '__graph__'
        const isCanvasTab = tab.fileName.endsWith('.canvas')
        // Plugin-view tabs (opened via workspace.getLeaf().setViewState()) carry the
        // view's own Obsidian icon name instead of a real filename — resolving it
        // through getFileIcon() would just guess from "__view::..." and show a generic
        // file icon, so these go through the same custom-icon-aware resolution as
        // ribbon icons and context-panel tabs instead.
        const isPluginViewTab = tab.filePath.startsWith('__view::')
        const customIconSvg = isPluginViewTab && tab.icon ? getCustomIconSvg(tab.icon) : undefined
        const pluginIconMarkup = isPluginViewTab && !customIconSvg && tab.icon ? resolveIconMarkupSync(tab.icon, 13) : undefined
        const TabFileIcon = isGraphTab ? Share2 : getFileIcon(tab.fileName)
        const tabFileIconClass = isGraphTab ? 'tab-icon-graph' : getFileIconClass(tab.fileName)
        const displayName = isGraphTab ? tab.fileName : getDisplayName(tab.fileName)

        return (
          <div
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            aria-label={tab.filePath}
            className={`tab-bar-tab${isActive ? ' tab-bar-tab--active' : ''}${dragOverIndex === index ? ' tab-bar-tab--drag-over' : ''}`}
            onClick={() => handleActivate(tab.id)}
            onContextMenu={(e) => handleTabContextMenu(e, index)}
            title={isGraphTab ? 'Graph' : tab.filePath}
            tabIndex={isActive ? 0 : -1}
            draggable
            onDragStart={(e) => handleDragStart(e, index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, index)}
            onDragEnd={handleDragEnd}
          >
            {customIconSvg ? (
              <span className="tab-bar-tab-icon" dangerouslySetInnerHTML={{ __html: sizeCustomIconSvg(customIconSvg, 13) }} />
            ) : isPluginViewTab && tab.icon ? (
              pluginIconMarkup
                ? <span className="tab-bar-tab-icon" dangerouslySetInnerHTML={{ __html: pluginIconMarkup }} />
                : <Puzzle size={13} className="tab-bar-tab-icon" />
            ) : (
              <TabFileIcon size={13} className={`tab-bar-tab-icon ${tabFileIconClass}`} />
            )}
            <span className="tab-bar-tab-label">
              {hasUnsaved ? '● ' : ''}{displayName}
            </span>
            {!tab.isBinary && !isGraphTab && !isCanvasTab && (
              <button
                type="button"
                className="tab-bar-mode-btn"
                aria-label={modeLabel}
                title={modeLabel}
                onClick={(e) => handleToggleMode(e, tab.id)}
              >
                <ModeIcon size={12} />
              </button>
            )}
            {tab.pinned ? (
              <button
                type="button"
                className="tab-bar-close-btn tab-bar-pin-btn"
                aria-label={t('tabs.unpinTabAriaLabel', { name: tab.fileName })}
                title={t('tabs.unpinTab')}
                onClick={(e) => handleTogglePin(e, tab.id)}
              >
                <Pin size={12} />
              </button>
            ) : (
              <button
                type="button"
                className="tab-bar-close-btn"
                aria-label={t('tabs.closeTabAriaLabel', { name: tab.fileName })}
                title={t('tabs.closeTab')}
                onClick={(e) => handleClose(e, tab.id)}
              >
                <X size={12} />
              </button>
            )}
          </div>
        )
      })}
    </div>
    {contextMenu && (
      <ContextMenu
        x={contextMenu.x}
        y={contextMenu.y}
        items={contextMenu.items}
        onClose={() => setContextMenu(null)}
        onSelect={() => setContextMenu(null)}
      />
    )}
    </>
  )
}
