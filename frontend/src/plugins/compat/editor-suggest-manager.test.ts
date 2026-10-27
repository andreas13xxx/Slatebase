/**
 * EditorSuggestManager — context lifecycle + re-entrancy regressions.
 *
 * Two bugs motivated these tests, both from the gap between this manager and
 * real Obsidian's EditorSuggest lifecycle:
 *
 *  1. Date-insert wiped the line (Tasks / Natural Language Dates): the manager
 *     nulled `suggest.context` BEFORE calling selectSuggestion(), so a plugin
 *     reading `this.context.start`/`.end` to replace its trigger range had no
 *     range and fell back to clobbering the whole line. Real Obsidian keeps the
 *     context valid across selectSuggestion() and clears it afterwards.
 *  2. Enter recursion (PR #294): a selection whose inserted value itself matches
 *     onTrigger() must not reopen + re-confirm in a loop. The `confirming` flag
 *     guards the trigger loop while selectSuggestion() runs.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  getEditorSuggestManager,
  destroyEditorSuggestManager,
  type EditorSuggestInstance,
  type EditorSuggestContext,
  type EditorSuggestTriggerInfo,
} from './editor-suggest-manager'
import type { EditorPosition, IEditor } from './editor-shim'
import type { TFile } from './types'

// A single-line fake editor: offsets equal `ch`, cursor is settable.
function makeEditor(initial = 0) {
  let cursor = initial
  const editor = {
    posToOffset: (p: EditorPosition) => p.ch,
    offsetToPos: (o: number) => ({ line: 0, ch: o }),
    getCursor: () => ({ line: 0, ch: cursor }),
    setCursorOffset: (o: number) => { cursor = o },
  } as unknown as IEditor & { setCursorOffset: (o: number) => void }
  return editor
}

// EditorSuggestPopover calls view.coordsAtPos() and reads view.state.doc; give
// it just enough to render into jsdom without throwing.
function makeView() {
  return {
    coordsAtPos: () => ({ left: 0, right: 0, top: 0, bottom: 0 }),
    dom: document.createElement('div'),
    state: {
      doc: {
        line: () => ({ from: 0 }),
      },
    },
  } as never
}

const file = { path: 'note.md' } as unknown as TFile

describe('EditorSuggestManager context lifecycle', () => {
  beforeEach(() => {
    destroyEditorSuggestManager()
    document.body.innerHTML = ''
  })

  it('keeps suggest.context valid during selectSuggestion, clears it after', () => {
    const editor = makeEditor(3)
    const view = makeView()
    const manager = getEditorSuggestManager({
      getActiveEditorView: () => view,
      getEditor: () => editor,
      getActiveFile: () => file,
    })!

    let contextDuringSelect: EditorSuggestContext | null | undefined
    const suggest: EditorSuggestInstance = {
      context: null,
      limit: 20,
      onTrigger: (): EditorSuggestTriggerInfo => ({
        start: { line: 0, ch: 0 },
        end: { line: 0, ch: 3 },
        query: 'tod',
      }),
      getSuggestions: () => ['today'],
      renderSuggestion: (v, el) => { el.textContent = String(v) },
      selectSuggestion() {
        // The plugin reads its own context here to know the replace range.
        contextDuringSelect = this.context
      },
      open() {},
      close() {},
    }

    manager.register(suggest)
    manager.handleUpdate(view)
    // getSuggestions resolves on a microtask boundary; the popover isn't needed
    // for confirmSelection — the items list is what matters. Drive it directly.
    return Promise.resolve().then(() => {
      expect(manager.isOpen()).toBe(true)
      const handled = manager.confirmSelection(new KeyboardEvent('keydown', { key: 'Enter' }))
      expect(handled).toBe(true)
      // The bug: this was null. The fix keeps the trigger range alive here.
      expect(contextDuringSelect).not.toBeNull()
      expect(contextDuringSelect?.start).toEqual({ line: 0, ch: 0 })
      expect(contextDuringSelect?.end).toEqual({ line: 0, ch: 3 })
      // Cleared afterwards, matching real Obsidian's after-selection close.
      expect(suggest.context).toBeNull()
      expect(manager.isOpen()).toBe(false)
    })
  })

  it('does not re-confirm when the inserted value re-matches onTrigger (no recursion)', () => {
    const editor = makeEditor(3)
    const view = makeView()
    const manager = getEditorSuggestManager({
      getActiveEditorView: () => view,
      getEditor: () => editor,
      getActiveFile: () => file,
    })!

    let selectCount = 0
    const suggest: EditorSuggestInstance = {
      context: null,
      limit: 20,
      // Always triggers — simulates an insertion that itself matches onTrigger.
      onTrigger: (): EditorSuggestTriggerInfo => ({
        start: { line: 0, ch: 0 },
        end: { line: 0, ch: 3 },
        query: 'x',
      }),
      getSuggestions: () => ['x'],
      renderSuggestion: (v, el) => { el.textContent = String(v) },
      selectSuggestion() {
        selectCount++
        // Simulate the plugin's own edit synchronously re-firing the trigger loop.
        manager.handleUpdate(view)
      },
      open() {},
      close() {},
    }

    manager.register(suggest)
    manager.handleUpdate(view)
    return Promise.resolve().then(() => {
      manager.confirmSelection(new KeyboardEvent('keydown', { key: 'Enter' }))
      // Exactly one selection — the confirming guard swallowed the re-fire.
      expect(selectCount).toBe(1)
    })
  })

  it('confirmSelection is a no-op when nothing is open', () => {
    const manager = getEditorSuggestManager({
      getActiveEditorView: () => makeView(),
      getEditor: () => makeEditor(),
      getActiveFile: () => file,
    })!
    expect(manager.confirmSelection(new KeyboardEvent('keydown', { key: 'Enter' }))).toBe(false)
  })
})
