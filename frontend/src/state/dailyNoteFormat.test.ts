import { describe, expect, it } from 'vitest'
import {
  DEFAULT_DAILY_NOTE_FORMAT,
  dailyNoteDate,
  dailyNoteName,
  effectiveDailyNoteFormat,
  validateDailyNoteFormat,
} from './dailyNoteFormat'

describe('dailyNoteName', () => {
  it('names notes YYYY-MM-DD without a format, like before', () => {
    expect(dailyNoteName('2026-10-31', null)).toBe('2026-10-31')
    expect(dailyNoteName('2026-10-31', '')).toBe('2026-10-31')
    expect(effectiveDailyNoteFormat(undefined)).toBe(DEFAULT_DAILY_NOTE_FORMAT)
  })

  it('formats with the patterns Obsidian users write', () => {
    expect(dailyNoteName('2026-10-31', 'YYYY/MM/YYYY-MM-DD')).toBe('2026/10/2026-10-31')
    expect(dailyNoteName('2024-03-05', 'MM月/MM-DD ddd')).toMatch(/^03月\/03-05 /)
    expect(dailyNoteName('2026-10-31', '[Journal] YYYY-MM-DD')).toBe('Journal 2026-10-31')
    expect(dailyNoteName('2026-10-31', 'gggg-[W]WW')).toBe('2026-W44')
  })

  it('uses the local calendar day, not UTC', () => {
    expect(dailyNoteName('2026-03-29', 'DD.MM.YYYY')).toBe('29.03.2026')
  })
})

describe('dailyNoteDate', () => {
  it('finds the date again, with or without .md and with sub folders', () => {
    expect(dailyNoteDate('2026-10-31.md', null)).toBe('2026-10-31')
    expect(dailyNoteDate('2026/10/2026-10-31.md', 'YYYY/MM/YYYY-MM-DD')).toBe('2026-10-31')
    expect(dailyNoteDate('31.10.2026', 'DD.MM.YYYY')).toBe('2026-10-31')
  })

  it('is null for a note that does not match the pattern', () => {
    expect(dailyNoteDate('Meeting.md', null)).toBeNull()
    expect(dailyNoteDate('2026-13-45.md', null)).toBeNull()
    expect(dailyNoteDate('2026/10/2026-10-31.md', 'YYYY-MM-DD')).toBeNull()
  })
})

describe('validateDailyNoteFormat', () => {
  it('accepts normal patterns', () => {
    for (const format of ['YYYY-MM-DD', 'YYYY/MM/YYYY-MM-DD', 'DD.MM.YYYY', '[Journal] YYYY-MM-DD', 'MM月/MM-DD ddd']) {
      expect(validateDailyNoteFormat(format), format).toBeNull()
    }
  })

  it('refuses an empty pattern and one without a date', () => {
    expect(validateDailyNoteFormat('')).toMatch(/leer/)
    expect(validateDailyNoteFormat('[Tagebuch]')).toMatch(/Datumsangaben/)
    expect(validateDailyNoteFormat('YYYY')).toMatch(/Datumsangaben/)
  })

  it('refuses names that are not safe relative paths', () => {
    expect(validateDailyNoteFormat('[../]YYYY')).not.toBeNull()
    expect(validateDailyNoteFormat('/YYYY-MM-DD')).not.toBeNull()
    expect(validateDailyNoteFormat('YYYY//MM-DD')).not.toBeNull()
    expect(validateDailyNoteFormat('YYYY-MM-DD[:]')).not.toBeNull()
    expect(validateDailyNoteFormat('[a\\b]YYYY-MM-DD')).not.toBeNull()
    expect(validateDailyNoteFormat('YYYY-MM-DD[ ]')).not.toBeNull()
    expect(validateDailyNoteFormat('x'.repeat(129))).not.toBeNull()
  })
})
