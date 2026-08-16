import { useEffect, useRef, useState, useCallback } from 'react'
import { useTranslation } from '../i18n'
import { useLineNumbers } from '../hooks/useLineNumbers'
import { DropZone } from './DropZone'
import { showToast } from './ToastNotification'
import { CodeMirrorEditor } from '../editor/CodeMirrorEditor'
import type { IEditorHandle, EditorFormattingAction } from '../editor/types'
import type { LivePreviewOptions } from '../editor/live-preview'
import { isEmbeddableFile, buildInternalLinkText } from '../utils/internalLink'

/**
 * Props for the EditMode component.
 */
export interface EditModeProps {
  content: string
  onChange: (content: string) => void
  onSave: () => void
  onCancel: () => void
  saving: boolean
  error: string | null
  readOnly?: boolean
  /** Path of the currently open file (used for relative link computation on drop). */
  filePath?: string
  /** Unique tab ID for per-tab state management in CodeMirror. */
  tabId?: string
  /** Optional handler for external file drops from OS. Called with dropped files. */
  onExternalFileDrop?: (files: File[]) => Promise<{ uploaded: Array<{ fileName: string; path: string }> }>
  /** Optional handler for image paste from clipboard. Called with a single image File. */
  onImagePaste?: (file: File) => Promise<{ uploaded: Array<{ fileName: string; path: string }> }>
  /** Drives Live Preview vs. source mode from the tab mode. */
  livePreviewMode: boolean
  /** Options for the CM6 Live Preview extension (vault context + link/checkbox callbacks). */
  livePreviewOptions?: LivePreviewOptions
}

type SaveStatus = 'idle' | 'unsaved' | 'saving' | 'saved' | 'error'

/** MIME type used by the File Explorer to mark an internal drag (see FileExplorer.tsx). */
const INTERNAL_DRAG_TYPE = 'application/x-slatebase-path'

/**
 * EditMode renders a CodeMirror 6 editor with auto-save.
 *
 * Validates: Requirements 1.1, 1.5, 1.6, 1.7, 1.8, 1.9, 10.1, 10.2, 10.3, 10.4, 10.5
 */

export function EditMode({ content, onChange, onSave, onCancel: _onCancel, saving, error, readOnly, filePath, tabId, onExternalFileDrop, onImagePaste: _onImagePaste, livePreviewMode, livePreviewOptions }: EditModeProps) {
  const { t } = useTranslation()
  const [status, setStatus] = useState<SaveStatus>('idle')
  const [isDragOver, setIsDragOver] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wasSavingRef = useRef(false)
  const onSaveRef = useRef(onSave)
  useEffect(() => { onSaveRef.current = onSave })

  // Editor handle ref for imperative operations (undo/redo, formatting commands)
  const editorRef = useRef<IEditorHandle>(null)

  // Line numbers toggle state (persisted to localStorage, translates to CM6 showLineNumbers prop).
  // Toggled via the Command Palette ('toggleLineNumbers' editor command).
  const { enabled: lineNumbersEnabled, toggle: toggleLineNumbers } = useLineNumbers()

  // Compute effective live preview state (respects file size) — livePreviewMode is
  // driven by the tab mode (Variante 1).
  const isFileTooLarge = content.length > 50000
  const effectiveLivePreview = livePreviewMode && !isFileTooLarge

  // Show toast when file is too large for Live Preview (auto-disable notice)
  const prevFileTooLargeRef = useRef(isFileTooLarge)
  useEffect(() => {
    if (isFileTooLarge && livePreviewMode && !prevFileTooLargeRef.current) {
      showToast('info', t('editor.livePreviewFileTooLarge'))
    }
    prevFileTooLargeRef.current = isFileTooLarge
  }, [isFileTooLarge, livePreviewMode, t])

  // Track saving status transitions
  useEffect(() => {
    if (wasSavingRef.current && !saving) {
      if (error) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setStatus('error')
      } else {
        setStatus('saved')
        const timer = setTimeout(() => setStatus('idle'), 2000)
        return () => clearTimeout(timer)
      }
    }
    if (saving) setStatus('saving')
    wasSavingRef.current = saving
  }, [saving, error])

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [])

  /**
   * Called by CodeMirrorEditor when content changes.
   * Updates status to unsaved, triggers auto-save debounce, and calls onChange prop.
   */
  const handleContentChange = useCallback((newContent: string) => {
    onChange(newContent)
    setStatus('unsaved')
    // Debounce auto-save
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => { onSaveRef.current() }, 1500)
  }, [onChange])

  // ─── Listen for editor commands from the Command Palette ─────────────────
  useEffect(() => {
    function handleEditorCommand(e: Event) {
      const detail = (e as CustomEvent<{ action: string }>).detail
      if (!detail?.action) return
      if (readOnly) return

      const action = detail.action

      switch (action) {
        case 'undo':
          editorRef.current?.undo()
          break
        case 'redo':
          editorRef.current?.redo()
          break
        case 'toggleLineNumbers':
          toggleLineNumbers()
          break
        default:
          // Delegate all formatting actions to CM6
          editorRef.current?.applyFormatting(action as EditorFormattingAction)
          break
      }
    }

    window.addEventListener('slatebase:editor-command', handleEditorCommand)
    return () => {
      window.removeEventListener('slatebase:editor-command', handleEditorCommand)
    }
  }, [readOnly, toggleLineNumbers])

  // --- External file drop (from OS) via DropZone ---

  /** Derive target directory from the currently open file path. */
  const uploadTargetDir = filePath
    ? (filePath.includes('/') ? filePath.slice(0, filePath.lastIndexOf('/')) : '')
    : ''

  /** Handle external file drop from OS — uploads to same directory as current file. */
  const handleExternalFileDrop = useCallback(async (files: File[], _targetPath: string, dropPoint: { x: number; y: number }) => {
    if (!onExternalFileDrop || !filePath) return

    // Resolve the drop position in the document immediately (before the upload
    // completes) so the image lands where the drop cursor was shown, not
    // wherever the text cursor happens to be once the upload finishes.
    const view = editorRef.current?.getView()
    const insertPos = view?.posAtCoords(dropPoint) ?? view?.state.selection.main.from ?? 0

    try {
      const result = await onExternalFileDrop(files)

      // For image files, insert embed links via CM6
      const imageEmbeds: string[] = []
      for (const uploaded of result.uploaded) {
        if (isEmbeddableFile(uploaded.fileName)) {
          imageEmbeds.push(`![[${uploaded.fileName}]]`)
        }
      }

      if (imageEmbeds.length > 0 && editorRef.current) {
        const embedText = imageEmbeds.join('\n')
        editorRef.current.insertAtPos(embedText, insertPos)
        setStatus('unsaved')
        // Trigger auto-save
        if (debounceRef.current) clearTimeout(debounceRef.current)
        debounceRef.current = setTimeout(() => { onSaveRef.current() }, 1500)
      }
    } catch (err) {
      // Show toast for individual file errors with filename + reason
      for (const file of files) {
        const reason = err instanceof Error ? err.message : 'Upload fehlgeschlagen'
        showToast('error', `"${file.name}": ${reason}`)
      }
    }
  }, [onExternalFileDrop, filePath])

  // ─── DropZone drag-over state for external file drops ───────────────────
  // (The DropZone component handles its own drag state; this is for the internal
  //  file-tree DnD indicator which CM6 handles via its own drop extension)
  void isDragOver
  void setIsDragOver

  // --- Internal file drop (from the File Explorer) — inserts a wikilink/embed ---

  const currentVaultId = livePreviewOptions?.vaultId

  /** Allow the drop when dragging a file node from the File Explorer. */
  const handleInternalDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (!e.dataTransfer.types.includes(INTERNAL_DRAG_TYPE)) return
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'copy'
  }, [])

  /**
   * Inserts a wikilink for a file dragged from the File Explorer at the drop
   * position. Folders are ignored; files from a different vault are rejected
   * since their path can't be resolved against the open file's vault.
   */
  const handleInternalDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (!e.dataTransfer.types.includes(INTERNAL_DRAG_TYPE)) return
    e.preventDefault()
    e.stopPropagation()

    if (readOnly) return

    const draggedPath = e.dataTransfer.getData('application/x-slatebase-path')
    const draggedType = e.dataTransfer.getData('application/x-slatebase-type')
    const draggedVaultId = e.dataTransfer.getData('application/x-slatebase-vaultid')

    if (draggedType !== 'file' || !draggedPath) return

    if (currentVaultId && draggedVaultId && draggedVaultId !== currentVaultId) {
      showToast('warning', t('editor.internalLinkCrossVault'))
      return
    }

    const view = editorRef.current?.getView()
    const insertPos = view?.posAtCoords({ x: e.clientX, y: e.clientY }) ?? view?.state.selection.main.from ?? 0
    const fileName = draggedPath.split('/').pop() ?? draggedPath

    editorRef.current?.insertAtPos(buildInternalLinkText(fileName), insertPos)
    setStatus('unsaved')
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => { onSaveRef.current() }, 1500)
  }, [readOnly, currentVaultId, t])

  const internalDropHandlers = { onDragOver: handleInternalDragOver, onDrop: handleInternalDrop }

  // Status bar text
  const statusText = (() => {
    switch (status) {
      case 'unsaved': return t('editor.statusUnsaved')
      case 'saving': return t('editor.statusSaving')
      case 'saved': return t('editor.statusSaved')
      case 'error': return t('editor.statusError', { error: error ?? 'Unknown' })
      default: return ''
    }
  })()

  const statusClass = `edit-mode-status${status === 'saving' ? ' edit-mode-status--saving' : status === 'saved' ? ' edit-mode-status--saved' : status === 'error' ? ' edit-mode-status--error' : ''}`

  // Compute the effective tabId — use prop if provided, fall back to filePath
  const effectiveTabId = tabId ?? filePath ?? 'default'

  return (
    <div className="edit-mode-container">
      {/* Read-only banner — no native toolbar; formatting is done via the Command
          Palette or an Obsidian-compatible plugin toolbar (e.g. Editing Toolbar). */}
      {readOnly && (
        <div className="edit-mode-readonly-banner" role="status">
          {t('editor.readOnlyBanner')}
        </div>
      )}

      {/* Editor area — wrapped in DropZone for external file drops */}
      <DropZone
        onDrop={handleExternalFileDrop}
        targetPath={uploadTargetDir}
        disabled={!filePath}
        disabledMessage="Bitte zuerst eine Datei öffnen"
        className="edit-mode-drop-zone"
        hideOverlay
      >
        <div className="edit-mode-editor-area" {...internalDropHandlers}>
          <CodeMirrorEditor
            content={content}
            onContentChange={handleContentChange}
            readOnly={readOnly}
            tabId={effectiveTabId}
            filePath={filePath}
            livePreview={effectiveLivePreview}
            livePreviewOptions={livePreviewOptions}
            showLineNumbers={lineNumbersEnabled}
            editorRef={editorRef}
          />
        </div>
      </DropZone>

      {/* Status bar */}
      {status !== 'idle' && (
        <div className={statusClass} role={status === 'error' ? 'alert' : 'status'}>
          <span>{statusText}</span>
        </div>
      )}
    </div>
  )
}
