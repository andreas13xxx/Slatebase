import { useEffect, useRef, useState, useCallback } from 'react'
import { useTranslation } from '../i18n'
import { useLineNumbers } from '../hooks/useLineNumbers'
import { useReadableLineLength } from '../hooks/useReadableLineLength'
import { useSpellcheck } from '../hooks/useSpellcheck'
import { isSpellcheckLanguage } from '../editor/spellcheck'
import { DropZone } from './DropZone'
import { showToast } from './ToastNotification'
import { CodeMirrorEditor } from '../editor/CodeMirrorEditor'
import type { IEditorHandle, EditorFormattingAction } from '../editor/types'
import type { LivePreviewOptions } from '../editor/live-preview'
import { buildInternalLinkText } from '../utils/internalLink'

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

export function EditMode({ content, onChange, onSave, onCancel: _onCancel, saving, error, readOnly, filePath, tabId, onExternalFileDrop, onImagePaste, livePreviewMode, livePreviewOptions }: EditModeProps) {
  const { t } = useTranslation()
  const [status, setStatus] = useState<SaveStatus>('idle')
  const [isDragOver, setIsDragOver] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wasSavingRef = useRef(false)
  const onSaveRef = useRef(onSave)
  useEffect(() => { onSaveRef.current = onSave })

  // Editor handle ref for imperative operations (undo/redo, formatting commands)
  const editorRef = useRef<IEditorHandle>(null)
  // Hidden <input type="file"> triggered by the "Anhang einfügen" editor command.
  const attachFileInputRef = useRef<HTMLInputElement>(null)

  // Line numbers toggle state (persisted to localStorage, translates to CM6 showLineNumbers prop).
  // Toggled via the Command Palette ('toggleLineNumbers' editor command).
  const { enabled: lineNumbersEnabled, toggle: toggleLineNumbers } = useLineNumbers()
  // Same pattern as line numbers — persisted, toggled via Command Palette editor commands.
  const { enabled: readableLineLengthEnabled, toggle: toggleReadableLineLength } = useReadableLineLength()
  const {
    enabled: spellcheckEnabled,
    toggle: toggleSpellcheck,
    language: spellcheckLanguage,
    setLanguage: setSpellcheckLanguage,
  } = useSpellcheck()

  // Compute the effective tabId — the prop when given, else the file path.
  // Declared up here because the auto-save flush effect keys on it.
  const effectiveTabId = tabId ?? filePath ?? 'default'

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

  /** (Re)starts the auto-save debounce. Cleared by `flushPendingSave`. */
  const scheduleSave = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null
      onSaveRef.current()
    }, 1500)
  }, [])

  /**
   * Saves immediately when the debounce is still pending, so an edit made in
   * the last 1.5s isn't dropped once this editor can no longer save it.
   * Cancelling the timer alone (what the unmount cleanup used to do) lost that
   * edit silently: it stayed in the tab's edit buffer and never reached disk.
   *
   * Frontmatter edits hit this hardest — committing a property and immediately
   * clicking away or switching notes is the normal gesture there, while typing
   * prose usually keeps the timer alive until it fires on its own.
   */
  const flushPendingSave = useCallback(() => {
    if (!debounceRef.current) return
    clearTimeout(debounceRef.current)
    debounceRef.current = null
    onSaveRef.current()
  }, [])

  // Flush on unmount and on every tab switch. The switch matters as much as the
  // unmount: this component stays mounted across tabs (only `tabId` changes), so
  // a pending timer would otherwise fire against the *new* tab's onSave while the
  // previous note's edit was never written. Effect cleanups all run before any
  // effect body in the same commit, so `onSaveRef` still holds the outgoing tab's
  // save callback at this point.
  useEffect(() => {
    return () => { flushPendingSave() }
  }, [effectiveTabId, flushPendingSave])

  // A pending timer dies with the page, so flush when the page goes away:
  // `pagehide` covers close/navigate/bfcache, `visibilitychange` the
  // switch-to-another-window case where the browser may freeze timers.
  useEffect(() => {
    const handlePageHide = () => { flushPendingSave() }
    const handleVisibilityChange = () => { if (document.hidden) flushPendingSave() }
    window.addEventListener('pagehide', handlePageHide)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      window.removeEventListener('pagehide', handlePageHide)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [flushPendingSave])

  /**
   * Called by CodeMirrorEditor when content changes.
   * Updates status to unsaved, triggers auto-save debounce, and calls onChange prop.
   */
  const handleContentChange = useCallback((newContent: string) => {
    onChange(newContent)
    setStatus('unsaved')
    scheduleSave()
  }, [onChange, scheduleSave])

  // ─── Listen for editor commands from the Command Palette ─────────────────
  useEffect(() => {
    function handleEditorCommand(e: Event) {
      const detail = (e as CustomEvent<{ action: string; language?: unknown }>).detail
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
        case 'toggleReadableLineLength':
          toggleReadableLineLength()
          break
        case 'toggleSpellcheck':
          toggleSpellcheck()
          break
        case 'setSpellcheckLanguage':
          // The language rides along on the event from the editor context
          // menu; anything else is ignored rather than trusted into the hook.
          if (isSpellcheckLanguage(detail.language)) setSpellcheckLanguage(detail.language)
          break
        case 'showContextMenu':
          editorRef.current?.showContextMenu()
          break
        case 'attachFile':
          // The actual upload happens in handleAttachFileSelected, once the
          // browser's native file picker resolves.
          attachFileInputRef.current?.click()
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
  }, [readOnly, toggleLineNumbers, toggleReadableLineLength, toggleSpellcheck, setSpellcheckLanguage])

  // --- External file drop (from OS) via DropZone, and the "Anhang einfügen" command ---

  /** Derive target directory from the currently open file path. */
  const uploadTargetDir = filePath
    ? (filePath.includes('/') ? filePath.slice(0, filePath.lastIndexOf('/')) : '')
    : ''

  /**
   * Uploads `files` via `onExternalFileDrop` and inserts a wikilink (or embed,
   * for images/PDFs) for each at `insertPos`. Shared by the OS drag-drop handler
   * and the "Anhang einfügen" file-picker handler below — they differ only in
   * how `files` and `insertPos` are obtained.
   */
  const uploadAndInsertLinks = useCallback(async (files: File[], insertPos: number) => {
    if (!onExternalFileDrop) return
    try {
      const result = await onExternalFileDrop(files)

      const linkTexts = result.uploaded.map((uploaded) => buildInternalLinkText(uploaded.fileName))
      if (linkTexts.length > 0 && editorRef.current) {
        editorRef.current.insertAtPos(linkTexts.join('\n'), insertPos)
        setStatus('unsaved')
        scheduleSave()
      }
    } catch (err) {
      // Show toast for individual file errors with filename + reason
      for (const file of files) {
        const reason = err instanceof Error ? err.message : 'Upload fehlgeschlagen'
        showToast('error', `"${file.name}": ${reason}`)
      }
    }
  }, [onExternalFileDrop, scheduleSave])

  /** Handle external file drop from OS — uploads to same directory as current file. */
  const handleExternalFileDrop = useCallback(async (files: File[], _targetPath: string, dropPoint: { x: number; y: number }) => {
    if (!onExternalFileDrop || !filePath) return

    // Resolve the drop position in the document immediately (before the upload
    // completes) so the image lands where the drop cursor was shown, not
    // wherever the text cursor happens to be once the upload finishes.
    const view = editorRef.current?.getView()
    const insertPos = view?.posAtCoords(dropPoint) ?? view?.state.selection.main.from ?? 0

    await uploadAndInsertLinks(files, insertPos)
  }, [onExternalFileDrop, filePath, uploadAndInsertLinks])

  /**
   * Handle the file(s) chosen via the hidden input triggered by the "Anhang
   * einfügen" editor command. Inserts at the current cursor position, since
   * there's no drop point for a file-picker selection.
   */
  const handleAttachFileSelected = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : []
    // Reset so picking the same file again still fires a change event.
    e.target.value = ''
    if (files.length === 0 || !onExternalFileDrop || !filePath) return

    const insertPos = editorRef.current?.getView()?.state.selection.main.from ?? 0
    await uploadAndInsertLinks(files, insertPos)
  }, [onExternalFileDrop, filePath, uploadAndInsertLinks])

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
    scheduleSave()
  }, [readOnly, currentVaultId, t, scheduleSave])

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
            readableLineLength={readableLineLengthEnabled}
            spellcheck={spellcheckEnabled}
            spellcheckLanguage={spellcheckLanguage}
            editorRef={editorRef}
            onImagePaste={onImagePaste}
          />
        </div>
      </DropZone>

      {/* Hidden file picker for the "Anhang einfügen" editor command (Command
          Palette / Obsidian-compat plugins) — see the 'attachFile' case above. */}
      <input
        ref={attachFileInputRef}
        type="file"
        multiple
        onChange={handleAttachFileSelected}
        style={{ display: 'none' }}
        aria-hidden="true"
        tabIndex={-1}
      />

      {/* Status bar */}
      {status !== 'idle' && (
        <div className={statusClass} role={status === 'error' ? 'alert' : 'status'}>
          <span>{statusText}</span>
        </div>
      )}
    </div>
  )
}
