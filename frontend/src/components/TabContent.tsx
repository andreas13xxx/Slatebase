import { useState, useCallback } from 'react'
import { useTabContext } from '../state/tabContext'
import { useAppContext } from '../state'
import { openTab, saveTab } from '../state/tabActions'
import { ApiClient } from '../api'
import type { DirectoryTree } from '../types'
import { EditMode } from './EditMode'
import { ViewMode } from './ViewMode'
import { BinaryViewer } from './BinaryViewer'

const apiClient = new ApiClient()

/**
 * Extracts the file extension from a filename (including the dot).
 * Returns empty string if no extension found.
 */
function getFileExtension(fileName: string): string {
  const dotIndex = fileName.lastIndexOf('.')
  if (dotIndex === -1 || dotIndex === fileName.length - 1) return ''
  return fileName.slice(dotIndex)
}

/**
 * Checks if a file path exists in the DirectoryTree.
 * Used to determine if an internal link target is a broken link.
 */
function pathExistsInTree(tree: DirectoryTree | null, filePath: string): boolean {
  if (!tree) return false

  const normalizedPath = filePath.replace(/\\/g, '/')

  function search(node: DirectoryTree): boolean {
    const nodePath = node.path.replace(/\\/g, '/')
    if (nodePath === normalizedPath) return true
    if (node.type === 'directory' && node.children) {
      for (const child of node.children) {
        if (search(child)) return true
      }
    }
    return false
  }

  return search(tree)
}

/**
 * TabContent is the orchestrator component that reads the active tab state
 * and renders the appropriate sub-component (EditMode, ViewMode, or BinaryViewer).
 *
 * - No active tab: shows empty state placeholder
 * - Active tab loading: shows loading indicator
 * - Active tab error: shows error message
 * - Active tab binary: renders BinaryViewer
 * - Active tab mode 'edit': renders EditMode
 * - Active tab mode 'view': renders ViewMode
 *
 * Validates: Requirements 1.1, 3.4, 3.5, 7.1
 */
export function TabContent() {
  const { tabState, tabDispatch } = useTabContext()
  const { state: appState, dispatch: appDispatch } = useAppContext()
  const [saving, setSaving] = useState(false)
  const [linkError, setLinkError] = useState<string | null>(null)

  const { tabs, activeTabId } = tabState
  const activeTab = activeTabId ? tabs.find((t) => t.id === activeTabId) ?? null : null

  const handleEditChange = useCallback(
    (content: string) => {
      if (!activeTab) return
      tabDispatch({ type: 'UPDATE_EDIT_BUFFER', payload: { tabId: activeTab.id, content } })
    },
    [activeTab, tabDispatch],
  )

  const handleSave = useCallback(async () => {
    if (!activeTab) return
    const contentToSave = activeTab.editBuffer ?? activeTab.content
    setSaving(true)
    await saveTab(tabDispatch, apiClient, activeTab.vaultId, activeTab.filePath, contentToSave)
    setSaving(false)
  }, [activeTab, tabDispatch])

  const handleCancel = useCallback(() => {
    if (!activeTab) return
    // Discard edit buffer and switch to view mode
    tabDispatch({ type: 'UPDATE_EDIT_BUFFER', payload: { tabId: activeTab.id, content: activeTab.content } })
    tabDispatch({ type: 'TOGGLE_MODE', payload: { tabId: activeTab.id } })
  }, [activeTab, tabDispatch])

  const handleInternalLinkClick = useCallback(
    async (targetPath: string) => {
      if (!activeTab) return
      const fileName = targetPath.split('/').pop() ?? targetPath

      // Clear any previous link error
      setLinkError(null)

      // Check if the file exists in the directory tree (broken link detection)
      const fileExists = pathExistsInTree(appState.directoryTree, targetPath)

      if (!fileExists) {
        // Broken link: create the file with empty content first, then open tab
        // Validates: Requirements 6.4, 6.5
        try {
          await apiClient.saveFile(activeTab.vaultId, targetPath, '')
        } catch (err: unknown) {
          // File creation failed — show error notification, maintain current view
          const message =
            err !== null && typeof err === 'object' && 'message' in err
              ? String((err as { message: unknown }).message)
              : 'Ein unerwarteter Fehler ist aufgetreten'
          setLinkError(`Datei konnte nicht erstellt werden: ${fileName} — ${message}`)
          return
        }
      }

      // Open the file in a new tab via the openTab action creator
      // Validates: Requirement 6.3
      await openTab(tabDispatch, appDispatch, apiClient, activeTab.vaultId, targetPath, fileName)
    },
    [activeTab, tabDispatch, appDispatch, appState.directoryTree],
  )

  // No active tab — empty state
  if (!activeTab) {
    return (
      <div className="tab-content tab-content--empty" style={emptyStyle}>
        <p style={emptyTextStyle}>Keine Datei geöffnet. Wähle eine Datei im Datei-Explorer aus.</p>
      </div>
    )
  }

  // Loading state
  if (activeTab.loading) {
    return (
      <div className="tab-content tab-content--loading" style={loadingStyle} role="status" aria-live="polite">
        <span className="app-loading-spinner" aria-hidden="true" />
        <span>Laden…</span>
      </div>
    )
  }

  // Error state
  if (activeTab.error) {
    return (
      <div className="tab-content tab-content--error" style={errorStyle} role="alert">
        <p style={errorTextStyle}>
          Fehler beim Laden der Datei: {activeTab.error}
        </p>
      </div>
    )
  }

  // Binary file — render BinaryViewer
  if (activeTab.isBinary) {
    const extension = getFileExtension(activeTab.fileName)
    return (
      <div className="tab-content tab-content--binary" style={contentStyle}>
        <BinaryViewer
          fileName={activeTab.fileName}
          fileExtension={extension}
          vaultId={activeTab.vaultId}
          filePath={activeTab.filePath}
        />
      </div>
    )
  }

  // Edit mode
  if (activeTab.mode === 'edit') {
    const editContent = activeTab.editBuffer ?? activeTab.content
    return (
      <div className="tab-content tab-content--edit" style={contentStyle}>
        <EditMode
          content={editContent}
          onChange={handleEditChange}
          onSave={handleSave}
          onCancel={handleCancel}
          saving={saving}
          error={activeTab.error}
        />
      </div>
    )
  }

  // View mode — render Markdown
  return (
    <div className="tab-content tab-content--view" style={contentStyle}>
      {linkError && (
        <div className="tab-content-link-error" role="alert" style={linkErrorStyle}>
          <span>{linkError}</span>
          <button
            onClick={() => setLinkError(null)}
            aria-label="Fehlermeldung schließen"
            style={linkErrorDismissStyle}
          >
            ×
          </button>
        </div>
      )}
      <ViewMode
        content={activeTab.editBuffer ?? activeTab.content}
        vaultId={activeTab.vaultId}
        directoryTree={appState.directoryTree}
        onInternalLinkClick={handleInternalLinkClick}
      />
    </div>
  )
}

/* Inline styles */

const emptyStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%',
  padding: '2rem',
}

const emptyTextStyle: React.CSSProperties = {
  color: '#718096',
  fontSize: '0.95rem',
}

const loadingStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '8px',
  height: '100%',
  padding: '2rem',
  color: '#4a5568',
}

const errorStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%',
  padding: '2rem',
}

const errorTextStyle: React.CSSProperties = {
  color: '#dc2626',
  fontSize: '0.95rem',
}

const contentStyle: React.CSSProperties = {
  flex: 1,
  overflow: 'auto',
  height: '100%',
}

const linkErrorStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '8px 12px',
  backgroundColor: '#fef2f2',
  border: '1px solid #fecaca',
  borderRadius: '4px',
  margin: '8px 8px 0',
  color: '#dc2626',
  fontSize: '0.85rem',
}

const linkErrorDismissStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#dc2626',
  cursor: 'pointer',
  fontSize: '1.2rem',
  lineHeight: 1,
  padding: '0 4px',
  marginLeft: '8px',
}
