/**
 * KeybindingsSection — Settings section for configuring keyboard shortcuts.
 * Displays a table of all configurable commands grouped by category,
 * allows editing shortcuts inline, and supports reset to default.
 *
 * @module components/settings/KeybindingsSection
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import React from 'react'
import {
  getAllBindings,
  setShortcut,
  resetShortcut,
  resetAll,
  formatShortcut,
  findConflict,
  DEFAULT_KEYBINDINGS,
  type KeybindingCategory,
} from '../../state/keybindingsStore'
import { showToast } from '../ToastNotification'

/** German labels for keybinding categories. */
const CATEGORY_LABELS: Record<KeybindingCategory, string> = {
  navigation: 'Navigation',
  editor: 'Editor',
  vault: 'Vault',
  panel: 'Panel',
}

/** Category display order. */
const CATEGORY_ORDER: KeybindingCategory[] = ['navigation', 'panel', 'editor', 'vault']

/**
 * Keybindings settings section.
 * Shows all configurable shortcuts, allows editing and resetting.
 */
export function KeybindingsSection() {
  const [bindings, setBindings] = useState(getAllBindings())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [recordedKeys, setRecordedKeys] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // Refresh bindings from store
  const refreshBindings = useCallback(() => {
    setBindings(getAllBindings())
  }, [])

  // Focus the input when editing starts
  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus()
    }
  }, [editingId])

  const handleEdit = useCallback((commandId: string) => {
    setEditingId(commandId)
    setRecordedKeys('')
  }, [])

  const handleCancelEdit = useCallback(() => {
    setEditingId(null)
    setRecordedKeys('')
  }, [])

  /**
   * Records a keyboard shortcut while editing.
   * Captures modifier + key combinations.
   */
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    e.preventDefault()
    e.stopPropagation()

    // Ignore lone modifier keys
    if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) {
      return
    }

    // Escape cancels editing
    if (e.key === 'Escape') {
      handleCancelEdit()
      return
    }

    // Build shortcut string
    const parts: string[] = []
    if (e.ctrlKey) parts.push('Ctrl')
    if (e.shiftKey) parts.push('Shift')
    if (e.altKey) parts.push('Alt')
    if (e.metaKey) parts.push('Meta')

    // Normalize key
    let key = e.key
    if (key === ' ') key = 'Space'
    else if (key.length === 1) key = key.toUpperCase()

    parts.push(key)
    const shortcut = parts.join('+')
    setRecordedKeys(shortcut)
  }, [handleCancelEdit])

  /** Save the recorded shortcut. */
  const handleSaveShortcut = useCallback(() => {
    if (!editingId) return

    // Check for conflicts
    const conflict = findConflict(recordedKeys, editingId)
    if (conflict) {
      const conflictDef = DEFAULT_KEYBINDINGS.find(d => d.commandId === conflict)
      const conflictLabel = conflictDef?.label ?? conflict
      showToast('error', `Konflikt: "${recordedKeys}" wird bereits für "${conflictLabel}" verwendet`)
      return
    }

    setShortcut(editingId, recordedKeys)
    setEditingId(null)
    setRecordedKeys('')
    refreshBindings()
    showToast('success', 'Tastaturkürzel gespeichert')
  }, [editingId, recordedKeys, refreshBindings])

  /** Unbind a shortcut (set to empty). */
  const handleUnbind = useCallback((commandId: string) => {
    setShortcut(commandId, '')
    refreshBindings()
  }, [refreshBindings])

  /** Reset a single shortcut to default. */
  const handleResetOne = useCallback((commandId: string) => {
    resetShortcut(commandId)
    refreshBindings()
  }, [refreshBindings])

  /** Reset all shortcuts to defaults. */
  const handleResetAll = useCallback(() => {
    resetAll()
    refreshBindings()
    showToast('success', 'Alle Tastaturkürzel zurückgesetzt')
  }, [refreshBindings])

  // Group bindings by category
  const grouped = CATEGORY_ORDER.map(cat => ({
    category: cat,
    label: CATEGORY_LABELS[cat],
    items: bindings.filter(b => b.category === cat),
  })).filter(g => g.items.length > 0)

  return (
    <div className="keybindings-section">
      <p className="settings-field-hint">
        Klicke auf ein Kürzel, um es zu ändern. Drücke die gewünschte Tastenkombination und bestätige mit dem Speichern-Button.
      </p>

      {grouped.map(group => (
        <div key={group.category} className="keybindings-group">
          <h3 className="keybindings-group-title">{group.label}</h3>
          <table className="keybindings-table">
            <thead>
              <tr>
                <th className="keybindings-col-command">Befehl</th>
                <th className="keybindings-col-shortcut">Kürzel</th>
                <th className="keybindings-col-actions">Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {group.items.map(item => (
                <tr key={item.commandId} className={item.isOverridden ? 'keybindings-row--overridden' : ''}>
                  <td className="keybindings-cell-command">{item.label}</td>
                  <td className="keybindings-cell-shortcut">
                    {editingId === item.commandId ? (
                      <div className="keybindings-edit-row">
                        <input
                          ref={inputRef}
                          type="text"
                          className="keybindings-input"
                          value={recordedKeys ? formatShortcut(recordedKeys) : ''}
                          placeholder="Taste drücken…"
                          onKeyDown={handleKeyDown}
                          readOnly
                        />
                        <button
                          type="button"
                          className="keybindings-btn keybindings-btn--save"
                          onClick={handleSaveShortcut}
                          disabled={!recordedKeys}
                          title="Speichern"
                        >
                          ✓
                        </button>
                        <button
                          type="button"
                          className="keybindings-btn keybindings-btn--cancel"
                          onClick={handleCancelEdit}
                          title="Abbrechen"
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="keybindings-shortcut-btn"
                        onClick={() => handleEdit(item.commandId)}
                        title="Klicken zum Ändern"
                      >
                        {item.effectiveShortcut ? formatShortcut(item.effectiveShortcut) : <span className="keybindings-unset">—</span>}
                      </button>
                    )}
                  </td>
                  <td className="keybindings-cell-actions">
                    {item.effectiveShortcut && editingId !== item.commandId && (
                      <button
                        type="button"
                        className="keybindings-btn keybindings-btn--unbind"
                        onClick={() => handleUnbind(item.commandId)}
                        title="Bindung entfernen"
                      >
                        Entfernen
                      </button>
                    )}
                    {item.isOverridden && editingId !== item.commandId && (
                      <button
                        type="button"
                        className="keybindings-btn keybindings-btn--reset"
                        onClick={() => handleResetOne(item.commandId)}
                        title="Standard wiederherstellen"
                      >
                        Standard
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      <div className="settings-actions">
        <button
          type="button"
          className="settings-save-btn settings-save-btn--secondary"
          onClick={handleResetAll}
        >
          Alle zurücksetzen
        </button>
      </div>
    </div>
  )
}
