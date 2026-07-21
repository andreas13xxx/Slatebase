import { Decoration, WidgetType, type EditorView } from '@codemirror/view'
import { StateEffect, type EditorState, type Range } from '@codemirror/state'
import { syntaxTree } from '@codemirror/language'
import type { HideableRange } from './inline-decorations'

/**
 * State effect to toggle callout fold state.
 * Payload: { from, to } identifying the blockquote node, and `fold` (the new state).
 */
export const toggleCalloutFoldEffect = StateEffect.define<{
  from: number
  to: number
  fold: boolean
}>()

/** Image file extensions (lowercase, with dot) that get inline image preview. */
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.avif', '.bmp'])

/**
 * Options for building widget decorations.
 */
export interface WidgetDecorationOptions {
  /** Vault ID for constructing embed image URLs. */
  vaultId: string
  /** Auth token for image requests. */
  token?: string
  /** Callback when a checkbox is toggled. */
  onCheckboxToggle?: (line: number, checked: boolean) => void
  /** Set of folded callout block positions (keyed as `${from}:${to}`). */
  foldedCallouts?: Set<string>
}

/**
 * Result of building widget decorations.
 */
export interface WidgetDecorationResult {
  decorations: Range<Decoration>[]
  hideableRanges: HideableRange[]
}

// ---------------------------------------------------------------------------
// Widget Classes
// ---------------------------------------------------------------------------

/**
 * Widget for inline image/file embed previews.
 * Renders an <img> for image files or a file-icon placeholder for other types.
 */
class EmbedWidget extends WidgetType {
  private readonly filename: string
  private readonly vaultId: string
  private readonly token: string | undefined
  private readonly isImage: boolean

  constructor(
    filename: string,
    vaultId: string,
    token: string | undefined,
    isImage: boolean
  ) {
    super()
    this.filename = filename
    this.vaultId = vaultId
    this.token = token
    this.isImage = isImage
  }

  toDOM(): HTMLElement {
    if (this.isImage) {
      const img = document.createElement('img')
      let src = `/api/v1/vaults/${this.vaultId}/files?path=${encodeURIComponent(this.filename)}&raw=true`
      if (this.token) {
        src += `&token=${encodeURIComponent(this.token)}`
      }
      img.src = src
      img.className = 'cm-lp-embed-img'
      img.alt = this.filename
      img.loading = 'lazy'
      return img
    }

    // Non-image embed: file icon placeholder
    const span = document.createElement('span')
    span.className = 'cm-lp-embed-file'
    span.textContent = `📄 ${this.filename}`
    return span
  }

  eq(other: EmbedWidget): boolean {
    return this.filename === other.filename &&
      this.vaultId === other.vaultId &&
      this.token === other.token &&
      this.isImage === other.isImage
  }

  get estimatedHeight(): number {
    return this.isImage ? 200 : 24
  }
}

/**
 * Widget for task checkbox rendering.
 * Renders a clickable <input type="checkbox"> that toggles task state.
 */
class CheckboxWidget extends WidgetType {
  private readonly checked: boolean
  private readonly lineNumber: number
  private readonly onToggle: ((line: number, checked: boolean) => void) | undefined

  constructor(
    checked: boolean,
    lineNumber: number,
    onToggle: ((line: number, checked: boolean) => void) | undefined
  ) {
    super()
    this.checked = checked
    this.lineNumber = lineNumber
    this.onToggle = onToggle
  }

  toDOM(view: EditorView): HTMLElement {
    const input = document.createElement('input')
    input.type = 'checkbox'
    input.className = 'cm-lp-checkbox'
    input.checked = this.checked
    input.setAttribute('aria-label', this.checked ? 'Task completed' : 'Task incomplete')

    input.addEventListener('click', (e) => {
      e.preventDefault()
      const newChecked = !this.checked
      const line = view.state.doc.line(this.lineNumber)
      const lineText = line.text

      // Replace [ ] with [x] or [x] with [ ]
      const oldMarker = this.checked ? '[x]' : '[ ]'
      const newMarker = newChecked ? '[x]' : '[ ]'
      const markerIndex = lineText.indexOf(oldMarker)

      if (markerIndex !== -1) {
        const from = line.from + markerIndex
        const to = from + oldMarker.length
        view.dispatch({
          changes: { from, to, insert: newMarker }
        })
      }

      if (this.onToggle) {
        this.onToggle(this.lineNumber, newChecked)
      }
    })

    return input
  }

  eq(other: CheckboxWidget): boolean {
    return this.checked === other.checked && this.lineNumber === other.lineNumber
  }
}

/**
 * Widget for rendering Markdown tables as proper HTML <table> elements.
 * Parses pipe-separated rows and renders with header/body distinction and alignment.
 */
class TableWidget extends WidgetType {
  private readonly rows: string[][]
  private readonly alignments: Array<'left' | 'center' | 'right' | null>

  constructor(rows: string[][], alignments: Array<'left' | 'center' | 'right' | null>) {
    super()
    this.rows = rows
    this.alignments = alignments
  }

  toDOM(): HTMLElement {
    const table = document.createElement('table')
    table.className = 'cm-lp-table'

    // Header row
    if (this.rows.length > 0) {
      const thead = document.createElement('thead')
      const headerRow = document.createElement('tr')
      const headerCells = this.rows[0]!
      for (let i = 0; i < headerCells.length; i++) {
        const th = document.createElement('th')
        th.textContent = headerCells[i]!.trim()
        const align = this.alignments[i]
        if (align) th.style.textAlign = align
        headerRow.appendChild(th)
      }
      thead.appendChild(headerRow)
      table.appendChild(thead)
    }

    // Body rows (skip row 0 = header, row 1 = delimiter)
    if (this.rows.length > 2) {
      const tbody = document.createElement('tbody')
      for (let r = 2; r < this.rows.length; r++) {
        const tr = document.createElement('tr')
        const cells = this.rows[r]!
        for (let i = 0; i < cells.length; i++) {
          const td = document.createElement('td')
          td.textContent = cells[i]!.trim()
          const align = this.alignments[i]
          if (align) td.style.textAlign = align
          tr.appendChild(td)
        }
        tbody.appendChild(tr)
      }
      table.appendChild(tbody)
    }

    const wrapper = document.createElement('div')
    wrapper.className = 'cm-lp-table-wrapper'
    wrapper.appendChild(table)
    return wrapper
  }

  eq(other: TableWidget): boolean {
    if (this.rows.length !== other.rows.length) return false
    for (let i = 0; i < this.rows.length; i++) {
      const a = this.rows[i]!
      const b = other.rows[i]!
      if (a.length !== b.length) return false
      for (let j = 0; j < a.length; j++) {
        if (a[j] !== b[j]) return false
      }
    }
    return true
  }

  get estimatedHeight(): number {
    return 30 + this.rows.length * 28
  }
}

/**
 * Parses a table delimiter row to extract column alignments.
 * `:---` = left, `:---:` = center, `---:` = right, `---` = null (default)
 */
function parseTableAlignments(delimiterRow: string[]): Array<'left' | 'center' | 'right' | null> {
  return delimiterRow.map(cell => {
    const trimmed = cell.trim()
    const left = trimmed.startsWith(':')
    const right = trimmed.endsWith(':')
    if (left && right) return 'center'
    if (right) return 'right'
    if (left) return 'left'
    return null
  })
}

/**
 * Parses a pipe-separated table line into cells.
 * Strips leading/trailing pipes and splits on `|`.
 */
function parseTableRow(line: string): string[] {
  let trimmed = line.trim()
  if (trimmed.startsWith('|')) trimmed = trimmed.slice(1)
  if (trimmed.endsWith('|')) trimmed = trimmed.slice(0, -1)
  return trimmed.split('|')
}

/**
 * Widget for rendering Mermaid diagrams as inline SVGs.
 * Lazy-loads the mermaid library, renders with a timeout, and caches the SVG.
 */
class MermaidWidget extends WidgetType {
  private readonly code: string

  constructor(code: string) {
    super()
    this.code = code
  }

  toDOM(): HTMLElement {
    const container = document.createElement('div')
    container.className = 'cm-lp-mermaid'

    // Show loading state
    const loading = document.createElement('span')
    loading.className = 'cm-lp-mermaid-loading'
    loading.textContent = 'Diagramm wird geladen…'
    container.appendChild(loading)

    // Async render
    this.renderDiagram(container)

    return container
  }

  private async renderDiagram(container: HTMLElement): Promise<void> {
    try {
      const mermaidModule = await import('mermaid')
      const mermaid = mermaidModule.default

      // Detect theme
      const dataTheme = document.documentElement.getAttribute('data-theme')
      let theme: 'default' | 'dark' = 'default'
      if (dataTheme === 'dark' || (!dataTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        theme = 'dark'
      }

      mermaid.initialize({
        securityLevel: 'strict',
        theme,
        startOnLoad: false,
        suppressErrorRendering: true,
      })

      // Generate unique ID
      const id = `cm-mermaid-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

      // Render with timeout
      const renderPromise = mermaid.render(id, this.code)
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('TIMEOUT')), 5000)
      )

      const { svg } = await Promise.race([renderPromise, timeoutPromise])

      // Replace loading with SVG
      container.innerHTML = ''
      container.className = 'cm-lp-mermaid cm-lp-mermaid-rendered'
      container.innerHTML = svg
    } catch (err: unknown) {
      container.innerHTML = ''
      container.className = 'cm-lp-mermaid cm-lp-mermaid-error'

      const message = err instanceof Error ? err.message : 'Unknown error'
      if (message === 'TIMEOUT') {
        container.textContent = 'Diagramm-Rendering abgebrochen (Timeout)'
      } else {
        const errSpan = document.createElement('span')
        errSpan.textContent = message
        container.appendChild(errSpan)

        const pre = document.createElement('pre')
        pre.className = 'cm-lp-mermaid-source'
        const code = document.createElement('code')
        code.textContent = this.code
        pre.appendChild(code)
        container.appendChild(pre)
      }
    }
  }

  eq(other: MermaidWidget): boolean {
    return this.code === other.code
  }

  get estimatedHeight(): number {
    return 200
  }
}

/**
 * Widget for rendering standard Markdown images ![alt](url) as inline <img> elements.
 */
class ImageWidget extends WidgetType {
  private readonly src: string
  private readonly alt: string
  private readonly vaultId: string
  private readonly token: string | undefined

  constructor(src: string, alt: string, vaultId: string, token: string | undefined) {
    super()
    this.src = src
    this.alt = alt
    this.vaultId = vaultId
    this.token = token
  }

  toDOM(): HTMLElement {
    const img = document.createElement('img')

    // Determine if this is an external URL or a vault-relative path
    if (this.src.startsWith('http://') || this.src.startsWith('https://') || this.src.startsWith('data:')) {
      img.src = this.src
    } else {
      // Vault-relative path — use the files API
      let src = `/api/v1/vaults/${this.vaultId}/files?path=${encodeURIComponent(this.src)}&raw=true`
      if (this.token) {
        src += `&token=${encodeURIComponent(this.token)}`
      }
      img.src = src
    }

    img.alt = this.alt
    img.className = 'cm-lp-image'
    img.loading = 'lazy'
    return img
  }

  eq(other: ImageWidget): boolean {
    return this.src === other.src && this.alt === other.alt &&
      this.vaultId === other.vaultId && this.token === other.token
  }

  get estimatedHeight(): number {
    return 200
  }
}

/**
 * Widget for rendering horizontal rules (---, ***, ___) as <hr> elements.
 */
class HorizontalRuleWidget extends WidgetType {
  toDOM(): HTMLElement {
    const hr = document.createElement('hr')
    hr.className = 'cm-lp-hr'
    return hr
  }

  eq(_other: HorizontalRuleWidget): boolean {
    return true
  }

  get estimatedHeight(): number {
    return 20
  }
}

/**
 * SVG path data for callout icons (Lucide icon set, 24x24 viewBox).
 * Each entry contains the SVG inner content for the corresponding callout type.
 */
const CALLOUT_ICON_PATHS: Record<string, string> = {
  note: '<path d="M12 20h9"/><path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  tip: '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/>',
  todo: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/>',
  warning: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  danger: '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>',
  bug: '<path d="m8 2 1.88 1.88"/><path d="M14.12 3.88 16 2"/><path d="M9 7.13v-1a3.003 3.003 0 1 1 6 0v1"/><path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6"/><path d="M12 20v-9"/><path d="M6.53 9C4.6 8.8 3 7.1 3 5"/><path d="M6 13H2"/><path d="M3 21c0-2.1 1.7-3.9 3.8-4"/><path d="M20.97 5c0 2.1-1.6 3.8-3.5 4"/><path d="M22 13h-4"/><path d="M17.2 17c2.1.1 3.8 1.9 3.8 4"/>',
  example: '<path d="M3 12h.01"/><path d="M3 18h.01"/><path d="M3 6h.01"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M8 6h13"/>',
  quote: '<path d="M16 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z"/><path d="M5 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z"/>',
  success: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/>',
  question: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
  failure: '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>',
  abstract: '<rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/>',
}

/** Chevron-right SVG path for fold toggle (rotates to down when open). */
const CHEVRON_RIGHT_PATH = '<path d="m9 18 6-6-6-6"/>'

/**
 * CSS color token names per callout type for the icon color.
 */
const CALLOUT_ICON_COLOR_TOKENS: Record<string, string> = {
  note: '--callout-note-icon',
  info: '--callout-info-icon',
  tip: '--callout-tip-icon',
  todo: '--callout-todo-icon',
  warning: '--callout-warning-icon',
  danger: '--callout-danger-icon',
  bug: '--callout-bug-icon',
  example: '--callout-example-icon',
  quote: '--callout-quote-icon',
  success: '--callout-success-icon',
  question: '--callout-question-icon',
  failure: '--callout-failure-icon',
  abstract: '--callout-abstract-icon',
}

/**
 * Widget that renders a callout icon (SVG) inline before the title text.
 * For foldable callouts, also renders a chevron toggle.
 */
class CalloutIconWidget extends WidgetType {
  private readonly calloutType: string
  private readonly foldable: boolean
  private readonly folded: boolean
  private readonly blockFrom: number
  private readonly blockTo: number
  private readonly defaultTitle: string | null

  constructor(
    calloutType: string,
    foldable: boolean,
    folded: boolean,
    blockFrom: number,
    blockTo: number,
    defaultTitle: string | null = null
  ) {
    super()
    this.calloutType = calloutType
    this.foldable = foldable
    this.folded = folded
    this.blockFrom = blockFrom
    this.blockTo = blockTo
    this.defaultTitle = defaultTitle
  }

  toDOM(view: EditorView): HTMLElement {
    const wrapper = document.createElement('span')
    wrapper.className = 'cm-lp-callout-icon-wrapper'

    // Fold chevron (only for foldable callouts)
    if (this.foldable) {
      const chevron = document.createElement('span')
      chevron.className = `cm-lp-callout-chevron${this.folded ? '' : ' cm-lp-callout-chevron--open'}`
      chevron.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${CHEVRON_RIGHT_PATH}</svg>`
      chevron.setAttribute('aria-label', this.folded ? 'Callout aufklappen' : 'Callout zuklappen')
      chevron.setAttribute('role', 'button')
      chevron.addEventListener('mousedown', (e) => {
        e.preventDefault()
        e.stopPropagation()
        // Toggle fold state by dispatching a state effect
        view.dispatch({
          effects: toggleCalloutFoldEffect.of({
            from: this.blockFrom,
            to: this.blockTo,
            fold: !this.folded,
          })
        })
      })
      wrapper.appendChild(chevron)
    }

    // Type icon
    const colorToken = CALLOUT_ICON_COLOR_TOKENS[this.calloutType] ?? '--callout-note-icon'
    const iconPath = CALLOUT_ICON_PATHS[this.calloutType] ?? CALLOUT_ICON_PATHS['note']!
    const icon = document.createElement('span')
    icon.className = `cm-lp-callout-icon cm-lp-callout-icon--${this.calloutType}`
    icon.style.color = `var(${colorToken})`
    icon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${iconPath}</svg>`
    wrapper.appendChild(icon)

    // Default title (shown when callout has no explicit title text)
    if (this.defaultTitle) {
      const titleSpan = document.createElement('span')
      titleSpan.className = 'cm-lp-callout-default-title'
      titleSpan.textContent = this.defaultTitle
      wrapper.appendChild(titleSpan)
    }

    return wrapper
  }

  eq(other: CalloutIconWidget): boolean {
    return this.calloutType === other.calloutType &&
      this.foldable === other.foldable &&
      this.folded === other.folded &&
      this.blockFrom === other.blockFrom &&
      this.blockTo === other.blockTo &&
      this.defaultTitle === other.defaultTitle
  }

  get estimatedHeight(): number {
    return -1 // inline widget
  }

  ignoreEvent(): boolean {
    return false
  }
}

/**
 * Widget for rendering YAML frontmatter as a compact properties box.
 * Shows key-value pairs in a styled container, similar to Obsidian's Properties view.
 */
class FrontmatterWidget extends WidgetType {
  private readonly yaml: string

  constructor(yaml: string) {
    super()
    this.yaml = yaml
  }

  toDOM(): HTMLElement {
    const container = document.createElement('div')
    container.className = 'cm-lp-frontmatter'

    // Parse simple YAML key-value pairs
    const lines = this.yaml.trim().split('\n')
    let currentKey = ''
    const entries: Array<{ key: string; values: string[] }> = []

    for (const line of lines) {
      const keyMatch = line.match(/^(\w[\w-]*):\s*(.*)/)
      if (keyMatch) {
        currentKey = keyMatch[1]!
        const value = keyMatch[2]!.trim()
        if (value.startsWith('[') && value.endsWith(']')) {
          // Inline array: tags: [foo, bar]
          const items = value.slice(1, -1).split(',').map(s => s.trim()).filter(Boolean)
          entries.push({ key: currentKey, values: items })
        } else if (value) {
          entries.push({ key: currentKey, values: [value] })
        } else {
          // Multi-line value starts on next lines
          entries.push({ key: currentKey, values: [] })
        }
      } else if (currentKey) {
        // Continuation line (e.g. list item "  - value")
        const listItem = line.match(/^\s+-\s+(.+)/)
        if (listItem) {
          const last = entries[entries.length - 1]
          if (last) {
            last.values.push(listItem[1]!.trim())
          }
        }
      }
    }

    // Render as compact key-value pairs
    for (const entry of entries) {
      const row = document.createElement('div')
      row.className = 'cm-lp-frontmatter-row'

      const keyEl = document.createElement('span')
      keyEl.className = 'cm-lp-frontmatter-key'
      keyEl.textContent = entry.key
      row.appendChild(keyEl)

      const valueEl = document.createElement('span')
      valueEl.className = 'cm-lp-frontmatter-value'

      if (entry.values.length === 0) {
        valueEl.textContent = '—'
      } else {
        for (let i = 0; i < entry.values.length; i++) {
          const tag = document.createElement('span')
          tag.className = 'cm-lp-frontmatter-tag'
          tag.textContent = entry.values[i]!
          valueEl.appendChild(tag)
        }
      }

      row.appendChild(valueEl)
      container.appendChild(row)
    }

    if (entries.length === 0) {
      container.textContent = '(leere Properties)'
      container.classList.add('cm-lp-frontmatter--empty')
    }

    return container
  }

  eq(other: FrontmatterWidget): boolean {
    return this.yaml === other.yaml
  }

  get estimatedHeight(): number {
    return 40
  }
}

// ---------------------------------------------------------------------------
// Builder Function
// ---------------------------------------------------------------------------

/** Regex to detect embed syntax: ![[filename]] */
const EMBED_REGEX = /!\[\[([^\]]+)\]\]/g

/** Regex to detect task markers: - [ ] or - [x] at line start */
const TASK_REGEX = /^(\s*)-\s\[([ xX])\]/

/** Regex to detect callout headers: > [!type][+/-] optional title */
const CALLOUT_REGEX = /^>\s*\[!(\w+)\]([+-])?\s*(.*)/

/**
 * Build widget decorations from the document.
 * Handles embeds, checkboxes, callouts, code blocks, and blockquotes.
 *
 * @param state - The current editor state
 * @param options - Widget decoration options (vaultId, token, callbacks)
 * @returns Decorations and hideable ranges for the live preview
 */
export function buildWidgetDecorations(
  state: EditorState,
  options: WidgetDecorationOptions
): WidgetDecorationResult {
  const decorations: Range<Decoration>[] = []
  const hideableRanges: HideableRange[] = []
  const tree = syntaxTree(state)
  const doc = state.doc

  // Track processed ranges to avoid duplicate processing
  const processedBlocks = new Set<string>()

  // --- Frontmatter: ---\nyaml\n--- at document start ---
  let frontmatterEndPos = 0
  const docText = doc.sliceString(0, Math.min(doc.length, 2000)) // only check first 2KB
  if (docText.startsWith('---\n') || docText.startsWith('---\r\n')) {
    const endMatch = docText.indexOf('\n---', 3)
    if (endMatch !== -1) {
      const fmEnd = endMatch + 4 // includes the closing \n---
      // Verify it ends at a line boundary (either end of doc or followed by newline)
      const afterEnd = fmEnd < doc.length ? doc.sliceString(fmEnd, fmEnd + 1) : '\n'
      if (afterEnd === '\n' || afterEnd === '\r' || fmEnd >= doc.length) {
        const yamlContent = doc.sliceString(4, endMatch) // content between the --- markers
        const fullEnd = afterEnd === '\n' ? fmEnd + 1 : (afterEnd === '\r' ? fmEnd + 2 : fmEnd)
        frontmatterEndPos = Math.min(fullEnd, doc.length)

        const widget = new FrontmatterWidget(yamlContent)
        decorations.push(
          Decoration.replace({ widget }).range(0, frontmatterEndPos)
        )
        hideableRanges.push({ from: 0, to: frontmatterEndPos, groupFrom: 0, groupTo: frontmatterEndPos })
      }
    }
  }

  tree.iterate({
    enter(node) {
      // --- Embeds: ![[filename.png]] ---
      // Detect via regex since Lezer markdown parser doesn't have a specific embed node
      if (node.name === 'Image' || node.name === 'Paragraph' || node.name === 'Document') {
        // Only scan text content at leaf level to avoid duplicate processing
        if (node.name === 'Paragraph') {
          const text = doc.sliceString(node.from, node.to)
          let match: RegExpExecArray | null
          EMBED_REGEX.lastIndex = 0

          while ((match = EMBED_REGEX.exec(text)) !== null) {
            const filename = match[1]!
            const matchFrom = node.from + match.index
            const matchTo = matchFrom + match[0].length
            const key = `embed:${matchFrom}:${matchTo}`

            if (processedBlocks.has(key)) continue
            processedBlocks.add(key)

            const ext = getFileExtension(filename)
            const isImage = IMAGE_EXTENSIONS.has(ext)

            const widget = new EmbedWidget(
              filename,
              options.vaultId,
              options.token,
              isImage
            )

            // Replace the ![[...]] syntax with the widget
            decorations.push(
              Decoration.replace({ widget }).range(matchFrom, matchTo)
            )
            hideableRanges.push({ from: matchFrom, to: matchTo, groupFrom: matchFrom, groupTo: matchTo })
          }
        }
      }

      // --- Standard Markdown Images: ![alt](url) ---
      if (node.name === 'Image') {
        const key = `image:${node.from}:${node.to}`
        if (processedBlocks.has(key)) return
        processedBlocks.add(key)

        const imageText = doc.sliceString(node.from, node.to)
        // Parse ![alt](url) — skip if it's an embed ![[...]]
        if (imageText.startsWith('![[')) return

        const altMatch = imageText.match(/^!\[([^\]]*)\]\(([^)]+)\)/)
        if (altMatch) {
          const alt = altMatch[1] ?? ''
          const src = altMatch[2] ?? ''

          const widget = new ImageWidget(src, alt, options.vaultId, options.token)
          decorations.push(
            Decoration.replace({ widget }).range(node.from, node.to)
          )
          hideableRanges.push({ from: node.from, to: node.to, groupFrom: node.from, groupTo: node.to })
        }
      }

      // --- Horizontal Rules: ---, ***, ___ ---
      if (node.name === 'HorizontalRule') {
        // Skip if inside frontmatter range (--- markers are not real HRs)
        if (node.from < frontmatterEndPos) return

        const key = `hr:${node.from}:${node.to}`
        if (processedBlocks.has(key)) return
        processedBlocks.add(key)

        const widget = new HorizontalRuleWidget()
        decorations.push(
          Decoration.replace({ widget }).range(node.from, node.to)
        )
        hideableRanges.push({ from: node.from, to: node.to, groupFrom: node.from, groupTo: node.to })
      }

      // --- Task Checkboxes: - [ ] or - [x] ---
      if (node.name === 'ListItem') {
        const line = doc.lineAt(node.from)
        const lineText = line.text
        const taskMatch = TASK_REGEX.exec(lineText)

        if (taskMatch) {
          const checked = taskMatch[2]!.toLowerCase() === 'x'
          const indentLen = taskMatch[1]!.length
          // The [ ] or [x] starts after "- " (or "  - ")
          const bracketStart = indentLen + 2 // "- " is 2 chars after indent
          const bracketFrom = line.from + bracketStart
          const bracketTo = bracketFrom + 3 // [x] is 3 chars

          const key = `checkbox:${bracketFrom}`
          if (processedBlocks.has(key)) return
          processedBlocks.add(key)

          const widget = new CheckboxWidget(
            checked,
            line.number,
            options.onCheckboxToggle
          )

          // Replace the [ ] or [x] with a checkbox widget
          decorations.push(
            Decoration.replace({ widget }).range(bracketFrom, bracketTo)
          )
          hideableRanges.push({ from: bracketFrom, to: bracketTo, groupFrom: bracketFrom, groupTo: bracketTo })
        }
      }

      // --- Fenced Code Blocks ---
      if (node.name === 'FencedCode') {
        const key = `code:${node.from}:${node.to}`
        if (processedBlocks.has(key)) return
        processedBlocks.add(key)

        // Detect language from the info string
        let language = ''
        const codeCursor = node.node.cursor()
        let fenceOpenFrom = -1
        let fenceOpenTo = -1
        let fenceCloseFrom = -1
        let fenceCloseTo = -1

        if (codeCursor.firstChild()) {
          do {
            if (codeCursor.name === 'CodeMark') {
              if (fenceOpenFrom === -1) {
                fenceOpenFrom = codeCursor.from
                fenceOpenTo = codeCursor.to
              } else {
                fenceCloseFrom = codeCursor.from
                fenceCloseTo = codeCursor.to
              }
            }
            if (codeCursor.name === 'CodeInfo') {
              language = doc.sliceString(codeCursor.from, codeCursor.to).trim()
            }
          } while (codeCursor.nextSibling())
        }

        // Mermaid blocks: replace entire block with rendered diagram widget
        if (language.toLowerCase() === 'mermaid') {
          // Extract code content (between opening and closing fence lines)
          const openLine = fenceOpenFrom !== -1 ? doc.lineAt(fenceOpenFrom) : null
          const closeLine = fenceCloseFrom !== -1 ? doc.lineAt(fenceCloseFrom) : null
          const codeStart = openLine ? openLine.to + 1 : node.from
          const codeEnd = closeLine ? closeLine.from - 1 : node.to
          const mermaidCode = codeEnd > codeStart ? doc.sliceString(codeStart, codeEnd) : ''

          if (mermaidCode.trim()) {
            const widget = new MermaidWidget(mermaidCode)
            decorations.push(
              Decoration.replace({ widget }).range(node.from, node.to)
            )
            hideableRanges.push({ from: node.from, to: node.to, groupFrom: node.from, groupTo: node.to })
          }
          return
        }

        // Apply line decorations for code block styling
        const startLine = doc.lineAt(node.from)
        const endLine = doc.lineAt(node.to)

        for (let lineNum = startLine.number; lineNum <= endLine.number; lineNum++) {
          const line = doc.line(lineNum)
          const isFirst = lineNum === startLine.number
          const isLast = lineNum === endLine.number
          let lineClass = 'cm-lp-code-block-line'

          if (isFirst) lineClass += ' cm-lp-code-block-first'
          if (isLast) lineClass += ' cm-lp-code-block-last'
          if (language) lineClass += ` cm-lp-code-lang-${language}`

          decorations.push(
            Decoration.line({ attributes: { class: lineClass } }).range(line.from)
          )
        }

        // Hide opening fence (``` or ```language)
        if (fenceOpenFrom !== -1 && fenceOpenTo !== -1) {
          const openLineEnd = doc.lineAt(fenceOpenFrom).to
          hideableRanges.push({ from: fenceOpenFrom, to: openLineEnd, groupFrom: node.from, groupTo: node.to })
          decorations.push(
            Decoration.replace({}).range(fenceOpenFrom, openLineEnd)
          )
        }

        // Hide closing fence (```)
        if (fenceCloseFrom !== -1 && fenceCloseTo !== -1) {
          hideableRanges.push({ from: fenceCloseFrom, to: fenceCloseTo, groupFrom: node.from, groupTo: node.to })
          decorations.push(
            Decoration.replace({}).range(fenceCloseFrom, fenceCloseTo)
          )
        }
      }

      // --- Blockquotes ---
      if (node.name === 'Blockquote') {
        const key = `blockquote:${node.from}:${node.to}`
        if (processedBlocks.has(key)) return
        processedBlocks.add(key)

        // Check if this is a callout (first line matches callout pattern)
        const firstLine = doc.lineAt(node.from)
        const firstLineText = firstLine.text
        const calloutMatch = CALLOUT_REGEX.exec(firstLineText)

        if (calloutMatch) {
          // --- Callout: > [!type][+/-] title ---
          const calloutType = calloutMatch[1]!.toLowerCase()
          const foldMarker = calloutMatch[2] as string | undefined
          const foldable = foldMarker === '+' || foldMarker === '-'
          const foldKey = `${node.from}:${node.to}`
          // Fold state logic:
          // - foldedCallouts tracks explicitly toggled callouts
          // - If a callout has been toggled, its key is in the set (inverted from default)
          // - Default: '-' means folded, '+' means open
          const defaultFolded = foldMarker === '-'
          const hasBeenToggled = options.foldedCallouts
            ? options.foldedCallouts.has(foldKey)
            : false
          const folded = foldable && (hasBeenToggled ? !defaultFolded : defaultFolded)

          const startLine = doc.lineAt(node.from)
          const endLine = doc.lineAt(node.to)

          for (let lineNum = startLine.number; lineNum <= endLine.number; lineNum++) {
            const line = doc.line(lineNum)
            const isFirst = lineNum === startLine.number

            // For foldable callouts that are folded, hide body lines
            if (foldable && folded && !isFirst) {
              hideableRanges.push({ from: line.from, to: line.to, groupFrom: node.from, groupTo: node.to })
              decorations.push(
                Decoration.replace({}).range(line.from, line.to)
              )
              continue
            }

            let lineClass = `cm-lp-callout cm-lp-callout-${calloutType}`
            if (isFirst) lineClass += ' cm-lp-callout-header'
            if (foldable) lineClass += ' cm-lp-callout-foldable'
            if (foldable && folded) lineClass += ' cm-lp-callout-folded'

            decorations.push(
              Decoration.line({ attributes: { class: lineClass } }).range(line.from)
            )

            // Hide the "> " prefix on each callout line
            const lineText = line.text
            const quotePrefix = lineText.match(/^>\s?/)
            if (quotePrefix) {
              const prefixTo = line.from + quotePrefix[0].length
              hideableRanges.push({ from: line.from, to: prefixTo, groupFrom: node.from, groupTo: node.to })
              decorations.push(
                Decoration.replace({}).range(line.from, prefixTo)
              )
            }
          }

          // Hide the [!type][+/-] part on the first line and insert icon widget
          const calloutMarkerMatch = firstLineText.match(/^>\s*(\[!\w+\][+-]?)\s*/)
          if (calloutMarkerMatch) {
            const markerStart = firstLine.from + (firstLineText.indexOf('[!'))
            const markerEnd = firstLine.from + firstLineText.indexOf(']', firstLineText.indexOf('[!')) + 1
            // Include fold marker if present
            let afterMarker = markerEnd
            if (foldMarker) {
              afterMarker = markerEnd + 1 // skip the + or -
            }
            // Include any space after the closing marker
            const afterBracket = afterMarker < firstLine.to && doc.sliceString(afterMarker, afterMarker + 1) === ' '
              ? afterMarker + 1
              : afterMarker

            hideableRanges.push({ from: markerStart, to: afterBracket, groupFrom: node.from, groupTo: node.to })

            // Replace [!type][+/-] with the icon widget
            // If no title text after the marker, show the type name as default title
            const titleText = calloutMatch[3]?.trim() ?? ''
            const defaultTitle = titleText.length === 0
              ? calloutType.charAt(0).toUpperCase() + calloutType.slice(1)
              : null
            const iconWidget = new CalloutIconWidget(
              calloutType,
              foldable,
              folded,
              node.from,
              node.to,
              defaultTitle
            )
            decorations.push(
              Decoration.replace({ widget: iconWidget }).range(markerStart, afterBracket)
            )
          }
        } else {
          // --- Regular blockquote ---
          const startLine = doc.lineAt(node.from)
          const endLine = doc.lineAt(node.to)

          for (let lineNum = startLine.number; lineNum <= endLine.number; lineNum++) {
            const line = doc.line(lineNum)
            decorations.push(
              Decoration.line({ attributes: { class: 'cm-lp-blockquote' } }).range(line.from)
            )

            // Hide the "> " prefix
            const lineText = line.text
            const quotePrefix = lineText.match(/^>\s?/)
            if (quotePrefix) {
              const prefixTo = line.from + quotePrefix[0].length
              hideableRanges.push({ from: line.from, to: prefixTo, groupFrom: node.from, groupTo: node.to })
              decorations.push(
                Decoration.replace({}).range(line.from, prefixTo)
              )
            }
          }
        }
      }

      // --- Tables (GFM) ---
      if (node.name === 'Table') {
        const key = `table:${node.from}:${node.to}`
        if (processedBlocks.has(key)) return
        processedBlocks.add(key)

        // Parse all lines of the table
        const tableText = doc.sliceString(node.from, node.to)
        const lines = tableText.split('\n').filter(l => l.trim().length > 0)

        if (lines.length >= 2) {
          const rows = lines.map(l => parseTableRow(l))
          // Row index 1 is the delimiter row (---|:---:|---:)
          const alignments = rows.length > 1 ? parseTableAlignments(rows[1]!) : []

          const widget = new TableWidget(rows, alignments)
          decorations.push(
            Decoration.replace({ widget }).range(node.from, node.to)
          )
          hideableRanges.push({ from: node.from, to: node.to, groupFrom: node.from, groupTo: node.to })
        }
      }
    }
  })

  return { decorations, hideableRanges }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extracts the file extension from a filename (lowercase, with dot).
 * Returns empty string if no extension found.
 */
function getFileExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.')
  if (lastDot === -1 || lastDot === filename.length - 1) return ''
  return filename.slice(lastDot).toLowerCase()
}
