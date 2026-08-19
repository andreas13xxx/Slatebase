import { useState, useCallback, useContext, useEffect, useRef } from 'react'
import { useTabContext } from '../state/tabContext'
import { useAppContext } from '../state'
import { openTab, saveTab } from '../state/tabActions'
import type { DirectoryTree } from '../types'
import { EditMode } from './EditMode'
import { BinaryViewer } from './BinaryViewer'
import { GraphView } from './GraphView'
import { CanvasView } from './canvas/CanvasView'
import { ErrorBoundary } from './ErrorBoundary'
import { useTranslation } from '../i18n'
import { extractErrorMessage } from '../utils/error'
import { PluginContext } from '../plugins/compat/plugin-context'
import { findFileViewMatch, getActiveFileView, setActiveFileView, removeActiveFileView } from '../plugins/compat/file-view-registry'
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
export function TabContent() {
  const { tabState, tabDispatch } = useTabContext()
  const { state: appState, dispatch: appDispatch, apiClient } = useAppContext()
  const { t } = useTranslation()
  const [saving, setSaving] = useState(false)
  const [linkError, setLinkError] = useState<string | null>(null)

  // Access plugin active views (nullable — context may be null if PluginProvider not in tree)
  const pluginContext = useContext(PluginContext)
  const pluginActiveViews = pluginContext?.activeViews ?? null

  // ─── Plugin File View (TextFileView-based plugins like Kanban) ────────────
  // Track whether the current tab's file is handled by a plugin file view.
  const fileViewKeyRef = useRef<string | null>(null)
  // Counter to trigger re-render when async file view is ready
  const [, setFileViewReady] = useState(0)

  const { tabs, activeTabId } = tabState
  const activeTab = activeTabId ? tabs.find((t) => t.id === activeTabId) ?? null : null

  // Determine if the active tab's content matches a plugin file view
  const fileViewMatch = activeTab && !activeTab.loading && !activeTab.error && !activeTab.isBinary
    && !activeTab.filePath.startsWith('__view::') && !activeTab.filePath.startsWith('__graph__')
    && !activeTab.fileName.endsWith('.canvas')
    ? findFileViewMatch(activeTab.filePath, activeTab.content)
    : null

  // Manage plugin file view lifecycle: create/destroy when match changes
  useEffect(() => {
    const currentKey = activeTab ? `${activeTab.vaultId}::${activeTab.filePath}` : null

    // If no match or different file, cleanup previous file view
    if (!fileViewMatch || currentKey !== fileViewKeyRef.current) {
      if (fileViewKeyRef.current) {
        const [prevVaultId, prevFilePath] = fileViewKeyRef.current.split('::') as [string, string]
        void removeActiveFileView(prevVaultId, prevFilePath)
        fileViewKeyRef.current = null
      }
    }

    // If we have a match, create the plugin file view
    if (fileViewMatch && activeTab && currentKey && pluginContext) {
      const existing = getActiveFileView(activeTab.vaultId, activeTab.filePath)
      if (!existing) {
        void pluginContext.createFileView(fileViewMatch.viewType, activeTab.filePath).then((result) => {
          if (result && activeTab) {
            setActiveFileView(activeTab.vaultId, activeTab.filePath, {
              key: currentKey,
              viewType: fileViewMatch.viewType,
              leaf: result.leaf,
              view: result.view,
              containerEl: result.containerEl,
            })
            fileViewKeyRef.current = currentKey
            // Force re-render to show the plugin view
            setFileViewReady((n) => n + 1)
          }
        })
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab?.vaultId, activeTab?.filePath, activeTab?.content, fileViewMatch?.viewType])

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
      <div className="tab-content tab-content--empty" role="tabpanel" aria-label={t('tabContent.emptyPanelLabel')}>
        <p>{t('tabContent.noFileOpen')}</p>
      </div>
    )
  }

  // Graph tab — render GraphView
  if (activeTab.filePath === '__graph__') {
    if (!activeTab.vaultId) {
      return (
        <div className="tab-content tab-content--empty" role="tabpanel" aria-label={t('tabContent.emptyPanelLabel')}>
          <p>{t('graph.noVault')}</p>
        </div>
      )
    }
    return (
      <div className="tab-content tab-content--graph" role="tabpanel" aria-label={activeTab.fileName}>
        <ErrorBoundary>
          <GraphView vaultId={activeTab.vaultId} />
        </ErrorBoundary>
      </div>
    )
  }

  // Local graph tab — render GraphView scoped to a single note's neighborhood
  if (activeTab.filePath.startsWith('__local-graph::')) {
    const centerPath = activeTab.filePath.slice('__local-graph::'.length)
    if (!activeTab.vaultId) {
      return (
        <div className="tab-content tab-content--empty" role="tabpanel" aria-label={t('tabContent.emptyPanelLabel')}>
          <p>{t('graph.noVault')}</p>
        </div>
      )
    }
    return (
      <div className="tab-content tab-content--graph" role="tabpanel" aria-label={activeTab.fileName}>
        <ErrorBoundary>
          <GraphView vaultId={activeTab.vaultId} localGraphCenterPath={centerPath} />
        </ErrorBoundary>
      </div>
    )
  }

  // Plugin view tab — render plugin view container
  if (activeTab.filePath.startsWith('__view::')) {
    const viewType = activeTab.filePath.slice('__view::'.length)
    const viewInfo = pluginActiveViews?.get(viewType)
    if (viewInfo) {
      return (
        <div
          key={`plugin-view-${activeTab.id}`}
          className="tab-content tab-content--plugin-view"
          role="tabpanel"
          aria-label={activeTab.fileName}
          ref={(el) => {
            if (el && !el.contains(viewInfo.containerEl)) {
              el.appendChild(viewInfo.containerEl)
            }
          }}
        />
      )
    }
    // View not found (may have been deactivated) — show empty state
    return (
      <div className="tab-content tab-content--empty" role="tabpanel" aria-label={t('tabContent.emptyPanelLabel')}>
        <p>{t('tabContent.noFileOpen')}</p>
      </div>
    )
  }

  // Loading state
  if (activeTab.loading) {
    return (
      <div className="tab-content tab-content--loading" role="tabpanel" aria-label={t('tabContent.panelLabel')}>
        <span role="status" aria-live="polite">
          <span className="app-loading-spinner" aria-hidden="true" />
          <span>{t('tabContent.loading')}</span>
        </span>
      </div>
    )
  }

  // Error state
  if (activeTab.error) {
    return (
      <div className="tab-content tab-content--error" role="tabpanel" aria-label={activeTab.fileName}>
        <p role="alert">
          {t('tabContent.fileLoadError', { error: activeTab.error })}
        </p>
      </div>
    )
  }

  // Binary file — render BinaryViewer
  if (activeTab.isBinary) {
    const extension = getFileExtension(activeTab.fileName)
    return (
      <div className="tab-content tab-content--binary" role="tabpanel" aria-label={activeTab.fileName}>
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
      <div className="tab-content tab-content--canvas" role="tabpanel" aria-label={activeTab.fileName}>
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

  // Plugin file view — render plugin's TextFileView container (e.g. Kanban board)
  // Only in view mode — edit mode shows raw markdown so the user can see/edit the source.
  if (fileViewMatch && activeTab && activeTab.mode !== 'edit') {
    const activeFileView = getActiveFileView(activeTab.vaultId, activeTab.filePath)
    if (activeFileView) {
      return (
        <div
          key={`plugin-file-view-${activeTab.id}`}
          className="tab-content tab-content--plugin-file-view"
          role="tabpanel"
          aria-label={activeTab.fileName}
          data-plugin-id={fileViewMatch.pluginId}
          ref={(el) => {
            if (el && !el.contains(activeFileView.containerEl)) {
              el.appendChild(activeFileView.containerEl)
            }
          }}
        />
      )
    }
    // View is being created asynchronously — show loading
    return (
      <div className="tab-content tab-content--loading" role="tabpanel" aria-label={t('tabContent.panelLabel')}>
        <span role="status" aria-live="polite">
          <span className="app-loading-spinner" aria-hidden="true" />
          <span>{t('tabContent.loading')}</span>
        </span>
      </div>
    )
  }

  // Edit mode
  if (activeTab.mode === 'edit') {
    const editContent = activeTab.editBuffer ?? activeTab.content
    const currentVault = appState.vaults.find((v) => v.id === activeTab.vaultId)
    const isReadOnly = currentVault?.permission === 'read'
    return (
      <div className="tab-content tab-content--edit" role="tabpanel" aria-label={activeTab.fileName}>
        <EditMode
          content={editContent}
          onChange={handleEditChange}
          onSave={handleSave}
          onCancel={handleCancel}
          saving={saving}
          error={activeTab.error}
          readOnly={isReadOnly}
          filePath={activeTab.filePath}
          tabId={activeTab.id}
          livePreviewMode={false}
          livePreviewOptions={{
            vaultId: activeTab.vaultId,
            directoryTree: appState.vaultTrees[activeTab.vaultId] ?? appState.directoryTree,
            token: apiClient?.getToken() ?? undefined,
            onInternalLinkClick: handleInternalLinkClick,
          }}
          onExternalFileDrop={handleExternalFileDrop}
          onImagePaste={handleImagePaste}
        />
      </div>
    )
  }

  // Preview mode — editable CM6 Live Preview (Variante 1)
  const editContentPreview = activeTab.editBuffer ?? activeTab.content
  const currentVaultPreview = appState.vaults.find((v) => v.id === activeTab.vaultId)
  const isReadOnlyPreview = currentVaultPreview?.permission === 'read'
  return (
    <div className="tab-content tab-content--edit" role="tabpanel" aria-label={activeTab.fileName}>
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
      <EditMode
        content={editContentPreview}
        onChange={handleEditChange}
        onSave={handleSave}
        onCancel={handleCancel}
        saving={saving}
        error={activeTab.error}
        readOnly={isReadOnlyPreview}
        filePath={activeTab.filePath}
        tabId={activeTab.id}
        livePreviewMode={true}
        livePreviewOptions={{
          vaultId: activeTab.vaultId,
          directoryTree: appState.vaultTrees[activeTab.vaultId] ?? appState.directoryTree,
          token: apiClient?.getToken() ?? undefined,
          onInternalLinkClick: handleInternalLinkClick,
        }}
        onExternalFileDrop={handleExternalFileDrop}
        onImagePaste={handleImagePaste}
      />
    </div>
  )
}
