/** Extensions that are inserted as an embed (`![[...]]`) rather than a plain link. */
const EMBEDDABLE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.pdf']

/** Whether a file name has an extension that should be embedded rather than linked. */
export function isEmbeddableFile(fileName: string): boolean {
  const lower = fileName.toLowerCase()
  return EMBEDDABLE_EXTENSIONS.some((ext) => lower.endsWith(ext))
}

/**
 * Builds the wikilink (or embed) text to insert for a file dropped from the File
 * Explorer. Markdown files link without their `.md` extension, matching how the
 * wikilink resolver looks targets up; all other file types keep their extension.
 */
export function buildInternalLinkText(fileName: string): string {
  const target = fileName.toLowerCase().endsWith('.md') ? fileName.slice(0, -3) : fileName
  return isEmbeddableFile(fileName) ? `![[${target}]]` : `[[${target}]]`
}
