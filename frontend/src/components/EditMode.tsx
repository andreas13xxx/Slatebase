import { useEffect, useRef, useState, useCallback } from 'react'
import { useTranslation } from '../i18n'
import { isEmbeddableFile } from '../utils/pathUtils'
import { useHistoryStack } from '../hooks/useHistoryStack'
import { useLineNumbers } from '../hooks/useLineNumbers'
import { LineNumbers } from './LineNumbers'
import { DropZone } from './DropZone'
import { showToast } from './ToastNotification'
import {
  Heading1, Heading2, Heading3, Bold, Italic, Strikethrough,
  Code, Link, List, ListOrdered, CheckSquare, Table,
  Quote, Minus, Undo2, Redo2, Hash, History,
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
  /** Optional handler for external file drops from OS. Called with dropped files. */
  onExternalFileDrop?: (files: File[]) => Promise<{ uploaded: Array<{ fileName: string; path: string }> }>
  /** Optional handler for image paste from clipboard. Called with a single image File. */
  onImagePaste?: (file: File) => Promise<{ uploaded: Array<{ fileName: string; path: string }> }>
  /** Optional callback to open the version browser for the current file. */
  onOpenVersions?: () => void
}

type SaveStatus = 'idle' | 'unsaved' | 'saving' | 'saved' | 'error'

interface ToolbarAction {
  icon: React.ReactNode
  labelKey: string
  action: (text: string, selStart: number, selEnd: number, t: (key: string) => string) => { text: string; cursor: number }
  separator?: boolean
}

/** Wraps selected text or inserts at cursor. */
function wrap(text: string, selStart: number, selEnd: number, before: string, after = before): { text: string; cursor: number } {
  const selected = text.slice(selStart, selEnd)
  const newText = text.slice(0, selStart) + before + selected + after + text.slice(selEnd)
  return { text: newText, cursor: selStart + before.length + selected.length + after.length }
}

/** Prepends a prefix to the current line. */
function prependLine(text: string, selStart: number, prefix: string): { text: string; cursor: number } {
  const lineStart = text.lastIndexOf('\n', selStart - 1) + 1
  const newText = text.slice(0, lineStart) + prefix + text.slice(lineStart)
  return { text: newText, cursor: selStart + prefix.length }
}

const TOOLBAR_ACTIONS: (ToolbarAction | 'sep')[] = [
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  { icon: <Heading1 size={14} />, labelKey: 'editor.heading1', action: (t, s, _e) => prependLine(t, s, '# ') },
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  { icon: <Heading2 size={14} />, labelKey: 'editor.heading2', action: (t, s, _e) => prependLine(t, s, '## ') },
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  { icon: <Heading3 size={14} />, labelKey: 'editor.heading3', action: (t, s, _e) => prependLine(t, s, '### ') },
  'sep',
  { icon: <Bold size={14} />, labelKey: 'editor.bold', action: (t, s, e) => wrap(t, s, e, '**') },
  { icon: <Italic size={14} />, labelKey: 'editor.italic', action: (t, s, e) => wrap(t, s, e, '_') },
  { icon: <Strikethrough size={14} />, labelKey: 'editor.strikethrough', action: (t, s, e) => wrap(t, s, e, '~~') },
  { icon: <Code size={14} />, labelKey: 'editor.code', action: (t, s, e) => wrap(t, s, e, '`') },
  'sep',
  { icon: <Link size={14} />, labelKey: 'editor.link', action: (t, s, e) => {
    const selected = t.slice(s, e) || 'Text'
    const newText = t.slice(0, s) + `[${selected}](url)` + t.slice(e)
    return { text: newText, cursor: s + selected.length + 3 }
  }},
  'sep',
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  { icon: <List size={14} />, labelKey: 'editor.bulletList', action: (t, s, _e) => prependLine(t, s, '- ') },
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  { icon: <ListOrdered size={14} />, labelKey: 'editor.numberedList', action: (t, s, _e) => prependLine(t, s, '1. ') },
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  { icon: <CheckSquare size={14} />, labelKey: 'editor.task', action: (t, s, _e) => prependLine(t, s, '- [ ] ') },
  'sep',
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  { icon: <Quote size={14} />, labelKey: 'editor.quote', action: (t, s, _e) => prependLine(t, s, '> ') },
  { icon: <Minus size={14} />, labelKey: 'editor.horizontalRule', action: (t, s, e) => {
    const ins = '\n---\n'
    return { text: t.slice(0, s) + ins + t.slice(e), cursor: s + ins.length }
  }},
  { icon: <Table size={14} />, labelKey: 'editor.table', action: (t, s, e, translate) => {
    const col = translate('editor.tableTemplate.column')
    const cell = translate('editor.tableTemplate.cell')
    const tbl = `\n| ${col} 1 | ${col} 2 |\n|----------|----------|\n| ${cell}    | ${cell}    |\n`
    return { text: t.slice(0, s) + tbl + t.slice(e), cursor: s + tbl.length }
  }},
]

/**
 * EditMode renders a plain-text editor with toolbar and auto-save.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function EditMode({ content, onChange, onSave, onCancel: _onCancel, saving, error, readOnly, filePath, onExternalFileDrop, onImagePaste, onOpenVersions }: EditModeProps) {
  const { t } = useTranslation()
  const [status, setStatus] = useState<SaveStatus>('idle')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wasSavingRef = useRef(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const onSaveRef = useRef(onSave)
  useEffect(() => { onSaveRef.current = onSave })

  // Undo/Redo history stack
  const { pushState, undo, redo, canUndo, canRedo, clear: clearHistory } = useHistoryStack()

  // Text-change history tracking: capture snapshots on word boundaries and idle pauses
  const lastChangeTimeRef = useRef<number>(0)
  const historyPendingRef = useRef(false)
  const prevContentRef = useRef(content)
  const prevSelectionRef = useRef<{ start: number; end: number }>({ start: 0, end: 0 })
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const historyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const lastChangeTypeRef = useRef<'insert' | 'delete' | null>(null)

  // Line numbers toggle state
  const { enabled: lineNumbersEnabled, toggle: toggleLineNumbers } = useLineNumbers()
  const [textareaScrollTop, setTextareaScrollTop] = useState(0)
  const LINE_HEIGHT = 20.8 // 13px font-size × 1.6 line-height

  // Clear history stack on file switch
  const prevFilePathRef = useRef(filePath)
  useEffect(() => {
    if (prevFilePathRef.current !== filePath) {
      clearHistory()
      prevContentRef.current = content
      prevSelectionRef.current = { start: 0, end: 0 }
      historyPendingRef.current = false
      prevFilePathRef.current = filePath
    }
  }, [filePath, clearHistory, content])


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

  const triggerAutoSave = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => { onSaveRef.current() }, 1500)
  }, [])

  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [])

  const [isDragOver, setIsDragOver] = useState(false)

  /** Handles dragOver on the textarea — shows visual indicator for valid drops. */
  const handleTextareaDragOver = useCallback((e: React.DragEvent<HTMLTextAreaElement>) => {
    // Ignore if read-only or no file open
    if (readOnly || !filePath) return

    // Check if the drag contains our custom MIME type (internal file tree drag)
    if (!e.dataTransfer.types.includes('application/x-slatebase-path')) return

    e.preventDefault()
    e.stopPropagation() // Prevent DropZone parent from activating for internal drags
    e.dataTransfer.dropEffect = 'copy'
    setIsDragOver(true)
  }, [readOnly, filePath])

  /** Handles dragLeave on the textarea — removes visual indicator. */
  const handleTextareaDragLeave = useCallback(() => {
    setIsDragOver(false)
  }, [])

  /** Handles drop on the textarea — inserts Markdown link at drop position. */
  const handleTextareaDrop = useCallback((e: React.DragEvent<HTMLTextAreaElement>) => {
    setIsDragOver(false)

    // Ignore if read-only or no file open
    if (readOnly || !filePath) return

    const droppedPath = e.dataTransfer.getData('application/x-slatebase-path')
    const droppedType = e.dataTransfer.getData('application/x-slatebase-type')

    // Ignore if not from FileExplorer or if it's a folder
    if (!droppedPath) return
    if (droppedType === 'directory') return

    e.preventDefault()
    e.stopPropagation() // Prevent DropZone parent from processing this internal drag

    // Get the filename from the dropped path (handle both / and \ separators)
    const normalizedDroppedPath = droppedPath.replace(/\\/g, '/')
    const fileName = normalizedDroppedPath.split('/').pop() ?? normalizedDroppedPath

    // Display name: filename without extension
    const displayName = fileName.includes('.')
      ? fileName.slice(0, fileName.lastIndexOf('.'))
      : fileName

    // Determine link format using Obsidian conventions:
    // - Images/PDFs: ![[filename.ext]] (embed with extension)
    // - Markdown files: [[filename]] (wikilink without .md extension)
    // - Other files: [[filename.ext]] (wikilink with extension)
    let linkText: string
    if (isEmbeddableFile(fileName)) {
      linkText = `![[${fileName}]]`
    } else if (fileName.toLowerCase().endsWith('.md')) {
      linkText = `[[${displayName}]]`
    } else {
      linkText = `[[${fileName}]]`
    }

    // Determine insertion position from drop coordinates
    const ta = textareaRef.current
    if (!ta) return

    // Use caretRangeFromPoint to find the character position at the drop coordinates
    let insertPos = ta.selectionStart
    if (document.caretRangeFromPoint) {
      const range = document.caretRangeFromPoint(e.clientX, e.clientY)
      if (range && ta.contains(range.startContainer)) {
        // For textarea, we need to calculate position differently
        // The drop event sets the cursor position, so we can use selectionStart after focus
        ta.focus()
        insertPos = ta.selectionStart
      }
    } else {
      // Fallback: focus and use current selection
      ta.focus()
      insertPos = ta.selectionStart
    }

    // Insert the link at the computed position
    pushState({ text: content, selectionStart: insertPos, selectionEnd: insertPos })
    const newContent = content.slice(0, insertPos) + linkText + content.slice(insertPos)
    onChange(newContent)

    // Trigger auto-save
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => { onSaveRef.current() }, 1500)

    // Position cursor after the inserted link
    const newCursorPos = insertPos + linkText.length
    requestAnimationFrame(() => {
      ta.focus()
      ta.setSelectionRange(newCursorPos, newCursorPos)
    })
  }, [readOnly, filePath, content, onChange, pushState])

  /**
   * Pushes the previous content to the history stack when a word boundary
   * is detected or the change type switches (insert ↔ delete).
   * Also schedules a deferred push for idle pauses.
   */
  const maybePushHistory = useCallback((newValue: string) => {
    const now = Date.now()
    const prevContent = prevContentRef.current
    const isDelete = newValue.length < prevContent.length
    const changeType: 'insert' | 'delete' = isDelete ? 'delete' : 'insert'
    const timeSinceLastChange = now - lastChangeTimeRef.current

    // Determine if we should capture a snapshot before this change
    const shouldPush =
      !historyPendingRef.current || // First keystroke in a new sequence
      timeSinceLastChange > 1000 || // Returned after idle pause
      (lastChangeTypeRef.current !== null && changeType !== lastChangeTypeRef.current) // Switched between typing and deleting

    if (shouldPush && prevContent !== newValue) {
      pushState({
        text: prevContent,
        selectionStart: prevSelectionRef.current.start,
        selectionEnd: prevSelectionRef.current.end,
      })
      historyPendingRef.current = true
    }

    lastChangeTypeRef.current = changeType
    lastChangeTimeRef.current = now
    prevContentRef.current = newValue

    // Update selection tracking
    const ta = textareaRef.current
    if (ta) {
      prevSelectionRef.current = { start: ta.selectionStart, end: ta.selectionEnd }
    }

    // Schedule a deferred snapshot if the user stops typing (500ms idle)
    if (historyTimerRef.current) clearTimeout(historyTimerRef.current)
    historyTimerRef.current = setTimeout(() => {
      // Mark as "no pending sequence" so next keystroke will push a snapshot
      historyPendingRef.current = false
      lastChangeTypeRef.current = null
    }, 500)
  }, [pushState])

  // Cleanup history timer on unmount
  useEffect(() => {
    return () => { if (historyTimerRef.current) clearTimeout(historyTimerRef.current) }
  }, [])

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value
    maybePushHistory(newValue)
    onChange(newValue)
    setStatus('unsaved')
    triggerAutoSave()
  }

  /** Handles textarea scroll to sync with LineNumbers. */
  const handleTextareaScroll = useCallback(() => {
    const ta = textareaRef.current
    if (ta) {
      setTextareaScrollTop(ta.scrollTop)
    }
  }, [])

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

      // For image and PDF files, insert embed links at cursor position
      const ta = textareaRef.current
      const imageEmbeds: string[] = []
      for (const uploaded of result.uploaded) {
        if (isEmbeddableFile(uploaded.fileName)) {
          imageEmbeds.push(`![[${uploaded.fileName}]]`)
        }
      }

      if (imageEmbeds.length > 0 && ta) {
        const insertPos = ta.selectionStart
        const embedText = imageEmbeds.join('\n')
        pushState({ text: content, selectionStart: insertPos, selectionEnd: insertPos })
        const newContent = content.slice(0, insertPos) + embedText + content.slice(insertPos)
        onChange(newContent)

        // Trigger auto-save
        if (debounceRef.current) clearTimeout(debounceRef.current)
        debounceRef.current = setTimeout(() => { onSaveRef.current() }, 1500)

        // Position cursor after the inserted embeds
        const newCursorPos = insertPos + embedText.length
        requestAnimationFrame(() => {
          ta.focus()
          ta.setSelectionRange(newCursorPos, newCursorPos)
        })
      }
    } catch (err) {
      // Show toast for individual file errors with filename + reason
      for (const file of files) {
        const reason = err instanceof Error ? err.message : 'Upload fehlgeschlagen'
        showToast('error', `"${file.name}": ${reason}`)
      }
    }
  }, [onExternalFileDrop, filePath, content, onChange, pushState])

  // --- Image paste handler (clipboard) ---

  /** Maximum image paste file size: 10 MB */
  const MAX_IMAGE_PASTE_SIZE = 10 * 1024 * 1024

  /** Supported image MIME types for paste. */
  const IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']

  /**
   * Handles paste events — intercepts only when clipboard contains image data.
   * Uploads the image via the paste API and inserts `![[filename]]` at cursor.
   */
  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    // Ignore paste when no file is open or handler not available
    if (!filePath || !onImagePaste) return

    // Check clipboardData.items for image MIME types
    const items = e.clipboardData?.items
    if (!items) return

    let imageItem: DataTransferItem | null = null
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (item && item.kind === 'file' && IMAGE_MIME_TYPES.includes(item.type)) {
        imageItem = item
        break
      }
    }

    // If no image found, let normal text paste happen
    if (!imageItem) return

    // Image found — prevent default text paste behavior
    e.preventDefault()

    const file = imageItem.getAsFile()
    if (!file) return

    // Validate size (10 MB limit)
    if (file.size > MAX_IMAGE_PASTE_SIZE) {
      showToast('error', `Bild zu groß: ${(file.size / 1024 / 1024).toFixed(1)} MB (maximal 10 MB)`)
      return
    }

    // Capture cursor position before async operation
    const ta = textareaRef.current
    if (!ta) return
    const insertPos = ta.selectionStart

    // Upload the image
    onImagePaste(file)
      .then((result) => {
        if (result.uploaded.length === 0) return

        const uploadedFile = result.uploaded[0]!
        const embedLink = `![[${uploadedFile.fileName}]]`

        // Insert embed link at cursor position
        pushState({ text: content, selectionStart: insertPos, selectionEnd: insertPos })
        const newContent = content.slice(0, insertPos) + embedLink + content.slice(insertPos)
        onChange(newContent)
        setStatus('unsaved')
        triggerAutoSave()

        // Position cursor after the inserted embed
        const newCursorPos = insertPos + embedLink.length
        requestAnimationFrame(() => {
          const textarea = textareaRef.current
          if (textarea) {
            textarea.focus()
            textarea.setSelectionRange(newCursorPos, newCursorPos)
          }
        })
      })
      .catch((err) => {
        const reason = err instanceof Error ? err.message : 'Upload fehlgeschlagen'
        showToast('error', `Bild-Upload fehlgeschlagen: ${reason}`)
      })
  }, [filePath, onImagePaste, content, onChange, pushState, triggerAutoSave])

  /** Perform undo: restore previous state from history stack. */
  const performUndo = useCallback(() => {
    const ta = textareaRef.current
    if (!ta) return

    // If there are uncommitted text changes, push current content first
    if (historyPendingRef.current) {
      pushState({
        text: prevContentRef.current,
        selectionStart: ta.selectionStart,
        selectionEnd: ta.selectionEnd,
      })
      historyPendingRef.current = false
      lastChangeTypeRef.current = null
      if (historyTimerRef.current) {
        clearTimeout(historyTimerRef.current)
        historyTimerRef.current = null
      }
    }

    const entry = undo()
    if (!entry) return
    prevContentRef.current = entry.text
    prevSelectionRef.current = { start: entry.selectionStart, end: entry.selectionEnd }
    onChange(entry.text)
    setStatus('unsaved')
    triggerAutoSave()
    requestAnimationFrame(() => {
      ta.focus()
      ta.setSelectionRange(entry.selectionStart, entry.selectionEnd)
    })
  }, [undo, onChange, triggerAutoSave, pushState])

  /** Perform redo: restore next state from history stack. */
  const performRedo = useCallback(() => {
    const ta = textareaRef.current
    if (!ta) return
    const entry = redo()
    if (!entry) return
    prevContentRef.current = entry.text
    prevSelectionRef.current = { start: entry.selectionStart, end: entry.selectionEnd }
    onChange(entry.text)
    setStatus('unsaved')
    triggerAutoSave()
    requestAnimationFrame(() => {
      ta.focus()
      ta.setSelectionRange(entry.selectionStart, entry.selectionEnd)
    })
  }, [redo, onChange, triggerAutoSave])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault()
      if (debounceRef.current) clearTimeout(debounceRef.current)
      onSave()
    }
    // Undo: Ctrl+Z (but not Ctrl+Shift+Z which is redo)
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
      e.preventDefault()
      performUndo()
    }
    // Redo: Ctrl+Y or Ctrl+Shift+Z
    if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'Z' && e.shiftKey) || (e.key === 'z' && e.shiftKey))) {
      e.preventDefault()
      performRedo()
    }
  }

  /** Apply a toolbar action to the textarea content, pushing current state to history first. */
  function applyAction(action: ToolbarAction['action']) {
    const ta = textareaRef.current
    if (!ta) return
    const { selectionStart: s, selectionEnd: e } = ta

    // Push current state before the action for undo
    pushState({ text: content, selectionStart: s, selectionEnd: e })

    const result = action(content, s, e, t as (key: string) => string)
    onChange(result.text)
    setStatus('unsaved')
    triggerAutoSave()
    // Restore cursor after React re-render
    requestAnimationFrame(() => {
      ta.focus()
      ta.setSelectionRange(result.cursor, result.cursor)
    })
  }

  // ─── Listen for editor commands from the Command Palette ─────────────────
  useEffect(() => {
    function handleEditorCommand(e: Event) {
      const detail = (e as CustomEvent<{ action: string }>).detail
      if (!detail?.action) return
      if (readOnly) return

      const ta = textareaRef.current
      if (!ta) return

      switch (detail.action) {
        case 'heading1': applyAction((txt, s, _e) => prependLine(txt, s, '# ')); break
        case 'heading2': applyAction((txt, s, _e) => prependLine(txt, s, '## ')); break
        case 'heading3': applyAction((txt, s, _e) => prependLine(txt, s, '### ')); break
        case 'bold': applyAction((txt, s, end) => wrap(txt, s, end, '**')); break
        case 'italic': applyAction((txt, s, end) => wrap(txt, s, end, '_')); break
        case 'strikethrough': applyAction((txt, s, end) => wrap(txt, s, end, '~~')); break
        case 'code': applyAction((txt, s, end) => wrap(txt, s, end, '`')); break
        case 'link': applyAction((txt, s, end) => {
          const selected = txt.slice(s, end) || 'Text'
          const newText = txt.slice(0, s) + `[${selected}](url)` + txt.slice(end)
          return { text: newText, cursor: s + selected.length + 3 }
        }); break
        case 'bulletList': applyAction((txt, s, _e) => prependLine(txt, s, '- ')); break
        case 'numberedList': applyAction((txt, s, _e) => prependLine(txt, s, '1. ')); break
        case 'task': applyAction((txt, s, _e) => prependLine(txt, s, '- [ ] ')); break
        case 'quote': applyAction((txt, s, _e) => prependLine(txt, s, '> ')); break
        case 'horizontalRule': applyAction((txt, s, end) => {
          const ins = '\n---\n'
          return { text: txt.slice(0, s) + ins + txt.slice(end), cursor: s + ins.length }
        }); break
        case 'table': applyAction((txt, s, end, translate) => {
          const col = translate('editor.tableTemplate.column')
          const cell = translate('editor.tableTemplate.cell')
          const tbl = `\n| ${col} 1 | ${col} 2 |\n|----------|----------|\n| ${cell}    | ${cell}    |\n`
          return { text: txt.slice(0, s) + tbl + txt.slice(end), cursor: s + tbl.length }
        }); break
        case 'undo': performUndo(); break
        case 'redo': performRedo(); break
        case 'toggleLineNumbers': toggleLineNumbers(); break
      }
    }

    window.addEventListener('slatebase:editor-command', handleEditorCommand)
    return () => {
      window.removeEventListener('slatebase:editor-command', handleEditorCommand)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, readOnly, performUndo, performRedo, toggleLineNumbers])

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
            onClick={performUndo}
            disabled={!canUndo}
            tabIndex={-1}
          >
            <Undo2 size={14} />
          </button>
          <button
            type="button"
            className="edit-toolbar-btn"
            title={t('editor.redo')}
            aria-label={t('editor.redo')}
            onClick={performRedo}
            disabled={!canRedo}
            tabIndex={-1}
          >
            <Redo2 size={14} />
          </button>
          <div className="edit-toolbar-separator" />
          {TOOLBAR_ACTIONS.map((item, i) => {
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
                onClick={() => applyAction(item.action)}
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

      {/* Editor area with optional line numbers — wrapped in DropZone for external file drops */}
      <DropZone
        onDrop={handleExternalFileDrop}
        targetPath={uploadTargetDir}
        disabled={!filePath}
        disabledMessage="Bitte zuerst eine Datei öffnen"
        className="edit-mode-drop-zone"
      >
      <div className="edit-mode-editor-area">
        <LineNumbers
          text={content}
          scrollTop={textareaScrollTop}
          lineHeight={LINE_HEIGHT}
          visible={lineNumbersEnabled}
        />
        <textarea
          ref={textareaRef}
          className={`edit-mode-textarea${isDragOver ? ' edit-mode-textarea--drag-over' : ''}`}
          value={content}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onScroll={handleTextareaScroll}
          onDragOver={handleTextareaDragOver}
          onDragLeave={handleTextareaDragLeave}
          onDrop={handleTextareaDrop}
          onPaste={handlePaste}
          readOnly={readOnly || saving}
          aria-label={t('editor.textareaAriaLabel')}
          spellCheck={false}
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
