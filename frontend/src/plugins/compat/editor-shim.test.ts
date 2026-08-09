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

describe('EditorShim toolbar formatting commands', () => {
  let view: EditorView
  let editor: EditorShim

  const setDoc = (doc: string) => {
    view.setState(EditorState.create({ doc, extensions: [history()] }))
  }

  beforeEach(() => {
    view = new EditorView({
      state: EditorState.create({ doc: '', extensions: [history()] }),
      parent: document.body,
    })
    setEditorViewAccessor(() => view)
    editor = new EditorShim()
  })

  afterEach(() => {
    view.destroy()
    setEditorViewAccessor(() => null)
  })

  it('toggleMarkdownFormatting("bold") wraps a selection, then unwraps it on repeat', () => {
    setDoc('hello world')
    editor.setSelection({ line: 0, ch: 0 }, { line: 0, ch: 5 })

    editor.toggleMarkdownFormatting('bold')
    expect(editor.getValue()).toBe('**hello** world')

    editor.setSelection({ line: 0, ch: 2 }, { line: 0, ch: 7 })
    editor.toggleMarkdownFormatting('bold')
    expect(editor.getValue()).toBe('hello world')
  })

  it('toggleMarkdownFormatting("italic") inserts an empty pair at the cursor when nothing is selected', () => {
    setDoc('hello')
    editor.setCursor({ line: 0, ch: 5 })

    editor.toggleMarkdownFormatting('italic')

    expect(editor.getValue()).toBe('hello**')
    expect(editor.getCursor().ch).toBe(6)
  })

  it('toggleMarkdownFormatting("code") wraps a selection in backticks, then unwraps it on repeat', () => {
    setDoc('hello world')
    editor.setSelection({ line: 0, ch: 0 }, { line: 0, ch: 5 })

    editor.toggleMarkdownFormatting('code')
    expect(editor.getValue()).toBe('`hello` world')

    editor.setSelection({ line: 0, ch: 1 }, { line: 0, ch: 6 })
    editor.toggleMarkdownFormatting('code')
    expect(editor.getValue()).toBe('hello world')
  })

  it('toggleBulletList() adds and removes "- " prefixes across selected lines', () => {
    setDoc('one\ntwo\nthree')
    editor.setSelection({ line: 0, ch: 0 }, { line: 2, ch: 5 })

    editor.toggleBulletList()
    expect(editor.getValue()).toBe('- one\n- two\n- three')

    editor.toggleBulletList()
    expect(editor.getValue()).toBe('one\ntwo\nthree')
  })

  it('toggleNumberList() numbers selected lines sequentially', () => {
    setDoc('a\nb\nc')
    editor.setSelection({ line: 0, ch: 0 }, { line: 2, ch: 1 })

    editor.toggleNumberList()

    expect(editor.getValue()).toBe('1. a\n2. b\n3. c')
  })

  it('toggleCheckList() adds an unchecked box, then toggles it off', () => {
    setDoc('todo item')
    editor.setSelection({ line: 0, ch: 0 }, { line: 0, ch: 9 })

    editor.toggleCheckList()
    expect(editor.getValue()).toBe('- [ ] todo item')

    editor.toggleCheckList()
    expect(editor.getValue()).toBe('todo item')
  })

  it('indentList() and unindentList() add/remove one indent level', () => {
    setDoc('- item')
    editor.setSelection({ line: 0, ch: 0 }, { line: 0, ch: 0 })

    editor.indentList()
    expect(editor.getValue()).not.toBe('- item')
    expect(editor.getValue().endsWith('- item')).toBe(true)

    editor.unindentList()
    expect(editor.getValue()).toBe('- item')
  })
})
