/**
 * Regression test: the CM6-backed editor operations must be synchronous.
 *
 * Obsidian's `Editor.undo()`, `redo()`, `exec()` and `scrollIntoView()` are
 * synchronous — a plugin may call `editor.undo()` and read `editor.getValue()`
 * on the very next line. These used to be implemented with
 * `import('@codemirror/commands').then(...)`, which deferred the actual edit by
 * a microtask, so that read returned the pre-undo document.
 *
 * The dynamic imports bought nothing: the bundler reported them as
 * INEFFECTIVE_DYNAMIC_IMPORT because the same modules are already statically
 * bundled elsewhere. Each assertion below reads state immediately after the
 * call, with no `await`, and fails against the deferred implementation.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { EditorView } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { history } from '@codemirror/commands'
import { EditorShim, setEditorViewAccessor } from './editor-shim'

describe('EditorShim CM6 operations are synchronous', () => {
  let view: EditorView
  let editor: EditorShim

  beforeEach(() => {
    view = new EditorView({
      state: EditorState.create({ doc: 'hello', extensions: [history()] }),
      parent: document.body,
    })
    setEditorViewAccessor(() => view)
    editor = new EditorShim()
  })

  afterEach(() => {
    view.destroy()
    setEditorViewAccessor(() => null)
  })

  it('undo() reverts the document before returning', () => {
    view.dispatch({ changes: { from: 5, insert: ' world' } })
    expect(editor.getValue()).toBe('hello world')

    editor.undo()

    // No await: a deferred undo would still read 'hello world' here.
    expect(editor.getValue()).toBe('hello')
  })

  it('redo() reapplies the change before returning', () => {
    view.dispatch({ changes: { from: 5, insert: ' world' } })
    editor.undo()

    editor.redo()

    expect(editor.getValue()).toBe('hello world')
  })

  it('exec() applies a mapped command before returning', () => {
    editor.setCursor({ line: 0, ch: 0 })

    editor.exec('goEnd')

    expect(editor.getCursor().ch).toBe(5)
  })

  it('exec() ignores an unmapped command name', () => {
    const before = editor.getValue()

    expect(() => editor.exec('notARealCommand')).not.toThrow()
    expect(editor.getValue()).toBe(before)
  })

  it('scrollIntoView() dispatches without throwing', () => {
    expect(() =>
      editor.scrollIntoView({ from: { line: 0, ch: 0 }, to: { line: 0, ch: 5 } }),
    ).not.toThrow()
  })

  it('undo() is a no-op without a CM6 view rather than throwing', () => {
    setEditorViewAccessor(() => null)
    const textarea = document.createElement('textarea')
    textarea.value = 'plain'

    const plainEditor = new EditorShim(textarea)

    expect(() => plainEditor.undo()).not.toThrow()
    expect(plainEditor.getValue()).toBe('plain')
  })
})
