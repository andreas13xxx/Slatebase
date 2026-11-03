import { describe, it, expect } from 'vitest'
import { tokenize } from './tokenizer.js'
import { evaluateFormula } from './evaluator.js'
import type { FormulaContext } from './evaluator.js'
import type { FormulaValue } from './functions.js'

function ctxOf(values: Record<string, FormulaValue> = {}, fileApi?: FormulaContext['fileApi']): FormulaContext {
  const ctx: FormulaContext = { resolve: (name) => (name in values ? values[name]! : null) }
  if (fileApi) ctx.fileApi = fileApi
  return ctx
}

function ev(src: string, values: Record<string, FormulaValue> = {}): FormulaValue {
  const r = evaluateFormula(src, ctxOf(values))
  if (!r.ok) throw new Error(r.error)
  return r.value
}

describe('regex literals', () => {
  it('tokenizes a regex where a value is expected, division after a value', () => {
    expect(tokenize('/ab+c/gi').map((t) => t.type)).toEqual(['regex', 'eof'])
    expect(tokenize('a / b').map((t) => t.type)).toEqual(['identifier', 'operator', 'identifier', 'eof'])
    expect(tokenize('(4) / 2').map((t) => t.type)).toContain('operator')
  })

  it('keeps a slash inside a character class', () => {
    expect(ev('/[/]x/.matches("a/x")')).toBe(true)
  })

  it('matches()', () => {
    expect(ev('/^a.c$/.matches("abc")')).toBe(true)
    expect(ev('/^a.c$/.matches("abd")')).toBe(false)
  })

  it('replace with a regex: g flag controls first versus all', () => {
    expect(ev('"a-b-c".replace(/-/, "+")')).toBe('a+b-c')
    expect(ev('"a-b-c".replace(/-/g, "+")')).toBe('a+b+c')
    expect(ev('"a-b-c".replace("-", "+")')).toBe('a+b+c')
  })

  it('split with a regex and a limit', () => {
    expect(ev('"a1b22c".split(/[0-9]+/)')).toEqual(['a', 'b', 'c'])
    expect(ev('"a,b,c".split(",", 2)')).toEqual(['a', 'b'])
  })
})

describe('string / number / date methods', () => {
  it('string helpers', () => {
    expect(ev('"ab".repeat(3)')).toBe('ababab')
    expect(ev('"abc".reverse()')).toBe('cba')
    expect(ev('"hello world".title()')).toBe('Hello World')
    expect(ev('"abcdef".slice(1, 3)')).toBe('bc')
    expect(ev('"hello".containsAll("he", "lo")')).toBe(true)
    expect(ev('"hello".containsAny("x", "ell")')).toBe(true)
    expect(ev('"".isEmpty()')).toBe(true)
  })

  it('number helpers', () => {
    expect(ev('(2.1).ceil()')).toBe(3)
    expect(ev('x.floor()', { x: 2.9 })).toBe(2)
    expect(ev('x.isEmpty()', { x: 0 })).toBe(false)
  })

  it('date relative()', () => {
    expect(ev('(now() - "2 days").relative()')).toMatch(/ago/)
  })
})

describe('list methods', () => {
  const tags: FormulaValue = ['b', 'a', 'b', 'c']
  it('unique / sort / reverse / slice / flat', () => {
    expect(ev('t.unique()', { t: tags })).toEqual(['b', 'a', 'c'])
    expect(ev('t.sort()', { t: tags })).toEqual(['a', 'b', 'b', 'c'])
    expect(ev('t.reverse()', { t: tags })).toEqual(['c', 'b', 'a', 'b'])
    expect(ev('t.slice(1, 3)', { t: tags })).toEqual(['a', 'b'])
    expect(ev('t.flat()', { t: [['x'], 'y'] })).toEqual(['x', 'y'])
  })

  it('containsAll / containsAny / isEmpty', () => {
    expect(ev('t.containsAll("a", "b")', { t: tags })).toBe(true)
    expect(ev('t.containsAny("x", "c")', { t: tags })).toBe(true)
    expect(ev('t.containsAll("a", "x")', { t: tags })).toBe(false)
    expect(ev('t.isEmpty()', { t: [] })).toBe(true)
  })

  it('sorts numbers numerically', () => {
    expect(ev('n.sort()', { n: [10, 9, 100] })).toEqual([9, 10, 100])
  })
})

describe('lambdas', () => {
  it('map / filter use value and index', () => {
    expect(ev('n.map(value * 2)', { n: [1, 2, 3] })).toEqual([2, 4, 6])
    expect(ev('n.filter(value > 1)', { n: [1, 2, 3] })).toEqual([2, 3])
    expect(ev('n.filter(index == 0)', { n: [7, 8] })).toEqual([7])
  })

  it('reduce uses acc with an initial value', () => {
    expect(ev('n.reduce(acc + value, 0)', { n: [1, 2, 3] })).toBe(6)
  })

  it('a lambda body can read row properties and members of value', () => {
    expect(ev('t.map(value + suffix)', { t: ['a', 'b'], suffix: '!' })).toEqual(['a!', 'b!'])
    expect(ev('t.filter(value.length > 1)', { t: ['a', 'bb'] })).toEqual(['bb'])
  })

  it('chains', () => {
    expect(ev('n.filter(value > 1).map(value * 10).reduce(acc + value, 0)', { n: [1, 2, 3] })).toBe(50)
  })
})

describe('global functions', () => {
  it('duration / escapeHTML / html / icon / random', () => {
    expect(ev('duration("2h")')).toBe(7_200_000)
    expect(ev('duration("5h") * 2')).toBe(36_000_000)
    expect(ev('escapeHTML("<a & \\"b\\">")')).toBe('&lt;a &amp; &quot;b&quot;&gt;')
    expect(ev('html("<b>x</b>")')).toBe('<b>x</b>')
    expect(ev('icon("star")')).toBe('star')
    const r = ev('random()')
    expect(typeof r === 'number' && r >= 0 && r < 1).toBe(true)
  })

  it('file() / image() build a link value', () => {
    expect(ev('file("a/b.md").path')).toBe('a/b.md')
    expect(ev('image("pic.png")')).toMatchObject({ kind: 'link', path: 'pic.png' })
  })
})

describe('any-type and link methods', () => {
  it('isTruthy / isType', () => {
    expect(ev('"x".isTruthy()')).toBe(true)
    expect(ev('"".isTruthy()')).toBe(false)
    expect(ev('"x".isType("string")')).toBe(true)
    expect(ev('n.isType("list")', { n: [1] })).toBe(true)
    expect(ev('d.isType("date")', { d: new Date() })).toBe(true)
  })

  it('link asFile / linksTo', () => {
    expect(ev('link("Notes/A.md").linksTo("a")')).toBe(true)
    expect(ev('link("Notes/A.md").linksTo("b")')).toBe(false)
    expect(ev('link("x").asFile()')).toMatchObject({ kind: 'link', path: 'x' })
  })

  it('file.hasProperty / file.asLink go through the file API', () => {
    const api = {
      hasTag: () => false, inFolder: () => false, hasLink: () => false,
      hasProperty: (n: string) => n === 'status',
      asLink: (d?: string): FormulaValue => ({ kind: 'link', path: 'p.md', ...(d ? { display: d } : {}) }),
    }
    const run = (src: string) => {
      const r = evaluateFormula(src, ctxOf({}, api))
      if (!r.ok) throw new Error(r.error)
      return r.value
    }
    expect(run('file.hasProperty("status")')).toBe(true)
    expect(run('file.hasProperty("other")')).toBe(false)
    expect(run('file.asLink("Hi")')).toMatchObject({ path: 'p.md', display: 'Hi' })
  })
})
