import { useEffect, useRef, useState, useCallback } from 'react'
import { useTranslation } from '../i18n'
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
export function EditMode({ content, onChange, onSave, onCancel: _onCancel, saving, error, readOnly }: EditModeProps) {
  const { t } = useTranslation()
  const [status, setStatus] = useState<SaveStatus>('idle')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wasSavingRef = useRef(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

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
    debounceRef.current = setTimeout(() => { onSave() }, 1500)
  }, [onSave])

  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [])

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
        className="edit-mode-textarea"
        value={content}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        disabled={saving}
        readOnly={readOnly}
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
