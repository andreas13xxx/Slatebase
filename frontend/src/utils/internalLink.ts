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

/**
 * Resolves the vault-relative directory new attachments (drag-drop, paste,
 * "Insert attachment") should upload into.
 *
 * `attachmentFolderPath` is the vault's setting from `.obsidian/app.json`, written the way
 * Obsidian writes it:
 *   - `"/"`            the vault root
 *   - `""` or `"./"`   the folder of the open note (the default)
 *   - `"./name"`       the subfolder `name` of the open note's folder
 *   - anything else    that folder, relative to the vault root
 */
export function resolveAttachmentTargetDir(attachmentFolderPath: string, notePath: string): string {
  const configured = attachmentFolderPath.trim()
  const noteDir = notePath.includes('/') ? notePath.slice(0, notePath.lastIndexOf('/')) : ''
  if (configured === '/') return ''
  if (configured === '' || configured === './') return noteDir
  if (configured.startsWith('./')) {
    const sub = configured.slice(2).replace(/^\/+|\/+$/g, '')
    if (sub === '') return noteDir
    return noteDir ? `${noteDir}/${sub}` : sub
  }
  return configured.replace(/^\/+|\/+$/g, '')
}

/**
 * Turns the raw destination of a Markdown link (`[text](<./My note.md#Heading>)`) into a
 * vault-relative note path, or `null` when nothing is left (e.g. a pure `#anchor`).
 *
 * Handles what the Lezer tree leaves untouched: the `<…>` wrapper (needed for spaces), `%20`
 * escapes, a trailing `#anchor`, and `./` / `../` segments, which are relative to the folder
 * of the note holding the link. A path without extension gets `.md`, as Obsidian does.
 */
export function resolveMarkdownLinkTarget(rawUrl: string, sourcePath: string): string | null {
  let url = rawUrl.trim()
  if (url.startsWith('<') && url.endsWith('>')) url = url.slice(1, -1).trim()

  const hash = url.indexOf('#')
  if (hash !== -1) url = url.slice(0, hash)
  if (url === '') return null
  // Other schemes (javascript:, data:, mailto:, …) are no vault paths: hand them back untouched.
  if (/^[a-z][a-z0-9+.-]+:/i.test(url)) return rawUrl

  try {
    url = decodeURIComponent(url)
  } catch {
    // Malformed escape: keep the text as written.
  }
  url = url.replace(/\\/g, '/')

  const isVaultRooted = url.startsWith('/')
  const baseDir = !isVaultRooted && sourcePath.includes('/')
    ? sourcePath.slice(0, sourcePath.lastIndexOf('/')).split('/')
    : []
  const segments = [...baseDir]
  for (const part of url.split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') {
      segments.pop()
      continue
    }
    segments.push(part)
  }
  if (segments.length === 0) return null

  const resolved = segments.join('/')
  const last = segments[segments.length - 1] ?? ''
  return last.includes('.') ? resolved : `${resolved}.md`
}
