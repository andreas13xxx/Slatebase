import { describe, it, expect } from 'vitest'
import { EditorState } from '@codemirror/state'
import { CompletionContext } from '@codemirror/autocomplete'
import { createMetadataCompletions, createApiMetadataSource, type MetadataSuggestSource } from './metadata-complete'

const source: MetadataSuggestSource = {
  getTags: async () => ['project', 'project/alpha'],
  getPropertyKeys: async () => ['status', 'tags'],
  getPropertyValues: async (key) => (key === 'tags' ? ['project'] : key === 'done' ? ['true', 'false'] : []),
}
const run = (doc: string, explicit = false) =>
  createMetadataCompletions(() => source)(new CompletionContext(EditorState.create({ doc }), doc.length, explicit))

describe('createMetadataCompletions', () => {
  it('suggests tags after #', async () => {
    const r = await run('text #pro')
    expect(r && 'then' in r).toBe(false)
    expect((r as { from: number }).from).toBe(6)
    expect((r as { options: unknown[] }).options).toHaveLength(2)
  })
  it('does not treat a heading marker as a tag', async () => {
    expect(await run('#')).toBeNull()
    expect(await run('# Title')).toBeNull()
  })
  it('suggests property names in frontmatter', async () => {
    const r = await run('---\nst')
    expect((r as { options: Array<{ apply: string }> }).options[0]?.apply).toBe('status: ')
  })
  it('suggests tag values for tags and list items', async () => {
    expect(await run('---\ntags: pr')).not.toBeNull()
    expect(await run('---\ntags:\n  - pr')).not.toBeNull()
  })
  it('suggests values in an open list and resolves linearly on a malicious value (no ReDoS)', async () => {
    expect(await run('---\ntags: [project, al')).not.toBeNull()
    const evil = '---\ntags:!:\t,' + '\t,'.repeat(50000)
    const start = Date.now()
    await run(evil)
    expect(Date.now() - start).toBeLessThan(1000)
  })
  it('stays silent outside frontmatter keys and for unknown values', async () => {
    expect(await run('---\ntitle: x\n---\nstatus')).toBeNull()
    expect(await run('---\ntitle: x')).toBeNull()
  })
  it('returns nothing without a source', async () => {
    const ctx = new CompletionContext(EditorState.create({ doc: 'a #p' }), 4, false)
    expect(await createMetadataCompletions(() => null)(ctx)).toBeNull()
  })
})

describe('createApiMetadataSource', () => {
  it('maps API results, caches, and survives errors', async () => {
    let calls = 0
    const api = {
      getVaultTags: async () => { calls++; return { tags: [{ name: '#a' }] } },
      getGraphMeta: async () => { throw new Error('x') },
    }
    const s = createApiMetadataSource(api, 'v1', () => [{ key: 'done', type: 'checkbox' }])
    expect(await s.getTags()).toEqual(['a'])
    await s.getTags()
    expect(calls).toBe(1)
    expect(await s.getPropertyKeys()).toEqual([])
    expect(await s.getPropertyValues('done')).toEqual(['true', 'false'])
  })
})
