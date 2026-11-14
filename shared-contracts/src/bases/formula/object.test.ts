import { describe, it, expect } from 'vitest'
import { evaluateFormula, evaluateCondition, formatFormulaValue } from './evaluator.js'
import type { FormulaContext } from './evaluator.js'
import { makeObject, isObject, stringify, isTruthy, objectsEqual, type FormulaValue } from './functions.js'

/** A context with named values; `meta` and `empty` are objects. */
function ctx(vars: Record<string, FormulaValue> = {}): FormulaContext {
  const values: Record<string, FormulaValue> = {
    meta: makeObject([['status', 'open'], ['tags', ['a', 'b']], ['count', 3]]),
    empty: makeObject([]),
    nested: makeObject([['inner', makeObject([['x', 1]])]]),
    ...vars,
  }
  return { resolve: (name) => values[name] ?? null }
}

const ok = (source: string, c: FormulaContext = ctx()): FormulaValue => {
  const r = evaluateFormula(source, c)
  if (!r.ok) throw new Error(r.error)
  return r.value
}

describe('object access', () => {
  it('reads an entry with dot and bracket notation', () => {
    expect(ok('meta.status')).toBe('open')
    expect(ok('meta["status"]')).toBe('open')
    expect(ok('meta.count')).toBe(3)
  })

  it('returns null for a missing key instead of failing', () => {
    expect(ok('meta.nope')).toBeNull()
    expect(ok('meta["nope"]')).toBeNull()
    expect(ok('meta[1]')).toBeNull()
  })

  it('reads nested objects, mixed forms, and stops at null', () => {
    expect(ok('nested.inner.x')).toBe(1)
    expect(ok('nested["inner"]["x"]')).toBe(1)
    expect(ok('nested.inner["x"]')).toBe(1)
    expect(ok('nested.nope.x')).toBeNull()
  })

  it('lets an entry named like a built-in member win', () => {
    expect(ok('o.length', ctx({ o: makeObject([['length', 'entry']]) }))).toBe('entry')
  })

  it('treats __proto__ and constructor as ordinary keys, never reaching the prototype', () => {
    const o = makeObject([['__proto__', 'p'], ['constructor', 'c']])
    expect(ok('o["__proto__"]', ctx({ o }))).toBe('p')
    expect(ok('o["constructor"]', ctx({ o }))).toBe('c')
    expect(ok('o["toString"]', ctx({ o }))).toBeNull()
    expect(ok('o["hasOwnProperty"]', ctx({ o }))).toBeNull()
    expect(ok('o.keys()', ctx({ o }))).toEqual(['__proto__', 'constructor'])
  })
})

describe('object methods', () => {
  it('keys() and values() in insertion order', () => {
    expect(ok('meta.keys()')).toEqual(['status', 'tags', 'count'])
    expect(ok('meta.values()')).toEqual(['open', ['a', 'b'], 3])
  })

  it('isEmpty() is true only without entries', () => {
    expect(ok('empty.isEmpty()')).toBe(true)
    expect(ok('meta.isEmpty()')).toBe(false)
  })

  it('isTruthy() follows the entry count', () => {
    expect(ok('meta.isTruthy()')).toBe(true)
    expect(ok('empty.isTruthy()')).toBe(false)
    expect(evaluateCondition('meta', ctx())).toBe(true)
    expect(evaluateCondition('empty', ctx())).toBe(false)
  })

  it('isType("object") is true for objects and false for other types', () => {
    expect(ok('meta.isType("object")')).toBe(true)
    expect(ok('"x".isType("object")')).toBe(false)
    expect(ok('meta.isType("list")')).toBe(false)
    expect(ok('tags.isType("object")', ctx({ tags: ['a'] }))).toBe(false)
  })

  it('toString() gives the compact JSON text form', () => {
    expect(ok('meta.toString()')).toBe('{"status":"open","tags":["a","b"],"count":3}')
  })

  it('refuses list/string methods on an object with a visible error', () => {
    for (const source of ['meta.contains("open")', 'meta.length()', 'meta.map(value)', 'meta.join(",")']) {
      const r = evaluateFormula(source, ctx())
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.error).toMatch(/Unknown method .* on object/)
    }
    // As a filter, a broken condition is simply false.
    expect(evaluateCondition('meta.contains("open")', ctx())).toBe(false)
  })
})

describe('object text form, equality and ordering', () => {
  it('prints compact JSON with links and dates in their text form', () => {
    const o = makeObject([['d', new Date('2026-11-14T10:00:00.000Z')], ['l', { kind: 'link', path: 'A.md', display: 'Titel' }], ['n', null]])
    expect(stringify(o)).toBe('{"d":"2026-11-14T10:00:00.000Z","l":"Titel","n":null}')
    expect(formatFormulaValue(o)).toBe(stringify(o))
  })

  it('compares structurally, regardless of key order', () => {
    const a = makeObject([['x', 1], ['y', 'z']])
    const b = makeObject([['y', 'z'], ['x', 1]])
    const c = makeObject([['x', 1], ['y', 'other']])
    expect(objectsEqual(a, b)).toBe(true)
    expect(objectsEqual(a, c)).toBe(false)
    expect(ok('a == b', ctx({ a, b }))).toBe(true)
    expect(ok('a != c', ctx({ a, c }))).toBe(true)
  })

  it('is never equal to a non-object', () => {
    expect(ok('meta == "x"')).toBe(false)
    expect(ok('empty == ""')).toBe(false)
    expect(ok('empty == null', ctx())).toBe(false)
  })

  it('is not comparable with < and >', () => {
    expect(ok('meta < meta')).toBe(false)
    expect(ok('meta > 1')).toBe(false)
  })

  it('has bounded depth when compared or printed', () => {
    let deep: FormulaValue = 'leaf'
    for (let i = 0; i < 40; i++) deep = makeObject([['k', deep]])
    expect(isObject(deep)).toBe(true)
    expect(() => stringify(deep)).not.toThrow()
    expect(objectsEqual(deep as never, deep as never)).toBe(false) // past the guard: not equal, not a hang
    expect(isTruthy(deep)).toBe(true)
  })
})
