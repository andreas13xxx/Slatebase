import { Decoration, WidgetType, type EditorView } from '@codemirror/view'
import type { EditorState, Range } from '@codemirror/state'
import { syntaxTree } from '@codemirror/language'
import type { HideableRange } from './inline-decorations'

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
      const encodedFilename = encodeURIComponent(this.filename)
      const tokenParam = this.token ? `?token=${encodeURIComponent(this.token)}` : ''
      img.src = `/api/v1/vaults/${this.vaultId}/files/${encodedFilename}${tokenParam}`
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

// ---------------------------------------------------------------------------
// Builder Function
// ---------------------------------------------------------------------------

/** Regex to detect embed syntax: ![[filename]] */
const EMBED_REGEX = /!\[\[([^\]]+)\]\]/g

/** Regex to detect task markers: - [ ] or - [x] at line start */
const TASK_REGEX = /^(\s*)-\s\[([ xX])\]/

/** Regex to detect callout headers: > [!type] optional title */
const CALLOUT_REGEX = /^>\s*\[!(\w+)\]\s*(.*)/

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
          // --- Callout: > [!type] title ---
          const calloutType = calloutMatch[1]!.toLowerCase()
          const startLine = doc.lineAt(node.from)
          const endLine = doc.lineAt(node.to)

          for (let lineNum = startLine.number; lineNum <= endLine.number; lineNum++) {
            const line = doc.line(lineNum)
            const isFirst = lineNum === startLine.number
            let lineClass = `cm-lp-callout cm-lp-callout-${calloutType}`

            if (isFirst) lineClass += ' cm-lp-callout-header'

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

          // Hide the [!type] part on the first line (keep the title visible)
          const calloutMarkerMatch = firstLineText.match(/^>\s*(\[!\w+\])\s*/)
          if (calloutMarkerMatch) {
            const markerStart = firstLine.from + (firstLineText.indexOf('[!'))
            const markerEnd = firstLine.from + firstLineText.indexOf(']', firstLineText.indexOf('[!')) + 1
            // Include any space after the closing ]
            const afterBracket = markerEnd < firstLine.to && doc.sliceString(markerEnd, markerEnd + 1) === ' '
              ? markerEnd + 1
              : markerEnd

            hideableRanges.push({ from: markerStart, to: afterBracket, groupFrom: node.from, groupTo: node.to })
            decorations.push(
              Decoration.replace({}).range(markerStart, afterBracket)
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
