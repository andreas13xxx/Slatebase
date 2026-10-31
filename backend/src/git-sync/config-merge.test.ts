import { describe, it, expect } from 'vitest'
import { mergeObsidianConfig, type JsonObject } from './config-merge.js'

const merge = (file: string, base: JsonObject | null, ours: JsonObject, theirs: JsonObject, oursNewer = true) => {
  const result = mergeObsidianConfig(file, base, ours, theirs, oursNewer)
  if (result === null) throw new Error('not resolvable')
  return result
}

describe('mergeObsidianConfig: keys', () => {
  it('keeps the changes of both sides when they touched different keys', () => {
    const { merged, decisions } = merge('app.json',
      { showLineNumber: false, spellcheck: true },
      { showLineNumber: true, spellcheck: true },
      { showLineNumber: false, spellcheck: false })
    expect(merged).toEqual({ showLineNumber: true, spellcheck: false })
    expect(decisions).toEqual([])
  })

  it('keeps a key one side deleted and the other left alone deleted', () => {
    const { merged } = merge('app.json', { a: 1, b: 2 }, { a: 1, b: 2, c: 3 }, { a: 1 })
    expect(merged).toEqual({ a: 1, c: 3 })
  })

  it('takes keys added on one side', () => {
    expect(merge('app.json', {}, { a: 1 }, { b: 2 }).merged).toEqual({ a: 1, b: 2 })
  })

  it('lets the newer side win a key both changed, and reports the decision', () => {
    const newerOurs = merge('app.json', { tabSize: 4 }, { tabSize: 2 }, { tabSize: 8 }, true)
    expect(newerOurs.merged).toEqual({ tabSize: 2 })
    expect(newerOurs.decisions).toEqual([{ path: 'tabSize', ours: '2', theirs: '8', kept: 'ours' }])
    const newerTheirs = merge('app.json', { tabSize: 4 }, { tabSize: 2 }, { tabSize: 8 }, false)
    expect(newerTheirs.merged).toEqual({ tabSize: 8 })
    expect(newerTheirs.decisions[0]?.kept).toBe('theirs')
  })

  it('treats delete against change as a conflict and lets the newer side win', () => {
    expect(merge('app.json', { a: 1 }, { a: 2 }, {}, false).merged).toEqual({})
    expect(merge('app.json', { a: 1 }, { a: 2 }, {}, true).merged).toEqual({ a: 2 })
  })

  it('handles a file both sides added', () => {
    const { merged, decisions } = merge('app.json', null, { a: 1, x: 'o' }, { b: 2, x: 'o' })
    expect(merged).toEqual({ a: 1, x: 'o', b: 2 })
    expect(decisions).toEqual([])
  })

  it('keeps our key order and appends keys that are new on their side', () => {
    expect(Object.keys(merge('app.json', {}, { z: 1, a: 2 }, { m: 3 }).merged)).toEqual(['z', 'a', 'm'])
  })

  it('shortens long values in a decision', () => {
    const long = 'x'.repeat(300)
    const { decisions } = merge('app.json', { a: '' }, { a: long }, { a: 'y' })
    expect(decisions[0]?.ours.length).toBeLessThan(100)
  })

  it('does not resolve files it does not know', () => {
    expect(mergeObsidianConfig('core-plugins.json', {}, {}, {}, true)).toBeNull()
    expect(mergeObsidianConfig('workspace.json', {}, {}, {}, true)).toBeNull()
  })
})

describe('mergeObsidianConfig: hotkeys and graph', () => {
  it('merges hotkeys per command id', () => {
    const key = (k: string) => [{ modifiers: ['Mod'], key: k }]
    const { merged } = merge('hotkeys.json', { 'a:x': key('A') }, { 'a:x': key('A'), 'b:y': key('B') }, { 'a:x': [] , 'c:z': key('C') })
    expect(merged).toEqual({ 'a:x': [], 'b:y': key('B'), 'c:z': key('C') })
  })

  it('keeps color groups of the newer side as a whole instead of mixing them', () => {
    const groupsOurs = [{ query: 'tag:#a', color: { a: 1, rgb: 1 } }]
    const groupsTheirs = [{ query: 'tag:#b', color: { a: 1, rgb: 2 } }]
    const { merged } = merge('graph.json', { colorGroups: [], scale: 1 }, { colorGroups: groupsOurs, scale: 1 }, { colorGroups: groupsTheirs, scale: 2 }, false)
    expect(merged).toEqual({ colorGroups: groupsTheirs, scale: 2 })
  })
})

describe('mergeObsidianConfig: nested maps', () => {
  it('merges saved workspaces by name', () => {
    const { merged, decisions } = merge('workspaces.json',
      { workspaces: { a: { v: 1 }, b: { v: 1 } }, active: 'a' },
      { workspaces: { a: { v: 2 }, b: { v: 1 } }, active: 'a' },
      { workspaces: { a: { v: 1 }, c: { v: 3 } }, active: 'c' })
    expect(merged).toEqual({ workspaces: { a: { v: 2 }, c: { v: 3 } }, active: 'c' })
    expect(decisions).toEqual([])
  })

  it('merges property types by property name', () => {
    const { merged } = merge('types.json',
      { types: { a: 'text' } },
      { types: { a: 'text', b: 'number' } },
      { types: { a: 'multitext' } })
    expect(merged).toEqual({ types: { a: 'multitext', b: 'number' } })
  })
})

describe('mergeObsidianConfig: bookmarks', () => {
  const file = (path: string, extra: JsonObject = {}) => ({ type: 'file', path, ...extra })

  it('combines entries added on both sides and keeps the rest', () => {
    const { merged } = merge('bookmarks.json',
      { items: [file('a.md')] },
      { items: [file('a.md'), file('ours.md')] },
      { items: [file('a.md'), file('theirs.md')] })
    expect(merged).toEqual({ items: [file('a.md'), file('ours.md'), file('theirs.md')] })
  })

  it('keeps an entry removed on one side removed, in either direction', () => {
    const base = { items: [file('a.md'), file('b.md')] }
    expect(merge('bookmarks.json', base, { items: [file('a.md')] }, base).merged).toEqual({ items: [file('a.md')] })
    expect(merge('bookmarks.json', base, base, { items: [file('b.md')] }).merged).toEqual({ items: [file('b.md')] })
  })

  it('keeps an entry one side removed and the other changed', () => {
    const base = { items: [file('a.md', { title: 'old' })] }
    const { merged } = merge('bookmarks.json', base, { items: [] }, { items: [file('a.md', { title: 'new' })] })
    expect(merged).toEqual({ items: [file('a.md', { title: 'new' })] })
  })

  it('merges a group recursively by title', () => {
    const group = (items: unknown[]) => ({ type: 'group', title: 'Work', items })
    const { merged } = merge('bookmarks.json',
      { items: [group([file('a.md')])] },
      { items: [group([file('a.md'), file('x.md')])] },
      { items: [group([file('a.md'), file('y.md')])] })
    expect(merged).toEqual({ items: [group([file('a.md'), file('x.md'), file('y.md')])] })
  })

  it('tells a heading bookmark from a bookmark of the whole note', () => {
    const { merged } = merge('bookmarks.json',
      { items: [file('a.md')] },
      { items: [file('a.md'), file('a.md', { subpath: '#H' })] },
      { items: [file('a.md')] })
    expect(merged.items).toEqual([file('a.md'), file('a.md', { subpath: '#H' })])
  })

  it('merges other keys of the file next to the list', () => {
    const { merged } = merge('bookmarks.json', { items: [], x: 1 }, { items: [], x: 2 }, { items: [], x: 1 })
    expect(merged).toEqual({ items: [], x: 2 })
  })
})
