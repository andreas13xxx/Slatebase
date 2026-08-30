/**
 * Client-side rendering of the placeholders Slatebase templates support.
 *
 * The "new note from template" flow goes through the server
 * (`POST /templates/create`), which substitutes these itself. "Vorlage
 * einfügen" never writes a file, so it reads the template's raw text and has
 * to render the placeholders here — kept deliberately in step with
 * `TemplateService.replacePlaceholders` (backend/src/template/template-service.ts).
 *
 * @module utils/templatePlaceholders
 */

/**
 * Replaces `{{date}}`, `{{time}}` and `{{title}}` in template text.
 * Unrecognized `{{...}}` placeholders are left as-is, matching the backend.
 *
 * @param content - Raw template text.
 * @param title - Value for `{{title}}` — usually the target note's name.
 * @param now - Clock to read `{{date}}`/`{{time}}` from (injectable for tests).
 */
export function substituteTemplatePlaceholders(content: string, title: string, now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  const time = `${pad(now.getHours())}:${pad(now.getMinutes())}`

  return content
    .replace(/\{\{date\}\}/g, date)
    .replace(/\{\{time\}\}/g, time)
    .replace(/\{\{title\}\}/g, title)
}
