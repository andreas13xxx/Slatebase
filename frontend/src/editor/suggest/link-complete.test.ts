import { describe, it, expect, vi } from 'vitest'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { CompletionContext, type Completion, type CompletionResult } from '@codemirror/autocomplete'
import { createLinkCompletions, createLinkSource, parseBlockIds, parseHeadings, type LinkSuggestSource } from './link-complete'

const files: Record<string, string> = {
  'Recipes/Bread.md': '---\ntitle: x\n---\n# Dough\ntext\n```\n# not a heading\n```\n## Baking: hot\nMix well ^mix1\n',
  'Other/Bread.md': '# Other',
}
const source: LinkSuggestSource = {
  notes: () => [
    { name: 'Bread.md', path: 'Recipes/Bread.md' },
    { name: 'Bread.md', path: 'Other/Bread.md' },
    { name: 'Soup.md', path: 'Soup.md' },
    { name: 'pic.png', path: 'pic.png' },
  ],
  aliases: () => [{ alias: 'Loaf', path: 'Recipes/Bread.md' }],
  resolve: (t) => (t === 'Recipes/Bread' ? 'Recipes/Bread.md' : null),
  readFile: async (p) => files[p] ?? null,
  vaultHeadings: async () => [{ path: 'Soup.md', heading: 'Broth' }, { path: 'Recipes/Bread.md', heading: 'Dough' }],
}

async function run(doc: string): Promise<CompletionResult | null> {
  const state = EditorState.create({ doc })
  return createLinkCompletions(() => source)(new CompletionContext(state, doc.length, false)) as Promise<CompletionResult | null>
}
const labels = async (doc: string) => (await run(doc))?.options.map((o) => o.label)

describe('parsers', () => {
  it('parseHeadings skips frontmatter and code fences', () => {
    expect(parseHeadings(files['Recipes/Bread.md']!)).toEqual(['Dough', 'Baking: hot'])
  })
  it('parseBlockIds finds ^ids at the end of a line only', () => {
    expect(parseBlockIds('Mix well ^mix1\nx^2\n^solo')).toEqual([{ id: 'mix1', text: 'Mix well' }, { id: 'solo', text: '' }])
  })
})

describe('createLinkCompletions', () => {
  it('suggests notes and aliases, disambiguating duplicate names by path', async () => {
    const r = await run('see [[')
    expect(r?.from).toBe(6)
    expect(r?.options.map((o) => o.label)).toEqual(['Bread', 'Bread', 'Soup', 'pic.png', 'Loaf'])
  })
  it('stays silent outside a link, after the closing brackets and in the display text', async () => {
    expect(await run('plain b')).toBeNull()
    expect(await run('[[Soup]] b')).toBeNull()
    expect(await run('[[Soup|b')).toBeNull()
  })
  it('suggests headings of the linked note and of this note', async () => {
    expect(await labels('[[Recipes/Bread#')).toEqual(['Dough', 'Baking: hot'])
    expect(await labels('[[Recipes/Bread#ba')).toEqual(['Baking: hot'])
    expect(await labels('# Mine\n[[#')).toEqual(['Mine'])
  })
  it('suggests existing block ids', async () => {
    expect(await labels('[[Recipes/Bread^')).toEqual(['^mix1'])
    expect(await labels('[[Recipes/Bread#^')).toEqual(['^mix1'])
  })
  it('suggests headings of the whole vault after ##', async () => {
    expect(await labels('[[##bro')).toEqual(['Broth'])
  })
  it('returns nothing for an unknown note', async () => {
    expect(await run('[[Nope#')).toBeNull()
  })

  it('inserts the link, closing it and moving the cursor behind it', async () => {
    const doc = '[[Recipes/Bread#ba'
    const r = await run(doc)
    const view = new EditorView({ state: EditorState.create({ doc }) })
    const apply = r!.options[0]!.apply as (v: EditorView, c: Completion, f: number, t: number) => void
    apply(view, r!.options[0]!, r!.from, doc.length)
    expect(view.state.doc.toString()).toBe('[[Recipes/Bread#Baking hot]]')
    expect(view.state.selection.main.head).toBe(view.state.doc.length)
    view.destroy()
  })
})

describe('createLinkSource', () => {
  it('reads vault headings through the search API, once per cache window', async () => {
    const searchVault = vi.fn().mockResolvedValue({
      results: [{ filePath: 'A.md', hits: [{ matchLine: '## Title ##' }, { matchLine: 'no' }] }],
    })
    const s = createLinkSource(() => ({
      vaultId: 'v', directoryTree: null, sourcePath: '', aliasMap: new Map(), aliasEntries: [], apiClient: { searchVault },
    }))
    expect(await s.vaultHeadings()).toEqual([{ path: 'A.md', heading: 'Title' }])
    await s.vaultHeadings()
    expect(searchVault).toHaveBeenCalledTimes(1)
  })
  it('gives an empty list when the search fails', async () => {
    const s = createLinkSource(() => ({
      vaultId: 'v', directoryTree: null, sourcePath: '', aliasMap: new Map(), aliasEntries: [],
      apiClient: { searchVault: vi.fn().mockRejectedValue(new Error('x')) },
    }))
    expect(await s.vaultHeadings()).toEqual([])
  })
})
