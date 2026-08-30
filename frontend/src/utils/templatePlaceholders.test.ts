import { describe, it, expect } from 'vitest'
import { substituteTemplatePlaceholders } from './templatePlaceholders'

const FIXED = new Date(2026, 7, 30, 9, 5) // 2026-08-30 09:05, local time

describe('substituteTemplatePlaceholders', () => {
  it('replaces date, time and title', () => {
    const result = substituteTemplatePlaceholders(
      '# {{title}}\n\nErstellt am {{date}} um {{time}}.',
      'Besprechung',
      FIXED,
    )
    expect(result).toBe('# Besprechung\n\nErstellt am 2026-08-30 um 09:05.')
  })

  it('replaces every occurrence', () => {
    expect(substituteTemplatePlaceholders('{{title}}/{{title}}', 'X', FIXED)).toBe('X/X')
  })

  it('leaves unknown placeholders untouched, matching the backend', () => {
    expect(substituteTemplatePlaceholders('{{author}} {{date}}', 'X', FIXED)).toBe('{{author}} 2026-08-30')
  })

  it('pads single-digit months, days, hours and minutes', () => {
    const early = new Date(2026, 0, 2, 3, 4)
    expect(substituteTemplatePlaceholders('{{date}} {{time}}', '', early)).toBe('2026-01-02 03:04')
  })

  it('returns content unchanged when there is nothing to substitute', () => {
    expect(substituteTemplatePlaceholders('Kein Platzhalter', 'X', FIXED)).toBe('Kein Platzhalter')
  })
})
