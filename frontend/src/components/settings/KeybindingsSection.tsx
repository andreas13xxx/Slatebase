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
  addShortcut,
  removeShortcut,
  isMacPlatform,
  resetShortcut,
  resetAll,
  formatShortcut,
  findConflict,
  onKeybindingsChange,
  DEFAULT_KEYBINDINGS,
  type KeybindingCategory,
} from '../../state/keybindingsStore'
import { showToast } from '../ToastNotification'
import { SettingSection, Button } from './ui'

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
  /** True when the recorded shortcut is added to the command's others instead of replacing them. */
  const [adding, setAdding] = useState(false)
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // Refresh bindings from store
  const refreshBindings = useCallback(() => {
    setBindings(getAllBindings())
  }, [])

  // The vault's hotkeys.json was read or changed (opened, Obsidian, a sync, another user).
  useEffect(() => onKeybindingsChange(refreshBindings), [refreshBindings])

  // Focus the input when editing starts
  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus()
    }
  }, [editingId])

  const handleEdit = useCallback((commandId: string, add = false) => {
    setEditingId(commandId)
    setAdding(add)
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

    // Build shortcut string. The platform's primary modifier is written as Mod, as Obsidian does,
    // so the same file works on every system.
    const isMac = isMacPlatform()
    const parts: string[] = []
    if (isMac ? e.metaKey : e.ctrlKey) parts.push('Mod')
    if (isMac && e.ctrlKey) parts.push('Ctrl')
    if (!isMac && e.metaKey) parts.push('Meta')
    if (e.altKey) parts.push('Alt')
    if (e.shiftKey) parts.push('Shift')

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

    if (adding) addShortcut(editingId, recordedKeys)
    else setShortcut(editingId, recordedKeys)
    setEditingId(null)
    setRecordedKeys('')
    refreshBindings()
    showToast('success', 'Tastaturkürzel gespeichert')
  }, [editingId, recordedKeys, adding, refreshBindings])

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

  // Group bindings by category; the search matches the label, the command ID and the shortcuts
  const needle = query.trim().toLowerCase()
  const matches = (b: (typeof bindings)[number]) =>
    needle === '' ||
    b.label.toLowerCase().includes(needle) ||
    b.commandId.toLowerCase().includes(needle) ||
    b.effectiveShortcuts.some(s => formatShortcut(s).toLowerCase().includes(needle))
  const grouped = CATEGORY_ORDER.map(cat => ({
    category: cat,
    label: CATEGORY_LABELS[cat],
    items: bindings.filter(b => b.category === cat && matches(b)),
  })).filter(g => g.items.length > 0)

  return (
    <div className="keybindings-section">
      <p className="settings-field-hint">
        Die Kürzel gelten für den ganzen Vault (<code>.obsidian/hotkeys.json</code>) und sind mit Obsidian kompatibel.
        Klicke auf ein Kürzel, um es zu ändern. Drücke die gewünschte Tastenkombination und bestätige mit dem Speichern-Button.
      </p>
      <input
        type="search"
        className="keybindings-search"
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Befehle oder Kürzel suchen…"
        aria-label="Befehle oder Kürzel suchen"
      />
      {grouped.length === 0 && <p className="settings-field-hint">Kein Befehl gefunden.</p>}

      {grouped.map(group => (
        <SettingSection key={group.category} title={group.label}>
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
                        {item.effectiveShortcuts.length > 0
                          ? item.effectiveShortcuts.map(formatShortcut).join(' · ')
                          : <span className="keybindings-unset">—</span>}
                      </button>
                    )}
                    {editingId !== item.commandId && item.effectiveShortcuts.length > 1 && (
                      <span className="keybindings-extra">
                        {item.effectiveShortcuts.map(shortcut => (
                          <button
                            key={shortcut}
                            type="button"
                            className="keybindings-btn keybindings-btn--unbind"
                            onClick={() => { removeShortcut(item.commandId, shortcut); refreshBindings() }}
                            title={`Nur ${formatShortcut(shortcut)} entfernen`}
                            aria-label={`Nur ${formatShortcut(shortcut)} entfernen`}
                          >
                            {formatShortcut(shortcut)} ✕
                          </button>
                        ))}
                      </span>
                    )}
                  </td>
                  <td className="keybindings-cell-actions">
                    {item.effectiveShortcut && editingId !== item.commandId && (
                      <button
                        type="button"
                        className="keybindings-btn keybindings-btn--add"
                        onClick={() => handleEdit(item.commandId, true)}
                        title="Weiteres Kürzel hinzufügen"
                      >
                        +
                      </button>
                    )}
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
        </SettingSection>
      ))}

      <div className="settings-actions">
        <Button variant="secondary" onClick={handleResetAll}>
          Alle zurücksetzen
        </Button>
      </div>
    </div>
  )
}
