import { useEffect, useRef, useState, useCallback } from 'react'
import { useTranslation } from '../i18n'
import { isImageFile } from '../utils/pathUtils'
import {
  Heading1, Heading2, Heading3, Bold, Italic, Strikethrough,
  Code, Link, List, ListOrdered, CheckSquare, Table,
  Quote, Minus,
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
  { icon: <Heading1 size={14} />, labelKey: 'editor.heading1', action: (t, s, _e) => prependLine(t, s, '# ') },
  { icon: <Heading2 size={14} />, labelKey: 'editor.heading2', action: (t, s, _e) => prependLine(t, s, '## ') },
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
  { icon: <List size={14} />, labelKey: 'editor.bulletList', action: (t, s, _e) => prependLine(t, s, '- ') },
  { icon: <ListOrdered size={14} />, labelKey: 'editor.numberedList', action: (t, s, _e) => prependLine(t, s, '1. ') },
  { icon: <CheckSquare size={14} />, labelKey: 'editor.task', action: (t, s, _e) => prependLine(t, s, '- [ ] ') },
  'sep',
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
export function EditMode({ content, onChange, onSave, onCancel: _onCancel, saving, error, readOnly, filePath }: EditModeProps) {
  const { t } = useTranslation()
  const [status, setStatus] = useState<SaveStatus>('idle')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wasSavingRef = useRef(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const onSaveRef = useRef(onSave)
  onSaveRef.current = onSave

  useEffect(() => {
    if (wasSavingRef.current && !saving) {
      if (error) {
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

    // Check if the drag contains our custom MIME type
    if (!e.dataTransfer.types.includes('application/x-slatebase-path')) return

    e.preventDefault()
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

    // Get the filename from the dropped path (handle both / and \ separators)
    const normalizedDroppedPath = droppedPath.replace(/\\/g, '/')
    const fileName = normalizedDroppedPath.split('/').pop() ?? normalizedDroppedPath

    // Display name: filename without extension
    const displayName = fileName.includes('.')
      ? fileName.slice(0, fileName.lastIndexOf('.'))
      : fileName

    // Determine link format using Obsidian conventions:
    // - Images/attachments: ![[filename.ext]] (embed with extension)
    // - Markdown files: [[filename]] (wikilink without .md extension)
    // - Other files: [[filename.ext]] (wikilink with extension)
    let linkText: string
    if (isImageFile(fileName)) {
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
  }, [readOnly, filePath, content, onChange])

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value)
    setStatus('unsaved')
    triggerAutoSave()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault()
      if (debounceRef.current) clearTimeout(debounceRef.current)
      onSave()
    }
  }

  /** Apply a toolbar action to the textarea content. */
  function applyAction(action: ToolbarAction['action']) {
    const ta = textareaRef.current
    if (!ta) return
    const { selectionStart: s, selectionEnd: e } = ta
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
        </div>
      )}

      {/* Editor */}
      <textarea
        ref={textareaRef}
        className={`edit-mode-textarea${isDragOver ? ' edit-mode-textarea--drag-over' : ''}`}
        value={content}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onDragOver={handleTextareaDragOver}
        onDragLeave={handleTextareaDragLeave}
        onDrop={handleTextareaDrop}
        readOnly={readOnly || saving}
        aria-label={t('editor.textareaAriaLabel')}
        spellCheck={false}
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
