import { describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_DAILY_NOTE_FORMAT,
  dailyNoteDate,
  dailyNoteName,
  effectiveDailyNoteFormat,
  usableDailyNoteFormat,
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
    expect(dailyNoteName('2026-10-31', 'gggg-[W]WW-E')).toBe('2026-W44-6')
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

describe('usableDailyNoteFormat', () => {
  it('trims a pattern and uses the default for an empty one', () => {
    expect(usableDailyNoteFormat(' DD.MM.YYYY ')).toBe('DD.MM.YYYY')
    expect(usableDailyNoteFormat('  ')).toBe(DEFAULT_DAILY_NOTE_FORMAT)
    expect(usableDailyNoteFormat(null)).toBe(DEFAULT_DAILY_NOTE_FORMAT)
  })

  it('falls back to the default, once with a warning, for a pattern that cannot name notes', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(usableDailyNoteFormat('[../]YYYY-MM-DD')).toBe(DEFAULT_DAILY_NOTE_FORMAT)
    expect(usableDailyNoteFormat('[../]YYYY-MM-DD')).toBe(DEFAULT_DAILY_NOTE_FORMAT)
    expect(warn).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })

  it('makes naming and finding agree for a bad pattern', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(dailyNoteName('2026-10-31', 'YYYY-MM')).toBe('2026-10-31')
    expect(dailyNoteDate('2026-10-31', 'YYYY-MM')).toBe('2026-10-31')
    warn.mockRestore()
  })
})

describe('validateDailyNoteFormat', () => {
  it('accepts normal patterns', () => {
    for (const format of ['YYYY-MM-DD', 'YYYY/MM/YYYY-MM-DD', 'DD.MM.YYYY', '[Journal] YYYY-MM-DD', 'MM月/MM-DD ddd']) {
      expect(validateDailyNoteFormat(format), format).toBeNull()
    }
  })

  it('refuses an empty pattern and one that leaves out the day, the month or the year', () => {
    expect(validateDailyNoteFormat('')).toMatch(/leer/)
    expect(validateDailyNoteFormat('[Tagebuch]')).toMatch(/Datumsangaben/)
    expect(validateDailyNoteFormat('YYYY')).toMatch(/Datumsangaben/)
    expect(validateDailyNoteFormat('YYYY-MM')).toMatch(/Datumsangaben/)
    expect(validateDailyNoteFormat('MM-DD')).toMatch(/Datumsangaben/)
    expect(validateDailyNoteFormat('DD')).toMatch(/Datumsangaben/)
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
