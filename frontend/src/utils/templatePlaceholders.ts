/**
 * Client-side rendering of the placeholders Slatebase templates support.
 *
 * The "new note from template" flow goes through the server
 * (`POST /templates/create`), which substitutes these itself. "Vorlage
 * einfügen" never writes a file, so it reads the template's raw text and has
 * to render the placeholders here — through the same `renderTemplatePlaceholders`
 * (`shared-contracts`) that `TemplateService.replacePlaceholders` uses.
 *
 * @module utils/templatePlaceholders
 */

import { renderTemplatePlaceholders } from '@slatebase/shared-contracts'

/**
 * Replaces `{{title}}`, `{{date}}`/`{{time}}` and `{{date:FORMAT}}`/`{{time:FORMAT}}`
 * (Moment formats) in template text. Unrecognized `{{...}}` placeholders are left as-is.
 * The implementation is shared with the backend (`shared-contracts`), so both paths
 * cannot drift.
 *
 * @param content - Raw template text.
 * @param title - Value for `{{title}}` — usually the target note's name.
 * @param now - Clock to read the date/time placeholders from (injectable for tests).
 */
export function substituteTemplatePlaceholders(content: string, title: string, now: Date = new Date()): string {
  return renderTemplatePlaceholders(content, title, now)
}
