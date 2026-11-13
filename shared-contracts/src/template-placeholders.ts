/**
 * Rendering of the placeholders Slatebase templates support — one implementation
 * for the server (`TemplateService`, "new note from template") and the client
 * ("Insert template", which never writes a file).
 *
 * Supported (Obsidian core Templates syntax):
 * - `{{title}}`          — the target note's name
 * - `{{date}}`           — `YYYY-MM-DD`
 * - `{{time}}`           — `HH:mm`
 * - `{{date:FORMAT}}`    — date in a Moment.js format, e.g. `{{date:dddd, D. MMMM YYYY}}`
 * - `{{time:FORMAT}}`    — time in a Moment.js format, e.g. `{{time:HH:mm:ss}}`
 *
 * Unrecognized `{{...}}` text is left as-is. Everything is substituted in ONE pass, so a
 * title that itself contains `{{date}}` is not expanded a second time.
 *
 * @module template-placeholders
 */
import moment from 'moment'

/** Default format of a bare `{{date}}`. */
export const DEFAULT_TEMPLATE_DATE_FORMAT = 'YYYY-MM-DD'

/** Default format of a bare `{{time}}`. */
export const DEFAULT_TEMPLATE_TIME_FORMAT = 'HH:mm'

/** Longest accepted `FORMAT`; longer ones stay literal text (a template is not a place for megabyte formats). */
export const MAX_TEMPLATE_FORMAT_LENGTH = 100

const PLACEHOLDER_RE = /\{\{(title|date|time)(?::([^{}\n]*))?\}\}/g

/**
 * Replaces the supported placeholders in template text.
 *
 * @param content - Raw template text.
 * @param title - Value for `{{title}}` — usually the target note's name.
 * @param now - Clock the date/time placeholders read from (injectable for tests).
 * @returns The rendered text.
 */
export function renderTemplatePlaceholders(content: string, title: string, now: Date = new Date()): string {
  const clock = moment(now).locale('en')

  return content.replace(PLACEHOLDER_RE, (match, name: string, format: string | undefined) => {
    if (name === 'title') {
      // `{{title:...}}` is not a thing — leave it alone rather than guess.
      return format === undefined ? title : match
    }
    if (format === undefined) {
      return clock.format(name === 'date' ? DEFAULT_TEMPLATE_DATE_FORMAT : DEFAULT_TEMPLATE_TIME_FORMAT)
    }
    if (format.length === 0 || format.length > MAX_TEMPLATE_FORMAT_LENGTH) return match
    return clock.format(format)
  })
}
