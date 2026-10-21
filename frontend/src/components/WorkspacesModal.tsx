/**
 * WorkspacesModal — save or load/manage named workspace layouts (R2/R3).
 *
 * One modal, two modes:
 *  - `save`: a name field; Enter saves. A name that already exists asks for
 *    overwrite confirmation inline (no second modal).
 *  - `load`: the saved workspaces list; click to apply, with inline rename and
 *    delete actions.
 *
 * Structurally mirrors QuickSwitcher (overlay, `useFocusTrap`, Enter/Escape,
 * `.command-palette-*` classes) rather than inventing new modal chrome.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { Layout, Trash2, Pencil, Check, X } from 'lucide-react'
import { useFocusTrap } from '../hooks/useFocusTrap'
import { useTranslation } from '../i18n'
import type { NamedWorkspace } from '../state/workspacesStore'

export interface WorkspacesModalProps {
  isOpen: boolean
  mode: 'save' | 'load'
  onClose: () => void
  /** Saved workspaces (read fresh each open from the store). */
  workspaces: NamedWorkspace[]
  /** Save mode: persist under this name (overwrites an existing one). */
  onSave: (name: string) => void
  /** Load mode: apply this workspace. */
  onApply: (name: string) => void
  /** Load mode: rename. */
  onRename: (from: string, to: string) => void
  /** Load mode: delete. */
  onDelete: (name: string) => void
}

export function WorkspacesModal({
  isOpen, mode, onClose, workspaces, onSave, onApply, onRename, onDelete,
}: WorkspacesModalProps) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [confirmOverwrite, setConfirmOverwrite] = useState(false)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useFocusTrap<HTMLDivElement>({
    isActive: isOpen,
    onEscape: onClose,
    returnFocusOnDeactivate: true,
  })

  useEffect(() => {
    if (isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setName('')
      setConfirmOverwrite(false)
      setRenaming(null)
      if (mode === 'save') requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [isOpen, mode])

  const exists = useCallback(
    (n: string) => workspaces.some((w) => w.name.toLowerCase() === n.trim().toLowerCase()),
    [workspaces],
  )

  const submitSave = useCallback(() => {
    const trimmed = name.trim()
    if (!trimmed) return
    if (exists(trimmed) && !confirmOverwrite) {
      setConfirmOverwrite(true)
      return
    }
    onSave(trimmed)
    onClose()
  }, [name, exists, confirmOverwrite, onSave, onClose])

  const handleOverlayClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose()
  }, [onClose])

  if (!isOpen) return null

  return (
    <div className="command-palette-overlay" onClick={handleOverlayClick} role="presentation">
      <div
        ref={containerRef}
        className="command-palette"
        role="dialog"
        aria-modal="true"
        aria-label={mode === 'save' ? t('workspaces.saveLabel') : t('workspaces.loadLabel')}
      >
        {mode === 'save' ? (
          <>
            <div className="command-palette-search">
              <Layout size={14} className="command-palette-search-icon" aria-hidden="true" />
              <input
                ref={inputRef}
                type="text"
                className="command-palette-input"
                placeholder={t('workspaces.namePlaceholder')}
                value={name}
                onChange={(e) => { setName(e.target.value); setConfirmOverwrite(false) }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submitSave() } }}
                aria-label={t('workspaces.namePlaceholder')}
              />
            </div>
            {confirmOverwrite && (
              <div className="command-palette-empty" role="alert">
                {t('workspaces.overwriteConfirm', { name: name.trim() })}
              </div>
            )}
          </>
        ) : (
          <ul className="command-palette-list" role="listbox" aria-label={t('workspaces.loadLabel')}>
            {workspaces.length === 0 ? (
              <li className="command-palette-empty" role="option" aria-selected={false}>
                {t('workspaces.empty')}
              </li>
            ) : (
              workspaces.map((ws) => (
                <li key={ws.name} className="command-palette-item workspaces-item" role="option" aria-selected={false}>
                  {renaming === ws.name ? (
                    <span className="workspaces-rename">
                      <input
                        type="text"
                        className="command-palette-input"
                        value={renameValue}
                        autoFocus
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') { e.preventDefault(); onRename(ws.name, renameValue); setRenaming(null) }
                          if (e.key === 'Escape') { e.stopPropagation(); setRenaming(null) }
                        }}
                        aria-label={t('workspaces.renameLabel', { name: ws.name })}
                      />
                      <button type="button" className="workspaces-action" aria-label={t('common.confirm')}
                        onClick={() => { onRename(ws.name, renameValue); setRenaming(null) }}>
                        <Check size={14} />
                      </button>
                      <button type="button" className="workspaces-action" aria-label={t('common.cancel')}
                        onClick={() => setRenaming(null)}>
                        <X size={14} />
                      </button>
                    </span>
                  ) : (
                    <>
                      <button type="button" className="workspaces-name" onClick={() => { onApply(ws.name); onClose() }}>
                        {ws.name}
                      </button>
                      <span className="workspaces-actions">
                        <button type="button" className="workspaces-action" aria-label={t('workspaces.renameLabel', { name: ws.name })}
                          onClick={() => { setRenaming(ws.name); setRenameValue(ws.name) }}>
                          <Pencil size={13} />
                        </button>
                        <button type="button" className="workspaces-action workspaces-action--danger" aria-label={t('workspaces.deleteLabel', { name: ws.name })}
                          onClick={() => onDelete(ws.name)}>
                          <Trash2 size={13} />
                        </button>
                      </span>
                    </>
                  )}
                </li>
              ))
            )}
          </ul>
        )}
      </div>
    </div>
  )
}
