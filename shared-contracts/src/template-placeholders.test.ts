import { describe, it, expect } from 'vitest'
import { renderTemplatePlaceholders } from './template-placeholders.js'

const NOW = new Date(2026, 10, 13, 9, 5, 7) // Fri 13 Nov 2026 09:05:07 local

describe('renderTemplatePlaceholders', () => {
  it('renders the bare placeholders with the default formats', () => {
    expect(renderTemplatePlaceholders('{{title}} {{date}} {{time}}', 'Note', NOW)).toBe('Note 2026-11-13 09:05')
  })

  it('renders {{date:FORMAT}} and {{time:FORMAT}} as Moment formats', () => {
    expect(renderTemplatePlaceholders('{{date:dddd, D MMMM YYYY}}', 'n', NOW)).toBe('Friday, 13 November 2026')
    expect(renderTemplatePlaceholders('{{date:YYYYMMDD}}-{{time:HH:mm:ss}}', 'n', NOW)).toBe('20261113-09:05:07')
  })

  it('leaves unknown, empty and oversized placeholders untouched', () => {
    expect(renderTemplatePlaceholders('{{foo}} {{date:}} {{title:x}}', 'n', NOW)).toBe('{{foo}} {{date:}} {{title:x}}')
    const long = 'Y'.repeat(101)
    expect(renderTemplatePlaceholders(`{{date:${long}}}`, 'n', NOW)).toBe(`{{date:${long}}}`)
  })

  it('does not expand placeholders contained in the title, nor treat $ specially', () => {
    expect(renderTemplatePlaceholders('# {{title}}', '{{date}} $& $1', NOW)).toBe('# {{date}} $& $1')
  })

  it('accepts bracket-escaped literals containing braces', () => {
    expect(renderTemplatePlaceholders('{{date:[Week }]W}}', 'n', NOW)).toBe('Week }46')
  })

  it('renders day and month names in the requested locale without leaking it globally', () => {
    expect(renderTemplatePlaceholders('{{date:dddd, D. MMMM YYYY}}', 'n', NOW, 'de')).toBe('Freitag, 13. November 2026')
    expect(renderTemplatePlaceholders('{{date:dddd}}', 'n', NOW)).toBe('Friday')
  })

  it('leaves the text untouched for an invalid clock', () => {
    expect(renderTemplatePlaceholders('{{date}} {{title}}', 'n', new Date(NaN))).toBe('{{date}} {{title}}')
  })
})

describe('renderTemplatePlaceholders — pathological input', () => {
  it('stays fast on many unterminated placeholders', () => {
    const evil = '{{date:['.repeat(20000)
    const start = Date.now()
    expect(renderTemplatePlaceholders(evil, 'n', NOW)).toBe(evil)
    expect(Date.now() - start).toBeLessThan(1000)
  })
})
