// Unit tests for parseSearchQuery

import { describe, it, expect } from 'vitest'
import { parseSearchQuery } from './query-parser.js'

describe('parseSearchQuery', () => {
  describe('single operators', () => {
    it('parses a path operator', () => {
      const result = parseSearchQuery('path:Projekte/**')
      expect(result.operators).toHaveLength(1)
      expect(result.operators[0]).toEqual({
        type: 'path',
        negated: false,
        value: 'Projekte/**',
      })
      expect(result.freeText).toBe('')
    })

    it('parses a tag operator', () => {
      const result = parseSearchQuery('tag:projekt')
      expect(result.operators).toHaveLength(1)
      expect(result.operators[0]).toEqual({
        type: 'tag',
        negated: false,
        value: 'projekt',
      })
      expect(result.freeText).toBe('')
    })

    it('parses a file operator', () => {
      const result = parseSearchQuery('file:notes')
      expect(result.operators).toHaveLength(1)
      expect(result.operators[0]).toEqual({
        type: 'file',
        negated: false,
        value: 'notes',
      })
    })

    it('parses a property operator without value', () => {
      const result = parseSearchQuery('property:status')
      expect(result.operators).toHaveLength(1)
      expect(result.operators[0]).toEqual({
        type: 'property',
        negated: false,
        value: 'status',
        propertyKey: 'status',
      })
    })

    it('parses a property operator with key=value', () => {
      const result = parseSearchQuery('property:status=done')
      expect(result.operators).toHaveLength(1)
      expect(result.operators[0]).toEqual({
        type: 'property',
        negated: false,
        value: 'status=done',
        propertyKey: 'status',
        propertyValue: 'done',
      })
    })
  })

  describe('negation', () => {
    it('parses a negated tag operator', () => {
      const result = parseSearchQuery('-tag:archiv')
      expect(result.operators).toHaveLength(1)
      expect(result.operators[0]!.negated).toBe(true)
      expect(result.operators[0]!.type).toBe('tag')
      expect(result.operators[0]!.value).toBe('archiv')
    })

    it('parses a negated path operator', () => {
      const result = parseSearchQuery('-path:Archiv/**')
      expect(result.operators[0]!.negated).toBe(true)
      expect(result.operators[0]!.type).toBe('path')
    })
  })

  describe('quoted values', () => {
    it('strips quotes from value', () => {
      const result = parseSearchQuery('path:"Mein Ordner/**"')
      expect(result.operators[0]!.value).toBe('Mein Ordner/**')
    })

    it('handles quoted property value', () => {
      const result = parseSearchQuery('property:"status=in progress"')
      expect(result.operators[0]!.propertyKey).toBe('status')
      expect(result.operators[0]!.propertyValue).toBe('in progress')
    })
  })

  describe('multiple operators', () => {
    it('parses multiple operators', () => {
      const result = parseSearchQuery('tag:projekt path:Arbeit/** search text')
      expect(result.operators).toHaveLength(2)
      expect(result.operators[0]!.type).toBe('tag')
      expect(result.operators[1]!.type).toBe('path')
      expect(result.freeText).toBe('search text')
    })

    it('parses mixed positive and negative operators', () => {
      const result = parseSearchQuery('tag:active -tag:done some text')
      expect(result.operators).toHaveLength(2)
      expect(result.operators[0]!.negated).toBe(false)
      expect(result.operators[1]!.negated).toBe(true)
      expect(result.freeText).toBe('some text')
    })
  })

  describe('unknown operators as freetext', () => {
    it('keeps unknown prefix:value as freetext', () => {
      const result = parseSearchQuery('foo:bar some text')
      expect(result.operators).toHaveLength(0)
      expect(result.freeText).toBe('foo:bar some text')
    })

    it('handles http:// URLs as freetext', () => {
      const result = parseSearchQuery('http://example.com')
      expect(result.operators).toHaveLength(0)
      expect(result.freeText).toBe('http://example.com')
    })
  })

  describe('empty freetext', () => {
    it('returns empty freetext when only operators', () => {
      const result = parseSearchQuery('tag:a tag:b')
      expect(result.freeText).toBe('')
    })

    it('trims freetext whitespace', () => {
      const result = parseSearchQuery('  tag:a   hello   ')
      expect(result.freeText).toBe('hello')
    })
  })

  describe('no operators', () => {
    it('returns entire input as freetext', () => {
      const result = parseSearchQuery('simple search query')
      expect(result.operators).toHaveLength(0)
      expect(result.freeText).toBe('simple search query')
    })

    it('handles empty string', () => {
      const result = parseSearchQuery('')
      expect(result.operators).toHaveLength(0)
      expect(result.freeText).toBe('')
    })
  })
})
