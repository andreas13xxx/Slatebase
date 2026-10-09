import { describe, it, expect } from 'vitest'
import { tokenize, FormulaTokenizeError } from './tokenizer'
import { parseFormula, FormulaParseError } from './parser'
import { evaluateFormula, formatFormulaValue } from './evaluator'
import type { FormulaContext, FormulaValue } from './functions'

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

  it('computes a day difference between two dates', () => {
    const r = evaluateFormula('date("2026-01-10") - date("2026-01-01")', ctxOf({}))
    expect(r).toEqual({ ok: true, value: 9 })
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
