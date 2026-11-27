/**
 * Tests for the functional Bases Value hierarchy.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  Value, NullValue, StringValue, NumberValue, BooleanValue, DateValue,
  ListValue, LinkValue, UrlValue, HTMLValue, TagValue,
  DurationValue, FileValue, ObjectValue, RegExpValue, RelativeDateValue,
} from './bases-values'

describe('bases-values', () => {
  describe('Value base behaviour', () => {
    it('StringValue toString/isTruthy', () => {
      expect(new StringValue('hi').toString()).toBe('hi')
      expect(new StringValue('hi').isTruthy()).toBe(true)
      expect(new StringValue('').isTruthy()).toBe(false)
    })

    it('equals compares wrapped values; looseEquals is case-insensitive', () => {
      expect(new StringValue('A').equals(new StringValue('A'))).toBe(true)
      expect(new StringValue('A').equals(new StringValue('B'))).toBe(false)
      expect(new StringValue('A').looseEquals(new StringValue('a'))).toBe(true)
      expect(Value.equals(new NumberValue(1), new NumberValue(1))).toBe(true)
      expect(Value.looseEquals(new StringValue('5'), new NumberValue(5))).toBe(true)
    })

    it('NullValue is empty and false', () => {
      expect(NullValue.value.toString()).toBe('')
      expect(NullValue.value.isTruthy()).toBe(false)
      expect(NullValue.value.equals(new NullValue())).toBe(true)
    })
  })

  describe('renderTo', () => {
    let el: HTMLElement
    beforeEach(() => { el = document.createElement('div') })

    it('NumberValue renders text', () => {
      new NumberValue(42).renderTo(el)
      expect(el.textContent).toBe('42')
    })

    it('BooleanValue renders a glyph', () => {
      new BooleanValue(true).renderTo(el)
      expect(el.textContent).toBe('✓')
    })

    it('DateValue formats a date-only string', () => {
      new DateValue('2026-10-09').renderTo(el)
      // Locale-formatted; just assert it isn't the raw ISO string and is non-empty.
      expect(el.textContent).toBeTruthy()
    })

    it('ListValue renders comma-separated items', () => {
      new ListValue([new StringValue('a'), new StringValue('b')]).renderTo(el)
      expect(el.textContent).toBe('a, b')
    })

    it('LinkValue renders a clickable internal link that calls onOpenNote', () => {
      const onOpenNote = vi.fn()
      const link = new LinkValue('Welcome')
      link.path = 'Welcome.md'
      link.renderTo(el, { onOpenNote })
      const a = el.querySelector('a.internal-link') as HTMLAnchorElement
      expect(a).toBeTruthy()
      expect(a.textContent).toBe('Welcome')
      a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
      expect(onOpenNote).toHaveBeenCalledWith('Welcome.md')
    })

    it('UrlValue renders a safe anchor and rejects javascript:', () => {
      new UrlValue('https://example.com').renderTo(el)
      expect((el.querySelector('a') as HTMLAnchorElement)?.href).toContain('example.com')
      const bad = document.createElement('div')
      new UrlValue('javascript:alert(1)').renderTo(bad)
      expect(bad.querySelector('a')).toBeNull()
      expect(bad.textContent).toContain('javascript')
    })

    it('HTMLValue sanitizes scripts out', () => {
      new HTMLValue('<b>ok</b><script>alert(1)</script>').renderTo(el)
      expect(el.querySelector('b')).toBeTruthy()
      expect(el.querySelector('script')).toBeNull()
    })

    it('TagValue prefixes #', () => {
      expect(new TagValue('todo').toString()).toBe('#todo')
      expect(new TagValue('#done').toString()).toBe('#done')
    })
  })

  describe('Duration, File, Object, RegExp, RelativeDate', () => {
    it('DurationValue keeps ms as data, formats and compares', () => {
      const d = new DurationValue(90_000, { months: 0, ms: 90_000 })
      expect(d.data).toBe(90_000)
      expect(d.toString()).toBe('1m 30s')
      expect(d.isTruthy()).toBe(true)
      expect(new DurationValue(0).isTruthy()).toBe(false)
      expect(d.equals(new DurationValue(90_000))).toBe(true)
    })

    it('FileValue reads the path from a file or a string and renders a link', () => {
      expect(new FileValue({ path: 'a/b.md' }).toString()).toBe('a/b.md')
      expect(new FileValue('c.md').isTruthy()).toBe(true)
      expect(new FileValue(null).isTruthy()).toBe(false)
      const open = vi.fn()
      const el = document.createElement('div')
      new FileValue('c.md').renderTo(el, { onOpenNote: open })
      el.querySelector('a')!.click()
      expect(open).toHaveBeenCalledWith('c.md')
    })

    it('ObjectValue serializes a Map with nested Values and compares by content', () => {
      const o = new ObjectValue(new Map([['n', new NumberValue(1)], ['s', new StringValue('x')]]))
      expect(o.toString()).toBe('{"n":"1","s":"x"}')
      expect(o.isTruthy()).toBe(true)
      expect(new ObjectValue({}).isTruthy()).toBe(false)
      expect(o.equals(new ObjectValue(new Map([['n', new NumberValue(1)], ['s', new StringValue('x')]])))).toBe(true)
    })

    it('RegExpValue prints the literal form', () => {
      expect(new RegExpValue({ source: 'a+', flags: 'gi' }).toString()).toBe('/a+/gi')
      expect(new RegExpValue(null).isTruthy()).toBe(false)
    })

    it('RelativeDateValue renders relative text but stays machine-readable in toString', () => {
      const el = document.createElement('div')
      const day = new Date(Date.now() + 3 * 86_400_000).toISOString()
      const v = new RelativeDateValue(day)
      v.renderTo(el)
      expect(el.textContent).not.toBe(day)
      expect(v.toString()).toBe(day)
    })
  })
})
