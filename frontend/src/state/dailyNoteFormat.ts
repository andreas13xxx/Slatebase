/**
 * dailyNoteFormat — names and finds daily notes by the Moment pattern in the vault's
 * `.obsidian/daily-notes.json` (`format`). Obsidian's pattern is a Moment pattern, so the real
 * Moment is used: every token Obsidian users write works the same. A `/` in the pattern puts the
 * note into sub folders (`YYYY/MM/YYYY-MM-DD`).
 *
 * @module state/dailyNoteFormat
 */

import moment from 'moment/min/moment-with-locales'
import { translateNow } from '../i18n'

/** Obsidian's default, used when the file has no `format`. */
export const DEFAULT_DAILY_NOTE_FORMAT = 'YYYY-MM-DD'

/** Names an operating system accepts for a file. */
const MAX_SEGMENT_LENGTH = 255
// eslint-disable-next-line no-control-regex -- control characters are exactly what a file name must not have
const FORBIDDEN_IN_NAME = /[\u0000-\u001f<>:"|?*\\]/

/** ISO date `YYYY-MM-DD` of a local calendar day, the form dates are passed around in. */
const ISO = 'YYYY-MM-DD'

/** The pattern as the file says it (trimmed), or the default if it has none. Not checked for safety. */
export function effectiveDailyNoteFormat(format: string | null | undefined): string {
  const trimmed = format?.trim() ?? ''
  return trimmed !== '' ? trimmed : DEFAULT_DAILY_NOTE_FORMAT
}

const warnedFormats = new Set<string>()

/**
 * The pattern notes are really named by: the file's if it can name notes safely, else the default
 * (with one console warning per pattern). Every place that names or finds daily notes goes through
 * this, so a hand-written bad pattern cannot make them disagree.
 */
export function usableDailyNoteFormat(format: string | null | undefined): string {
  const effective = effectiveDailyNoteFormat(format)
  if (effective === DEFAULT_DAILY_NOTE_FORMAT) return effective
  const problem = validateDailyNoteFormat(effective)
  if (problem === null) return effective
  if (!warnedFormats.has(effective)) {
    warnedFormats.add(effective)
    console.warn(`[daily-notes] format ${JSON.stringify(effective)} in daily-notes.json cannot name notes (${problem}); using ${DEFAULT_DAILY_NOTE_FORMAT}`)
  }
  return DEFAULT_DAILY_NOTE_FORMAT
}

/**
 * Why `format` cannot name daily notes, or null if it can. A pattern is refused if it yields a name
 * that is not a safe relative path, or the same name for different days.
 */
export function validateDailyNoteFormat(format: string): string | null {
  if (format.trim() === '') return translateNow('commonUi.c_dn_empty')
  if (format.length > 128) return translateNow('commonUi.c_dn_long')

  // Neighbours in every unit a pattern can leave out: next day, next month, next year, and a far day.
  const samples = ['2026-01-01', '2026-01-02', '2026-02-01', '2027-01-01', '2028-12-31', '2026-07-15']
  const names = samples.map((day) => moment(day, ISO).format(format))
  for (const name of names) {
    if (name.startsWith('/') || name.endsWith('/')) return translateNow('commonUi.c_dn_slash')
    for (const segment of name.split('/')) {
      if (segment === '' ) return translateNow('commonUi.c_dn_emptyFolder')
      if (segment === '.' || segment === '..') return translateNow('commonUi.c_dn_dots')
      if (FORBIDDEN_IN_NAME.test(segment)) return translateNow('commonUi.c_dn_badChar')
      if (segment.length > MAX_SEGMENT_LENGTH) return translateNow('commonUi.c_dn_segLong')
      if (segment !== segment.trim() || segment.endsWith('.')) return translateNow('commonUi.c_dn_segSpace')
    }
  }
  if (new Set(names).size !== names.length) return translateNow('commonUi.c_dn_notEnough')
  return null
}

/** Name of the daily note for `isoDate` (`YYYY-MM-DD`), without `.md`, possibly with sub folders. */
export function dailyNoteName(isoDate: string, format: string | null | undefined): string {
  return moment(isoDate, ISO).format(usableDailyNoteFormat(format))
}

/**
 * The date a daily note is for, from its path relative to the daily notes folder (with or without
 * `.md`), or null if the path does not match the pattern.
 */
export function dailyNoteDate(relativePath: string, format: string | null | undefined): string | null {
  const name = relativePath.replace(/\.md$/i, '')
  const parsed = moment(name, usableDailyNoteFormat(format), true)
  return parsed.isValid() ? parsed.format(ISO) : null
}
