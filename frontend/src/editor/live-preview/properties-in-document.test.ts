import { describe, it, expect, afterEach } from 'vitest'
import { EditorView } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
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
})
