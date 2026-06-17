import { useCallback, useEffect, useRef, useState } from 'react'
import ReactDOM from 'react-dom'
import { clampMenuPosition } from '../utils/pathUtils'
import './ContextMenu.css'

/**
 * Represents a single item in the context menu.
 */
export interface ContextMenuItem {
  /** Unique identifier for the action. */
  id: string
  /** Display label for the menu item. */
  label: string
  /** Optional icon (React element, e.g. Lucide icon). */
  icon?: React.ReactNode
  /** Whether the item is disabled (shown but not selectable). */
  disabled?: boolean
  /** Whether this entry is a visual separator (renders a divider line). */
  separator?: boolean
}

/**
 * Props for the generic ContextMenu component.
 */
export interface ContextMenuProps {
  /** X coordinate (viewport) where the menu should appear. */
  x: number
  /** Y coordinate (viewport) where the menu should appear. */
  y: number
  /** Menu items to display. */
  items: ContextMenuItem[]
  /** Callback to close the context menu. */
  onClose: () => void
  /** Callback when a menu item is selected. Receives the item's `id`. */
  onSelect: (action: string) => void
}

/**
 * Generic context menu component rendered via portal with fixed positioning.
 *
 * Features:
 * - Viewport boundary clamping (position: fixed)
 * - Suppresses native browser context menu via onContextMenu handler
 * - Closes on click-outside or Escape
 * - Keyboard navigation: Arrow Up/Down (cyclic wrapping), Enter to select
 * - Focuses first selectable item on open
 * - Named export only (no default export)
 */
export function ContextMenu({ x, y, items, onClose, onSelect }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ x: number; y: number }>({ x, y })
  const [focusedIndex, setFocusedIndex] = useState<number>(-1)

  /** Filter to only selectable (non-separator, non-disabled) items for keyboard nav. */
  const selectableIndices = items.reduce<number[]>((acc, item, i) => {
    if (!item.separator && !item.disabled) {
      acc.push(i)
    }
    return acc
  }, [])

  // Measure menu dimensions and clamp to viewport on mount
  useEffect(() => {
    const menu = menuRef.current
    if (!menu) return

    const menuWidth = menu.offsetWidth
    const menuHeight = menu.offsetHeight
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight

    const clamped = clampMenuPosition(x, y, menuWidth, menuHeight, viewportWidth, viewportHeight)
    setPosition(clamped)
  }, [x, y])

  // Focus the first selectable item on open
  useEffect(() => {
    if (selectableIndices.length > 0) {
      // Initial focus index is a synchronization side-effect of mount
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFocusedIndex(selectableIndices[0]!)
    }
  // Only run once on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Close on click outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const menu = menuRef.current
      if (menu && !menu.contains(e.target as Node)) {
        onClose()
      }
    }

    // Delay listener to avoid the opening click from immediately closing it
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClick)
    }, 0)

    return () => {
      clearTimeout(timeoutId)
      document.removeEventListener('mousedown', handleClick)
    }
  }, [onClose])

  // Keyboard navigation: Escape, Arrow Up/Down (cyclic), Enter
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    switch (e.key) {
      case 'Escape':
        e.preventDefault()
        onClose()
        break

      case 'ArrowDown': {
        e.preventDefault()
        if (selectableIndices.length === 0) break
        const currentPos = selectableIndices.indexOf(focusedIndex)
        const nextPos = currentPos === -1 ? 0 : (currentPos + 1) % selectableIndices.length
        setFocusedIndex(selectableIndices[nextPos]!)
        break
      }

      case 'ArrowUp': {
        e.preventDefault()
        if (selectableIndices.length === 0) break
        const currentPos = selectableIndices.indexOf(focusedIndex)
        const prevPos = currentPos <= 0
          ? selectableIndices.length - 1
          : currentPos - 1
        setFocusedIndex(selectableIndices[prevPos]!)
        break
      }

      case 'Enter': {
        e.preventDefault()
        if (focusedIndex >= 0 && focusedIndex < items.length) {
          const item = items[focusedIndex]
          if (item && !item.disabled && !item.separator) {
            onSelect(item.id)
            onClose()
          }
        }
        break
      }
    }
  }, [focusedIndex, items, onClose, onSelect, selectableIndices])

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [handleKeyDown])

  /** Suppress native context menu on right-click within the menu. */
  function handleContextMenu(e: React.MouseEvent) {
    e.preventDefault()
  }

  function handleItemClick(item: ContextMenuItem) {
    if (item.disabled) return
    onSelect(item.id)
    onClose()
  }

  function handleItemMouseEnter(index: number) {
    const item = items[index]
    if (item && !item.separator && !item.disabled) {
      setFocusedIndex(index)
    }
  }

  const menu = (
    <div
      ref={menuRef}
      className="context-menu"
      style={{
        left: position.x,
        top: position.y,
      }}
      role="menu"
      aria-label="Kontextmenü"
      onContextMenu={handleContextMenu}
      tabIndex={-1}
    >
      <ul className="context-menu-list">
        {items.map((item, index) => {
          if (item.separator) {
            return (
              <li key={item.id} className="context-menu-separator" role="separator" />
            )
          }

          const isFocused = index === focusedIndex

          return (
            <li
              key={item.id}
              className="context-menu-item"
              role="menuitem"
              aria-disabled={item.disabled ? 'true' : undefined}
            >
              <button
                type="button"
                className={`context-menu-btn${item.disabled ? ' context-menu-btn--disabled' : ''}`}
                data-focused={isFocused ? 'true' : undefined}
                onClick={() => handleItemClick(item)}
                onMouseEnter={() => handleItemMouseEnter(index)}
                tabIndex={-1}
              >
                {item.icon && (
                  <span className="context-menu-icon">{item.icon}</span>
                )}
                <span>{item.label}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )

  return ReactDOM.createPortal(menu, document.body)
}
