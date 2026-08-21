/**
 * EditorSuggestPopover — Renders and positions the suggestion dropdown.
 *
 * Creates a fixed-position `.suggestion-container` element that attaches to
 * `document.body` when visible. Items are rendered by calling the plugin's
 * `renderSuggestion()` method into individual `.suggestion-item` elements.
 *
 * Positioning uses CM6's `coordsAtPos()` to place the popover near the cursor.
 * Viewport clamping ensures it doesn't overflow the screen.
 *
 * @module editor-suggest-popover
 */

import type { EditorView } from '@codemirror/view'
import type { EditorPosition } from './editor-shim.js'
import type { EditorSuggestInstance } from './editor-suggest-manager.js'

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface PopoverCallbacks {
  /** Called when the user clicks or presses Enter on a suggestion. */
  onSelect: (index: number, evt: MouseEvent | KeyboardEvent) => void
  /** Called when the user hovers over a suggestion. */
  onHover: (index: number) => void
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const POPOVER_MAX_HEIGHT = 300
const POPOVER_MIN_WIDTH = 200
const POPOVER_MAX_WIDTH = 400
const POPOVER_GAP = 4 // px between cursor line and popover

// ─── Popover ───────────────────────────────────────────────────────────────────

/**
 * EditorSuggestPopover — Manages the suggestion dropdown DOM.
 */
export class EditorSuggestPopover {
  private containerEl: HTMLDivElement
  private callbacks: PopoverCallbacks
  private itemElements: HTMLDivElement[] = []
  private selectedIndex = -1
  private visible = false

  constructor(callbacks: PopoverCallbacks) {
    this.callbacks = callbacks
    this.containerEl = document.createElement('div')
    this.containerEl.className = 'suggestion-container editor-suggest-popover'
    this.containerEl.style.position = 'fixed'
    this.containerEl.style.zIndex = '9999'
    this.containerEl.style.display = 'none'
    this.containerEl.style.maxHeight = `${POPOVER_MAX_HEIGHT}px`
    this.containerEl.style.minWidth = `${POPOVER_MIN_WIDTH}px`
    this.containerEl.style.maxWidth = `${POPOVER_MAX_WIDTH}px`
    this.containerEl.style.overflowY = 'auto'
    this.containerEl.style.overflowX = 'hidden'
  }

  /**
   * Render suggestion items and show the popover at the trigger position.
   */
  render(
    items: unknown[],
    suggest: EditorSuggestInstance,
    view: EditorView,
    triggerStart: EditorPosition,
  ): void {
    // Clear previous content
    this.containerEl.textContent = ''
    this.itemElements = []

    // Render each item via the plugin's renderSuggestion
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      const el = document.createElement('div')
      el.className = 'suggestion-item'
      el.dataset.index = String(i)

      try {
        suggest.renderSuggestion(item, el)
      } catch (err) {
        console.error('[EditorSuggestPopover] renderSuggestion error:', err)
        el.textContent = String(item)
      }

      // Event handlers
      el.addEventListener('mousedown', (evt) => {
        evt.preventDefault() // Don't steal focus from the editor
        evt.stopPropagation()
        this.callbacks.onSelect(i, evt)
      })
      el.addEventListener('mouseenter', () => {
        this.callbacks.onHover(i)
      })

      this.containerEl.appendChild(el)
      this.itemElements.push(el)
    }

    // Position and show
    this.position(view, triggerStart)
    this.show()
  }

  /** Update the visual selection highlight. */
  setSelectedIndex(index: number): void {
    // Remove old selection
    if (this.selectedIndex >= 0 && this.selectedIndex < this.itemElements.length) {
      this.itemElements[this.selectedIndex].classList.remove('is-selected')
    }
    this.selectedIndex = index
    // Apply new selection
    if (index >= 0 && index < this.itemElements.length) {
      const el = this.itemElements[index]
      el.classList.add('is-selected')
      // Scroll into view if needed
      this.scrollItemIntoView(el)
    }
  }

  /** Hide the popover and detach from DOM. */
  hide(): void {
    if (!this.visible) return
    this.visible = false
    this.containerEl.style.display = 'none'
    if (this.containerEl.parentElement) {
      this.containerEl.parentElement.removeChild(this.containerEl)
    }
    this.selectedIndex = -1
  }

  /** Full cleanup — remove DOM element entirely. */
  destroy(): void {
    this.hide()
    this.itemElements = []
    this.containerEl.textContent = ''
  }

  /** Whether the popover is currently visible. */
  get isVisible(): boolean {
    return this.visible
  }

  // ─── Private ───────────────────────────────────────────────────────────────

  private show(): void {
    if (this.visible) return
    this.visible = true
    document.body.appendChild(this.containerEl)
    this.containerEl.style.display = ''
  }

  /**
   * Position the popover relative to the trigger position in the editor.
   * Uses CM6's coordsAtPos for pixel-accurate placement.
   */
  private position(view: EditorView, triggerStart: EditorPosition): void {
    // Convert EditorPosition (0-indexed line/ch) to CM6 offset
    const line = view.state.doc.line(triggerStart.line + 1) // CM6 lines are 1-indexed
    const offset = line.from + triggerStart.ch
    const coords = view.coordsAtPos(offset)

    if (!coords) {
      // Fallback: position at top-left of the editor
      const editorRect = view.dom.getBoundingClientRect()
      this.containerEl.style.left = `${editorRect.left}px`
      this.containerEl.style.top = `${editorRect.top + 20}px`
      return
    }

    const viewportHeight = window.innerHeight
    const viewportWidth = window.innerWidth

    // Preferred: below the cursor line
    let top = coords.bottom + POPOVER_GAP
    let left = coords.left

    // Check if there's enough space below
    const spaceBelow = viewportHeight - top
    const spaceAbove = coords.top - POPOVER_GAP

    if (spaceBelow < POPOVER_MAX_HEIGHT && spaceAbove > spaceBelow) {
      // Place above the cursor
      top = coords.top - POPOVER_GAP
      // The popover will grow upward — use bottom positioning trick
      this.containerEl.style.top = ''
      this.containerEl.style.bottom = `${viewportHeight - top}px`
    } else {
      // Place below (default)
      this.containerEl.style.bottom = ''
      this.containerEl.style.top = `${top}px`
      // Clamp max-height to available space below
      const effectiveMaxHeight = Math.min(POPOVER_MAX_HEIGHT, spaceBelow - POPOVER_GAP)
      this.containerEl.style.maxHeight = `${Math.max(effectiveMaxHeight, 100)}px`
    }

    // Horizontal: clamp to viewport
    if (left + POPOVER_MAX_WIDTH > viewportWidth) {
      left = Math.max(0, viewportWidth - POPOVER_MAX_WIDTH - 8)
    }
    this.containerEl.style.left = `${left}px`
  }

  /** Scroll the container so the given item is visible. */
  private scrollItemIntoView(el: HTMLElement): void {
    const containerRect = this.containerEl.getBoundingClientRect()
    const itemRect = el.getBoundingClientRect()

    if (itemRect.bottom > containerRect.bottom) {
      this.containerEl.scrollTop += itemRect.bottom - containerRect.bottom
    } else if (itemRect.top < containerRect.top) {
      this.containerEl.scrollTop -= containerRect.top - itemRect.top
    }
  }
}
