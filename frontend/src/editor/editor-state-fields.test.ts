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
import { livePreviewState, livePreviewStateTracker } from './editor-state-fields'

let view: EditorView | null = null

function mountView(): EditorView {
  view = new EditorView({
    state: EditorState.create({ doc: 'hello', extensions: [livePreviewStateTracker] }),
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
