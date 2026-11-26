import { describe, it, expect, vi } from 'vitest'
import { createMetadataEditorShim } from './metadata-editor-shim'
import { registerRenderedProperty } from './metadata-editor-bridge'

const host = (data: string) => ({
  file: { path: 'n.md' },
  data,
  getViewData() { return this.data },
  setViewData(next: string) { this.data = next },
})

describe('metadataEditor shim', () => {
  it('serializes nested frontmatter as a copy', () => {
    const editor = createMetadataEditorShim(host('---\nmeta:\n  a:\n    - 1\n    - b\n---\nbody'))
    const data = editor.serialize()
    expect(data).toEqual({ meta: { a: [1, 'b'] } })
    expect(editor.serialize()).not.toBe(data)
  })

  it('lists the rows registered for its note only', () => {
    const el = document.createElement('div')
    const render = vi.fn()
    const unregister = registerRenderedProperty({ containerEl: el, entry: { key: 'k', value: 1 }, sourcePath: 'n.md', renderProperty: render })
    const other = registerRenderedProperty({ containerEl: document.createElement('div'), entry: { key: 'o', value: 1 }, sourcePath: 'x.md', renderProperty: render })
    const editor = createMetadataEditorShim(host(''))
    expect(editor.rendered.map((r) => r.entry.key)).toEqual(['k'])
    unregister()
    other()
    expect(editor.rendered).toEqual([])
  })

  it('falls back to the view text when no live editor shows the note', () => {
    const h = host('---\na: 1\n---\nbody')
    createMetadataEditorShim(h).synchronize({ a: 2, nested: { b: true } })
    expect(h.data).toContain('a: 2')
    expect(h.data).toContain('nested:\n  b: true')
    expect(h.data.endsWith('body')).toBe(true)
  })
})
