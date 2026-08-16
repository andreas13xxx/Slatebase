import { describe, it, expect, afterEach, vi } from 'vitest'
import { EditorView } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { markdown } from '@codemirror/lang-markdown'
import { GFM } from '@lezer/markdown'
import { createLivePreviewField, createLivePreviewClickHandler } from './live-preview-extension'
import type { LivePreviewOptions } from './live-preview-extension'

/**
 * End-to-end check (real EditorView + real DOM events, no app/auth needed)
 * that clicking a rendered table cell in Live Preview makes it editable and
 * commits the edit back into the document — the behavior that was missing
 * before (clicking a cell did nothing; only switching to raw Markdown
 * source allowed editing a table at all).
 */
function mount(doc: string, options: Partial<LivePreviewOptions> = {}) {
  const fullOptions: LivePreviewOptions = { vaultId: 'v1', directoryTree: null, ...options }
  const parent = document.createElement('div')
  document.body.appendChild(parent)
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      extensions: [
        markdown({ extensions: GFM }),
        createLivePreviewField(fullOptions),
        createLivePreviewClickHandler(fullOptions),
      ],
    }),
  })
  return { view, parent }
}

describe('Live Preview table cell editing', () => {
  let cleanup: (() => void) | undefined

  afterEach(() => {
    cleanup?.()
    cleanup = undefined
  })

  const TABLE_DOC =
    '| Guide | Beschreibung |\n' +
    '| --- | --- |\n' +
    '| [[Features/Wikilinks]] | Notizen |\n'

  it('renders the table as a static <table>, not raw text, before any interaction', () => {
    const { view, parent } = mount(TABLE_DOC)
    cleanup = () => { view.destroy(); parent.remove() }

    expect(view.dom.querySelector('table.cm-lp-table')).not.toBeNull()
    expect(view.dom.textContent).not.toContain('---')
  })

  it('clicking a data cell makes it contentEditable and shows raw cell text', () => {
    const { view, parent } = mount(TABLE_DOC)
    cleanup = () => { view.destroy(); parent.remove() }

    const cell = view.dom.querySelectorAll('tbody td')[1] as HTMLElement
    expect(cell.textContent).toBe('Notizen')
    expect(cell.contentEditable).not.toBe('true')

    cell.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(cell.contentEditable).toBe('true')
    expect(cell.textContent).toBe('Notizen')
  })

  it('commits an edit on blur into the document, leaving the rest of the table intact', () => {
    const { view, parent } = mount(TABLE_DOC)
    cleanup = () => { view.destroy(); parent.remove() }

    const cell = view.dom.querySelectorAll('tbody td')[1] as HTMLElement
    cell.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    cell.textContent = 'Geänderte Notizen'
    cell.dispatchEvent(new FocusEvent('blur'))

    const text = view.state.doc.toString()
    expect(text).toContain('Geänderte Notizen')
    // Header row and the other cell in the same row are untouched.
    expect(view.state.doc.line(1).text).toBe('| Guide | Beschreibung |')
    expect(view.state.doc.line(3).text).toBe('| [[Features/Wikilinks]] | Geänderte Notizen |')
  })

  it('auto-escapes a literal pipe typed into a cell so the table structure is not corrupted', () => {
    const { view, parent } = mount(TABLE_DOC)
    cleanup = () => { view.destroy(); parent.remove() }

    const cell = view.dom.querySelectorAll('tbody td')[1] as HTMLElement
    cell.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    cell.textContent = 'a | b'
    cell.dispatchEvent(new FocusEvent('blur'))

    expect(view.state.doc.line(3).text).toBe('| [[Features/Wikilinks]] | a \\| b |')
  })

  it('Escape cancels an edit without touching the document', () => {
    const { view, parent } = mount(TABLE_DOC)
    cleanup = () => { view.destroy(); parent.remove() }

    const cell = view.dom.querySelectorAll('tbody td')[1] as HTMLElement
    cell.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    cell.textContent = 'discarded'
    cell.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))

    expect(cell.contentEditable).toBe('false')
    expect(view.state.doc.toString()).toBe(TABLE_DOC)
  })

  it('clicking a wikilink inside a cell navigates instead of entering edit mode', () => {
    const onInternalLinkClick = vi.fn()
    const { view, parent } = mount(TABLE_DOC, { onInternalLinkClick })
    cleanup = () => { view.destroy(); parent.remove() }

    const wikilink = view.dom.querySelector('tbody td .cm-lp-wikilink') as HTMLElement
    expect(wikilink).not.toBeNull()
    const cell = wikilink.closest('td') as HTMLElement

    // Mirrors the real browser sequence: capture-phase mousedown navigates
    // and stops propagation; a click event still separately fires after.
    wikilink.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }))
    wikilink.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(onInternalLinkClick).toHaveBeenCalledWith('Features/Wikilinks.md')
    expect(cell.contentEditable).not.toBe('true')
  })
})
