import { describe, it, expect } from 'vitest'
import { hasNestedQuantifier } from './regex-safety.js'

describe('hasNestedQuantifier', () => {
  describe('dangerous patterns (should be flagged)', () => {
    const dangerous = [
      '(a+)+',
      '(a*)*',
      '(a+)*',
      '(a*)+',
      '(.*)+',
      '(.+)+',
      '(\\d+)+',
      '(\\s*)*',
      '([a-zA-Z]+)*',
      '(x+x+)+',
      '((a+)+)+',
      '(?:a+)+',
      '(a{1,100})+',
      '(a{2,})*',
      '(a+?)+', // lazy inner quantifier is still ambiguous when nested
      'foo(bar(baz+)+)+qux',
    ]

    it.each(dangerous)('flags %s', (pattern) => {
      expect(hasNestedQuantifier(pattern)).toBe(true)
    })
  })

  describe('safe patterns (should not be flagged)', () => {
    const safe = [
      'plain text',
      'a+b+c+d+',
      '\\d{4}-\\d{2}-\\d{2}',
      '#\\w+',
      '\\[\\[.*?\\]\\]',
      '^#+\\s',
      '(foo|bar)+',
      '(foo|bar)',
      '(abc)+',
      '(a(b)c)+',
      '(?:\\d{4})+', // exact-count quantifier inside, no ambiguity
      'colou?r',
      '[a-z]+',
      '[+*(){}]+', // quantifier-looking chars inside a character class are literal
      'a{3}',
      '(a{3})+', // exact-count inside a repeated group — no ambiguity
      'user@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}', // wide-but-terminal quantifier, not nested
      '\\(escaped\\)\\+parens',
      '',
    ]

    it.each(safe)('does not flag %s', (pattern) => {
      expect(hasNestedQuantifier(pattern)).toBe(false)
    })
  })

  it('does not crash on malformed/unbalanced regex source', () => {
    expect(() => hasNestedQuantifier('(a+')).not.toThrow()
    expect(() => hasNestedQuantifier('a+)')).not.toThrow()
    expect(() => hasNestedQuantifier('[unterminated')).not.toThrow()
    expect(() => hasNestedQuantifier('trailing\\')).not.toThrow()
  })
})
