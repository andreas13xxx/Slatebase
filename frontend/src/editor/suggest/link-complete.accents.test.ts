import { describe, it, expect } from 'vitest'
import { EditorState } from '@codemirror/state'
import { CompletionContext, type CompletionResult } from '@codemirror/autocomplete'
import { createLinkCompletions, type LinkSuggestSource } from './link-complete'

const source: LinkSuggestSource = {
  notes: () => [
    { name: 'Café Notizen.md', path: 'Café Notizen.md' },
    { name: 'Äpfel.md', path: 'Äpfel.md' },
    { name: 'Straße.md', path: 'Straße.md' },
    { name: 'Soup.md', path: 'Soup.md' },
  ],
  aliases: () => [],
  resolve: () => null,
  readFile: async () => null,
  vaultHeadings: async () => [],
}

async function labels(doc: string): Promise<string[]> {
  const state = EditorState.create({ doc })
  const result = (await createLinkCompletions(() => source)(
    new CompletionContext(state, doc.length, false),
  )) as CompletionResult | null
  return result?.options.map((o) => o.label) ?? []
}

describe('link suggestions — accent-insensitive (Obsidian 1.15)', () => {
  it('finds "Café Notizen" with "cafe"', async () => {
    expect(await labels('[[cafe')).toEqual(['Café Notizen'])
  })

  it('finds "Äpfel" with "apf" and ranks the prefix match first', async () => {
    expect(await labels('[[apf')).toEqual(['Äpfel'])
  })

  it('finds "Straße" with "strasse"', async () => {
    expect(await labels('[[strasse')).toEqual(['Straße'])
  })

  it('finds nothing for an unrelated query', async () => {
    expect(await labels('[[zzz')).toEqual([])
  })
})
