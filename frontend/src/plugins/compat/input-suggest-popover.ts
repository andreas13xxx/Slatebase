/**
 * InputSuggestPopover — Renders and positions the dropdown for `AbstractInputSuggest`.
 *
 * Sibling of `EditorSuggestPopover`, adapted for a plain `<input>`/`contenteditable`
 * anchor instead of a CM6 `EditorView`: positioning uses `getBoundingClientRect()`
 * on the anchor element rather than `coordsAtPos()`. Same `.suggestion-container`/
 * `.suggestion-item`/`.is-selected` CSS classes, so it matches EditorSuggest's
 * look without any new styling.
 *
 * @module input-suggest-popover
 */

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface InputSuggestPopoverCallbacks {
  /** Called when the user clicks or presses Enter/Tab on a suggestion. */
  onSelect: (index: number, evt: MouseEvent | KeyboardEvent) => void
  /** Called when the user hovers over a suggestion. */
  onHover: (index: number) => void
}

export interface InputSuggestRenderer {
  renderSuggestion(value: unknown, el: HTMLElement): void
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const POPOVER_MAX_HEIGHT = 300
const POPOVER_MIN_WIDTH = 100
const POPOVER_GAP = 4 // px between anchor and popover

// ─── Popover ───────────────────────────────────────────────────────────────────

/**
 * InputSuggestPopover — Manages the suggestion dropdown DOM for an input anchor.
 */
export class InputSuggestPopover {
  private containerEl: HTMLDivElement
  private callbacks: InputSuggestPopoverCallbacks
  private itemElements: HTMLDivElement[] = []
  private selectedIndex = -1
  private visible = false

  constructor(callbacks: InputSuggestPopoverCallbacks) {
    this.callbacks = callbacks
    this.containerEl = document.createElement('div')
    this.containerEl.className = 'suggestion-container input-suggest-popover'
    this.containerEl.style.position = 'fixed'
    this.containerEl.style.zIndex = '9999'
    this.containerEl.style.display = 'none'
    this.containerEl.style.maxHeight = `${POPOVER_MAX_HEIGHT}px`
    this.containerEl.style.minWidth = `${POPOVER_MIN_WIDTH}px`
    this.containerEl.style.overflowY = 'auto'
    this.containerEl.style.overflowX = 'hidden'
  }

  /**
   * Render suggestion items and show the popover anchored to `anchorEl`.
   */
  render(items: unknown[], suggest: InputSuggestRenderer, anchorEl: HTMLElement): void {
    this.containerEl.textContent = ''
    this.itemElements = []

    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      const el = document.createElement('div')
      el.className = 'suggestion-item'
      el.dataset.index = String(i)

      try {
        suggest.renderSuggestion(item, el)
      } catch (err) {
        console.error('[InputSuggestPopover] renderSuggestion error:', err)
        el.textContent = String(item)
      }

      // mousedown (not click) + preventDefault: selecting a suggestion must not
      // blur textInputEl first, which is what a click's focus-then-click sequence
      // would otherwise do and which would fire this popover's own blur-close.
      el.addEventListener('mousedown', (evt) => {
        evt.preventDefault()
        evt.stopPropagation()
        this.callbacks.onSelect(i, evt)
      })
      el.addEventListener('mouseenter', () => {
        this.callbacks.onHover(i)
      })

      this.containerEl.appendChild(el)
      this.itemElements.push(el)
    }

    this.position(anchorEl)
    this.show()
  }

  /** Update the visual selection highlight. */
  setSelectedIndex(index: number): void {
    if (this.selectedIndex >= 0 && this.selectedIndex < this.itemElements.length) {
      this.itemElements[this.selectedIndex].classList.remove('is-selected')
    }
    this.selectedIndex = index
    if (index >= 0 && index < this.itemElements.length) {
      const el = this.itemElements[index]
      el.classList.add('is-selected')
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

  /** The underlying DOM element — assignable onto a `suggestEl` field for API fidelity. */
  get element(): HTMLElement {
    return this.containerEl
  }

  // ─── Private ───────────────────────────────────────────────────────────────

  private show(): void {
    if (this.visible) return
    this.visible = true
    document.body.appendChild(this.containerEl)
    this.containerEl.style.display = ''
  }

  /**
   * Position the popover directly below (or above, if there isn't room)
   * `anchorEl`, matching its width. Viewport-clamped like EditorSuggestPopover.
   */
  private position(anchorEl: HTMLElement): void {
    const rect = anchorEl.getBoundingClientRect()
    const viewportHeight = window.innerHeight
    const viewportWidth = window.innerWidth

    this.containerEl.style.minWidth = `${Math.max(POPOVER_MIN_WIDTH, rect.width)}px`

    const spaceBelow = viewportHeight - (rect.bottom + POPOVER_GAP)
    const spaceAbove = rect.top - POPOVER_GAP

    if (spaceBelow < POPOVER_MAX_HEIGHT && spaceAbove > spaceBelow) {
      // Place above the anchor
      this.containerEl.style.top = ''
      this.containerEl.style.bottom = `${viewportHeight - rect.top + POPOVER_GAP}px`
      this.containerEl.style.maxHeight = `${Math.max(Math.min(POPOVER_MAX_HEIGHT, spaceAbove - POPOVER_GAP), 100)}px`
    } else {
      // Place below (default)
      this.containerEl.style.bottom = ''
      this.containerEl.style.top = `${rect.bottom + POPOVER_GAP}px`
      this.containerEl.style.maxHeight = `${Math.max(Math.min(POPOVER_MAX_HEIGHT, spaceBelow - POPOVER_GAP), 100)}px`
    }

    let left = rect.left
    const width = Math.max(POPOVER_MIN_WIDTH, rect.width)
    if (left + width > viewportWidth) {
      left = Math.max(0, viewportWidth - width - 8)
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
