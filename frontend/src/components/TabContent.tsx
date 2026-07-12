import { useState, useCallback } from 'react'
import { useTabContext } from '../state/tabContext'
import { useAppContext } from '../state'
import { openTab, saveTab } from '../state/tabActions'
import type { DirectoryTree } from '../types'
import { EditMode } from './EditMode'
import { ViewMode } from './ViewMode'
import { BinaryViewer } from './BinaryViewer'
import { GraphView } from './GraphView'
import { CanvasView } from './canvas/CanvasView'
import { ErrorBoundary } from './ErrorBoundary'
import { useTranslation } from '../i18n'
import { extractErrorMessage } from '../utils/error'
import './TabContent.css'

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
export function TabContent({ onOpenVersions }: { onOpenVersions?: (vaultId: string, filePath: string) => void } = {}) {
  const { tabState, tabDispatch } = useTabContext()
  const { state: appState, dispatch: appDispatch, apiClient } = useAppContext()
  const { t } = useTranslation()
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
    if (!activeTab || !apiClient) return
    const contentToSave = activeTab.editBuffer ?? activeTab.content
    setSaving(true)
    await saveTab(tabDispatch, apiClient, activeTab.vaultId, activeTab.filePath, contentToSave)
    setSaving(false)
  }, [activeTab, tabDispatch, apiClient])

  const handleCancel = useCallback(() => {
    if (!activeTab) return
    // Discard edit buffer and switch to view mode
    tabDispatch({ type: 'UPDATE_EDIT_BUFFER', payload: { tabId: activeTab.id, content: activeTab.content } })
    tabDispatch({ type: 'TOGGLE_MODE', payload: { tabId: activeTab.id } })
  }, [activeTab, tabDispatch])

  const handleInternalLinkClick = useCallback(
    async (targetPath: string) => {
      if (!activeTab || !apiClient) return
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
          // Refresh the directory tree so the new file appears in the Explorer
          const tree = await apiClient.fetchVaultTree(activeTab.vaultId)
          appDispatch({ type: 'TREE_LOADED', payload: tree })
        } catch (err: unknown) {
          // File creation failed — show error notification, maintain current view
          const message = extractErrorMessage(err, t('tabContent.linkCreateUnexpected'))
          setLinkError(t('tabContent.linkCreateError', { fileName, message }))
          return
        }
      }

      // Open the file in a new tab via the openTab action creator
      // Validates: Requirement 6.3
      await openTab(tabDispatch, appDispatch, apiClient, activeTab.vaultId, targetPath, fileName)
    },
    [activeTab, tabDispatch, appDispatch, appState.directoryTree, apiClient],
  )

  /** Handle external file drops in EditMode — uploads to same directory as current file. */
  const handleExternalFileDrop = useCallback(async (files: File[]) => {
    if (!activeTab || !apiClient) {
      return { uploaded: [] }
    }

    const filePath = activeTab.filePath
    const targetDir = filePath.includes('/') ? filePath.slice(0, filePath.lastIndexOf('/')) : ''

    const result = await apiClient.uploadFiles(activeTab.vaultId, files, targetDir)

    // Refresh file tree after successful upload
    const newTree = await apiClient.fetchVaultTree(activeTab.vaultId)
    appDispatch({ type: 'VAULT_TREE_LOADED', payload: { vaultId: activeTab.vaultId, tree: newTree } })

    return result
  }, [activeTab, apiClient, appDispatch])

  /** Handle image paste in EditMode — uploads single image via paste mode. */
  const handleImagePaste = useCallback(async (file: File) => {
    if (!activeTab || !apiClient) {
      return { uploaded: [] }
    }

    const filePath = activeTab.filePath
    const targetDir = filePath.includes('/') ? filePath.slice(0, filePath.lastIndexOf('/')) : ''

    const result = await apiClient.uploadImagePaste(activeTab.vaultId, file, targetDir)

    // Refresh file tree after successful upload
    const newTree = await apiClient.fetchVaultTree(activeTab.vaultId)
    appDispatch({ type: 'VAULT_TREE_LOADED', payload: { vaultId: activeTab.vaultId, tree: newTree } })

    return result
  }, [activeTab, apiClient, appDispatch])

  // No active tab — empty state
  if (!activeTab) {
    return (
      <div className="tab-content tab-content--empty">
        <p>{t('tabContent.noFileOpen')}</p>
      </div>
    )
  }

  // Graph tab — render GraphView
  if (activeTab.filePath === '__graph__') {
    if (!activeTab.vaultId) {
      return (
        <div className="tab-content tab-content--empty">
          <p>{t('graph.noVault')}</p>
        </div>
      )
    }
    return (
      <div className="tab-content tab-content--graph">
        <ErrorBoundary>
          <GraphView vaultId={activeTab.vaultId} />
        </ErrorBoundary>
      </div>
    )
  }

  // Loading state
  if (activeTab.loading) {
    return (
      <div className="tab-content tab-content--loading" role="status" aria-live="polite">
        <span className="app-loading-spinner" aria-hidden="true" />
        <span>{t('tabContent.loading')}</span>
      </div>
    )
  }

  // Error state
  if (activeTab.error) {
    return (
      <div className="tab-content tab-content--error" role="alert">
        <p>
          {t('tabContent.fileLoadError', { error: activeTab.error })}
        </p>
      </div>
    )
  }

  // Binary file — render BinaryViewer
  if (activeTab.isBinary) {
    const extension = getFileExtension(activeTab.fileName)
    return (
      <div className="tab-content tab-content--binary">
        <BinaryViewer
          fileName={activeTab.fileName}
          fileExtension={extension}
          vaultId={activeTab.vaultId}
          filePath={activeTab.filePath}
          token={apiClient?.getToken() ?? undefined}
        />
      </div>
    )
  }

  // Canvas file — render CanvasView
  if (activeTab.fileName.endsWith('.canvas')) {
    const currentVault = appState.vaults.find((v) => v.id === activeTab.vaultId)
    const isReadOnly = currentVault?.permission === 'read'
    return (
      <div className="tab-content tab-content--canvas">
        <ErrorBoundary>
          <CanvasView
            vaultId={activeTab.vaultId}
            filePath={activeTab.filePath}
            content={activeTab.content}
            readOnly={isReadOnly ?? false}
            onSave={async (content) => {
              await saveTab(tabDispatch, apiClient!, activeTab.vaultId, activeTab.filePath, content)
            }}
            onFileOpen={(path) => {
              const fileName = path.split('/').pop() ?? path
              void openTab(tabDispatch, appDispatch, apiClient!, activeTab.vaultId, path, fileName)
            }}
            onFileSave={async (filePath, content) => {
              await apiClient!.saveFile(activeTab.vaultId, filePath, content)
              // Refresh tree to update any changed references
              const newTree = await apiClient!.fetchVaultTree(activeTab.vaultId)
              appDispatch({ type: 'VAULT_TREE_LOADED', payload: { vaultId: activeTab.vaultId, tree: newTree } })
            }}
            directoryTree={appState.vaultTrees[activeTab.vaultId] ?? appState.directoryTree}
            token={apiClient?.getToken() ?? undefined}
          />
        </ErrorBoundary>
      </div>
    )
  }

  // Edit mode
  if (activeTab.mode === 'edit') {
    const editContent = activeTab.editBuffer ?? activeTab.content
    const currentVault = appState.vaults.find((v) => v.id === activeTab.vaultId)
    const isReadOnly = currentVault?.permission === 'read'
    return (
      <div className="tab-content tab-content--edit">
        <EditMode
          content={editContent}
          onChange={handleEditChange}
          onSave={handleSave}
          onCancel={handleCancel}
          saving={saving}
          error={activeTab.error}
          readOnly={isReadOnly}
          filePath={activeTab.filePath}
          onExternalFileDrop={handleExternalFileDrop}
          onImagePaste={handleImagePaste}
          onOpenVersions={onOpenVersions ? () => onOpenVersions(activeTab.vaultId, activeTab.filePath) : undefined}
        />
      </div>
    )
  }

  // View mode — render Markdown
  return (
    <div className="tab-content tab-content--view">
      {linkError && (
        <div className="tab-content-link-error" role="alert">
          <span>{linkError}</span>
          <button
            className="tab-content-link-error-dismiss"
            onClick={() => setLinkError(null)}
            aria-label={t('tabContent.dismissError')}
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
        token={apiClient?.getToken() ?? undefined}
      />
    </div>
  )
}
