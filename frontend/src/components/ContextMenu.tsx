import { useCallback, useEffect, useRef, useState } from 'react'
import ReactDOM from 'react-dom'
import { ChevronRight, Check } from 'lucide-react'
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
  /**
   * Renders a checkmark and `aria-checked` — mirrors `MenuItem.setChecked()`
   * in the plugin `Menu` shim (menu.ts). Undefined means "not a checkbox
   * item" (no `aria-checked` at all), matching a plain `MenuItem`.
   */
  checked?: boolean
  /** Whether this entry is a visual separator (renders a divider line). */
  separator?: boolean
  /**
   * Optional direct handler, called instead of `onSelect(id)`. For items built
   * from data not known to the menu's owner ahead of time — e.g. plugin-
   * contributed 'file-menu' items, whose action is a callback supplied by the
   * plugin rather than one of the owner's own fixed action ids.
   */
  run?: () => void
  /**
   * Keeps the menu open after this item is activated, instead of closing it.
   * For items the user typically toggles several times in a row — the
   * per-button visibility checkboxes in the toolbar's context menu, say —
   * where closing after every click would mean reopening the menu for each
   * button. Items without it keep the normal close-on-activate behaviour.
   */
  keepOpen?: boolean
  /**
   * Nested items, shown in a submenu opened to the side of this item (hover
   * or click/Enter/ArrowRight) instead of this item being directly
   * selectable — mirrors `MenuItem.setSubmenu()` in the plugin `Menu` shim
   * (menu.ts), so a plugin-contributed submenu (e.g. a "Text Tools" or
   * "AI Tools" plugin grouping several actions under one entry) renders
   * instead of silently disappearing.
   */
  submenu?: ContextMenuItem[]
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
 * - Items with `submenu` open a nested menu on hover/click/Enter/ArrowRight
 * - Named export only (no default export)
 */
export function ContextMenu({ x, y, items, onClose, onSelect }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<Map<number, HTMLElement>>(new Map())
  const [position, setPosition] = useState<{ x: number; y: number }>({ x, y })
  const [focusedIndex, setFocusedIndex] = useState<number>(-1)
  const [openSubmenu, setOpenSubmenu] = useState<{ index: number; x: number; y: number } | null>(null)

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

  // Close on click outside. A submenu renders through its own portal (a
  // sibling of this menu's DOM node, not a descendant), so "outside" is
  // determined by the shared `.context-menu` class across every open level
  // rather than `menuRef.current.contains(...)` — otherwise interacting with
  // an open submenu would look like an outside click and close everything.
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = e.target as Element | null
      if (!target?.closest('.context-menu')) {
        onClose()
      }
    }

    // Close when focus leaves the window (e.g. clicking into a cross-origin
    // iframe such as a canvas link-node preview, whose mousedown never reaches
    // this document).
    function handleWindowBlur() {
      onClose()
    }

    // Delay listener to avoid the opening click from immediately closing it.
    // Registered in the capture phase so node drag handlers calling
    // stopPropagation() can't prevent the event from reaching this handler.
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClick, true)
      window.addEventListener('blur', handleWindowBlur)
    }, 0)

    return () => {
      clearTimeout(timeoutId)
      document.removeEventListener('mousedown', handleClick, true)
      window.removeEventListener('blur', handleWindowBlur)
    }
  }, [onClose])

  /** Opens the submenu of the item at `index` (if it has one), positioned beside its DOM element. */
  const openSubmenuFor = useCallback((index: number) => {
    const item = items[index]
    if (!item?.submenu) {
      setOpenSubmenu(null)
      return
    }
    const el = itemRefs.current.get(index)
    if (!el) return
    const rect = el.getBoundingClientRect()
    setOpenSubmenu({ index, x: rect.right, y: rect.top })
  }, [items])

  // Keyboard navigation: Escape, Arrow Up/Down (cyclic), ArrowRight/Enter, submenu
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

      case 'ArrowRight': {
        const item = items[focusedIndex]
        if (item?.submenu) {
          e.preventDefault()
          openSubmenuFor(focusedIndex)
        }
        break
      }

      case 'Enter': {
        e.preventDefault()
        if (focusedIndex >= 0 && focusedIndex < items.length) {
          const item = items[focusedIndex]
          if (item && !item.disabled && !item.separator) {
            if (item.submenu) {
              openSubmenuFor(focusedIndex)
            } else {
              if (item.run) item.run()
              else onSelect(item.id)
              if (!item.keepOpen) onClose()
            }
          }
        }
        break
      }
    }
  }, [focusedIndex, items, onClose, onSelect, selectableIndices, openSubmenuFor])

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

  function handleItemClick(item: ContextMenuItem, index: number) {
    if (item.disabled) return
    if (item.submenu) {
      openSubmenuFor(index)
      return
    }
    if (item.run) item.run()
    else onSelect(item.id)
    if (!item.keepOpen) onClose()
  }

  function handleItemMouseEnter(index: number) {
    const item = items[index]
    if (item && !item.separator && !item.disabled) {
      setFocusedIndex(index)
      openSubmenuFor(index)
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
              role={item.checked !== undefined ? 'menuitemcheckbox' : 'menuitem'}
              aria-disabled={item.disabled ? 'true' : undefined}
              aria-checked={item.checked}
              aria-haspopup={item.submenu ? 'menu' : undefined}
              aria-expanded={item.submenu ? openSubmenu?.index === index : undefined}
              ref={(el) => {
                if (el) itemRefs.current.set(index, el)
                else itemRefs.current.delete(index)
              }}
            >
              <button
                type="button"
                className={`context-menu-btn${item.disabled ? ' context-menu-btn--disabled' : ''}`}
                data-focused={isFocused ? 'true' : undefined}
                onClick={() => handleItemClick(item, index)}
                onMouseEnter={() => handleItemMouseEnter(index)}
                tabIndex={-1}
              >
                {(item.checked || item.icon) && (
                  <span className="context-menu-icon">
                    {item.checked ? <Check size={14} /> : item.icon}
                  </span>
                )}
                <span className="context-menu-label">{item.label}</span>
                {item.submenu && (
                  <ChevronRight size={14} className="context-menu-submenu-arrow" />
                )}
              </button>
            </li>
          )
        })}
      </ul>
      {openSubmenu && items[openSubmenu.index]?.submenu && (
        <ContextSubmenu
          x={openSubmenu.x}
          y={openSubmenu.y}
          items={items[openSubmenu.index]!.submenu!}
          onSelect={onSelect}
          onCloseAll={onClose}
        />
      )}
    </div>
  )

  return ReactDOM.createPortal(menu, document.body)
}

/**
 * A nested submenu level. Purely hover/click-driven (matching the plugin
 * `Menu` shim's own submenu behavior in menu.ts, which is hover-only too) —
 * the outermost `ContextMenu` above owns all outside-click/Escape/window-blur
 * handling, so a submenu doesn't register its own copies of those; selecting
 * an item (at any depth) or clicking truly outside the whole `.context-menu`
 * chain closes everything via `onCloseAll` (the root's `onClose`).
 */
function ContextSubmenu({
  x, y, items, onSelect, onCloseAll,
}: {
  x: number
  y: number
  items: ContextMenuItem[]
  onSelect: (action: string) => void
  onCloseAll: () => void
}) {
  const menuRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<Map<number, HTMLElement>>(new Map())
  const [position, setPosition] = useState<{ x: number; y: number }>({ x, y })
  const [openSubmenu, setOpenSubmenu] = useState<{ index: number; x: number; y: number } | null>(null)

  useEffect(() => {
    const menu = menuRef.current
    if (!menu) return
    const clamped = clampMenuPosition(x, y, menu.offsetWidth, menu.offsetHeight, window.innerWidth, window.innerHeight)
    setPosition(clamped)
  }, [x, y])

  function openSubmenuFor(index: number) {
    const item = items[index]
    if (!item?.submenu) {
      setOpenSubmenu(null)
      return
    }
    const el = itemRefs.current.get(index)
    if (!el) return
    const rect = el.getBoundingClientRect()
    setOpenSubmenu({ index, x: rect.right, y: rect.top })
  }

  function handleItemClick(item: ContextMenuItem, index: number) {
    if (item.disabled) return
    if (item.submenu) {
      openSubmenuFor(index)
      return
    }
    if (item.run) item.run()
    else onSelect(item.id)
    if (!item.keepOpen) onCloseAll()
  }

  const menu = (
    <div
      ref={menuRef}
      className="context-menu"
      style={{ left: position.x, top: position.y }}
      role="menu"
      aria-label="Untermenü"
      onContextMenu={(e) => e.preventDefault()}
      tabIndex={-1}
    >
      <ul className="context-menu-list">
        {items.map((item, index) => {
          if (item.separator) {
            return <li key={item.id} className="context-menu-separator" role="separator" />
          }
          return (
            <li
              key={item.id}
              className="context-menu-item"
              role={item.checked !== undefined ? 'menuitemcheckbox' : 'menuitem'}
              aria-disabled={item.disabled ? 'true' : undefined}
              aria-checked={item.checked}
              aria-haspopup={item.submenu ? 'menu' : undefined}
              aria-expanded={item.submenu ? openSubmenu?.index === index : undefined}
              ref={(el) => {
                if (el) itemRefs.current.set(index, el)
                else itemRefs.current.delete(index)
              }}
            >
              <button
                type="button"
                className={`context-menu-btn${item.disabled ? ' context-menu-btn--disabled' : ''}`}
                onClick={() => handleItemClick(item, index)}
                onMouseEnter={() => openSubmenuFor(index)}
                tabIndex={-1}
              >
                {(item.checked || item.icon) && (
                  <span className="context-menu-icon">
                    {item.checked ? <Check size={14} /> : item.icon}
                  </span>
                )}
                <span className="context-menu-label">{item.label}</span>
                {item.submenu && <ChevronRight size={14} className="context-menu-submenu-arrow" />}
              </button>
            </li>
          )
        })}
      </ul>
      {openSubmenu && items[openSubmenu.index]?.submenu && (
        <ContextSubmenu
          x={openSubmenu.x}
          y={openSubmenu.y}
          items={items[openSubmenu.index]!.submenu!}
          onSelect={onSelect}
          onCloseAll={onCloseAll}
        />
      )}
    </div>
  )

  return ReactDOM.createPortal(menu, document.body)
}
