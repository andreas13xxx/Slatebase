/**
 * Localized display labels for the slash-command menu, keyed by the stable,
 * language-independent slash-command id. Same pattern as
 * `plugins/compat/core-command-i18n.ts`: the ids stay fixed (the actions resolve
 * by id / by the core-command id they delegate to), only the label shown in the
 * menu is translated.
 *
 * @module editor/slash/slash-command-i18n
 */

/** Supported UI locales for slash-command labels. */
export type SlashLocale = 'de' | 'en'

interface LabelPair {
  de: string
  en: string
}

/**
 * DE/EN labels per slash-command id. A missing id falls back to the id itself
 * in `getSlashLabel`, so an untranslated entry is visible rather than blank.
 */
const SLASH_LABELS: Record<string, LabelPair> = {
  'slash:heading-1': { de: 'Überschrift 1', en: 'Heading 1' },
  'slash:heading-2': { de: 'Überschrift 2', en: 'Heading 2' },
  'slash:heading-3': { de: 'Überschrift 3', en: 'Heading 3' },
  'slash:bullet-list': { de: 'Aufzählung', en: 'Bullet list' },
  'slash:numbered-list': { de: 'Nummerierte Liste', en: 'Numbered list' },
  'slash:task-list': { de: 'Aufgabenliste', en: 'Task list' },
  'slash:blockquote': { de: 'Zitat', en: 'Quote' },
  'slash:code-block': { de: 'Codeblock', en: 'Code block' },
  'slash:callout': { de: 'Callout', en: 'Callout' },
  'slash:table': { de: 'Tabelle', en: 'Table' },
  'slash:horizontal-rule': { de: 'Trennlinie', en: 'Horizontal rule' },
  'slash:internal-link': { de: 'Interner Link', en: 'Internal link' },
  'slash:template': { de: 'Vorlage einfügen', en: 'Insert template' },
  'slash:date': { de: 'Datum einfügen', en: 'Insert date' },
  'slash:time': { de: 'Zeit einfügen', en: 'Insert time' },
}

/**
 * Resolve the display label for a slash-command id in the given locale.
 * Falls back to the id itself if no label is registered.
 */
export function getSlashLabel(id: string, locale: SlashLocale): string {
  const pair = SLASH_LABELS[id]
  if (!pair) return id
  return locale === 'de' ? pair.de : pair.en
}
