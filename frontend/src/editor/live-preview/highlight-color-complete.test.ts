import { describe, it, expect } from 'vitest'
import { EditorState } from '@codemirror/state'
import { CompletionContext } from '@codemirror/autocomplete'
import { highlightColorCompletions } from './highlight-color-complete'

/**
 * Builds a CompletionContext whose cursor sits at the end of `doc` (or at
 * `pos` when given). `explicit=false` mimics typing; the source should decide
 * on its own whether to fire.
 */
function contextFor(doc: string, pos?: number, explicit = false): CompletionContext {
  const state = EditorState.create({ doc })
  return new CompletionContext(state, pos ?? doc.length, explicit)
}

describe('highlightColorCompletions', () => {
  it('suggests colors right after an opening ==', () => {
    const result = highlightColorCompletions(contextFor('text =='))
    expect(result).not.toBeNull()
    expect(result?.options.length).toBe(5) // red/orange/green/blue/purple, not yellow
    expect(result?.options.every((o) => o.detail === 'Hervorhebung')).toBe(true)
  })

  it('does NOT suggest on the closing == of a finished highlight', () => {
    // Typing the second == of ==wichtig== must not re-open the color menu.
    expect(highlightColorCompletions(contextFor('==wichtig=='))).toBeNull()
  })

  it('does NOT suggest on the closing == of an already-colored highlight', () => {
    expect(highlightColorCompletions(contextFor('==🔴 wichtig=='))).toBeNull()
  })

  it('suggests again on a second opening == later on the same line', () => {
    // After one complete highlight, a fresh == opens a new one → even count.
    const result = highlightColorCompletions(contextFor('==one== and =='))
    expect(result).not.toBeNull()
    expect(result?.options.length).toBe(5)
  })

  it('does not fire on === (three or more equals)', () => {
    expect(highlightColorCompletions(contextFor('text ==='))).toBeNull()
  })

  it('does not fire when the cursor is not after ==', () => {
    expect(highlightColorCompletions(contextFor('plain text'))).toBeNull()
  })

  it('counts delimiters per line, not across the whole document', () => {
    // A finished highlight on an earlier line must not flip the parity of the
    // opening == on the current line.
    const doc = '==done==\ntext =='
    const result = highlightColorCompletions(contextFor(doc))
    expect(result).not.toBeNull()
    expect(result?.options.length).toBe(5)
  })
})
