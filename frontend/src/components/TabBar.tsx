import { useTabContext } from '../state/tabContext'
import { Eye, Pencil, X } from 'lucide-react'
import { getFileIcon, getDisplayName } from '../utils/fileIcons'

/**
 * TabBar renders the horizontal tab strip showing all open tabs.
 * Each tab displays the filename (truncated to fit), a mode toggle icon, and a close button.
 * The active tab is visually distinguished with a bottom border and background.
 * Tabs shrink to fit the available width without overflowing.
 *
 * Validates: Requirements 1.3, 1.4, 1.5, 2.1, 3.1
 */
export function TabBar() {
  const { tabState, tabDispatch } = useTabContext()
  const { tabs, activeTabId } = tabState

  if (tabs.length === 0) {
    return null
  }

  function handleActivate(tabId: string) {
    tabDispatch({ type: 'ACTIVATE_TAB', payload: { tabId } })
  }

  function handleClose(e: React.MouseEvent | React.KeyboardEvent, tabId: string) {
    e.stopPropagation()
    tabDispatch({ type: 'CLOSE_TAB', payload: { tabId } })
  }

  function handleCloseKeyDown(e: React.KeyboardEvent, tabId: string) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      handleClose(e, tabId)
    }
  }

  function handleToggleMode(e: React.MouseEvent | React.KeyboardEvent, tabId: string) {
    e.stopPropagation()
    tabDispatch({ type: 'TOGGLE_MODE', payload: { tabId } })
  }

  function handleToggleModeKeyDown(e: React.KeyboardEvent, tabId: string) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      handleToggleMode(e, tabId)
    }
  }

  return (
    <div className="tab-bar" role="tablist" aria-label="Geöffnete Dateien">
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId
        const tooltip = tab.filePath
        const modeLabel = tab.mode === 'edit' ? 'Vorschau anzeigen' : 'Bearbeiten'
        const ModeIcon = tab.mode === 'edit' ? Eye : Pencil
        const hasUnsaved = tab.editBuffer !== null && tab.editBuffer !== tab.content

        const tabClassName = `tab-bar-tab${isActive ? ' tab-bar-tab--active' : ''}`
        const TabFileIcon = getFileIcon(tab.fileName)
        const displayName = getDisplayName(tab.fileName)

        return (
          <div
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            aria-label={tab.filePath}
            className={tabClassName}
            onClick={() => handleActivate(tab.id)}
            title={tooltip}
            tabIndex={isActive ? 0 : -1}
          >
            <TabFileIcon size={13} className="tab-bar-tab-icon" />
            <span className="tab-bar-tab-label">
              {hasUnsaved ? '● ' : ''}{displayName}
            </span>

            <button
              type="button"
              className="tab-bar-mode-btn"
              aria-label={modeLabel}
              title={modeLabel}
              onClick={(e) => handleToggleMode(e, tab.id)}
              onKeyDown={(e) => handleToggleModeKeyDown(e, tab.id)}
              disabled={tab.isBinary}
              tabIndex={0}
            >
              <ModeIcon size={12} />
            </button>

            <button
              type="button"
              className="tab-bar-close-btn"
              aria-label={`Tab schließen: ${tab.fileName}`}
              title="Tab schließen"
              onClick={(e) => handleClose(e, tab.id)}
              onKeyDown={(e) => handleCloseKeyDown(e, tab.id)}
              tabIndex={0}
            >
              <X size={12} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
