import { useState, useEffect, useRef, useCallback } from 'react'
import { Search } from 'lucide-react'
import type { Command } from '../plugins/compat/command-registry'

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

/** Maximum number of results displayed */
const MAX_RESULTS = 50;

/**
 * CommandPalette — Modal overlay for searching and executing plugin commands.
 *
 * Opens when `isOpen` is true. Provides a search input with case-insensitive
 * filtering (max 50 results), keyboard navigation (Arrow Up/Down, Enter, Escape),
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

  // Filter commands by case-insensitive substring match on name
  const filteredCommands = filterCommands(commands, query)

  // Reset state when palette opens
  useEffect(() => {
    if (isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setQuery('')
      setSelectedIndex(0)
      // Autofocus the input after render
      requestAnimationFrame(() => {
        inputRef.current?.focus()
      })
    }
  }, [isOpen])

  // Clamp selectedIndex when filtered results change
  useEffect(() => {
    if (selectedIndex >= filteredCommands.length) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedIndex(Math.max(0, filteredCommands.length - 1))
    }
  }, [filteredCommands.length, selectedIndex])

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
          prev < filteredCommands.length - 1 ? prev + 1 : prev
        )
        break
      case 'ArrowUp':
        e.preventDefault()
        setSelectedIndex(prev => (prev > 0 ? prev - 1 : prev))
        break
      case 'Enter':
        e.preventDefault()
        if (filteredCommands.length > 0) {
          const selected = filteredCommands[selectedIndex]
          if (selected) {
            handleExecute(selected.id)
          }
        }
        break
      case 'Escape':
        e.preventDefault()
        onClose()
        break
    }
  }, [filteredCommands, selectedIndex, handleExecute, onClose])

  const handleOverlayClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }, [onClose])

  if (!isOpen) return null

  const activeDescendant = filteredCommands.length > 0
    ? `command-palette-item-${selectedIndex}`
    : undefined

  return (
    <div
      className="command-palette-overlay"
      onClick={handleOverlayClick}
      role="presentation"
    >
      <div
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
            filteredCommands.map((cmd, index) => (
              <li
                key={cmd.id}
                id={`command-palette-item-${index}`}
                className={`command-palette-item${index === selectedIndex ? ' command-palette-item--selected' : ''}`}
                role="option"
                aria-selected={index === selectedIndex}
                onClick={() => handleExecute(cmd.id)}
              >
                <span className="command-palette-item-name">{cmd.name}</span>
                <span className="command-palette-item-plugin">{cmd.pluginId}</span>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  )
}

/**
 * Filter commands by case-insensitive substring match on the command name.
 * Returns at most MAX_RESULTS items.
 */
function filterCommands(commands: Command[], query: string): Command[] {
  if (!query) {
    return commands.slice(0, MAX_RESULTS)
  }

  const lowerQuery = query.toLowerCase()
  const results: Command[] = []

  for (const cmd of commands) {
    if (cmd.name.toLowerCase().includes(lowerQuery)) {
      results.push(cmd)
      if (results.length >= MAX_RESULTS) break
    }
  }

  return results
}
