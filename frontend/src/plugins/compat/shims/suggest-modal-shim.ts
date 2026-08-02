/**
 * SuggestModal / FuzzySuggestModal — Obsidian-compatible modal overlays with search.
 *
 * These provide type-ahead selection modals that plugins use for:
 * - Template selection (Templater)
 * - File quick-open (various plugins)
 * - Command palette-like custom lists
 *
 * Implementation renders a DOM-based modal overlay (not React) since it's called
 * from plugin code that runs outside the React tree.
 *
 * @module suggest-modal-shim
 */

// ─── Types ───────────────────────────────────────────────────────────────────

/** Instruction displayed at the bottom of the modal. */
export interface Instruction {
  command: string
  purpose: string
}

/** Search result from fuzzy matching. */
export interface SearchResult {
  score: number
  matches: Array<[number, number]>
}

/** Fuzzy match wrapper. */
export interface FuzzyMatch<T> {
  item: T
  match: SearchResult
}

// ─── Modal Base Class ────────────────────────────────────────────────────────

/**
 * Modal — Base class for Obsidian-compatible modal dialogs.
 * Renders a DOM overlay with title, content area, and close behavior.
 */
export class Modal {
  app: unknown
  scope: { register: () => object; unregister: () => void }
  containerEl: HTMLElement
  modalEl: HTMLElement
  titleEl: HTMLElement
  contentEl: HTMLElement
  shouldRestoreSelection: boolean = true

  constructor(app?: unknown) {
    this.app = app ?? null
    this.scope = { register: () => ({}), unregister: () => {} }

    // Build DOM structure
    this.containerEl = document.createElement('div')
    this.containerEl.className = 'modal-bg mod-dim'
    this.containerEl.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.5);'

    this.modalEl = document.createElement('div')
    this.modalEl.className = 'modal modal-container'
    this.modalEl.style.cssText = 'background:var(--bg-surface,#fff);border-radius:8px;padding:16px;min-width:400px;max-width:600px;max-height:80vh;display:flex;flex-direction:column;box-shadow:0 8px 32px rgba(0,0,0,0.3);'

    this.titleEl = document.createElement('div')
    this.titleEl.className = 'modal-title'
    this.titleEl.style.cssText = 'font-weight:600;font-size:1.1em;margin-bottom:12px;'

    this.contentEl = document.createElement('div')
    this.contentEl.className = 'modal-content'
    this.contentEl.style.cssText = 'flex:1;overflow:auto;'

    this.modalEl.appendChild(this.titleEl)
    this.modalEl.appendChild(this.contentEl)
    this.containerEl.appendChild(this.modalEl)

    // Close on backdrop click
    this.containerEl.addEventListener('mousedown', (e) => {
      if (e.target === this.containerEl) this.close()
    })

    // Close on Escape
    this.containerEl.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); this.close() }
    })
  }

  /** Show the modal. */
  open(): void {
    document.body.appendChild(this.containerEl)
    this.onOpen()
    // Focus the first focusable element
    const focusable = this.modalEl.querySelector('input, button, [tabindex]') as HTMLElement | null
    focusable?.focus()
  }

  /** Hide the modal. */
  close(): void {
    this.onClose()
    this.containerEl.remove()
  }

  /** Called when the modal opens. Override in subclass. */
  onOpen(): void {}

  /** Called when the modal closes. Override in subclass. */
  onClose(): void {}

  /** Set the modal title. */
  setTitle(title: string): this {
    this.titleEl.textContent = title
    return this
  }

  /** Set the modal content. */
  setContent(content: string | DocumentFragment): this {
    if (typeof content === 'string') {
      this.contentEl.textContent = content
    } else {
      this.contentEl.innerHTML = ''
      this.contentEl.appendChild(content)
    }
    return this
  }
}

// ─── SuggestModal ────────────────────────────────────────────────────────────

/**
 * SuggestModal — Modal with a search input and suggestion list.
 * Plugins extend this and override getSuggestions, renderSuggestion, onChooseSuggestion.
 */
export abstract class SuggestModal<T> extends Modal {
  limit: number = 100
  emptyStateText: string = 'No results found.'
  inputEl: HTMLInputElement
  resultContainerEl: HTMLElement
  private suggestions: T[] = []
  private selectedIndex: number = 0

  constructor(app?: unknown) {
    super(app)

    // Build input
    this.inputEl = document.createElement('input')
    this.inputEl.type = 'text'
    this.inputEl.className = 'prompt-input'
    this.inputEl.style.cssText = 'width:100%;padding:8px 12px;border:1px solid var(--border-color,#ddd);border-radius:4px;font-size:14px;margin-bottom:8px;outline:none;box-sizing:border-box;'
    this.inputEl.placeholder = 'Type to search...'

    // Build results container
    this.resultContainerEl = document.createElement('div')
    this.resultContainerEl.className = 'prompt-results'
    this.resultContainerEl.style.cssText = 'max-height:300px;overflow-y:auto;'

    // Insert before contentEl
    this.modalEl.insertBefore(this.inputEl, this.contentEl)
    this.modalEl.insertBefore(this.resultContainerEl, this.contentEl)

    // Wire input events
    this.inputEl.addEventListener('input', () => {
      void this.updateSuggestions()
    })

    // Keyboard navigation
    this.inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        this.setSelectedIndex(this.selectedIndex + 1)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        this.setSelectedIndex(this.selectedIndex - 1)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        this.selectActiveSuggestion(e)
      }
    })
  }

  open(): void {
    super.open()
    this.inputEl.focus()
    void this.updateSuggestions()
  }

  /** Set placeholder text. */
  setPlaceholder(placeholder: string): void {
    this.inputEl.placeholder = placeholder
  }

  /** Set instruction hints. */
  setInstructions(_instructions: Instruction[]): void {
    // Could render at bottom — for now no-op
  }

  /** Called when there are no suggestions. */
  onNoSuggestion(): void {
    this.resultContainerEl.innerHTML = ''
    const empty = document.createElement('div')
    empty.className = 'suggestion-empty'
    empty.style.cssText = 'padding:12px;color:var(--text-muted,#888);text-align:center;'
    empty.textContent = this.emptyStateText
    this.resultContainerEl.appendChild(empty)
  }

  /** Select the currently highlighted suggestion. */
  selectSuggestion(value: T, evt: MouseEvent | KeyboardEvent): void {
    this.onChooseSuggestion(value, evt)
    this.close()
  }

  /** Select the active (highlighted) suggestion. */
  selectActiveSuggestion(evt: MouseEvent | KeyboardEvent): void {
    const item = this.suggestions[this.selectedIndex]
    if (item !== undefined) {
      this.selectSuggestion(item, evt)
    }
  }

  /** Get suggestions for the current query. Override this. */
  abstract getSuggestions(query: string): T[] | Promise<T[]>

  /** Render a suggestion item. Override this. */
  abstract renderSuggestion(value: T, el: HTMLElement): void

  /** Handle when user selects a suggestion. Override this. */
  abstract onChooseSuggestion(item: T, evt: MouseEvent | KeyboardEvent): void

  // ─── Private ─────────────────────────────────────────────────────────────

  private async updateSuggestions(): Promise<void> {
    const query = this.inputEl.value
    const result = this.getSuggestions(query)
    const items = result instanceof Promise ? await result : result

    this.suggestions = items.slice(0, this.limit)
    this.selectedIndex = 0
    this.renderSuggestions()
  }

  private renderSuggestions(): void {
    this.resultContainerEl.innerHTML = ''

    if (this.suggestions.length === 0) {
      this.onNoSuggestion()
      return
    }

    for (let i = 0; i < this.suggestions.length; i++) {
      const item = this.suggestions[i]!
      const el = document.createElement('div')
      el.className = 'suggestion-item'
      el.style.cssText = 'padding:8px 12px;cursor:pointer;border-radius:4px;'
      if (i === this.selectedIndex) {
        el.style.background = 'var(--bg-elevated, #f0f0f0)'
        el.classList.add('is-selected')
      }
      el.addEventListener('click', (e) => {
        this.selectSuggestion(item, e)
      })
      el.addEventListener('mouseenter', () => {
        this.setSelectedIndex(i)
      })
      this.renderSuggestion(item, el)
      this.resultContainerEl.appendChild(el)
    }
  }

  private setSelectedIndex(index: number): void {
    if (this.suggestions.length === 0) return
    // Wrap around
    this.selectedIndex = ((index % this.suggestions.length) + this.suggestions.length) % this.suggestions.length
    // Update DOM highlight
    const items = this.resultContainerEl.querySelectorAll('.suggestion-item')
    items.forEach((el, i) => {
      if (i === this.selectedIndex) {
        el.classList.add('is-selected')
        ;(el as HTMLElement).style.background = 'var(--bg-elevated, #f0f0f0)'
        el.scrollIntoView({ block: 'nearest' })
      } else {
        el.classList.remove('is-selected')
        ;(el as HTMLElement).style.background = ''
      }
    })
  }
}

// ─── FuzzySuggestModal ───────────────────────────────────────────────────────

/**
 * FuzzySuggestModal — SuggestModal with built-in fuzzy search.
 * Plugins override getItems() and getItemText() instead of getSuggestions().
 */
export abstract class FuzzySuggestModal<T> extends SuggestModal<FuzzyMatch<T>> {
  /** Get all items to search through. Override this. */
  abstract getItems(): T[]

  /** Get the searchable text for an item. Override this. */
  abstract getItemText(item: T): string

  /** Handle when user chooses an item. Override this. */
  abstract onChooseItem(item: T, evt: MouseEvent | KeyboardEvent): void

  getSuggestions(query: string): FuzzyMatch<T>[] {
    const items = this.getItems()
    if (!query) {
      return items.map(item => ({
        item,
        match: { score: 0, matches: [] },
      }))
    }

    const lowerQuery = query.toLowerCase()
    const results: FuzzyMatch<T>[] = []

    for (const item of items) {
      const text = this.getItemText(item).toLowerCase()
      const matchIndex = text.indexOf(lowerQuery)
      if (matchIndex >= 0) {
        results.push({
          item,
          match: {
            score: matchIndex === 0 ? 1 : 0.5,
            matches: [[matchIndex, matchIndex + lowerQuery.length]],
          },
        })
      }
    }

    // Sort by score (higher first), then alphabetically
    results.sort((a, b) => b.match.score - a.match.score)
    return results
  }

  renderSuggestion(fuzzyMatch: FuzzyMatch<T>, el: HTMLElement): void {
    el.textContent = this.getItemText(fuzzyMatch.item)
  }

  onChooseSuggestion(item: FuzzyMatch<T>, evt: MouseEvent | KeyboardEvent): void {
    this.onChooseItem(item.item, evt)
  }
}

// ─── Registration ────────────────────────────────────────────────────────────

/**
 * Register Modal, SuggestModal, and FuzzySuggestModal on window.obsidian.
 */
export function registerSuggestModalGlobals(): void {
  const obsidian = (window as unknown as { obsidian?: Record<string, unknown> }).obsidian
  if (obsidian) {
    obsidian.Modal = Modal
    obsidian.SuggestModal = SuggestModal
    obsidian.FuzzySuggestModal = FuzzySuggestModal
  }
}
