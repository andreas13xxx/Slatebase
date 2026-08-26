import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { EditorView } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { history } from '@codemirror/commands'
import { EditorShim, setEditorViewAccessor } from './editor-shim'
import { CommandRegistry } from './command-registry'
import { registerCoreEditorCommands } from './core-commands'
import { setActiveEditorView } from '../../editor/plugin-extensions'
import { codeFolding, foldedRanges } from '@codemirror/language'
import { markdownFoldService } from '../../editor/folding'
import type { IEditor } from './editor-shim'

describe('registerCoreEditorCommands', () => {
  let view: EditorView
  let editor: EditorShim
  let registry: CommandRegistry

  const setDoc = (doc: string) => {
    view.setState(EditorState.create({ doc, extensions: [history(), EditorState.allowMultipleSelections.of(true)] }))
  }

  const run = (id: string) => registry.executeCommand(`editor:${id}`)

  beforeEach(() => {
    view = new EditorView({
      state: EditorState.create({ doc: '', extensions: [history()] }),
      parent: document.body,
    })
    setEditorViewAccessor(() => view)
    editor = new EditorShim()

    registry = new CommandRegistry()
    registry.setEditorContextResolver(() => ({
      editor,
      file: { path: 'note.md', basename: 'note', extension: 'md' },
    }))
    registerCoreEditorCommands(registry)
  })

  afterEach(() => {
    view.destroy()
    setEditorViewAccessor(() => null)
  })

  it('registers every command under the "editor:" namespace, matching real Obsidian IDs', () => {
    expect(registry.getCommand('editor:toggle-code')).toBeDefined()
    expect(registry.getCommand('editor:toggle-checklist-status')).toBeDefined()
  })

  it('toggle-checklist-status (the toolbar\'s checkbox button) turns a line into a checkbox', () => {
    setDoc('todo item')
    editor.setSelection({ line: 0, ch: 0 }, { line: 0, ch: 9 })

    run('toggle-checklist-status')

    expect(editor.getValue()).toBe('- [ ] todo item')
  })

  it('toggle-code (the toolbar\'s inline-code button) wraps the selection in backticks', () => {
    setDoc('hello world')
    editor.setSelection({ line: 0, ch: 0 }, { line: 0, ch: 5 })

    run('toggle-code')

    expect(editor.getValue()).toBe('`hello` world')
  })

  it('toggle-blockquote adds and removes "> " across selected lines', () => {
    setDoc('one\ntwo')
    editor.setSelection({ line: 0, ch: 0 }, { line: 1, ch: 3 })

    run('toggle-blockquote')
    expect(editor.getValue()).toBe('> one\n> two')

    run('toggle-blockquote')
    expect(editor.getValue()).toBe('one\ntwo')
  })

  it('insert-wikilink wraps the selection in [[ ]]', () => {
    setDoc('hello')
    editor.setSelection({ line: 0, ch: 0 }, { line: 0, ch: 5 })

    run('insert-wikilink')

    expect(editor.getValue()).toBe('[[hello]]')
  })

  it('swap-line-down moves the current line below the next one', () => {
    setDoc('a\nb')
    editor.setCursor({ line: 0, ch: 0 })

    run('swap-line-down')

    expect(editor.getValue()).toBe('b\na')
  })

  it('does nothing when no editor is active, rather than throwing', () => {
    registry.setEditorContextResolver(() => null)

    expect(() => run('toggle-code')).not.toThrow()
  })

  it('set-heading-2 sets the current line to a level-2 heading, replacing any existing level', () => {
    setDoc('# Title')
    editor.setCursor({ line: 0, ch: 3 })

    run('set-heading-2')

    expect(editor.getValue()).toBe('## Title')
  })

  it('set-heading-0 removes the heading marker', () => {
    setDoc('### Title')
    editor.setCursor({ line: 0, ch: 0 })

    run('set-heading-0')

    expect(editor.getValue()).toBe('Title')
  })

  it('set-heading cycles none -> 1 -> 2 -> ... -> 6 -> none', () => {
    setDoc('Title')
    editor.setCursor({ line: 0, ch: 0 })

    run('set-heading')
    expect(editor.getValue()).toBe('# Title')
    run('set-heading')
    expect(editor.getValue()).toBe('## Title')
  })

  it('insert-footnote inserts a marker and appends the definition at the document end', () => {
    setDoc('hello')
    editor.setCursor({ line: 0, ch: 5 })

    run('insert-footnote')

    expect(editor.getValue()).toBe('hello[^1]\n\n[^1]: ')
  })

  it('delete-paragraph removes the contiguous non-blank block around the cursor', () => {
    setDoc('keep\n\npara line one\npara line two\n\nkeep2')
    editor.setCursor({ line: 3, ch: 0 })

    run('delete-paragraph')

    expect(editor.getValue()).toBe('keep\n\n\nkeep2')
  })

  it('add-cursor-below adds a second selection one line down at the same column', () => {
    setDoc('aaaa\nbbbb')
    editor.setCursor({ line: 0, ch: 2 })

    run('add-cursor-below')

    const sels = editor.listSelections()
    expect(sels).toHaveLength(2)
    expect(sels[1]!.head).toEqual({ line: 1, ch: 2 })
  })

  it('no-op commands (e.g. fold-all) are registered but do nothing, without throwing', () => {
    setDoc('hello')
    expect(registry.getCommand('editor:fold-all')).toBeDefined()

    expect(() => run('fold-all')).not.toThrow()
    expect(editor.getValue()).toBe('hello')
  })

  describe('table editing', () => {
    const table = '| A | B |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |'

    it('table-col-after inserts an empty column after the current one', () => {
      setDoc(table)
      editor.setCursor({ line: 0, ch: 2 }) // inside column A (col 0)

      run('table-col-after')

      expect(editor.getValue()).toBe('| A |  | B |\n| --- | --- | --- |\n| 1 |  | 2 |\n| 3 |  | 4 |')
    })

    it('table-col-delete removes the current column', () => {
      setDoc(table)
      editor.setCursor({ line: 0, ch: 2 }) // col 0

      run('table-col-delete')

      expect(editor.getValue()).toBe('| B |\n| --- |\n| 2 |\n| 4 |')
    })

    it('table-row-after inserts a blank data row after the current row', () => {
      setDoc(table)
      editor.setCursor({ line: 2, ch: 2 }) // first data row

      run('table-row-after')

      expect(editor.getValue()).toBe('| A | B |\n| --- | --- |\n| 1 | 2 |\n|  |  |\n| 3 | 4 |')
    })

    it('table-row-delete removes the current data row but not the header/separator', () => {
      setDoc(table)
      editor.setCursor({ line: 2, ch: 2 })

      run('table-row-delete')
      expect(editor.getValue()).toBe('| A | B |\n| --- | --- |\n| 3 | 4 |')

      // Header row is protected
      setDoc(table)
      editor.setCursor({ line: 0, ch: 2 })
      run('table-row-delete')
      expect(editor.getValue()).toBe(table)
    })

    it('table-col-align-right rewrites the separator cell for the current column', () => {
      setDoc(table)
      editor.setCursor({ line: 0, ch: 2 }) // col 0

      run('table-col-align-right')

      expect(editor.getValue()).toBe('| A | B |\n| ---: | --- |\n| 1 | 2 |\n| 3 | 4 |')
    })

    it('is a no-op outside a table block', () => {
      setDoc('just some text')
      editor.setCursor({ line: 0, ch: 3 })

      expect(() => run('table-col-after')).not.toThrow()
      expect(editor.getValue()).toBe('just some text')
    })
  })

  describe('commands wired via the slatebase:editor-command CustomEvent', () => {
    it('context-menu dispatches a showContextMenu editor-command event', () => {
      const listener = vi.fn()
      window.addEventListener('slatebase:editor-command', listener)

      run('context-menu')

      expect(listener).toHaveBeenCalledTimes(1)
      expect((listener.mock.calls[0]![0] as CustomEvent).detail).toEqual({ action: 'showContextMenu' })
      window.removeEventListener('slatebase:editor-command', listener)
    })

    it('toggle-readable-line-length dispatches a toggleReadableLineLength editor-command event', () => {
      const listener = vi.fn()
      window.addEventListener('slatebase:editor-command', listener)

      run('toggle-readable-line-length')

      expect((listener.mock.calls[0]![0] as CustomEvent).detail).toEqual({ action: 'toggleReadableLineLength' })
      window.removeEventListener('slatebase:editor-command', listener)
    })

    it('toggle-spellcheck dispatches a toggleSpellcheck editor-command event', () => {
      const listener = vi.fn()
      window.addEventListener('slatebase:editor-command', listener)

      run('toggle-spellcheck')

      expect((listener.mock.calls[0]![0] as CustomEvent).detail).toEqual({ action: 'toggleSpellcheck' })
      window.removeEventListener('slatebase:editor-command', listener)
    })
  })

  describe('folding commands', () => {
    let foldingView: EditorView
    let foldingRegistry: CommandRegistry

    function setUpFoldingView(doc: string): void {
      foldingView = new EditorView({
        state: EditorState.create({ doc, extensions: [codeFolding(), markdownFoldService] }),
        parent: document.body,
      })
      setActiveEditorView(foldingView)
      foldingRegistry = new CommandRegistry()
      // These six commands ignore the IEditor argument (they call
      // getActiveEditorView() directly) — the resolver only needs to make
      // CommandRegistry treat editor:* commands as invocable at all.
      foldingRegistry.setEditorContextResolver(() => ({
        editor: {} as IEditor,
        file: { path: 'note.md', basename: 'note', extension: 'md' },
      }))
      registerCoreEditorCommands(foldingRegistry, 'de')
    }

    afterEach(() => {
      foldingView.destroy()
      setActiveEditorView(null)
    })

    it('editor:fold-all folds every heading section', () => {
      setUpFoldingView('# Title\n\n## A\n\nBody A.')

      foldingRegistry.executeCommand('editor:fold-all')

      let count = 0
      foldedRanges(foldingView.state).between(0, foldingView.state.doc.length, () => { count++ })
      expect(count).toBeGreaterThan(0)
    })

    it('editor:unfold-all clears folds created by editor:fold-all', () => {
      setUpFoldingView('# Title\n\n## A\n\nBody A.')
      foldingRegistry.executeCommand('editor:fold-all')

      foldingRegistry.executeCommand('editor:unfold-all')

      let count = 0
      foldedRanges(foldingView.state).between(0, foldingView.state.doc.length, () => { count++ })
      expect(count).toBe(0)
    })

    it('editor:toggle-fold folds then unfolds the heading section at the cursor', () => {
      const doc = '# Title\n\n## A\n\nBody A.'
      setUpFoldingView(doc)
      foldingView.dispatch({ selection: { anchor: doc.indexOf('## A') } })

      foldingRegistry.executeCommand('editor:toggle-fold')
      let count = 0
      foldedRanges(foldingView.state).between(0, foldingView.state.doc.length, () => { count++ })
      expect(count).toBeGreaterThan(0)

      foldingRegistry.executeCommand('editor:toggle-fold')
      count = 0
      foldedRanges(foldingView.state).between(0, foldingView.state.doc.length, () => { count++ })
      expect(count).toBe(0)
    })

    it('editor:toggle-fold-properties folds the frontmatter block', () => {
      setUpFoldingView('---\ntags: [a]\n---\nBody.')

      foldingRegistry.executeCommand('editor:toggle-fold-properties')

      let count = 0
      foldedRanges(foldingView.state).between(0, foldingView.state.doc.length, () => { count++ })
      expect(count).toBe(1)
    })

    it('editor:fold-more folds the deepest heading level', () => {
      setUpFoldingView('# Title\n\n## A\n\nBody A.')

      foldingRegistry.executeCommand('editor:fold-more')

      let count = 0
      foldedRanges(foldingView.state).between(0, foldingView.state.doc.length, () => { count++ })
      expect(count).toBeGreaterThan(0)
    })

    it('editor:fold-less is a no-op when nothing is folded', () => {
      setUpFoldingView('# Title\n\n## A\n\nBody A.')

      expect(() => foldingRegistry.executeCommand('editor:fold-less')).not.toThrow()
      let count = 0
      foldedRanges(foldingView.state).between(0, foldingView.state.doc.length, () => { count++ })
      expect(count).toBe(0)
    })

    it('does nothing (no throw) when there is no active editor view', () => {
      setUpFoldingView('# Title')
      setActiveEditorView(null)

      expect(() => foldingRegistry.executeCommand('editor:fold-all')).not.toThrow()
    })
  })
})
