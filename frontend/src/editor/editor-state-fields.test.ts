/**
 * `livePreviewState` is the field widget-rendering plugins read to suppress
 * re-rendering mid-drag (`view.state.field(livePreviewState).mousedown`).
 * Two things have to hold for that to be usable: the flag goes up on mousedown,
 * and it comes back down even when the drag ends outside the editor — a stuck
 * `true` would freeze every widget on the page for the rest of the session.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { livePreviewState, livePreviewStateTracker, editorInfoField, setEditorInfo } from './editor-state-fields'
import { EditorShim, setEditorViewAccessor } from '../plugins/compat/editor-shim'

let view: EditorView | null = null

function mountView(): EditorView {
  view = new EditorView({
    state: EditorState.create({ doc: 'hello', extensions: [livePreviewStateTracker, editorInfoField] }),
    parent: document.body,
  })
  return view
}

afterEach(() => {
  view?.destroy()
  view = null
})

describe('livePreviewState', () => {
  it('starts with mousedown false', () => {
    expect(mountView().state.field(livePreviewState)).toEqual({ mousedown: false })
  })

  it('is true while the pointer is held down in the editor', () => {
    const v = mountView()
    v.contentDOM.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    expect(v.state.field(livePreviewState).mousedown).toBe(true)
  })

  it('clears when the drag ends outside the editor', () => {
    const v = mountView()
    v.contentDOM.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    expect(v.state.field(livePreviewState).mousedown).toBe(true)

    document.body.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
    expect(v.state.field(livePreviewState).mousedown).toBe(false)
  })

  it('stops listening once the view is destroyed', () => {
    const v = mountView()
    v.contentDOM.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    v.destroy()
    view = null

    // A destroyed view rejects dispatches; the listener must already be gone.
    expect(() => document.body.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))).not.toThrow()
  })

  it('is exported on the obsidian module namespace', async () => {
    const { installObsidianGlobals } = await import('../plugins/compat/install-globals')
    installObsidianGlobals()
    expect(window.obsidian?.livePreviewState).toBe(livePreviewState)
  })
})

describe('editorInfoField.editor', () => {
  // Regression: CodeMirrorEditor.tsx used to dispatch `setEditorInfo.of({ ...,
  // editor: EditorShim.create() })`. Real Obsidian's MarkdownFileInfo.editor is always a
  // live Editor for an open file, and plugins that read it via
  // `state.field(editorInfoField).editor` (rather than the separate
  // editorEditorField) rely on that without a null-check — obsidian-outliner's
  // Settings.ts does exactly `state.field(editorInfoField).editor.getCursor()`.
  // With editor left undefined, that threw "can't access property getCursor,
  // editor is null" the moment ANY plugin's CM6 transactionExtender ran a
  // dispatch on the shared editor — not just Outliner's own edits.
  afterEach(() => {
    setEditorViewAccessor(() => null)
  })

  it('is a working Editor, not undefined, once CodeMirrorEditor.tsx-style setup dispatches it', () => {
    const v = mountView()
    setEditorViewAccessor(() => v)
    v.dispatch({
      effects: setEditorInfo.of({ app: null, file: null, editor: EditorShim.create() }),
    })

    const editor = v.state.field(editorInfoField).editor as { getCursor: (which?: string) => { line: number; ch: number } } | undefined
    expect(editor).toBeDefined()
    expect(() => editor!.getCursor()).not.toThrow()
    expect(editor!.getCursor()).toEqual({ line: 0, ch: 0 })
  })
})
