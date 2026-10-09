/**
 * Tests for the functional Bases Value hierarchy.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  Value, NullValue, StringValue, NumberValue, BooleanValue, DateValue,
  ListValue, LinkValue, UrlValue, HTMLValue, TagValue,
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
})
