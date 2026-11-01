import { describe, it, expect, afterEach } from 'vitest'
import { EditorView } from '@codemirror/view'
import { EditorState, Transaction } from '@codemirror/state'
import { markdown } from '@codemirror/lang-markdown'
import { GFM } from '@lezer/markdown'
import { createLivePreviewField } from './live-preview-extension'
import type { LivePreviewOptions } from './live-preview-extension'

/** app.json `propertiesInDocument` in the editor: properties block, nothing, or the raw YAML. */
const DOC = '---\ntitle: Hello\n---\nBody text\n'
let view: EditorView | null = null

function mount(propertiesInDocument?: LivePreviewOptions['propertiesInDocument']): EditorView {
  const options: LivePreviewOptions = { vaultId: 'v1', directoryTree: null, propertiesInDocument }
  const parent = document.createElement('div')
  document.body.appendChild(parent)
  view = new EditorView({
    parent,
    state: EditorState.create({ doc: DOC, extensions: [markdown({ extensions: GFM }), createLivePreviewField(options)] }),
  })
  return view
}

afterEach(() => {
  view?.destroy()
  view = null
  document.body.innerHTML = ''
})

describe('propertiesInDocument in the editor', () => {
  it('shows the properties block by default', () => {
    expect(mount().dom.querySelector('.cm-lp-frontmatter')).not.toBeNull()
  })

  it('shows the properties block for visible', () => {
    expect(mount('visible').dom.querySelector('.cm-lp-frontmatter')).not.toBeNull()
  })

  it('hides the frontmatter completely for hidden', () => {
    const v = mount('hidden')
    expect(v.dom.querySelector('.cm-lp-frontmatter')).toBeNull()
    expect(v.dom.textContent).not.toContain('title')
    expect(v.dom.textContent).toContain('Body text')
    // The document itself is untouched
    expect(v.state.doc.toString()).toBe(DOC)
  })

  it('leaves the raw YAML as text for source', () => {
    const v = mount('source')
    expect(v.dom.querySelector('.cm-lp-frontmatter')).toBeNull()
    expect(v.dom.textContent).toContain('title: Hello')
  })

  it('does not style the YAML lines as headings in source mode', () => {
    // The last property line followed by the closing --- parses as a setext heading
    const parent = document.createElement('div')
    document.body.appendChild(parent)
    view = new EditorView({
      parent,
      state: EditorState.create({
        doc: DOC.replace('title: Hello', '# comment\ntitle: Hello'),
        extensions: [markdown({ extensions: GFM }), createLivePreviewField({ vaultId: 'v1', directoryTree: null, propertiesInDocument: 'source' })],
      }),
    })

    expect(view.dom.querySelector('[class*="cm-lp-h"], .HyperMD-header')).toBeNull()
  })

  describe('hidden: the user cannot edit what cannot be seen', () => {
    it('drops typing at the start of the note and deleting into the block', () => {
      const v = mount('hidden')

      v.dispatch({ changes: { from: 0, insert: 'x' }, userEvent: 'input.type' })
      expect(v.state.doc.toString()).toBe(DOC)

      const end = DOC.indexOf('Body')
      v.dispatch({ changes: { from: end - 1, to: end }, userEvent: 'delete.backward' })
      expect(v.state.doc.toString()).toBe(DOC)
    })

    it('lets the user edit the text below the block', () => {
      const v = mount('hidden')
      const end = DOC.indexOf('Body')

      v.dispatch({ changes: { from: end, insert: 'new ' }, userEvent: 'input.type' })

      expect(v.state.doc.toString()).toBe('---\ntitle: Hello\n---\nnew Body text\n')
    })

    it('lets code change the block, such as a reload from disk or a command that adds a property', () => {
      const v = mount('hidden')

      v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: '---\ntitle: Other\n---\nBody text\n' } })

      expect(v.state.doc.toString()).toContain('title: Other')
    })

    it('lets the user replace the whole note, and undo what a command did to the block', () => {
      const v = mount('hidden')

      v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: 'fresh' }, userEvent: 'input.paste' })
      expect(v.state.doc.toString()).toBe('fresh')

      v.dispatch({ changes: { from: 0, to: 5, insert: DOC }, userEvent: 'undo' })
      expect(v.state.doc.toString()).toBe(DOC)
    })

    it('also guards a frontmatter longer than 2 KB', () => {
      view?.destroy()
      view = null
      document.body.innerHTML = ''
      const long = `---\n${'k: v\n'.repeat(1000)}---\nBody\n`
      const parent = document.createElement('div')
      document.body.appendChild(parent)
      view = new EditorView({
        parent,
        state: EditorState.create({ doc: long, extensions: [markdown({ extensions: GFM }), createLivePreviewField({ vaultId: 'v1', directoryTree: null, propertiesInDocument: 'hidden' })] }),
      })

      expect(view.dom.textContent).not.toContain('k: v')
      view.dispatch({ changes: { from: 0, insert: 'x' }, userEvent: 'input.type' })
      expect(view.state.doc.toString()).toBe(long)
    })

    it('does not guard the visible and source modes', () => {
      for (const mode of ['visible', 'source'] as const) {
        view?.destroy()
        view = null
        document.body.innerHTML = ''
        const v = mount(mode)
        v.dispatch({ changes: { from: 0, insert: 'x' }, userEvent: 'input.type', annotations: Transaction.addToHistory.of(true) })
        expect(v.state.doc.toString().startsWith('x')).toBe(true)
      }
    })
  })
})
