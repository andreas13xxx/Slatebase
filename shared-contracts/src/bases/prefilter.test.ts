/**
 * Tests for the conservative server-prefilter extractor. The load-bearing
 * property: the prefilter must NEVER exclude a row the full expression filter
 * would keep (soundness). Over-inclusion is fine (the client re-filters).
 */

import { describe, it, expect } from 'vitest'
import { buildPrefilterNode, buildCombinedPrefilter } from './prefilter.js'

describe('buildPrefilterNode — this.* (the host note) is never pushed', () => {
  it.each([
    'this == "x"',
    'this.status == "done"',
    '"done" == this.status',
    'this.file.name == "Tasks"',
    'this.note.status == "open"',
    'status == this.status',
    'file.inFolder(this.file.folder)',
    'file.hasLink(this.file)',
    'file.hasTag(this.tag)',
  ])('pushes nothing for %s', (expression) => {
    expect(buildPrefilterNode(expression)).toBeNull()
  })

  it('pushes only the provable part of a mixed AND', () => {
    expect(buildPrefilterNode('file.hasTag("a") && status == this.status')).toEqual({ tag: 'a' })
  })

  it('pushes nothing for an OR with a this.* branch', () => {
    expect(buildPrefilterNode('file.hasTag("a") || file.hasLink(this.file)')).toBeNull()
  })
})

describe('buildPrefilterNode — pushable predicates', () => {
  it('pushes property equality (prop == literal)', () => {
    expect(buildPrefilterNode('status == "done"')).toEqual({ property: 'status', op: 'eq', value: 'done' })
  })

  it('pushes property equality with reversed operands', () => {
    expect(buildPrefilterNode('"done" == status')).toEqual({ property: 'status', op: 'eq', value: 'done' })
  })

  it('strips a note. prefix to the plain key', () => {
    expect(buildPrefilterNode('note.status == "open"')).toEqual({ property: 'status', op: 'eq', value: 'open' })
  })

  it('pushes file.hasTag as a tag condition', () => {
    expect(buildPrefilterNode('file.hasTag("book")')).toEqual({ tag: 'book' })
  })

  it('strips a leading # from hasTag', () => {
    expect(buildPrefilterNode('file.hasTag("#book")')).toEqual({ tag: 'book' })
  })

  it('pushes file.inFolder as a path glob', () => {
    expect(buildPrefilterNode('file.inFolder("Projects")')).toEqual({ path: 'Projects/**' })
  })

  it('ANDs two pushable children', () => {
    expect(buildPrefilterNode({ and: ['status == "done"', 'file.hasTag("book")'] })).toEqual({
      and: [
        { property: 'status', op: 'eq', value: 'done' },
        { tag: 'book' },
      ],
    })
  })

  it('ORs two pushable children', () => {
    expect(buildPrefilterNode({ or: ['status == "a"', 'status == "b"'] })).toEqual({
      or: [
        { property: 'status', op: 'eq', value: 'a' },
        { property: 'status', op: 'eq', value: 'b' },
      ],
    })
  })
})

describe('buildPrefilterNode — unpushable forms yield null (soundness)', () => {
  it('does not push inequality', () => {
    expect(buildPrefilterNode('status != "done"')).toBeNull()
  })

  it('does not push ordering comparisons', () => {
    expect(buildPrefilterNode('price < 10')).toBeNull()
  })

  it('does not push negation', () => {
    expect(buildPrefilterNode({ not: ['status == "done"'] })).toBeNull()
  })

  it('does not push method calls other than hasTag/inFolder', () => {
    expect(buildPrefilterNode('title.contains("x")')).toBeNull()
  })

  it('does not push a formula reference', () => {
    expect(buildPrefilterNode('formula.score == 5')).toBeNull()
  })

  it('does not push a dotted member comparison', () => {
    expect(buildPrefilterNode('title.length == 3')).toBeNull()
  })

  it('does not push a numeric-literal equality', () => {
    // The backend compares property eq as a case-insensitive string, but the
    // client coerces to numbers, so `price == 10` keeps a note with price
    // "10.0" that the backend's "10.0" !== "10" would drop. Not pushable.
    expect(buildPrefilterNode('price == 10')).toBeNull()
    expect(buildPrefilterNode('10 == price')).toBeNull()
  })

  it('does not push a boolean-literal equality', () => {
    expect(buildPrefilterNode('done == true')).toBeNull()
  })

  it('does not push a numeric-looking STRING literal equality', () => {
    // "10" would also trigger the client's numeric coercion against a "10.0"
    // value, which the backend string compare cannot reproduce.
    expect(buildPrefilterNode('price == "10"')).toBeNull()
  })

  it('still pushes a non-numeric string equality', () => {
    expect(buildPrefilterNode('status == "done"')).toEqual({ property: 'status', op: 'eq', value: 'done' })
  })

  it('an AND keeps only its pushable child', () => {
    // `status == "done"` is pushable, `price < 10` is not → push only the first.
    expect(buildPrefilterNode({ and: ['status == "done"', 'price < 10'] })).toEqual({
      property: 'status',
      op: 'eq',
      value: 'done',
    })
  })

  it('an OR with ANY unpushable branch yields null', () => {
    // If one OR branch cannot be narrowed, pre-excluding by the other would
    // drop rows the unpushable branch would have matched.
    expect(buildPrefilterNode({ or: ['status == "done"', 'price < 10'] })).toBeNull()
  })

  it('an unparseable expression yields null', () => {
    expect(buildPrefilterNode('this is not ) valid (')).toBeNull()
  })

  it('an empty AND yields null', () => {
    expect(buildPrefilterNode({ and: [] })).toBeNull()
  })
})

describe('buildCombinedPrefilter', () => {
  it('ANDs document and view filters', () => {
    const result = buildCombinedPrefilter('status == "done"', 'file.hasTag("book")')
    expect(result).toEqual({
      and: [
        { property: 'status', op: 'eq', value: 'done' },
        { tag: 'book' },
      ],
    })
  })

  it('returns the single side when only one is pushable', () => {
    expect(buildCombinedPrefilter('status == "done"', 'price < 10')).toEqual({
      property: 'status',
      op: 'eq',
      value: 'done',
    })
  })

  it('returns null when neither side is pushable', () => {
    expect(buildCombinedPrefilter('price < 10', undefined)).toBeNull()
  })
})
