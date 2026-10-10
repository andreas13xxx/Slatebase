import { describe, it, expect } from 'vitest'
import { EditorState } from '@codemirror/state'
import { markdown } from '@codemirror/lang-markdown'
import { detectSlashTrigger } from './slash-trigger'

/** Build a Markdown-parsing state so the trigger sees the same tree the editor does. */
function stateFor(doc: string): EditorState {
  return EditorState.create({ doc, extensions: [markdown()] })
}

/** Detect a trigger with the cursor at the given offset (default: end of doc). */
function triggerAt(doc: string, cursor: number = doc.length) {
  return detectSlashTrigger(stateFor(doc), cursor)
}

describe('detectSlashTrigger', () => {
  describe('positive', () => {
    it('fires on a bare slash at the line start', () => {
      const t = triggerAt('/')
      expect(t).not.toBeNull()
      expect(t).toMatchObject({ from: 0, to: 1, query: '' })
    })

    it('captures the filter typed after the slash', () => {
      const t = triggerAt('/tab')
      expect(t).toMatchObject({ from: 0, to: 4, query: 'tab' })
    })

    it('fires after leading whitespace / a word plus a space', () => {
      const t = triggerAt('Text /hea')
      expect(t).not.toBeNull()
      expect(t?.query).toBe('hea')
      expect(t?.from).toBe(5)
    })
  })

  describe('negative', () => {
    it('does not fire for a slash inside a word', () => {
      expect(triggerAt('word/tab')).toBeNull()
    })

    it('does not fire for a path-like slash', () => {
      expect(triggerAt('a/b')).toBeNull()
    })

    it('does not fire once a space follows the slash text', () => {
      expect(triggerAt('/tab ')).toBeNull()
    })

    it('does not fire inside a fenced code block', () => {
      const doc = '```\n/tab\n```'
      // Cursor right after `/tab` on line 2.
      const cursor = doc.indexOf('/tab') + 4
      expect(triggerAt(doc, cursor)).toBeNull()
    })

    it('does not fire inside an inline code span', () => {
      const doc = 'see `/tab` here'
      const cursor = doc.indexOf('/tab') + 4
      expect(triggerAt(doc, cursor)).toBeNull()
    })

    it('does not fire inside a wikilink target', () => {
      const doc = '[[/tab'
      expect(triggerAt(doc, doc.length)).toBeNull()
    })

    it('does not fire inside inline math', () => {
      const doc = '$x /y'
      expect(triggerAt(doc, doc.length)).toBeNull()
    })
  })
})
