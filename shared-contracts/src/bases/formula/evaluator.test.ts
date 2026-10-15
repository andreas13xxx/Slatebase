import { describe, it, expect } from 'vitest'
import { tokenize, FormulaTokenizeError } from './tokenizer.js'
import { parseFormula, FormulaParseError } from './parser.js'
import { evaluateFormula, evaluateCondition, formatFormulaValue } from './evaluator.js'
import type { FormulaContext } from './evaluator.js'
import type { FormulaValue } from './functions.js'

function ctxOf(values: Record<string, FormulaValue>): FormulaContext {
  return { resolve: (name) => (name in values ? values[name]! : null) }
}

describe('tokenize', () => {
  it('tokenizes identifiers, numbers, strings, operators', () => {
    const toks = tokenize('status == "open"').map((t) => t.type)
    expect(toks).toEqual(['identifier', 'operator', 'string', 'eof'])
  })

  it('recognizes two-char operators', () => {
    expect(tokenize('a >= 1').map((t) => t.value)).toEqual(['a', '>=', '1', ''])
  })

  it('throws on an unterminated string', () => {
    expect(() => tokenize('"oops')).toThrow(FormulaTokenizeError)
  })
})

describe('parseFormula', () => {
  it('respects operator precedence', () => {
    const ast = parseFormula('1 + 2 * 3')
    // + at the root, * nested on the right
    expect(ast.kind).toBe('binary')
    if (ast.kind === 'binary') {
      expect(ast.op).toBe('+')
      expect(ast.right.kind).toBe('binary')
    }
  })

  it('parses function calls with arguments', () => {
    const ast = parseFormula('if(a, "x", "y")')
    expect(ast.kind).toBe('call')
    if (ast.kind === 'call') {
      expect(ast.name).toBe('if')
      expect(ast.args).toHaveLength(3)
    }
  })

  it('throws on a trailing token', () => {
    expect(() => parseFormula('1 2')).toThrow(FormulaParseError)
  })
})

describe('evaluateFormula', () => {
  it('evaluates arithmetic', () => {
    const r = evaluateFormula('2 + 3 * 4', ctxOf({}))
    expect(r).toEqual({ ok: true, value: 14 })
  })

  it('resolves property references', () => {
    const r = evaluateFormula('priority + 1', ctxOf({ priority: 2 }))
    expect(r).toEqual({ ok: true, value: 3 })
  })

  it('concatenates strings with +', () => {
    const r = evaluateFormula('"a" + "b"', ctxOf({}))
    expect(r).toEqual({ ok: true, value: 'ab' })
  })

  it('evaluates comparisons', () => {
    expect(evaluateFormula('3 > 2', ctxOf({}))).toEqual({ ok: true, value: true })
    expect(evaluateFormula('status == "open"', ctxOf({ status: 'open' }))).toEqual({ ok: true, value: true })
  })

  it('evaluates if()', () => {
    const r = evaluateFormula('if(done, "✓", "…")', ctxOf({ done: true }))
    expect(r).toEqual({ ok: true, value: '✓' })
  })

  it('computes a millisecond difference between two dates (Obsidian semantics)', () => {
    const r = evaluateFormula('date("2026-01-10") - date("2026-01-01")', ctxOf({}))
    // 9 days in milliseconds
    expect(r).toEqual({ ok: true, value: 9 * 86_400_000 })
  })

  it('returns an error on division by zero (no crash)', () => {
    const r = evaluateFormula('1 / 0', ctxOf({}))
    expect(r.ok).toBe(false)
  })

  it('returns an error for an unknown function', () => {
    const r = evaluateFormula('bogus(1)', ctxOf({}))
    expect(r.ok).toBe(false)
  })

  it('treats a missing property as null, not a crash', () => {
    const r = evaluateFormula('concat("x=", missing)', ctxOf({}))
    expect(r).toEqual({ ok: true, value: 'x=' })
  })

  it('never throws on a syntax error', () => {
    const r = evaluateFormula('1 +', ctxOf({}))
    expect(r.ok).toBe(false)
  })
})

describe('formatFormulaValue', () => {
  it('renders a midnight date as a plain date', () => {
    const r = evaluateFormula('date("2026-03-15")', ctxOf({}))
    expect(r.ok).toBe(true)
    if (r.ok) expect(formatFormulaValue(r.value)).toBe('2026-03-15')
  })

  it('renders null as an empty string', () => {
    expect(formatFormulaValue(null)).toBe('')
  })
})

describe('expression language — logical operators', () => {
  it('evaluates && and || with short-circuit truthiness', () => {
    expect(evaluateFormula('true && false', ctxOf({}))).toEqual({ ok: true, value: false })
    expect(evaluateFormula('false || true', ctxOf({}))).toEqual({ ok: true, value: true })
  })
  it('evaluates logical not', () => {
    expect(evaluateFormula('!done', ctxOf({ done: false }))).toEqual({ ok: true, value: true })
  })
  it('precedence: || binds looser than &&', () => {
    // true || (false && false) === true
    expect(evaluateFormula('true || false && false', ctxOf({}))).toEqual({ ok: true, value: true })
  })
})

describe('expression language — methods', () => {
  it('number.toFixed(n)', () => {
    expect(evaluateFormula('price.toFixed(2)', ctxOf({ price: 3 }))).toEqual({ ok: true, value: '3.00' })
  })
  it('string.contains', () => {
    expect(evaluateFormula('name.contains("ab")', ctxOf({ name: 'cabd' }))).toEqual({ ok: true, value: true })
  })
  it('string.upper', () => {
    expect(evaluateFormula('name.upper()', ctxOf({ name: 'hi' }))).toEqual({ ok: true, value: 'HI' })
  })
  it('list.contains / length', () => {
    expect(evaluateFormula('tags.contains("x")', ctxOf({ tags: ['a', 'x'] }))).toEqual({ ok: true, value: true })
    expect(evaluateFormula('tags.length()', ctxOf({ tags: ['a', 'x'] }))).toEqual({ ok: true, value: 2 })
  })
  it('date.format via moment', () => {
    const r = evaluateFormula('d.format("YYYY")', ctxOf({ d: new Date(2026, 0, 1) }))
    expect(r).toEqual({ ok: true, value: '2026' })
  })
  it('unknown method is an error, not a crash', () => {
    expect(evaluateFormula('name.bogus()', ctxOf({ name: 'x' })).ok).toBe(false)
  })
})

describe('expression language — members, index, durations', () => {
  it('date member field', () => {
    expect(evaluateFormula('now().year', ctxOf({})).ok).toBe(true)
  })
  it('list index access', () => {
    expect(evaluateFormula('tags[0]', ctxOf({ tags: ['first', 'second'] }))).toEqual({ ok: true, value: 'first' })
  })
  it('date + duration string', () => {
    const r = evaluateFormula('date("2026-01-01") + "1d"', ctxOf({}))
    expect(r.ok).toBe(true)
    if (r.ok) expect(formatFormulaValue(r.value)).toBe('2026-01-02')
  })
})

describe('evaluateCondition (filter entry point)', () => {
  it('returns true/false for a comparison', () => {
    expect(evaluateCondition('status == "done"', ctxOf({ status: 'done' }))).toBe(true)
    expect(evaluateCondition('status == "done"', ctxOf({ status: 'open' }))).toBe(false)
  })
  it('combines conditions with && / ||', () => {
    expect(evaluateCondition('a > 1 && b < 5', ctxOf({ a: 2, b: 3 }))).toBe(true)
  })
  it('a broken condition is false, not a crash', () => {
    expect(evaluateCondition('1 +', ctxOf({}))).toBe(false)
  })
})

describe('review follow-ups', () => {
  const run = (src: string, values: Record<string, FormulaValue> = {}) => evaluateFormula(src, ctxOf(values))

  it('treats a missing value as not comparable (no string-ordering accident)', () => {
    expect(evaluateCondition('price < 10', ctxOf({}))).toBe(false)
    expect(evaluateCondition('price <= 10', ctxOf({}))).toBe(false)
    expect(evaluateCondition('price > 3', ctxOf({}))).toBe(false)
    expect(evaluateCondition('price < 10', ctxOf({ price: 4 }))).toBe(true)
  })

  it('|| and && return the operand value (default idiom)', () => {
    expect(run('status || "none"', { status: 'open' })).toEqual({ ok: true, value: 'open' })
    expect(run('status || "none"', {})).toEqual({ ok: true, value: 'none' })
    expect(run('status && "set"', { status: 'open' })).toEqual({ ok: true, value: 'set' })
    expect(run('status && "set"', {})).toEqual({ ok: true, value: null })
  })

  it('reads `end-start` as a subtraction, not one identifier', () => {
    expect(run('end-start', { end: 10, start: 4 })).toEqual({ ok: true, value: 6 })
    expect(run('count-1', { count: 5 })).toEqual({ ok: true, value: 4 })
  })

  it('reaches a hyphenated property via note["..."]', () => {
    expect(run('note["due-date"]', { 'note.due-date': 'x' })).toEqual({ ok: true, value: 'x' })
  })

  it('allows method calls on string and number literals', () => {
    expect(run('"a,b".split(",").length')).toEqual({ ok: true, value: 2 })
    expect(run('"abc".contains("b")')).toEqual({ ok: true, value: true })
    expect(run('5.toFixed(2)')).toEqual({ ok: true, value: '5.00' })
    expect(run('1.5 + 1')).toEqual({ ok: true, value: 2.5 })
  })

  it('treats epoch numbers and date strings as dates for methods and members', () => {
    const ms = new Date(2026, 9, 5, 12, 0, 0).getTime()
    expect(run('t.format("YYYY-MM-DD")', { t: ms })).toEqual({ ok: true, value: '2026-10-05' })
    expect(run('t.year', { t: ms })).toEqual({ ok: true, value: 2026 })
    expect(run('d.format("YYYY")', { d: '2026-10-01' })).toEqual({ ok: true, value: '2026' })
  })
})

