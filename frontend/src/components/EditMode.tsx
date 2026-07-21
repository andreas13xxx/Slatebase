import { useEffect, useRef, useState, useCallback } from 'react'
import { useTranslation } from '../i18n'
import { useLineNumbers } from '../hooks/useLineNumbers'
import { useFeatureContext } from '../state/featureContext'
import { DropZone } from './DropZone'
import { showToast } from './ToastNotification'
import { CodeMirrorEditor } from '../editor/CodeMirrorEditor'
import type { IEditorHandle, EditorFormattingAction } from '../editor/types'
import type { LivePreviewOptions } from '../editor/live-preview'
import {
  Heading1, Heading2, Heading3, Bold, Italic, Strikethrough,
  Code, Link, List, ListOrdered, CheckSquare, Table,
  Quote, Minus, Undo2, Redo2, Hash, History, Eye, FileText,
} from 'lucide-react'

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
  /** Optional callback to open the version browser for the current file. */
  onOpenVersions?: () => void
  /** When set, overrides the internal live-preview toggle and drives it from the tab mode (Variante 1). */
  livePreviewMode?: boolean
  /** Options for the CM6 Live Preview extension (vault context + link/checkbox callbacks). */
  livePreviewOptions?: LivePreviewOptions
}

type SaveStatus = 'idle' | 'unsaved' | 'saving' | 'saved' | 'error'

/**
 * Toolbar button definition for the editor toolbar.
 */
interface ToolbarButton {
  icon: React.ReactNode
  labelKey: string
  action: EditorFormattingAction
}

/** Toolbar button groups separated by 'sep'. */
const TOOLBAR_BUTTONS: (ToolbarButton | 'sep')[] = [
  { icon: <Heading1 size={14} />, labelKey: 'editor.heading1', action: 'heading1' },
  { icon: <Heading2 size={14} />, labelKey: 'editor.heading2', action: 'heading2' },
  { icon: <Heading3 size={14} />, labelKey: 'editor.heading3', action: 'heading3' },
  'sep',
  { icon: <Bold size={14} />, labelKey: 'editor.bold', action: 'bold' },
  { icon: <Italic size={14} />, labelKey: 'editor.italic', action: 'italic' },
  { icon: <Strikethrough size={14} />, labelKey: 'editor.strikethrough', action: 'strikethrough' },
  { icon: <Code size={14} />, labelKey: 'editor.code', action: 'code' },
  'sep',
  { icon: <Link size={14} />, labelKey: 'editor.link', action: 'link' },
  'sep',
  { icon: <List size={14} />, labelKey: 'editor.bulletList', action: 'bulletList' },
  { icon: <ListOrdered size={14} />, labelKey: 'editor.numberedList', action: 'numberedList' },
  { icon: <CheckSquare size={14} />, labelKey: 'editor.task', action: 'task' },
  'sep',
  { icon: <Quote size={14} />, labelKey: 'editor.quote', action: 'quote' },
  { icon: <Minus size={14} />, labelKey: 'editor.horizontalRule', action: 'horizontalRule' },
  { icon: <Table size={14} />, labelKey: 'editor.table', action: 'table' },
]

/**
 * EditMode renders a CodeMirror 6 editor with toolbar and auto-save.
 *
 * Validates: Requirements 1.1, 1.5, 1.6, 1.7, 1.8, 1.9, 10.1, 10.2, 10.3, 10.4, 10.5
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function EditMode({ content, onChange, onSave, onCancel: _onCancel, saving, error, readOnly, filePath, tabId, onExternalFileDrop, onImagePaste: _onImagePaste, onOpenVersions, livePreviewMode, livePreviewOptions }: EditModeProps) {
  const { t } = useTranslation()
  const [status, setStatus] = useState<SaveStatus>('idle')
  const [isDragOver, setIsDragOver] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wasSavingRef = useRef(false)
  const onSaveRef = useRef(onSave)
  useEffect(() => { onSaveRef.current = onSave })

  // Editor handle ref for imperative operations (toolbar, undo/redo, commands)
  const editorRef = useRef<IEditorHandle>(null)

  // Line numbers toggle state (persisted to localStorage, translates to CM6 showLineNumbers prop)
  const { enabled: lineNumbersEnabled, toggle: toggleLineNumbers } = useLineNumbers()

  // Feature toggle: check if live-preview is enabled
  const { isEnabled: isFeatureEnabled } = useFeatureContext()
  const livePreviewFeatureEnabled = isFeatureEnabled('live-preview')

  // Live Preview state (persisted to localStorage)
  const LIVE_PREVIEW_STORAGE_KEY = 'slatebase_editor_live_preview'
  const [livePreviewEnabled, setLivePreviewEnabled] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem(LIVE_PREVIEW_STORAGE_KEY)
      // Default: true (Live Preview on by default)
      return stored === null ? true : stored === 'true'
    } catch {
      return true
    }
  })

  // Compute effective live preview state (respects feature toggle + file size).
  // When livePreviewMode is set (Variante 1), the tab mode drives live preview,
  // overriding the localStorage-based toggle.
  const isFileTooLarge = content.length > 50000
  const effectiveLivePreview = livePreviewMode !== undefined
    ? (livePreviewFeatureEnabled && livePreviewMode && !isFileTooLarge)
    : (livePreviewFeatureEnabled && livePreviewEnabled && !isFileTooLarge)

  /** Toggle Live Preview mode and persist to localStorage. */
  const toggleLivePreview = useCallback(() => {
    if (isFileTooLarge) {
      showToast('info', t('editor.livePreviewFileTooLarge'))
      return
    }
    setLivePreviewEnabled(prev => {
      const next = !prev
      try {
        localStorage.setItem(LIVE_PREVIEW_STORAGE_KEY, String(next))
      } catch {
        // localStorage unavailable — ignore
      }
      return next
    })
  }, [isFileTooLarge, t])

  // Show toast when file is too large for Live Preview (auto-disable notice)
  const prevFileTooLargeRef = useRef(isFileTooLarge)
  useEffect(() => {
    if (isFileTooLarge && livePreviewEnabled && livePreviewFeatureEnabled && !prevFileTooLargeRef.current) {
      showToast('info', t('editor.livePreviewFileTooLarge'))
    }
    prevFileTooLargeRef.current = isFileTooLarge
  }, [isFileTooLarge, livePreviewEnabled, livePreviewFeatureEnabled, t])

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
  const handleExternalFileDrop = useCallback(async (files: File[], _targetPath: string) => {
    if (!onExternalFileDrop || !filePath) return

    try {
      const result = await onExternalFileDrop(files)

      // For image files, insert embed links via CM6
      const imageEmbeds: string[] = []
      for (const uploaded of result.uploaded) {
        // Check common image/embeddable extensions
        const name = uploaded.fileName.toLowerCase()
        if (name.endsWith('.png') || name.endsWith('.jpg') || name.endsWith('.jpeg') ||
            name.endsWith('.gif') || name.endsWith('.webp') || name.endsWith('.svg') ||
            name.endsWith('.pdf')) {
          imageEmbeds.push(`![[${uploaded.fileName}]]`)
        }
      }

      if (imageEmbeds.length > 0 && editorRef.current) {
        const embedText = imageEmbeds.join('\n')
        editorRef.current.insertAtCursor(embedText)
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
      {/* Read-only banner or Toolbar */}
      {readOnly ? (
        <div className="edit-mode-readonly-banner" role="status">
          {t('editor.readOnlyBanner')}
        </div>
      ) : (
        <div className="edit-mode-toolbar" role="toolbar" aria-label={t('editor.toolbarAriaLabel')}>
          {/* Undo/Redo buttons */}
          <button
            type="button"
            className="edit-toolbar-btn"
            title={t('editor.undo')}
            aria-label={t('editor.undo')}
            onClick={() => editorRef.current?.undo()}
            tabIndex={-1}
          >
            <Undo2 size={14} />
          </button>
          <button
            type="button"
            className="edit-toolbar-btn"
            title={t('editor.redo')}
            aria-label={t('editor.redo')}
            onClick={() => editorRef.current?.redo()}
            tabIndex={-1}
          >
            <Redo2 size={14} />
          </button>
          <div className="edit-toolbar-separator" />
          {TOOLBAR_BUTTONS.map((item, i) => {
            if (item === 'sep') {
              return <div key={`sep-${i}`} className="edit-toolbar-separator" />
            }
            const label = t(item.labelKey as Parameters<typeof t>[0])
            return (
              <button
                key={item.labelKey}
                type="button"
                className="edit-toolbar-btn"
                title={label}
                aria-label={label}
                onClick={() => editorRef.current?.applyFormatting(item.action)}
                tabIndex={-1}
              >
                {item.icon}
              </button>
            )
          })}
          {/* Line Numbers toggle */}
          <div className="edit-toolbar-separator" />
          <button
            type="button"
            className={`edit-toolbar-btn${lineNumbersEnabled ? ' edit-toolbar-btn--active' : ''}`}
            title={t('editor.lineNumbers')}
            aria-label={t('editor.lineNumbers')}
            aria-pressed={lineNumbersEnabled}
            onClick={toggleLineNumbers}
            tabIndex={-1}
          >
            <Hash size={14} />
          </button>
          {/* Live Preview toggle — only shown when feature is enabled and the tab
              is not driving the mode (Variante 1 hides this toggle) */}
          {livePreviewFeatureEnabled && livePreviewMode === undefined && (
            <button
              type="button"
              className={`edit-toolbar-btn${effectiveLivePreview ? ' edit-toolbar-btn--active' : ''}`}
              title={t('editor.livePreview')}
              aria-label={t('editor.livePreview')}
              aria-pressed={effectiveLivePreview}
              onClick={toggleLivePreview}
              tabIndex={-1}
            >
              {effectiveLivePreview ? <Eye size={14} /> : <FileText size={14} />}
            </button>
          )}
          {/* Versionen button */}
          {onOpenVersions && (
            <button
              type="button"
              className="edit-toolbar-btn"
              title="Versionen"
              aria-label="Versionen"
              onClick={onOpenVersions}
              tabIndex={-1}
            >
              <History size={14} />
            </button>
          )}
        </div>
      )}

      {/* Editor area — wrapped in DropZone for external file drops */}
      <DropZone
        onDrop={handleExternalFileDrop}
        targetPath={uploadTargetDir}
        disabled={!filePath}
        disabledMessage="Bitte zuerst eine Datei öffnen"
        className="edit-mode-drop-zone"
      >
        <div className="edit-mode-editor-area">
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
