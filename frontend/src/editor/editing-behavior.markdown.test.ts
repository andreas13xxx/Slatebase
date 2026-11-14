import { describe, it, expect } from 'vitest'
import { EditorState } from '@codemirror/state'
import { markdown } from '@codemirror/lang-markdown'
import { editingBehaviorExtension, DEFAULT_EDITING_BEHAVIOR } from './editing-behavior'

describe('closeBrackets config next to the Markdown language', () => {
  it('uses the enabled sets, not the language defaults', () => {
    const state = EditorState.create({
      doc: '',
      extensions: [markdown(), editingBehaviorExtension({ ...DEFAULT_EDITING_BEHAVIOR, autoPairMarkdown: true })],
    })
    const first = state.languageDataAt<{ brackets: string[] }>('closeBrackets', 0)[0]
    expect(first?.brackets).toEqual(['*', '_', '`', '~'])
  })
})
