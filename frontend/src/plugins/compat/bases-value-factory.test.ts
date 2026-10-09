/**
 * Tests for the Bases value factory (raw link-index value → Value object).
 */

import { describe, it, expect } from 'vitest'
import { toValue } from './bases-value-factory'
import { NullValue, StringValue, NumberValue, BooleanValue, DateValue, ListValue } from './bases-values'

describe('bases-value-factory', () => {
  it('empty / absent → NullValue', () => {
    expect(toValue(undefined)).toBe(NullValue.value)
    expect(toValue([])).toBe(NullValue.value)
  })

  describe('inference (no declared type)', () => {
    it('infers number', () => {
      expect(toValue(['42'])).toBeInstanceOf(NumberValue)
      expect(toValue(['42']).toString()).toBe('42')
    })
    it('infers boolean', () => {
      expect(toValue(['true'])).toBeInstanceOf(BooleanValue)
      expect((toValue(['true']) as BooleanValue).isTruthy()).toBe(true)
    })
    it('infers date', () => {
      expect(toValue(['2026-10-09'])).toBeInstanceOf(DateValue)
    })
    it('infers list for multiple values', () => {
      expect(toValue(['a', 'b'])).toBeInstanceOf(ListValue)
      expect(toValue(['a', 'b']).toString()).toBe('a, b')
    })
    it('falls back to string', () => {
      expect(toValue(['hello'])).toBeInstanceOf(StringValue)
    })
  })

  describe('declared type', () => {
    it('number declared but non-numeric → NullValue', () => {
      expect(toValue(['abc'], 'number')).toBe(NullValue.value)
    })
    it('checkbox', () => {
      expect(toValue(['false'], 'checkbox')).toBeInstanceOf(BooleanValue)
      expect((toValue(['false'], 'checkbox') as BooleanValue).isTruthy()).toBe(false)
    })
    it('datetime → DateValue', () => {
      expect(toValue(['2026-10-09T12:00'], 'datetime')).toBeInstanceOf(DateValue)
    })
    it('tags → ListValue of TagValue', () => {
      const v = toValue(['todo', 'done'], 'tags') as ListValue
      expect(v).toBeInstanceOf(ListValue)
      expect(v.toString()).toBe('#todo, #done')
    })
    it('single value declared list → ListValue', () => {
      expect(toValue(['one'], 'list')).toBeInstanceOf(ListValue)
    })
  })
})
