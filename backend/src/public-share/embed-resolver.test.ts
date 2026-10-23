import { describe, expect, it } from 'vitest'
import { resolveEmbeds, toPublicEmbeds } from './embed-resolver.js'
import { createMockVaultAccess } from './test-helpers.js'
import { DEFAULT_EMBED_LIMITS } from './types.js'

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47])

async function resolve(files: Record<string, string | Buffer>, root: string, options?: Parameters<typeof createMockVaultAccess>[1], limits = DEFAULT_EMBED_LIMITS) {
  const access = createMockVaultAccess(files, options)
  const markdown = String(files[root])
  return resolveEmbeds('v1', root, markdown, access, limits)
}

describe('resolveEmbeds', () => {
  it('inlines an embedded note without its frontmatter', async () => {
    const embeds = await resolve({ 'Main.md': '![[Prices]]', 'Prices.md': '---\nsecret: x\n---\n# Prices\n10 EUR' }, 'Main.md')
    expect(embeds['Prices']).toEqual({ kind: 'note', markdown: '# Prices\n10 EUR' })
  })

  it('applies heading and block excerpts', async () => {
    const files = {
      'Main.md': '![[N#Two]] ![[N#^b]]',
      'N.md': '# One\na\n# Two\nb\n\npara ^b\n',
    }
    const embeds = await resolve(files, 'Main.md')
    expect(embeds['N#Two']).toMatchObject({ kind: 'note', markdown: '# Two\nb\n\npara ^b\n' })
    expect(embeds['N#^b']).toEqual({ kind: 'note', markdown: 'para' })
  })

  it('reports a missing block as unavailable', async () => {
    const embeds = await resolve({ 'Main.md': '![[N#^nope]]', 'N.md': 'text' }, 'Main.md')
    expect(embeds['N#^nope']).toEqual({ kind: 'unavailable', reason: 'missing' })
  })

  it('lists images and other media as assets with their content type', async () => {
    const embeds = await resolve({ 'Main.md': '![[pic.png]] ![x](img/a.jpg) ![[doc.pdf]]', 'pic.png': PNG, 'img/a.jpg': PNG, 'doc.pdf': PNG }, 'Main.md')
    expect(embeds['pic.png']).toEqual({ kind: 'asset', path: 'pic.png', contentType: 'image/png' })
    expect(embeds['img/a.jpg']).toMatchObject({ kind: 'asset', path: 'img/a.jpg' })
    expect(embeds['doc.pdf']).toMatchObject({ kind: 'asset', contentType: 'application/pdf' })
  })

  it('resolves embeds of embedded notes (transitive assets)', async () => {
    const embeds = await resolve({ 'Main.md': '![[Inner]]', 'Inner.md': '![[deep.png]]', 'deep.png': PNG }, 'Main.md')
    expect(embeds['deep.png']).toMatchObject({ kind: 'asset', path: 'deep.png' })
  })

  it('does not follow plain wikilinks or markdown links', async () => {
    const embeds = await resolve({ 'Main.md': '[[Other]] [x](Other.md)', 'Other.md': 'secret' }, 'Main.md')
    expect(embeds).toEqual({})
  })

  it('marks a deleted embed as missing', async () => {
    const embeds = await resolve({ 'Main.md': '![[Gone]] ![[gone.png]]' }, 'Main.md')
    expect(embeds['Gone']).toEqual({ kind: 'unavailable', reason: 'missing' })
    expect(embeds['gone.png']).toEqual({ kind: 'unavailable', reason: 'missing' })
  })

  it('marks an unreadable note as unavailable', async () => {
    const embeds = await resolve({ 'Main.md': '![[N]]', 'N.md': 'x' }, 'Main.md', { unreadable: ['N.md'] })
    expect(embeds['N']).toEqual({ kind: 'unavailable', reason: 'unreadable' })
  })

  it('never resolves .base and .canvas, nor reads them', async () => {
    const access = createMockVaultAccess({ 'Main.md': '![[Tasks.base]] ![[Board.canvas]]', 'Tasks.base': 'views: []', 'Board.canvas': '{}' })
    const embeds = await resolveEmbeds('v1', 'Main.md', '![[Tasks.base]] ![[Board.canvas]]', access)
    expect(embeds['Tasks.base']).toEqual({ kind: 'unavailable', reason: 'unsupported' })
    expect(embeds['Board.canvas']).toEqual({ kind: 'unavailable', reason: 'unsupported' })
    expect(access.reads).toEqual([])
  })

  it('treats other file types as unsupported', async () => {
    const embeds = await resolve({ 'Main.md': '![[data.xlsx]]', 'data.xlsx': 'x' }, 'Main.md')
    expect(embeds['data.xlsx']).toEqual({ kind: 'unavailable', reason: 'unsupported' })
  })

  it('refuses dot paths even when the tree contains them', async () => {
    const files = { 'Main.md': '![[.obsidian/app.md]] ![[.slatebase/x.png]] ![[.hidden]]', '.obsidian/app.md': 'cfg', '.slatebase/x.png': PNG }
    const access = createMockVaultAccess(files)
    const embeds = await resolveEmbeds('v1', 'Main.md', String(files['Main.md']), access)
    expect(Object.values(embeds).every((e) => e.kind === 'unavailable' && e.reason === 'hidden')).toBe(true)
    expect(access.reads).toEqual([])
  })

  it('refuses a name that resolves into a hidden folder', async () => {
    const access = createMockVaultAccess({ 'Main.md': '![[Config]]', '.obsidian/Config.md': 'cfg' })
    const embeds = await resolveEmbeds('v1', 'Main.md', '![[Config]]', access)
    expect(embeds['Config']).toMatchObject({ kind: 'unavailable' })
    expect(access.reads).toEqual([])
  })

  it('stops a ring A -> B -> A', async () => {
    const files = { 'A.md': 'a ![[B]]', 'B.md': 'b ![[A]]' }
    const embeds = await resolve(files, 'A.md')
    expect(embeds['B']).toMatchObject({ kind: 'note' })
    expect(embeds['A']).toEqual({ kind: 'unavailable', reason: 'cycle' })
  })

  it('stops a note embedding itself', async () => {
    const embeds = await resolve({ 'A.md': '![[A]]' }, 'A.md')
    expect(embeds['A']).toEqual({ kind: 'unavailable', reason: 'cycle' })
  })

  it('resolves up to three levels and marks the fourth as too deep', async () => {
    const files = { 'R.md': '![[L1]]', 'L1.md': '![[L2]]', 'L2.md': '![[L3]]', 'L3.md': '![[L4]]', 'L4.md': 'end' }
    const embeds = await resolve(files, 'R.md')
    expect(embeds['L1']).toMatchObject({ kind: 'note' })
    expect(embeds['L2']).toMatchObject({ kind: 'note' })
    expect(embeds['L3']).toMatchObject({ kind: 'note' })
    expect(embeds['L4']).toEqual({ kind: 'unavailable', reason: 'depth' })
  })

  it('enforces the total size limit', async () => {
    const files = { 'Main.md': '![[Big1]] ![[Big2]]', 'Big1.md': 'x'.repeat(60), 'Big2.md': 'y'.repeat(60) }
    const embeds = await resolve(files, 'Main.md', undefined, { ...DEFAULT_EMBED_LIMITS, maxTotalChars: 100 })
    expect(embeds['Big1']).toMatchObject({ kind: 'note' })
    expect(embeds['Big2']).toEqual({ kind: 'unavailable', reason: 'too-large' })
  })

  it('enforces the embed count limit on wide fan-out', async () => {
    const names = Array.from({ length: 10 }, (_, i) => `n${i}`)
    const files: Record<string, string> = { 'Main.md': names.map((n) => `![[${n}]]`).join(' ') }
    for (const n of names) files[`${n}.md`] = n
    const embeds = await resolve(files, 'Main.md', undefined, { ...DEFAULT_EMBED_LIMITS, maxEmbeds: 4 })
    const kinds = Object.values(embeds)
    expect(kinds.filter((e) => e.kind === 'note')).toHaveLength(4)
    expect(kinds.filter((e) => e.kind === 'unavailable' && e.reason === 'too-large')).toHaveLength(6)
  })

  it('survives prototype-polluting references', async () => {
    const embeds = await resolve({ 'Main.md': '![[__proto__]] ![[constructor]]' }, 'Main.md')
    expect(Object.keys(embeds).sort()).toEqual(['__proto__', 'constructor'])
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined()
  })

  it('reports everything unreadable when the vault tree is unavailable', async () => {
    const access = { ...createMockVaultAccess({}), getTree: async () => null }
    const embeds = await resolveEmbeds('v1', 'Main.md', '![[x]]', access)
    expect(embeds['x']).toEqual({ kind: 'unavailable', reason: 'unreadable' })
  })
})

describe('toPublicEmbeds', () => {
  it('drops vault paths and failure reasons', async () => {
    const embeds = await resolve({ 'Main.md': '![[N]] ![[a/pic.png]] ![[Gone]]', 'N.md': 'x', 'a/pic.png': PNG }, 'Main.md')
    const view = toPublicEmbeds(embeds)
    expect(view['N']).toEqual({ kind: 'note', markdown: 'x' })
    expect(view['a/pic.png']).toEqual({ kind: 'asset', contentType: 'image/png' })
    expect(view['Gone']).toEqual({ kind: 'unavailable' })
    expect(JSON.stringify(view)).not.toContain('missing')
    expect(JSON.stringify(view)).not.toContain('"path"')
  })
})
