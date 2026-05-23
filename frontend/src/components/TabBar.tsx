import { useTabContext } from '../state/tabContext'
import type { TabEntry } from '../state/tabState'

/**
 * Extracts the parent folder path from a file path.
 * Returns the directory portion (everything before the last segment).
 */
function getParentFolder(filePath: string): string {
  const segments = filePath.replace(/\\/g, '/').split('/')
  if (segments.length <= 1) return '/'
  return segments.slice(0, -1).join('/')
}

/**
 * Determines which tabs have duplicate filenames and need a tooltip
 * showing the parent folder path for disambiguation.
 */
function getDuplicateFileNames(tabs: TabEntry[]): Set<string> {
  const nameCount = new Map<string, number>()
  for (const tab of tabs) {
    nameCount.set(tab.fileName, (nameCount.get(tab.fileName) ?? 0) + 1)
  }
  const duplicates = new Set<string>()
  for (const [name, count] of nameCount) {
    if (count > 1) duplicates.add(name)
  }
  return duplicates
}

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

  const duplicateNames = getDuplicateFileNames(tabs)

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
        const showTooltip = duplicateNames.has(tab.fileName)
        const modeLabel = tab.mode === 'edit' ? 'Bearbeitungsmodus' : 'Ansichtsmodus'
        const modeIcon = tab.mode === 'edit' ? '✏️' : '👁️'
        const hasUnsaved = tab.editBuffer !== null && tab.editBuffer !== tab.content

        const tabClassName = `tab-bar-tab${isActive ? ' tab-bar-tab--active' : ''}`

        return (
          <div
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            aria-label={tab.fileName}
            className={tabClassName}
            onClick={() => handleActivate(tab.id)}
            title={showTooltip ? getParentFolder(tab.filePath) : undefined}
            tabIndex={isActive ? 0 : -1}
          >
            {/* Filename label (truncated) */}
            <span className="tab-bar-tab-label">
              {hasUnsaved ? '● ' : ''}{tab.fileName}
            </span>

            {/* Mode toggle icon */}
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
              {modeIcon}
            </button>

            {/* Close button */}
            <button
              type="button"
              className="tab-bar-close-btn"
              aria-label={`Tab schließen: ${tab.fileName}`}
              onClick={(e) => handleClose(e, tab.id)}
              onKeyDown={(e) => handleCloseKeyDown(e, tab.id)}
              tabIndex={0}
            >
              ×
            </button>
          </div>
        )
      })}
    </div>
  )
}
