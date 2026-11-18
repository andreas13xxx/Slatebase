/**
 * KeybindingsSection — Settings section for configuring keyboard shortcuts.
 * Displays a table of all configurable commands grouped by category,
 * allows editing shortcuts inline, and supports reset to default.
 *
 * @module components/settings/KeybindingsSection
 */

import { useTranslation, translateNow, type TranslationKey } from '../../i18n'
import { useState, useCallback, useContext, useEffect, useRef } from 'react'
import React from 'react'
import {
  getAllBindings,
  setShortcut,
  setShortcuts,
  getShortcuts,
  isMacPlatform,
  resetShortcut,
  resetAll,
  formatShortcut,
  findConflict,
  isOverridden,
  onKeybindingsChange,
  DEFAULT_KEYBINDINGS,
  type KeybindingCategory,
} from '../../state/keybindingsStore'
import { PluginContext } from '../../plugins/compat/plugin-context'
import { FeatureContext } from '../../state/featureContext'
import { NATIVE_TWINS, registryShortcuts } from '../../hooks/useRegistryHotkeys'
import { showToast } from '../ToastNotification'
import { SettingSection, Button } from './ui'

/** Translation keys of the keybinding category labels. */
const CATEGORY_LABELS: Record<KeybindingCategory, TranslationKey> = {
  navigation: 'settingsUi.catNavigation',
  editor: 'settingsUi.catEditor',
  vault: 'settingsUi.catVault',
  panel: 'settingsUi.catPanel',
}

/** Category display order. */
const CATEGORY_ORDER: KeybindingCategory[] = ['navigation', 'panel', 'editor', 'vault']

/**
 * Keybindings settings section.
 * Shows all configurable shortcuts, allows editing and resetting.
 */
export function KeybindingsSection() {
  const { t } = useTranslation()
  const [bindings, setBindings] = useState(getAllBindings())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [recordedKeys, setRecordedKeys] = useState('')
  /** True when the recorded shortcut is added to the command's others instead of replacing them. */
  const [adding, setAdding] = useState(false)
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // Obsidian's core commands and plugins' commands come from the command registry (outside the
  // plugin provider, e.g. in tests, or with plugin compatibility off, there are none).
  const pluginCompat = useContext(FeatureContext)?.isEnabled('obsidian-plugin-compat') ?? false
  const pluginRegistry = useContext(PluginContext)?.commandRegistry
  const registry = pluginCompat ? pluginRegistry : undefined

  /** The shortcuts a command answers to now; for a registry command that includes the hotkeys its plugin declares. */
  const shortcutsOf = useCallback((commandId: string): string[] => {
    const command = registry?.getCommand(commandId)
    return command && !NATIVE_TWINS.has(commandId) ? registryShortcuts(command) : getShortcuts(commandId)
  }, [registry])

  const labelOf = useCallback(
    (commandId: string): string => DEFAULT_KEYBINDINGS.find(d => d.commandId === commandId)?.label ?? registry?.getCommand(commandId)?.name ?? commandId,
    [registry],
  )

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
      showToast('error', translateNow('settingsUi.hotkeyConflict', { keys: recordedKeys, command: labelOf(conflict) }))
      return
    }

    if (adding) setShortcuts(editingId, [...shortcutsOf(editingId), recordedKeys])
    else setShortcut(editingId, recordedKeys)
    setEditingId(null)
    setRecordedKeys('')
    refreshBindings()
    showToast('success', translateNow('settingsUi.hotkeySaved'))
  }, [editingId, recordedKeys, adding, refreshBindings, shortcutsOf, labelOf])

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
    showToast('success', translateNow('settingsUi.hotkeysReset'))
  }, [refreshBindings])

  // Group bindings by category; the search matches the label, the command ID and the shortcuts
  const needle = query.trim().toLowerCase()
  const matches = (b: (typeof bindings)[number]) =>
    needle === '' ||
    b.label.toLowerCase().includes(needle) ||
    b.commandId.toLowerCase().includes(needle) ||
    b.effectiveShortcuts.some(s => formatShortcut(s).toLowerCase().includes(needle))
  // The registry commands Slatebase does not bind itself (those are listed above).
  const registryItems: typeof bindings = (registry?.getCommands() ?? [])
    .filter(c => !NATIVE_TWINS.has(c.id))
    .map(c => {
      const shortcuts = registryShortcuts(c)
      return {
        commandId: c.id,
        label: c.name,
        defaultShortcut: '',
        category: 'panel' as KeybindingCategory,
        effectiveShortcut: shortcuts[0] ?? '',
        effectiveShortcuts: shortcuts,
        isOverridden: isOverridden(c.id),
      }
    })
    .filter(matches)
    .sort((a, b) => a.label.localeCompare(b.label))
  const grouped = [
    ...CATEGORY_ORDER.map(cat => ({
      category: cat as string,
      label: t(CATEGORY_LABELS[cat]),
      items: bindings.filter(b => b.category === cat && matches(b)),
    })),
    { category: 'registry', label: t('settingsUi.moreCommands', { count: registryItems.length }), items: registryItems },
  ].filter(g => g.items.length > 0)

  return (
    <div className="keybindings-section">
      <p className="settings-field-hint">
        {t('settingsUi.hotkeysIntro1')}<code>.obsidian/hotkeys.json</code>{t('settingsUi.hotkeysIntro2')}
      </p>
      <input
        type="search"
        className="keybindings-search"
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder={t('settingsUi.searchCommandsPh')}
        aria-label={t('settingsUi.searchCommands')}
      />
      {grouped.length === 0 && <p className="settings-field-hint">{t('settingsUi.noCommand')}</p>}

      {grouped.map(group => (
        <SettingSection key={group.category} title={group.label}>
          <div className="table-scroll">
          <table className="keybindings-table data-table">
            <thead>
              <tr>
                <th className="keybindings-col-command">{t('settingsUi.colCommand')}</th>
                <th className="keybindings-col-shortcut">{t('settingsUi.colShortcut')}</th>
                <th className="keybindings-col-actions">{t('settingsUi.colActions')}</th>
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
                          placeholder={t('settingsUi.pressKey')}
                          onKeyDown={handleKeyDown}
                          readOnly
                        />
                        <button
                          type="button"
                          className="keybindings-btn keybindings-btn--save"
                          onClick={handleSaveShortcut}
                          disabled={!recordedKeys}
                          title={t('settingsUi.save')}
                        >
                          ✓
                        </button>
                        <button
                          type="button"
                          className="keybindings-btn keybindings-btn--cancel"
                          onClick={handleCancelEdit}
                          title={t('settingsUi.cancel')}
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="keybindings-shortcut-btn"
                        onClick={() => handleEdit(item.commandId)}
                        title={t('settingsUi.clickToChange')}
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
                            onClick={() => { setShortcuts(item.commandId, shortcutsOf(item.commandId).filter(s => s !== shortcut)); refreshBindings() }}
                            title={t('settingsUi.removeOnly', { keys: formatShortcut(shortcut) })}
                            aria-label={t('settingsUi.removeOnly', { keys: formatShortcut(shortcut) })}
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
                        title={t('settingsUi.addShortcut')}
                      >
                        +
                      </button>
                    )}
                    {item.effectiveShortcut && editingId !== item.commandId && (
                      <button
                        type="button"
                        className="keybindings-btn keybindings-btn--unbind"
                        onClick={() => handleUnbind(item.commandId)}
                        title={t('settingsUi.removeBinding')}
                      >
                        {t('settingsUi.remove')}
                      </button>
                    )}
                    {item.isOverridden && editingId !== item.commandId && (
                      <button
                        type="button"
                        className="keybindings-btn keybindings-btn--reset"
                        onClick={() => handleResetOne(item.commandId)}
                        title={t('settingsUi.restoreDefault')}
                      >
                        {t('settingsUi.default')}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </SettingSection>
      ))}

      <div className="settings-actions">
        <Button variant="secondary" onClick={handleResetAll}>
          {t('settingsUi.resetAll')}
        </Button>
      </div>
    </div>
  )
}
