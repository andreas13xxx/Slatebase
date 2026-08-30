import { describe, it, expect, afterEach } from 'vitest'
import { EditorView } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { markdown } from '@codemirror/lang-markdown'
import { GFM } from '@lezer/markdown'
import { createLivePreviewField, createLivePreviewClickHandler } from './live-preview-extension'
import type { LivePreviewOptions } from './live-preview-extension'

/**
 * Live Preview renders a standalone image/embed/horizontal rule inside an
 * ordinary `cm-line`, tagged with `cm-lp-tight-block-line` so CSS can
 * collapse the `cm-widgetBuffer` spacers CodeMirror puts on each side of the
 * widget (they carry `height: 1em`, which showed up as a phantom gap above
 * and below the rendered element).
 *
 * The line staying an ordinary `cm-line` is the point: an earlier attempt
 * used `Decoration.replace({ block: true })` over the whole line, which
 * removed the line's gutter number and made it unreachable with the arrow
 * keys. These tests pin both halves — the tightening is applied, and the
 * line remains a normal, cursor-reachable text line whose raw Markdown
 * reappears when the cursor moves into it.
 */
function mount(doc: string) {
  const options: LivePreviewOptions = { vaultId: 'v1', directoryTree: null }
  const parent = document.createElement('div')
  document.body.appendChild(parent)
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      extensions: [
        markdown({ extensions: GFM }),
        createLivePreviewField(options),
        createLivePreviewClickHandler(options),
      ],
    }),
  })
  return { view, parent }
}

/** The `.cm-line` element rendering 1-based document line `n`. */
function lineEl(view: EditorView, n: number): HTMLElement {
  return view.dom.querySelectorAll<HTMLElement>('.cm-line')[n - 1]!
}

/** Moves the cursor to the start of 1-based document line `n`. */
function putCursorOnLine(view: EditorView, n: number): void {
  view.dispatch({ selection: { anchor: view.state.doc.line(n).from } })
}

describe('Live Preview standalone block spacing', () => {
  let cleanup: (() => void) | undefined

  afterEach(() => {
    cleanup?.()
    cleanup = undefined
  })

  // Image on line 3, horizontal rule on line 7.
  const DOC = 'Before\n\n![alt](img.png)\n\nBetween\n\n---\n\nAfter'

  it('keeps a standalone image on its own ordinary cm-line, tightened', () => {
    const { view, parent } = mount(DOC)
    cleanup = () => { view.destroy(); parent.remove() }

    // One cm-line per document line — nothing was swallowed by a block widget,
    // which is what kept gutter numbering and arrow-key navigation working.
    expect(view.dom.querySelectorAll('.cm-line')).toHaveLength(view.state.doc.lines)

    const line = lineEl(view, 3)
    expect(line.classList.contains('cm-lp-tight-block-line')).toBe(true)
    expect(line.querySelector('img.cm-lp-image')).not.toBeNull()
  })

  it('keeps a standalone horizontal rule on its own ordinary cm-line, tightened', () => {
    const { view, parent } = mount(DOC)
    cleanup = () => { view.destroy(); parent.remove() }

    const line = lineEl(view, 7)
    expect(line.classList.contains('cm-lp-tight-block-line')).toBe(true)
    expect(line.querySelector('hr.cm-lp-hr')).not.toBeNull()
  })

  it('reveals the image\'s raw Markdown and drops the tightening when the cursor moves onto its line', () => {
    const { view, parent } = mount(DOC)
    cleanup = () => { view.destroy(); parent.remove() }

    putCursorOnLine(view, 3)

    const line = lineEl(view, 3)
    expect(line.textContent).toBe('![alt](img.png)')
    expect(line.querySelector('img.cm-lp-image')).toBeNull()
    // Tightening must go too, or the raw text would render at zero height.
    expect(line.classList.contains('cm-lp-tight-block-line')).toBe(false)
  })

  it('reveals the horizontal rule\'s raw Markdown and drops the tightening when the cursor moves onto its line', () => {
    const { view, parent } = mount(DOC)
    cleanup = () => { view.destroy(); parent.remove() }

    putCursorOnLine(view, 7)

    const line = lineEl(view, 7)
    expect(line.textContent).toBe('---')
    expect(line.querySelector('hr.cm-lp-hr')).toBeNull()
    expect(line.classList.contains('cm-lp-tight-block-line')).toBe(false)
  })

  it('re-renders the widget once the cursor leaves the line again', () => {
    const { view, parent } = mount(DOC)
    cleanup = () => { view.destroy(); parent.remove() }

    putCursorOnLine(view, 3)
    expect(lineEl(view, 3).querySelector('img.cm-lp-image')).toBeNull()

    putCursorOnLine(view, 1)
    const line = lineEl(view, 3)
    expect(line.querySelector('img.cm-lp-image')).not.toBeNull()
    expect(line.classList.contains('cm-lp-tight-block-line')).toBe(true)
  })

  it('tightens a standalone ![[embed]] line', () => {
    const { view, parent } = mount('Before\n\n![[pic.png]]\n\nAfter')
    cleanup = () => { view.destroy(); parent.remove() }

    const line = lineEl(view, 3)
    expect(line.classList.contains('cm-lp-tight-block-line')).toBe(true)
    expect(line.querySelector('img.cm-lp-embed-img')).not.toBeNull()
  })

  it('tightens the frontmatter block, which spans several source lines', () => {
    // The frontmatter replace covers lines 1-3 plus the newline ending line 3,
    // which CodeMirror collapses into a single rendered line — so the
    // tightening has to handle a multi-line range, not just a single line.
    const { view, parent } = mount('---\ntags: basics\n---\n\nContent')
    cleanup = () => { view.destroy(); parent.remove() }

    const line = lineEl(view, 1)
    expect(line.classList.contains('cm-lp-tight-block-line')).toBe(true)
    expect(line.querySelector('.cm-lp-frontmatter')).not.toBeNull()
  })

  it('reveals the raw YAML and drops the tightening when the cursor enters the frontmatter', () => {
    const { view, parent } = mount('---\ntags: basics\n---\n\nContent')
    cleanup = () => { view.destroy(); parent.remove() }

    putCursorOnLine(view, 2)

    const line = lineEl(view, 1)
    expect(line.querySelector('.cm-lp-frontmatter')).toBeNull()
    expect(line.classList.contains('cm-lp-tight-block-line')).toBe(false)
    expect(view.dom.textContent).toContain('tags: basics')
  })

  it('does not tighten frontmatter when real text shares its collapsed line', () => {
    // No blank line after the closing `---`, so the following paragraph ends
    // up in the same rendered line and must keep its normal line height.
    const { view, parent } = mount('---\ntags: basics\n---\nContent right after')
    cleanup = () => { view.destroy(); parent.remove() }

    const line = lineEl(view, 1)
    expect(line.classList.contains('cm-lp-tight-block-line')).toBe(false)
    expect(line.textContent).toContain('Content right after')
  })

  it('does not tighten a line where the image shares space with other text', () => {
    // A block decoration can only span whole lines, and an inline image has
    // real text beside it that must keep its normal line height.
    const { view, parent } = mount('Before\n\nsee ![alt](img.png) here\n\nAfter')
    cleanup = () => { view.destroy(); parent.remove() }

    const line = lineEl(view, 3)
    expect(line.classList.contains('cm-lp-tight-block-line')).toBe(false)
    expect(line.querySelector('img.cm-lp-image')).not.toBeNull()
  })
})
