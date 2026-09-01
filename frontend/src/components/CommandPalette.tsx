import { useState, useEffect, useRef, useCallback } from 'react'
import { Search } from 'lucide-react'
import type { Command } from '../plugins/compat/command-registry'
import { useFocusTrap } from '../hooks/useFocusTrap'
import { getShortcut, formatShortcut } from '../state/keybindingsStore'

export interface CommandPaletteProps {
  /** All available commands from the command registry */
  commands: Command[];
  /** Whether the palette is open */
  isOpen: boolean;
  /** Called when the palette should close */
  onClose: () => void;
  /** Called when a command should be executed */
  onExecute: (commandId: string) => void;
}

/**
 * Safety cap on rendered results, not a UX-intended limit — the list is a normal
 * scrollable `<ul>` (see `.command-palette-list` in App.css), so this only exists
 * to avoid rendering an absurd number of `<li>`s if a user has installed dozens
 * of plugins each registering dozens of commands. Realistic totals (native +
 * Obsidian core-compat + a handful of real plugins) land in the low hundreds.
 */
const MAX_RESULTS = 300;

/**
 * CommandPalette — Modal overlay for searching and executing plugin commands.
 *
 * Opens when `isOpen` is true. Provides a search input with case-insensitive
 * filtering, keyboard navigation (Arrow Up/Down, Enter, Escape),
 * and click-to-execute.
 *
 * The keyboard shortcut (Ctrl+P / Cmd+P) is registered at the App level,
 * not inside this component.
 */
export function CommandPalette({ commands, isOpen, onClose, onExecute }: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const containerRef = useFocusTrap<HTMLDivElement>({
    isActive: isOpen,
    onEscape: onClose,
    returnFocusOnDeactivate: true,
  })

  // Filter commands by case-insensitive substring match on name
  const filteredCommands = filterCommands(commands, query)

  const totalItems = filteredCommands.length

  // Reset state when palette opens
  useEffect(() => {
    if (isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setQuery('')
      setSelectedIndex(0)
      // Focus the input after the focus trap activates (which focuses first focusable child)
      requestAnimationFrame(() => {
        inputRef.current?.focus()
      })
    }
  }, [isOpen])

  // Clamp selectedIndex when filtered results change
  useEffect(() => {
    if (selectedIndex >= totalItems) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedIndex(Math.max(0, totalItems - 1))
    }
  }, [totalItems, selectedIndex])

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return
    const selectedEl = listRef.current.querySelector('[aria-selected="true"]')
    if (selectedEl && typeof selectedEl.scrollIntoView === 'function') {
      selectedEl.scrollIntoView({ block: 'nearest' })
    }
  }, [selectedIndex])

  const handleExecute = useCallback((commandId: string) => {
    try {
      onExecute(commandId)
    } catch (err) {
      console.error('[CommandPalette] Exception executing command:', err)
    }
    onClose()
  }, [onExecute, onClose])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setSelectedIndex(prev =>
          prev < totalItems - 1 ? prev + 1 : prev
        )
        break
      case 'ArrowUp':
        e.preventDefault()
        setSelectedIndex(prev => (prev > 0 ? prev - 1 : prev))
        break
      case 'Enter':
        e.preventDefault()
        if (totalItems > 0) {
          const selected = filteredCommands[selectedIndex]
          if (selected) {
            handleExecute(selected.id)
          }
        }
        break
    }
  }, [filteredCommands, selectedIndex, handleExecute, totalItems])

  const handleOverlayClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }, [onClose])

  if (!isOpen) return null

  const activeDescendant = totalItems > 0
    ? `command-palette-item-${selectedIndex}`
    : undefined

  return (
    <div
      className="command-palette-overlay"
      onClick={handleOverlayClick}
      role="presentation"
    >
      <div
        ref={containerRef}
        className="command-palette"
        role="dialog"
        aria-modal="true"
        aria-label="Command Palette"
      >
        <div className="command-palette-search">
          <Search size={14} className="command-palette-search-icon" />
          <input
            ref={inputRef}
            type="text"
            className="command-palette-input"
            placeholder="Befehl suchen…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setSelectedIndex(0)
            }}
            onKeyDown={handleKeyDown}
            role="combobox"
            aria-expanded="true"
            aria-controls="command-palette-list"
            aria-activedescendant={activeDescendant}
            aria-autocomplete="list"
          />
        </div>

        <ul
          ref={listRef}
          id="command-palette-list"
          className="command-palette-list"
          role="listbox"
          aria-label="Befehle"
        >
          {filteredCommands.length === 0 ? (
            <li className="command-palette-empty" role="option" aria-selected={false}>
              Keine Befehle gefunden
            </li>
          ) : (
            filteredCommands.map((cmd, index) => {
              const shortcut = resolveShortcut(cmd)
              return (
                <li
                  key={cmd.id}
                  id={`command-palette-item-${index}`}
                  className={`command-palette-item${index === selectedIndex ? ' command-palette-item--selected' : ''}`}
                  role="option"
                  aria-selected={index === selectedIndex}
                  onClick={() => handleExecute(cmd.id)}
                >
                  <span className="command-palette-item-name">{cmd.name}</span>
                  {shortcut && (
                    <kbd className="command-palette-item-shortcut">{shortcut}</kbd>
                  )}
                  <span className="command-palette-item-plugin">{cmd.pluginId}</span>
                </li>
              )
            })
          )}
        </ul>
      </div>
    </div>
  )
}

/**
 * Resolve the keyboard shortcut to display for a command, already formatted for
 * the current platform ("Mod" -> Ctrl / ⌘). Returns '' when the command has no
 * binding, which is the common case: only the commands listed in
 * DEFAULT_KEYBINDINGS are bindable in settings, and most plugins ship no hotkey.
 *
 * Two sources, in priority order:
 *  1. The keybindings store — the user's override, else the shipped default.
 *     This is the only source that reflects a rebinding in settings.
 *  2. The command's own `hotkeys`, declared by a plugin at `addCommand()` time.
 *     Only the first is shown; a list of alternatives would crowd the row.
 *
 * Compat commands that duplicate a native one (see DUPLICATE_OF_NATIVE_COMMAND in
 * CommandPaletteContainer) are deliberately *not* resolved through their native
 * twin: they only reach the palette when that native command is hidden because its
 * gate isn't met (no open editor, no selected vault), and the native shortcut is
 * gated the same way — so showing it would advertise a key combo that does nothing
 * in exactly the situation the compat entry is visible.
 */
function resolveShortcut(command: Command): string {
  const bound = getShortcut(command.id)
  if (bound) return formatShortcut(bound)

  const hotkey = command.hotkeys?.[0]
  if (hotkey?.key) {
    // Plugins are inconsistent about case ('p' vs 'P'); the store's own bindings
    // are already normalized, so only this branch needs it.
    const key = hotkey.key.length === 1 ? hotkey.key.toUpperCase() : hotkey.key
    return formatShortcut([...hotkey.modifiers, key].join('+'))
  }

  return ''
}

/**
 * Filter commands by case-insensitive substring match on the command name.
 * Returns at most MAX_RESULTS items, alphabetically sorted.
 *
 * Sorting matters most for the empty-query case: `commands` arrives in
 * registration order (native commands first, then the ~120 Obsidian core-compat
 * commands, with any real community-plugin commands registered last of all) —
 * without a sort, the MAX_RESULTS cap on an empty query always cuts off exactly
 * at that boundary, so a real plugin's own commands never appear until the user
 * types a query that searches the full (unsliced) list instead.
 */
function filterCommands(commands: Command[], query: string): Command[] {
  const sorted = [...commands].sort((a, b) => a.name.localeCompare(b.name, 'de'))

  if (!query) {
    return sorted.slice(0, MAX_RESULTS)
  }

  const lowerQuery = query.toLowerCase()
  const results: Command[] = []

  for (const cmd of sorted) {
    if (cmd.name.toLowerCase().includes(lowerQuery)) {
      results.push(cmd)
      if (results.length >= MAX_RESULTS) break
    }
  }

  return results
}
