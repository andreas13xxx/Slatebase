import { Decoration, WidgetType, type EditorView } from '@codemirror/view'
import { StateEffect, type EditorState, type Range } from '@codemirror/state'
import { syntaxTree } from '@codemirror/language'
import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { HideableRange } from './inline-decorations'
import { hasCodeBlockProcessor, getCodeBlockHandler, MarkdownRenderChild } from '../../plugins/compat/code-block-processor-registry'
import type { MarkdownPostProcessorContext } from '../../plugins/compat/code-block-processor-registry'
import { createWikilinkRegex, resolveWikilinkMatchTarget } from './link-decorations'
import { resolveWikilinkTarget } from '../../plugins/link-resolver'
import { ViewMode } from '../../components/ViewMode'
import type { DirectoryTree } from '../../types'
import { errorOnce } from '../../plugins/compat/log'
import { findEmbedCreatorForTarget, getLinktextExtension, mountRegisteredEmbed, type EmbedComponent, type EmbedContext } from '../../plugins/compat/embed-registry'

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

/** PDF file extensions (lowercase, with dot) that get an inline PDF viewer. */
const PDF_EXTENSIONS = new Set(['.pdf'])

/** Audio file extensions (lowercase, with dot) that get an inline audio player. */
const AUDIO_EXTENSIONS = new Set(['.mp3', '.wav', '.ogg', '.flac', '.m4a', '.aac', '.wma'])

/** Video file extensions (lowercase, with dot) that get an inline video player. */
const VIDEO_EXTENSIONS = new Set(['.mp4', '.webm', '.ogv', '.mov', '.mkv'])

/** Default inline PDF viewer height in pixels, when no `|height` is specified. */
const DEFAULT_PDF_HEIGHT_PX = 500

/**
 * Options for building widget decorations.
 */
export interface WidgetDecorationOptions {
  /** Vault ID for constructing embed image URLs. */
  vaultId: string
  /** Auth token for image requests. */
  token?: string
  /** Source file path (for code block processor context). */
  sourcePath?: string
  /** Callback when a checkbox is toggled. */
  onCheckboxToggle?: (line: number, checked: boolean) => void
  /** Set of folded callout block positions (keyed as `${from}:${to}`). */
  foldedCallouts?: Set<string>
  /** Directory tree, for resolving note-embed targets (bare names, missing .md). */
  directoryTree?: DirectoryTree | null
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

/** What kind of inline preview an embed target gets in Live Preview. */
type EmbedKind = 'image' | 'pdf' | 'audio' | 'video' | 'note'

/**
 * Widget for inline image/PDF/note embed previews.
 * - image: <img>
 * - pdf: fetched as a Blob and rendered via <object type="application/pdf">
 *   (mirroring BinaryViewer's PdfViewer, chosen there so Firefox uses its
 *   built-in pdf.js viewer)
 * - note: resolved against the directory tree, fetched, optionally sliced
 *   to a `#heading` section, and rendered by mounting a nested ViewMode
 *   React root — reusing the same rendering pipeline Viewer mode and hover
 *   previews use, rather than re-implementing Markdown rendering here.
 *   Every non-image/non-PDF extension falls through to 'note' — matching
 *   Reading mode's detectEmbedType(), which treats any unrecognized
 *   extension (.excalidraw, .canvas, ...) as a note. This is what gives a
 *   plugin's registerMarkdownPostProcessor a chance to re-render the nested
 *   ViewMode's output (e.g. Excalidraw turning its raw .excalidraw.md JSON
 *   into a drawing) — a 'file' placeholder fallback here used to skip that
 *   pipeline entirely and never call the plugin. Before falling into the
 *   note-fetch pipeline, buildNoteDOM() also checks app.embedRegistry for a
 *   plugin-registered creator (Supernote, PDF++, and similar plugins that
 *   render their own embed type) and delegates to it when one matches.
 */
class EmbedWidget extends WidgetType {
  private readonly filename: string
  private readonly vaultId: string
  private readonly token: string | undefined
  private readonly kind: EmbedKind
  private readonly display: string | null
  private readonly heading: string | null
  private readonly directoryTree: DirectoryTree | null
  private objectUrl: string | null = null
  private reactRoot: Root | null = null
  private pluginEmbed: EmbedComponent | null = null

  constructor(
    filename: string,
    vaultId: string,
    token: string | undefined,
    kind: EmbedKind,
    display: string | null,
    heading: string | null,
    directoryTree: DirectoryTree | null
  ) {
    super()
    this.filename = filename
    this.vaultId = vaultId
    this.token = token
    this.kind = kind
    this.display = display
    this.heading = heading
    this.directoryTree = directoryTree
  }

  /**
   * Resolves the embed target against the directory tree — same bare-name/
   * missing-extension resolution wikilinks and note embeds get (and what
   * Reading mode's renderEmbedNode already does for images/PDFs) — falling
   * back to the literal filename when it can't be resolved (e.g. tree not
   * loaded yet) so a valid explicit path still works.
   */
  private resolveFilePath(): string {
    return resolveWikilinkTarget(this.filename, this.directoryTree) ?? this.filename
  }

  private buildRawSrc(path: string = this.resolveFilePath()): string {
    let src = `/api/v1/vaults/${this.vaultId}/files?path=${encodeURIComponent(path)}&raw=true`
    if (this.token) {
      src += `&token=${encodeURIComponent(this.token)}`
    }
    return src
  }

  toDOM(): HTMLElement {
    if (this.kind === 'image') {
      const img = document.createElement('img')
      img.src = this.buildRawSrc()
      img.className = 'cm-lp-embed-img'
      img.alt = this.filename
      img.loading = 'lazy'
      applyEmbedImageSize(img, this.display)
      return img
    }

    if (this.kind === 'pdf') {
      return this.buildPdfDOM()
    }

    if (this.kind === 'audio') {
      return this.buildAudioDOM()
    }

    if (this.kind === 'video') {
      return this.buildVideoDOM()
    }

    return this.buildNoteDOM()
  }

  /**
   * Builds an inline PDF viewer, fetched as a Blob and rendered via
   * <object type="application/pdf"> — same approach as BinaryViewer's
   * PdfViewer (chosen there so Firefox uses its built-in pdf.js viewer).
   * The fetch happens after mount since toDOM() must return synchronously;
   * a loading placeholder shows until the blob URL is ready.
   */
  private buildPdfDOM(): HTMLElement {
    const heightPx = parseEmbedPdfHeight(this.display)
    const container = document.createElement('div')
    container.className = 'cm-lp-embed-pdf'
    container.style.height = `${String(heightPx)}px`

    const status = document.createElement('p')
    status.className = 'cm-lp-embed-pdf-status'
    status.textContent = '…'
    container.appendChild(status)

    fetch(this.buildRawSrc())
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${String(res.status)}`)
        return res.blob()
      })
      .then((blob) => {
        const pdfBlob = new Blob([blob], { type: 'application/pdf' })
        this.objectUrl = URL.createObjectURL(pdfBlob)

        const object = document.createElement('object')
        object.data = this.objectUrl
        object.type = 'application/pdf'
        object.className = 'cm-lp-embed-pdf-object'
        object.setAttribute('aria-label', this.filename)

        container.replaceChildren(object)
      })
      .catch(() => {
        status.textContent = `📄 ${this.filename}`
      })

    return container
  }

  /**
   * Builds an inline audio player.
   */
  private buildAudioDOM(): HTMLElement {
    const audio = document.createElement('audio')
    audio.controls = true
    audio.preload = 'metadata'
    audio.className = 'cm-lp-embed-audio'
    audio.setAttribute('aria-label', this.filename)
    const source = document.createElement('source')
    source.src = this.buildRawSrc()
    audio.appendChild(source)
    return audio
  }

  /**
   * Builds an inline video player with optional sizing from the display param.
   */
  private buildVideoDOM(): HTMLElement {
    const video = document.createElement('video')
    video.controls = true
    video.preload = 'metadata'
    video.className = 'cm-lp-embed-video'
    video.setAttribute('aria-label', this.filename)
    applyEmbedMediaSize(video, this.display)
    const source = document.createElement('source')
    source.src = this.buildRawSrc()
    video.appendChild(source)
    return video
  }

  /**
   * Builds an inline note embed: resolves the target against the directory
   * tree (handles bare names and missing `.md`, same as wikilinks), fetches
   * its content, slices to `#heading` if given, and renders it by mounting a
   * nested <ViewMode> React root — the same component Viewer mode and hover
   * previews use, so nested embeds/callouts/headings render identically.
   *
   * Before any of that: checks app.embedRegistry (see ../../plugins/compat/
   * embed-registry.ts) for a plugin-registered creator matching this
   * embed's extension — either the apparent one in the link text (e.g.
   * "excalidraw" from "Drawing.excalidraw") or the resolved file's real one
   * (e.g. "md"). A match delegates to that plugin's own embed component
   * instead of the note-fetch pipeline below.
   */
  private buildNoteDOM(): HTMLElement {
    const container = document.createElement('div')
    container.className = 'cm-lp-embed-note'

    const resolvedPath = resolveWikilinkTarget(this.filename, this.directoryTree)
    if (!resolvedPath) {
      container.classList.add('cm-lp-embed-note--missing')
      container.textContent = `Notiz nicht gefunden: ${this.filename}`
      return container
    }

    const creator = findEmbedCreatorForTarget(this.filename, getLinktextExtension(resolvedPath))
    if (creator) {
      return this.buildPluginEmbedDOM(creator, resolvedPath)
    }

    const status = document.createElement('p')
    status.className = 'cm-lp-embed-note-status'
    status.textContent = '…'
    container.appendChild(status)

    // The non-raw JSON endpoint only accepts the auth token via a real
    // Authorization header — unlike raw=true (used by the image/PDF embeds
    // above), which also allows a ?token= query param specifically so plain
    // <img src>/<object data> tags can authenticate without custom headers.
    const fetchInit: RequestInit = this.token
      ? { headers: { Authorization: `Bearer ${this.token}` } }
      : {}

    fetch(this.buildFileContentSrc(resolvedPath), fetchInit)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${String(res.status)}`)
        return res.json() as Promise<{ content: string; isBinary: boolean }>
      })
      .then((file) => {
        if (file.isBinary) throw new Error('binary')
        const content = this.heading ? extractHeadingSection(file.content, this.heading) : file.content

        const header = document.createElement('span')
        header.className = 'cm-lp-embed-note-title'
        header.textContent = this.filename

        const body = document.createElement('div')
        container.replaceChildren(header, body)

        this.reactRoot = createRoot(body)
        this.reactRoot.render(
          createElement(ViewMode, {
            content,
            vaultId: this.vaultId,
            directoryTree: this.directoryTree,
            token: this.token,
          })
        )
      })
      .catch(() => {
        container.classList.add('cm-lp-embed-note--missing')
        container.textContent = `Notiz nicht gefunden: ${this.filename}`
      })

    return container
  }

  /**
   * Builds the JSON (non-raw) file-content URL used to fetch note text.
   * No `?token=` here — see the Authorization-header comment above.
   */
  private buildFileContentSrc(path: string): string {
    return `/api/v1/vaults/${this.vaultId}/files?path=${encodeURIComponent(path)}`
  }

  /**
   * Delegates rendering to a plugin's registered embed creator (found by
   * buildNoteDOM above) instead of the built-in note pipeline. Mirrors real
   * Obsidian's embed contract: the creator gets a containerEl to render
   * into and a subpath (the `#heading`/`#^block` fragment, if any); the
   * returned component is tracked so destroy() can unload() it.
   */
  private buildPluginEmbedDOM(creator: NonNullable<ReturnType<typeof findEmbedCreatorForTarget>>, resolvedPath: string): HTMLElement {
    const container = document.createElement('div')
    container.className = 'cm-lp-embed-plugin'

    const context: EmbedContext = {
      app: (window as unknown as { app?: unknown }).app,
      containerEl: container,
      linktext: this.filename,
      sourcePath: '',
      showInline: true,
      displayMode: false,
    }
    // `this.heading` already holds the raw text after `#` — a block ref's
    // (`^block-id`) as much as a heading's, since Live Preview's parser
    // (unlike Reading mode's) doesn't split the two apart. Re-adding the `#`
    // here reconstructs Obsidian's subpath convention for both.
    const subpath = this.heading ? `#${this.heading}` : undefined
    this.pluginEmbed = mountRegisteredEmbed(creator, context, resolvedPath, subpath)
    return container
  }

  destroy(_dom: HTMLElement): void {
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl)
      this.objectUrl = null
    }
    if (this.reactRoot) {
      this.reactRoot.unmount()
      this.reactRoot = null
    }
    if (this.pluginEmbed) {
      this.pluginEmbed.unload?.()
      this.pluginEmbed = null
    }
  }

  eq(other: EmbedWidget): boolean {
    return this.filename === other.filename &&
      this.vaultId === other.vaultId &&
      this.token === other.token &&
      this.kind === other.kind &&
      this.display === other.display &&
      this.heading === other.heading &&
      this.directoryTree === other.directoryTree
  }

  get estimatedHeight(): number {
    if (this.kind === 'image') return 200
    if (this.kind === 'pdf') return parseEmbedPdfHeight(this.display)
    return 100
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
 * Parses pipe-separated rows and renders with header/body distinction and
 * alignment. Cells are click-to-edit: a static cell swaps to a
 * contentEditable island showing its raw Markdown on click, and commits
 * back to the document (via `view.dispatch`) on blur/Enter/Tab — mirroring
 * how inline marks elsewhere in Live Preview reveal raw syntax only while
 * being edited, applied here at cell granularity instead of the whole node.
 */
class TableWidget extends WidgetType {
  private readonly rows: TableCellSpan[][]
  private readonly alignments: Array<'left' | 'center' | 'right' | null>

  constructor(rows: TableCellSpan[][], alignments: Array<'left' | 'center' | 'right' | null>) {
    super()
    this.rows = rows
    this.alignments = alignments
  }

  toDOM(view: EditorView): HTMLElement {
    const table = document.createElement('table')
    table.className = 'cm-lp-table'

    const buildCell = (tag: 'th' | 'td', cell: TableCellSpan, align: 'left' | 'center' | 'right' | null) => {
      const el = document.createElement(tag)
      renderCellInline(el, cell.text)
      if (align) el.style.textAlign = align
      el.tabIndex = 0
      wireCellEditing(el, cell, view)
      return el
    }

    // Header row
    if (this.rows.length > 0) {
      const thead = document.createElement('thead')
      const headerRow = document.createElement('tr')
      const headerCells = this.rows[0]!
      for (let i = 0; i < headerCells.length; i++) {
        headerRow.appendChild(buildCell('th', headerCells[i]!, this.alignments[i] ?? null))
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
          tr.appendChild(buildCell('td', cells[i]!, this.alignments[i] ?? null))
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
        if (a[j]!.text !== b[j]!.text) return false
      }
    }
    return true
  }

  get estimatedHeight(): number {
    return 30 + this.rows.length * 28
  }
}

/**
 * Replaces any unescaped `|` in user-typed cell text with `\|` (the same
 * escape convention `parseTableRow` already understands for aliased
 * wikilinks) so a literal pipe typed while editing can't split the cell
 * into extra columns. Also collapses `\r`/`\n` (e.g. from a multi-line
 * paste) to spaces, since a GFM table row is always exactly one source line.
 */
function escapeTableCellText(text: string): string {
  return text
    .replace(/[\r\n]+/g, ' ')
    .replace(/\\?\|/g, match => (match === '|' ? '\\|' : match))
}

/**
 * Wires click-to-edit behavior onto a single rendered `<th>`/`<td>`.
 * Clicking a wikilink/link inside the cell is left alone — the global
 * mousedown-capture handler (`createLivePreviewClickHandler`) navigates it,
 * matching link behavior everywhere else in Live Preview.
 */
function wireCellEditing(el: HTMLElement, cell: TableCellSpan, view: EditorView): void {
  let originalHTML = el.innerHTML

  const renderStatic = (text: string) => {
    el.innerHTML = ''
    renderCellInline(el, text)
    originalHTML = el.innerHTML
  }

  const commit = (): boolean => {
    const raw = el.textContent ?? ''
    const newText = escapeTableCellText(raw.trim())
    el.contentEditable = 'false'
    if (newText !== cell.text) {
      view.dispatch({ changes: { from: cell.from, to: cell.to, insert: newText } })
      // The dispatch triggers a full decoration rebuild (fresh TableWidget),
      // but render eagerly too so there's no flicker back to raw text first.
      renderStatic(newText)
      return true
    }
    renderStatic(cell.text)
    return false
  }

  const cancel = () => {
    el.contentEditable = 'false'
    el.innerHTML = originalHTML
  }

  const startEditing = () => {
    if (el.contentEditable === 'true') return
    el.innerHTML = ''
    el.textContent = cell.text
    el.contentEditable = 'true'
    el.focus()
    const range = document.createRange()
    range.selectNodeContents(el)
    range.collapse(false)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
  }

  el.addEventListener('click', (event) => {
    const target = event.target as HTMLElement
    if (target.closest('.cm-lp-wikilink, .cm-lp-link')) return
    startEditing()
  })

  el.addEventListener('keydown', (event) => {
    if (el.contentEditable !== 'true') return
    event.stopPropagation()

    if (event.key === 'Escape') {
      event.preventDefault()
      cancel()
      el.blur()
    } else if (event.key === 'Enter') {
      event.preventDefault()
      commit()
      el.blur()
    } else if (event.key === 'Tab') {
      event.preventDefault()
      commit()
      const table = el.closest('table')
      const cells = table ? Array.from(table.querySelectorAll<HTMLElement>('th, td')) : []
      const index = cells.indexOf(el)
      const next = cells[index + (event.shiftKey ? -1 : 1)]
      next?.click()
    }
  })

  el.addEventListener('blur', () => {
    if (el.contentEditable === 'true') commit()
  })
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
 * Splits on `|`, but a backslash-escaped pipe (`\|`) — the convention for
 * keeping an aliased wikilink intact inside a table cell, since `|` is
 * also the column delimiter — is kept as literal cell text and does not
 * start a new column. Mirrors the escape handling in Lezer's own GFM
 * table row parser (`@lezer/markdown`'s `parseRow`).
 * A leading/trailing `|` (the optional outer table pipes) does not
 * produce an empty boundary column.
 */
/** A single table cell's raw (untrimmed) text plus its start/end offset within the source line. */
interface RawCellSpan {
  text: string
  /** Offset of `text[0]` within `line`, accounting for the line's leading trim. */
  start: number
  end: number
}

/**
 * Escape-aware pipe-splitter shared by `parseTableRow` and
 * `parseTableRowWithPositions`, so both stay in exact agreement on where
 * cell boundaries fall. See `parseTableRow`'s doc comment for the escape
 * and outer-pipe-stripping rules this implements.
 */
function splitTableRowSpans(line: string): RawCellSpan[] {
  const leadingTrim = line.length - line.trimStart().length
  const trimmedLine = line.trim()
  const spans: RawCellSpan[] = []
  let cell = ''
  let cellStart = leadingTrim
  let escaped = false

  for (let i = 0; i < trimmedLine.length; i++) {
    const ch = trimmedLine[i]!
    if (ch === '|' && !escaped) {
      spans.push({ text: cell, start: cellStart, end: cellStart + cell.length })
      cell = ''
      cellStart = leadingTrim + i + 1
    } else {
      cell += ch
    }
    escaped = !escaped && ch === '\\'
  }
  spans.push({ text: cell, start: cellStart, end: cellStart + cell.length })

  if (spans.length > 0 && spans[0]!.text === '') spans.shift()
  if (spans.length > 0 && spans[spans.length - 1]!.text === '') spans.pop()

  return spans
}

export function parseTableRow(line: string): string[] {
  return splitTableRowSpans(line).map(span => span.text)
}

/** A table cell resolved to its trimmed content and absolute document offsets. */
export interface TableCellSpan {
  /** Trimmed cell text (what a user would type/see when editing). */
  text: string
  /** Absolute document offset of the first trimmed character. */
  from: number
  /** Absolute document offset just past the last trimmed character. */
  to: number
}

/**
 * Like `parseTableRow`, but resolves each cell to its trimmed content's
 * absolute document offsets (`lineFrom` + the cell's position within
 * `line`). Used to let Live Preview commit direct edits to a single table
 * cell without touching the surrounding pipe padding or other cells.
 */
export function parseTableRowWithPositions(line: string, lineFrom: number): TableCellSpan[] {
  return splitTableRowSpans(line).map(span => {
    const leadingWs = span.text.length - span.text.trimStart().length
    const trimmed = span.text.trim()
    const from = lineFrom + span.start + leadingWs
    return { text: trimmed, from, to: from + trimmed.length }
  })
}

/**
 * Renders cell text into a container element, turning `[[wikilink]]` /
 * `[[target|alias]]` spans (including the `\|` escaped-pipe alias
 * convention, see `resolveWikilinkMatchTarget`) into clickable wikilink
 * spans. Inline code spans (`` `text` ``) are rendered literally as
 * `<code>` — their content is never scanned for wikilinks, matching how
 * code spans suppress inline syntax everywhere else. Everything else is
 * inserted as plain text. Cell content is never covered by the
 * block-level Lezer syntax tree used elsewhere in this file (the whole
 * table is one replaced widget), so both code spans and wikilinks here
 * are found by regex, same as `link-decorations.ts` does outside the tree.
 */
export function renderCellInline(container: HTMLElement, text: string): void {
  const codeSpanRegex = /`([^`]+)`/g
  let lastIndex = 0
  let codeMatch: RegExpExecArray | null

  while ((codeMatch = codeSpanRegex.exec(text)) !== null) {
    if (codeMatch.index > lastIndex) {
      renderWikilinkSegment(container, text.slice(lastIndex, codeMatch.index))
    }

    const code = document.createElement('code')
    code.className = 'cm-lp-inline-code'
    code.textContent = codeMatch[1] ?? ''
    container.appendChild(code)

    lastIndex = codeMatch.index + codeMatch[0].length
  }

  if (lastIndex < text.length) {
    renderWikilinkSegment(container, text.slice(lastIndex))
  }
}

/**
 * Renders a cell text segment known to contain no inline code spans,
 * turning `[[wikilink]]` spans into clickable spans and leaving
 * everything else as plain text. Extracted from `renderCellInline` so
 * code spans can be carved out first.
 */
function renderWikilinkSegment(container: HTMLElement, text: string): void {
  const wikilinkRegex = createWikilinkRegex()
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = wikilinkRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      container.appendChild(document.createTextNode(text.slice(lastIndex, match.index)))
    }

    const rawTarget = match[1] ?? ''
    const alias = match[2]
    const target = resolveWikilinkMatchTarget(rawTarget, alias !== undefined)

    const link = document.createElement('span')
    link.className = 'cm-lp-wikilink'
    link.setAttribute('data-target', target)
    link.textContent = alias ?? target
    container.appendChild(link)

    lastIndex = match.index + match[0].length
  }

  if (lastIndex < text.length) {
    container.appendChild(document.createTextNode(text.slice(lastIndex)))
  }
}

/**
 * Widget for rendering plugin-registered code block processors in Live Preview.
 *
 * When a FencedCode block's language has a registered CodeBlockProcessor
 * (e.g. `dataview`, `dataviewjs`, `kanban`, `tasks`), this widget replaces
 * the raw code block with the plugin's rendered output.
 *
 * The handler is called asynchronously. Errors are caught and displayed inline.
 */
class CodeBlockProcessorWidget extends WidgetType {
  private readonly language: string
  private readonly source: string
  private readonly sourcePath: string

  constructor(language: string, source: string, sourcePath: string) {
    super()
    this.language = language
    this.source = source
    this.sourcePath = sourcePath
  }

  toDOM(): HTMLElement {
    const container = document.createElement('div')
    container.className = `cm-lp-code-block-processed block-language-${this.language}`
    container.dataset.language = this.language

    // Call the registered handler
    this.renderBlock(container)

    return container
  }

  private renderBlock(container: HTMLElement): void {
    const handler = getCodeBlockHandler(this.language)
    if (!handler) {
      container.textContent = `No handler for language: ${this.language}`
      return
    }

    // Build context
    const renderChild = new MarkdownRenderChild(container)
    const ctx: MarkdownPostProcessorContext = {
      docId: `lp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      sourcePath: this.sourcePath,
      frontmatter: null,
      addChild(child: MarkdownRenderChild): void {
        // Track child for cleanup — widget destroy handles lifecycle
        void child
      },
      getSectionInfo(): null {
        return null
      },
    }

    try {
      const result = handler(this.source, container, ctx)
      if (result instanceof Promise) {
        result.catch((err) => {
          errorOnce(`CodeBlockProcessorWidget.handlerError::${this.language}`, `[CodeBlockProcessorWidget] Handler error for "${this.language}":`, err)
          container.textContent = `Error rendering ${this.language}: ${err instanceof Error ? err.message : String(err)}`
        })
      }
    } catch (err) {
      errorOnce(`CodeBlockProcessorWidget.handlerError::${this.language}`, `[CodeBlockProcessorWidget] Handler error for "${this.language}":`, err)
      container.textContent = `Error rendering ${this.language}: ${err instanceof Error ? err.message : String(err)}`
    }

    // Store render child for potential cleanup
    ;(container as unknown as { __renderChild?: MarkdownRenderChild }).__renderChild = renderChild
  }

  eq(other: CodeBlockProcessorWidget): boolean {
    return this.language === other.language && this.source === other.source
  }

  get estimatedHeight(): number {
    return 100
  }

  destroy(_dom: HTMLElement): void {
    const renderChild = (_dom as unknown as { __renderChild?: MarkdownRenderChild }).__renderChild
    if (renderChild) {
      renderChild.unload()
    }
  }
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
// Math Widget Classes
// ---------------------------------------------------------------------------

/**
 * Widget for inline math ($...$) in Live Preview.
 * Renders the LaTeX source via KaTeX asynchronously.
 */
class InlineMathWidget extends WidgetType {
  readonly source: string
  constructor(source: string) {
    super()
    this.source = source
  }

  toDOM(): HTMLElement {
    const span = document.createElement('span')
    span.className = 'cm-lp-math-inline'
    span.textContent = `$${this.source}$`

    import('../../components/katex-loader').then(({ loadKaTeX, renderMathToString }) => {
      loadKaTeX().then((katex) => {
        if (!katex) {
          span.classList.add('cm-lp-math-load-failed')
          return
        }
        try {
          span.innerHTML = renderMathToString(katex, this.source, false)
          span.classList.remove('cm-lp-math-inline')
          span.classList.add('cm-lp-math-inline', 'cm-lp-math-rendered')
        } catch {
          span.classList.add('cm-lp-math-error')
        }
      })
    })

    return span
  }

  eq(other: InlineMathWidget): boolean {
    return this.source === other.source
  }
}

/**
 * Widget for block math ($$...$$) in Live Preview.
 * Renders the LaTeX source via KaTeX asynchronously in display mode.
 */
class BlockMathWidget extends WidgetType {
  readonly source: string
  constructor(source: string) {
    super()
    this.source = source
  }

  toDOM(): HTMLElement {
    const container = document.createElement('div')
    container.className = 'cm-lp-math-block'
    container.textContent = `$$${this.source}$$`

    import('../../components/katex-loader').then(({ loadKaTeX, renderMathToString }) => {
      loadKaTeX().then((katex) => {
        if (!katex) {
          container.classList.add('cm-lp-math-load-failed')
          return
        }
        try {
          container.innerHTML = renderMathToString(katex, this.source, true)
          container.classList.add('cm-lp-math-rendered')
        } catch {
          container.classList.add('cm-lp-math-error')
        }
      })
    })

    return container
  }

  eq(other: BlockMathWidget): boolean {
    return this.source === other.source
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
 * Regex to detect inline math: $...$
 * Boundary rules:
 * - Not preceded by backslash (escaped)
 * - Opening $ not followed by whitespace
 * - Closing $ not preceded by whitespace
 * - Closing $ not followed by a digit
 * - No newlines within
 */
const INLINE_MATH_REGEX = /(?<![\\$])\$([^\s$](?:[^\n$\\]|\\.)*?[^\s$\\]|[^\s$\\])\$(?!\d)/g

/**
 * Regex to detect block math: $$...$$ (multiline or single-line).
 * Matches $$ at the start, content (possibly spanning multiple lines), then $$.
 */
const BLOCK_MATH_REGEX = /^\$\$([\s\S]*?)\$\$\s*$/gm

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

  // --- Block Math: $$...$$ ---
  // Scan full document for block math before the tree iterate
  {
    const fullText = doc.sliceString(0, doc.length)
    BLOCK_MATH_REGEX.lastIndex = 0
    let blockMathMatch: RegExpExecArray | null
    while ((blockMathMatch = BLOCK_MATH_REGEX.exec(fullText)) !== null) {
      const matchFrom = blockMathMatch.index
      const matchTo = matchFrom + blockMathMatch[0].length
      const key = `blockmath:${matchFrom}:${matchTo}`
      if (processedBlocks.has(key)) continue
      processedBlocks.add(key)

      // Skip if inside a fenced code block
      let insideCode = false
      tree.iterate({
        from: matchFrom, to: matchTo,
        enter(n) {
          if (n.name === 'FencedCode' || n.name === 'CodeBlock') {
            insideCode = true
            return false
          }
        }
      })
      if (insideCode) continue

      const source = (blockMathMatch[1] ?? '').replace(/^\n+|\n+$/g, '')
      if (!source) continue

      const widget = new BlockMathWidget(source)
      decorations.push(
        Decoration.replace({ widget }).range(matchFrom, matchTo)
      )
      hideableRanges.push({ from: matchFrom, to: matchTo, groupFrom: matchFrom, groupTo: matchTo })
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
            const raw = match[1]!
            const filename = parseEmbedTarget(raw)
            const display = parseEmbedDisplay(raw)
            const heading = parseEmbedHeading(raw)
            const matchFrom = node.from + match.index
            const matchTo = matchFrom + match[0].length
            const key = `embed:${matchFrom}:${matchTo}`

            if (processedBlocks.has(key)) continue
            processedBlocks.add(key)

            // Skip embed syntax written as a code example (e.g. `` `![[file.pdf|600]]` ``
            // inside a tip callout) — matches the same guard link-decorations.ts uses
            // for wikilinks. Without it, docs demonstrating the syntax would try to
            // fetch and render a file that's just example text, not a real target.
            let insideCode = false
            tree.iterate({
              from: matchFrom, to: matchTo,
              enter(n) {
                if (n.name === 'FencedCode' || n.name === 'InlineCode' || n.name === 'CodeBlock') {
                  insideCode = true
                  return false
                }
              }
            })
            if (insideCode) continue

            const ext = getFileExtension(filename)
            const kind: EmbedKind =
              IMAGE_EXTENSIONS.has(ext) ? 'image' :
              PDF_EXTENSIONS.has(ext) ? 'pdf' :
              AUDIO_EXTENSIONS.has(ext) ? 'audio' :
              VIDEO_EXTENSIONS.has(ext) ? 'video' :
              'note'

            const widget = new EmbedWidget(
              filename,
              options.vaultId,
              options.token,
              kind,
              display,
              heading,
              options.directoryTree ?? null
            )

            // Replace the ![[...]] syntax with the widget
            decorations.push(
              Decoration.replace({ widget }).range(matchFrom, matchTo)
            )
            hideableRanges.push({ from: matchFrom, to: matchTo, groupFrom: matchFrom, groupTo: matchTo })
          }

          // --- Inline Math: $...$ ---
          INLINE_MATH_REGEX.lastIndex = 0
          let mathMatch: RegExpExecArray | null
          while ((mathMatch = INLINE_MATH_REGEX.exec(text)) !== null) {
            const mathSource = mathMatch[1]!
            const mathFrom = node.from + mathMatch.index
            const mathTo = mathFrom + mathMatch[0].length
            const mathKey = `inlinemath:${mathFrom}:${mathTo}`

            if (processedBlocks.has(mathKey)) continue
            processedBlocks.add(mathKey)

            // Skip if inside a code span or fenced code block
            let insideMathCode = false
            tree.iterate({
              from: mathFrom, to: mathTo,
              enter(n) {
                if (n.name === 'FencedCode' || n.name === 'InlineCode' || n.name === 'CodeBlock') {
                  insideMathCode = true
                  return false
                }
              }
            })
            if (insideMathCode) continue

            const mathWidget = new InlineMathWidget(mathSource)
            decorations.push(
              Decoration.replace({ widget: mathWidget }).range(mathFrom, mathTo)
            )
            hideableRanges.push({ from: mathFrom, to: mathTo, groupFrom: mathFrom, groupTo: mathTo })
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

        // Plugin-registered code block processors (dataview, kanban, tasks, etc.)
        if (hasCodeBlockProcessor(language)) {
          const openLine = fenceOpenFrom !== -1 ? doc.lineAt(fenceOpenFrom) : null
          const closeLine = fenceCloseFrom !== -1 ? doc.lineAt(fenceCloseFrom) : null
          const codeStart = openLine ? openLine.to + 1 : node.from
          const codeEnd = closeLine ? closeLine.from : node.to
          const source = codeEnd > codeStart ? doc.sliceString(codeStart, codeEnd) : ''

          const widget = new CodeBlockProcessorWidget(language, source, options.sourcePath ?? '')
          decorations.push(
            Decoration.replace({ widget }).range(node.from, node.to)
          )
          hideableRanges.push({ from: node.from, to: node.to, groupFrom: node.from, groupTo: node.to })
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

        // Walk the table's actual source lines so each cell can carry its
        // absolute document offsets (needed to commit direct cell edits).
        const startLine = doc.lineAt(node.from)
        const endLine = doc.lineAt(node.to)
        const rows: TableCellSpan[][] = []
        for (let lineNum = startLine.number; lineNum <= endLine.number; lineNum++) {
          const line = doc.line(lineNum)
          if (line.text.trim().length === 0) continue
          rows.push(parseTableRowWithPositions(line.text, line.from))
        }

        if (rows.length >= 2) {
          // Row index 1 is the delimiter row (---|:---:|---:)
          const alignments = parseTableAlignments(rows[1]!.map(c => c.text))

          const widget = new TableWidget(rows, alignments)
          decorations.push(
            Decoration.replace({ widget }).range(node.from, node.to)
          )
        }
      }

      // --- HTML block: <center>...</center> ---
      // Lezer parses this as one opaque HTMLBlock node (unlike inline tags like
      // <font>, which come through as separate HTMLTag open/close nodes handled
      // in inline-decorations.ts). Centering is applied as a per-line CSS class
      // (mirroring the Blockquote branch above) and the tag lines are hidden,
      // revealed together via hideableRanges when the cursor is inside.
      if (node.name === 'HTMLBlock') {
        const key = `htmlblock:${node.from}:${node.to}`
        if (processedBlocks.has(key)) return
        processedBlocks.add(key)

        const text = doc.sliceString(node.from, node.to)
        const centerMatch = /^(<center(?:\s[^<>]*)?>)[\s\S]*(<\/center\s*>)\s*$/i.exec(text)

        if (centerMatch) {
          const openTag = centerMatch[1]!
          const closeTag = centerMatch[2]!
          const openFrom = node.from
          const openTo = openFrom + openTag.length
          const closeFrom = node.from + text.lastIndexOf(closeTag)
          const closeTo = closeFrom + closeTag.length

          const startLine = doc.lineAt(node.from)
          const endLine = doc.lineAt(node.to)
          for (let lineNum = startLine.number; lineNum <= endLine.number; lineNum++) {
            decorations.push(
              Decoration.line({ attributes: { class: 'cm-lp-html-center' } }).range(doc.line(lineNum).from)
            )
          }

          hideableRanges.push({ from: openFrom, to: openTo, groupFrom: node.from, groupTo: node.to })
          decorations.push(Decoration.replace({}).range(openFrom, openTo))

          hideableRanges.push({ from: closeFrom, to: closeTo, groupFrom: node.from, groupTo: node.to })
          decorations.push(Decoration.replace({}).range(closeFrom, closeTo))
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
 * Strips the `#heading` and `|display` (e.g. size) suffixes from a raw
 * `![[target#heading|display]]` capture, leaving just the file path.
 * Without this, a sized embed like `![[photo.png|400]]` resolves its
 * extension as `.png|400` — matching no known type — and its API path
 * as `photo.png|400`, which 404s.
 */
function parseEmbedTarget(raw: string): string {
  const hashIndex = raw.indexOf('#')
  const pipeIndex = raw.indexOf('|')
  const candidates = [hashIndex, pipeIndex].filter((i) => i !== -1)
  const end = candidates.length > 0 ? Math.min(...candidates) : raw.length
  return raw.slice(0, end)
}

/**
 * Extracts the `|display` (size/alt) text from a raw `![[target#heading|display]]`
 * capture, or null if no `|` is present.
 */
function parseEmbedDisplay(raw: string): string | null {
  const pipeIndex = raw.indexOf('|')
  if (pipeIndex === -1) return null
  return raw.slice(pipeIndex + 1)
}

/**
 * Extracts the `#heading` text from a raw `![[target#heading|display]]`
 * capture, or null if no `#` is present. Block refs (`#^id`) are left as-is
 * (a heading named e.g. "^id" simply won't match, degrading to full content)
 * — block-ref embeds aren't supported in Live Preview note embeds.
 */
function parseEmbedHeading(raw: string): string | null {
  const hashIndex = raw.indexOf('#')
  if (hashIndex === -1) return null
  const pipeIndex = raw.indexOf('|')
  const end = pipeIndex === -1 ? raw.length : pipeIndex
  if (end <= hashIndex + 1) return null
  return raw.slice(hashIndex + 1, end)
}

/**
 * Extracts the content under a specific heading from Markdown text — all
 * lines from the heading until the next heading of equal or higher level.
 * Mirrors ViewMode.tsx's extractHeadingSection (duplicated rather than
 * imported: this module operates on raw embed targets pre-fetch, outside
 * ViewMode's React tree, so keeping it local avoids a cross-layer coupling
 * for a ~20-line pure function). Returns the full content if not found.
 */
function extractHeadingSection(content: string, heading: string): string {
  const lines = content.split('\n')
  const headingLower = heading.toLowerCase().trim()

  let startIndex = -1
  let startLevel = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    const match = line.match(/^(#{1,6})\s+(.+)$/)
    if (match) {
      const level = match[1]!.length
      const text = match[2]!.trim().toLowerCase()
      if (text === headingLower) {
        startIndex = i
        startLevel = level
        break
      }
    }
  }

  if (startIndex === -1) return content

  let endIndex = lines.length
  for (let i = startIndex + 1; i < lines.length; i++) {
    const line = lines[i]!
    const match = line.match(/^(#{1,6})\s+/)
    if (match && match[1]!.length <= startLevel) {
      endIndex = i
      break
    }
  }

  return lines.slice(startIndex, endIndex).join('\n')
}

/**
 * Parses a PDF embed's `|display` text into a viewer height in pixels
 * (mirroring ViewMode.tsx's parseEmbedPdfHeight). PDF embeds only support
 * a plain number, e.g. `![[doc.pdf|600]]`, which bounds the viewer height
 * — unlike image embeds, where a bare number is a width. Falls back to
 * DEFAULT_PDF_HEIGHT_PX for missing/non-numeric display text.
 */
function parseEmbedPdfHeight(display: string | null): number {
  if (!display) return DEFAULT_PDF_HEIGHT_PX
  const widthMatch = display.trim().match(/^(\d+)$/)
  return widthMatch ? Number(widthMatch[1]) : DEFAULT_PDF_HEIGHT_PX
}

/**
 * Applies a width/height style to an embed `<img>` from its `|display` text,
 * mirroring the size formats supported in Viewer mode (ViewMode.tsx's
 * parseEmbedImageStyle): `300` (width px), `300x200` (widthxheight px),
 * `x200` (height px), `100%` (percent width). Non-numeric display text is
 * alt text, not a size, so it's left alone.
 */
function applyEmbedImageSize(img: HTMLImageElement, display: string | null): void {
  if (!display) return
  const trimmed = display.trim()

  const dimensionMatch = trimmed.match(/^(\d+)\s*x\s*(\d+)$/)
  if (dimensionMatch) {
    img.style.width = `${dimensionMatch[1]!}px`
    img.style.height = `${dimensionMatch[2]!}px`
    return
  }

  const heightOnlyMatch = trimmed.match(/^x\s*(\d+)$/)
  if (heightOnlyMatch) {
    img.style.height = `${heightOnlyMatch[1]!}px`
    img.style.width = 'auto'
    return
  }

  const percentMatch = trimmed.match(/^(\d+)%$/)
  if (percentMatch) {
    img.style.width = `${percentMatch[1]!}%`
    img.style.height = 'auto'
    return
  }

  const widthMatch = trimmed.match(/^(\d+)$/)
  if (widthMatch) {
    img.style.width = `${widthMatch[1]!}px`
    img.style.height = 'auto'
  }
}

/**
 * Applies width/height style to a media element (video) from its `|display` text.
 * Same logic as applyEmbedImageSize but accepts any HTMLElement.
 */
function applyEmbedMediaSize(el: HTMLElement, display: string | null): void {
  if (!display) return
  const trimmed = display.trim()

  const dimensionMatch = trimmed.match(/^(\d+)\s*x\s*(\d+)$/)
  if (dimensionMatch) {
    el.style.width = `${dimensionMatch[1]!}px`
    el.style.height = `${dimensionMatch[2]!}px`
    return
  }

  const percentMatch = trimmed.match(/^(\d+)%$/)
  if (percentMatch) {
    el.style.width = `${percentMatch[1]!}%`
    el.style.height = 'auto'
    return
  }

  const widthMatch = trimmed.match(/^(\d+)$/)
  if (widthMatch) {
    el.style.width = `${widthMatch[1]!}px`
    el.style.height = 'auto'
  }
}

/**
 * Extracts the file extension from a filename (lowercase, with dot).
 * Returns empty string if no extension found.
 */
function getFileExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.')
  if (lastDot === -1 || lastDot === filename.length - 1) return ''
  return filename.slice(lastDot).toLowerCase()
}
