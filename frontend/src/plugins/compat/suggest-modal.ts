/**
 * SuggestModal & FuzzySuggestModal — Obsidian-compatible modal with search/filter.
 *
 * Plugins use these to create autocomplete/selection UIs:
 * - SuggestModal: Plugin provides getSuggestions() + renderSuggestion() + onChooseSuggestion()
 * - FuzzySuggestModal: Plugin provides getItems() + getItemText() + onChooseItem()
 *
 * Both render a modal with a search input and a scrollable list of filtered results.
 * Keyboard navigation (Arrow Up/Down, Enter, Escape) is supported.
 *
 * @module suggest-modal
 */

import type { IAppShim } from './types'

// ─── SuggestModal ────────────────────────────────────────────────────────────────

/**
 * SuggestModal — Base class for search-filtered selection modals.
 *
 * Plugins extend this and implement:
 * - getSuggestions(query): Filter/compute items based on the input query
 * - renderSuggestion(item, el): Render an item into its DOM element
 * - onChooseSuggestion(item, evt): Handle item selection
 */
export abstract class SuggestModal<T> {
  /** Reference to the app instance */
  app: IAppShim

  /** The modal container element */
  containerEl: HTMLElement

  /** The modal content element */
  contentEl: HTMLElement

  /** The search input element */
  inputEl: HTMLInputElement

  /** The results list element */
  resultContainerEl: HTMLElement

  /** Currently selected index */
  private selectedIndex = 0

  /** Current suggestions list */
  private currentSuggestions: T[] = []

  /** Overlay backdrop */
  private overlayEl: HTMLElement | null = null

  /** Limit for displayed results */
  limit = 50

  /** Placeholder text for input */
  emptyStateText = 'No results found.'

  constructor(app: IAppShim) {
    this.app = app

    this.containerEl = document.createElement('div')
    this.containerEl.className = 'modal-container suggestion-modal'

    this.contentEl = document.createElement('div')
    this.contentEl.className = 'modal-content'

    this.inputEl = document.createElement('input')
    this.inputEl.type = 'text'
    this.inputEl.className = 'suggestion-input'
    this.inputEl.placeholder = 'Type to search...'

    this.resultContainerEl = document.createElement('div')
    this.resultContainerEl.className = 'suggestion-container'

    this.contentEl.appendChild(this.inputEl)
    this.contentEl.appendChild(this.resultContainerEl)
    this.containerEl.appendChild(this.contentEl)
  }

  /**
   * Open the modal. Creates the overlay, appends to DOM, focuses the input.
   */
  open(): void {
    this.overlayEl = document.createElement('div')
    this.overlayEl.className = 'modal-bg'
    this.overlayEl.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;'
    this.containerEl.style.cssText = 'background:var(--bg-surface,#fff);border-radius:8px;padding:0;max-width:600px;width:90%;max-height:70vh;display:flex;flex-direction:column;overflow:hidden;'
    this.inputEl.style.cssText = 'width:100%;padding:12px 16px;border:none;border-bottom:1px solid var(--border-color,#e0e0e0);font-size:14px;outline:none;box-sizing:border-box;'
    this.resultContainerEl.style.cssText = 'flex:1;overflow-y:auto;padding:4px 0;'

    this.overlayEl.appendChild(this.containerEl)

    // Close on backdrop click
    this.overlayEl.addEventListener('mousedown', (e) => {
      if (e.target === this.overlayEl) this.close()
    })

    // Input handler
    this.inputEl.addEventListener('input', () => {
      this.updateSuggestions()
    })

    // Keyboard navigation
    this.inputEl.addEventListener('keydown', (e) => {
      this.handleKeydown(e)
    })

    document.body.appendChild(this.overlayEl)
    this.inputEl.value = ''
    this.updateSuggestions()

    // Focus input after DOM insert
    requestAnimationFrame(() => {
      this.inputEl.focus()
    })
  }

  /**
   * Close the modal and remove from DOM.
   */
  close(): void {
    if (this.overlayEl && this.overlayEl.parentNode) {
      this.overlayEl.parentNode.removeChild(this.overlayEl)
    }
    this.overlayEl = null
    this.onClose()
  }

  /**
   * Set the placeholder text for the input.
   */
  setPlaceholder(placeholder: string): void {
    this.inputEl.placeholder = placeholder
  }

  /**
   * Set the instruction text shown in the modal.
   */
  setInstructions(_instructions: Array<{ command: string; purpose: string }>): void {
    // Instructions display is not implemented (cosmetic)
  }

  /**
   * Called when the modal is closed. Plugins can override for cleanup.
   */
  onClose(): void {
    // Override in subclasses
  }

  // ─── Abstract methods (plugins implement these) ─────────────────────────────

  /**
   * Return the list of suggestions based on the current query.
   * Called on every input change.
   */
  abstract getSuggestions(query: string): T[] | Promise<T[]>;

  /**
   * Render a single suggestion item into the given element.
   */
  abstract renderSuggestion(item: T, el: HTMLElement): void;

  /**
   * Handle the user selecting a suggestion.
   */
  abstract onChooseSuggestion(item: T, evt: MouseEvent | KeyboardEvent): void;

  // ─── Internal ──────────────────────────────────────────────────────────────

  private async updateSuggestions(): Promise<void> {
    const query = this.inputEl.value
    const rawSuggestions = this.getSuggestions(query)
    const suggestions = rawSuggestions instanceof Promise ? await rawSuggestions : rawSuggestions

    this.currentSuggestions = suggestions.slice(0, this.limit)
    this.selectedIndex = 0
    this.renderResults()
  }

  private renderResults(): void {
    this.resultContainerEl.innerHTML = ''

    if (this.currentSuggestions.length === 0) {
      const emptyEl = document.createElement('div')
      emptyEl.className = 'suggestion-empty'
      emptyEl.textContent = this.emptyStateText
      emptyEl.style.cssText = 'padding:12px 16px;color:var(--text-muted,#888);font-size:13px;'
      this.resultContainerEl.appendChild(emptyEl)
      return
    }

    for (let i = 0; i < this.currentSuggestions.length; i++) {
      const item = this.currentSuggestions[i]!
      const el = document.createElement('div')
      el.className = 'suggestion-item'
      el.style.cssText = 'padding:8px 16px;cursor:pointer;font-size:14px;'

      if (i === this.selectedIndex) {
        el.classList.add('is-selected')
        el.style.backgroundColor = 'var(--bg-hover,#f0f0f0)'
      }

      this.renderSuggestion(item, el)

      el.addEventListener('mousedown', (evt) => {
        evt.preventDefault()
        this.onChooseSuggestion(item, evt)
        this.close()
      })

      el.addEventListener('mouseenter', () => {
        this.selectedIndex = i
        this.highlightSelected()
      })

      this.resultContainerEl.appendChild(el)
    }
  }

  private highlightSelected(): void {
    const items = this.resultContainerEl.querySelectorAll('.suggestion-item')
    items.forEach((el, idx) => {
      const htmlEl = el as HTMLElement
      if (idx === this.selectedIndex) {
        htmlEl.classList.add('is-selected')
        htmlEl.style.backgroundColor = 'var(--bg-hover,#f0f0f0)'
      } else {
        htmlEl.classList.remove('is-selected')
        htmlEl.style.backgroundColor = ''
      }
    })

    // Scroll selected item into view
    const selected = items[this.selectedIndex] as HTMLElement | undefined
    if (selected) {
      selected.scrollIntoView({ block: 'nearest' })
    }
  }

  private handleKeydown(e: KeyboardEvent): void {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (this.currentSuggestions.length > 0) {
        this.selectedIndex = (this.selectedIndex + 1) % this.currentSuggestions.length
        this.highlightSelected()
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (this.currentSuggestions.length > 0) {
        this.selectedIndex = (this.selectedIndex - 1 + this.currentSuggestions.length) % this.currentSuggestions.length
        this.highlightSelected()
      }
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const item = this.currentSuggestions[this.selectedIndex]
      if (item !== undefined) {
        this.onChooseSuggestion(item, e)
        this.close()
      }
    } else if (e.key === 'Escape') {
      e.preventDefault()
      this.close()
    }
  }
}

// ─── FuzzySuggestModal ───────────────────────────────────────────────────────────

/**
 * FuzzyMatch — Result of a fuzzy match operation.
 */
export interface FuzzyMatch<T> {
  item: T
  match: { score: number; matches: Array<[number, number]> }
}

/**
 * FuzzySuggestModal — Simplified suggest modal with built-in fuzzy matching.
 *
 * Plugins extend this and implement:
 * - getItems(): Return all possible items
 * - getItemText(item): Return the searchable text for an item
 * - onChooseItem(item, evt): Handle item selection
 */
export abstract class FuzzySuggestModal<T> extends SuggestModal<FuzzyMatch<T>> {
  constructor(app: IAppShim) {
    super(app)
  }

  /**
   * Built-in getSuggestions: applies fuzzy filter to getItems() using getItemText().
   */
  getSuggestions(query: string): FuzzyMatch<T>[] {
    const items = this.getItems()
    if (!query.trim()) {
      // Show all items when query is empty (with neutral score)
      return items.map(item => ({
        item,
        match: { score: 0, matches: [] },
      }))
    }

    const results: FuzzyMatch<T>[] = []
    const lowerQuery = query.toLowerCase()

    for (const item of items) {
      const text = this.getItemText(item)
      const matchResult = fuzzyMatch(lowerQuery, text.toLowerCase())
      if (matchResult) {
        results.push({
          item,
          match: matchResult,
        })
      }
    }

    // Sort by score (lower is better)
    results.sort((a, b) => a.match.score - b.match.score)
    return results
  }

  /**
   * Built-in renderSuggestion: renders the item text with match highlighting.
   */
  renderSuggestion(fuzzyResult: FuzzyMatch<T>, el: HTMLElement): void {
    const text = this.getItemText(fuzzyResult.item)
    el.textContent = text
  }

  /**
   * Built-in onChooseSuggestion: delegates to onChooseItem.
   */
  onChooseSuggestion(fuzzyResult: FuzzyMatch<T>, evt: MouseEvent | KeyboardEvent): void {
    this.onChooseItem(fuzzyResult.item, evt)
  }

  // ─── Abstract methods (plugins implement these) ─────────────────────────────

  /** Return all available items. */
  abstract getItems(): T[];

  /** Return the searchable text representation of an item. */
  abstract getItemText(item: T): string;

  /** Handle the user selecting an item. */
  abstract onChooseItem(item: T, evt: MouseEvent | KeyboardEvent): void;
}

// ─── Fuzzy Match Algorithm ───────────────────────────────────────────────────────

/**
 * Simple fuzzy match: checks if all characters of the query appear in order
 * within the text. Returns match positions and a score, or null if no match.
 *
 * Score is based on:
 * - Total gap between matched characters (lower is better)
 * - Bonus for matches at word boundaries
 */
function fuzzyMatch(query: string, text: string): { score: number; matches: Array<[number, number]> } | null {
  if (query.length === 0) return { score: 0, matches: [] }
  if (query.length > text.length) return null

  const matches: Array<[number, number]> = []
  let queryIdx = 0
  let score = 0
  let lastMatchIdx = -1

  for (let i = 0; i < text.length && queryIdx < query.length; i++) {
    if (text[i] === query[queryIdx]) {
      const start = i
      // Try to match consecutive characters
      while (i < text.length && queryIdx < query.length && text[i] === query[queryIdx]) {
        queryIdx++
        i++
      }
      i-- // Adjust for the outer loop increment
      matches.push([start, i])

      // Score: penalize gaps between matches
      if (lastMatchIdx >= 0) {
        score += start - lastMatchIdx - 1
      }
      // Bonus for word boundary matches (lower score = better)
      if (start === 0 || text[start - 1] === ' ' || text[start - 1] === '/' || text[start - 1] === '-' || text[start - 1] === '_') {
        score -= 2
      }
      lastMatchIdx = i
    }
  }

  // All query characters must be matched
  if (queryIdx < query.length) return null

  return { score, matches }
}
