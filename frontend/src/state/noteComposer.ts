/**
 * Shared logic for the `note-composer:*` commands (`split-file`,
 * `extract-heading`, `merge-file`) — cutting a range of the active document
 * into a new file, linked back from where it was cut.
 */
import type { EditorView } from '@codemirror/view'
import type { IApiClient } from '../api'
import type { DirectoryTree } from '../types'
import { resolveWikilinkTarget } from '../plugins/link-resolver'

/**
 * Matches a single `[[...]]` wikilink in raw Markdown and splits its inner body
 * into target / `#heading` or `#^block` / `|display` parts without losing the
 * exact original text. Capture 1 is the whole `[[...]]`, capture 2 the inner
 * body. We decompose the body ourselves (rather than reconstructing the link
 * from parsed fields) so the replacement edits only the target segment and the
 * rest of the link — heading, block ref, alias, and any spacing — survives
 * byte-for-byte. An image embed (`![[...]]`) is excluded via the leading `(?<!!)`.
 */
const WIKILINK_TOKEN_REGEX = /(?<!!)\[\[([^\]]+)\]\]/g

/** A character-offset range plus the heading text it was found under (if any). */
export interface HeadingSectionRange {
  from: number
  to: number
  headingText: string
}

const HEADING_LINE_REGEX = /^(#{1,6})\s+(.+?)\s*#*$/

/**
 * Finds the Markdown heading at or above the cursor and the span of its
 * section — the heading line through the line before the next heading of the
 * same or higher level (fewer or equal `#`s), or end of document. Mirrors
 * core-commands-app.ts's `findHeadingBeforeCursor`'s upward line walk, then
 * extends it downward to find the section's end.
 */
export function findHeadingSectionAtCursor(view: EditorView): HeadingSectionRange | null {
  const doc = view.state.doc
  const cursorLine = doc.lineAt(view.state.selection.main.head).number

  let headingLineNo = -1
  let headingLevel = 0
  let headingText = ''
  for (let lineNo = cursorLine; lineNo >= 1; lineNo--) {
    const match = HEADING_LINE_REGEX.exec(doc.line(lineNo).text)
    if (match) {
      headingLineNo = lineNo
      headingLevel = match[1]!.length
      headingText = match[2]!.trim()
      break
    }
  }
  if (headingLineNo === -1) return null

  let endLineNo = doc.lines
  for (let lineNo = headingLineNo + 1; lineNo <= doc.lines; lineNo++) {
    const match = /^(#{1,6})\s+/.exec(doc.line(lineNo).text)
    if (match && match[1]!.length <= headingLevel) {
      endLineNo = lineNo - 1
      break
    }
  }

  return { from: doc.line(headingLineNo).from, to: doc.line(endLineNo).to, headingText }
}

/**
 * Turns heading text into a filesystem-safe filename: strips characters
 * invalid in vault paths and collapses whitespace.
 */
export function sanitizeFileNameFromHeading(headingText: string): string {
  const cleaned = headingText.replace(/[/\\:*?"<>|]/g, '').replace(/\s+/g, ' ').trim()
  return cleaned === '' ? 'Untitled' : cleaned
}

/**
 * Rewrites bare-name wikilinks in extracted content so they still point at the
 * same file from the new note's location (Obsidian 1.13 "update links on
 * extract"). A bare `[[Note]]` resolves against the vault via same-folder →
 * shortest-path → alphabetical disambiguation (`resolveWikilinkTarget`); moving
 * the text to a note in a different folder can change which file that bare name
 * resolves to. For every wikilink whose resolution from `sourcePath` differs
 * from its resolution from `newPath`, the target is rewritten to the explicit
 * resolved path (minus the `.md` extension), which is unambiguous from anywhere.
 *
 * Links that already resolve identically from both locations — the common case,
 * and always true when the new note stays in the source folder — are left
 * exactly as written. Display text, headings and block refs are preserved.
 *
 * @param content - The extracted Markdown.
 * @param sourcePath - Path of the note the content came from.
 * @param newPath - Path of the new note the content is moving to.
 * @param tree - The vault directory tree used for resolution; when null, nothing is rewritten.
 * @returns The content with any now-ambiguous links made explicit.
 */
export function rewriteExtractedLinks(
  content: string,
  sourcePath: string,
  newPath: string,
  tree: DirectoryTree | null,
): string {
  if (!tree) return content

  // Scan the raw `[[...]]` tokens directly instead of reconstructing each link
  // from parsed fields. Reconstruction silently failed to match (and so left
  // the link unchanged) whenever the original differed from the rebuilt string
  // — most visibly for links carrying a `#heading` or `|alias`. Editing only
  // the target segment of the real matched text makes the rewrite exact.
  return content.replace(WIKILINK_TOKEN_REGEX, (whole, body: string) => {
    // Split the inner body into target + the trailing `#heading`/`#^block`/`|alias`.
    // The alias (`|...`) always comes last; a `#` before it is the heading/block.
    const pipeIndex = body.indexOf('|')
    const beforeAlias = pipeIndex === -1 ? body : body.slice(0, pipeIndex)
    const aliasPart = pipeIndex === -1 ? '' : body.slice(pipeIndex) // includes the leading `|`

    const hashIndex = beforeAlias.indexOf('#')
    const target = hashIndex === -1 ? beforeAlias : beforeAlias.slice(0, hashIndex)
    const headingPart = hashIndex === -1 ? '' : beforeAlias.slice(hashIndex) // includes the leading `#`

    // Path-qualified links (containing `/`) are already unambiguous.
    const trimmedTarget = target.trim()
    if (trimmedTarget === '' || trimmedTarget.includes('/')) return whole

    const fromSource = resolveWikilinkTarget(trimmedTarget, tree, sourcePath)
    const fromNew = resolveWikilinkTarget(trimmedTarget, tree, newPath)
    if (!fromSource || fromSource === fromNew) return whole

    // Resolution changed: pin the link to the file it meant in the source note.
    const explicit = fromSource.replace(/\.md$/i, '')
    return `[[${explicit}${headingPart}${aliasPart}]]`
  })
}

/**
 * Cuts `range` out of `view`'s document, replaces it with a `[[fileName]]`
 * link, and creates a new file at `fileName` (same directory as `sourcePath`)
 * containing the cut text. Used by both `split-file` and `extract-heading` —
 * they differ only in how `range` and `fileName` are computed.
 *
 * When `tree` is supplied, bare-name wikilinks inside the cut text that would
 * resolve differently from the new file's location are rewritten to explicit
 * paths (Obsidian 1.13 "update links on extract"). Omit `tree` to skip that.
 */
export async function extractRangeToNewFile(
  view: EditorView,
  range: { from: number; to: number },
  sourcePath: string,
  fileName: string,
  vaultId: string,
  apiClient: IApiClient,
  tree?: DirectoryTree | null,
): Promise<void> {
  const extracted = view.state.doc.sliceString(range.from, range.to)
  const dir = sourcePath.includes('/') ? sourcePath.slice(0, sourcePath.lastIndexOf('/') + 1) : ''
  const baseName = fileName.endsWith('.md') ? fileName.slice(0, -3) : fileName
  const newPath = `${dir}${baseName}.md`

  const toWrite = tree === undefined ? extracted : rewriteExtractedLinks(extracted, sourcePath, newPath, tree)
  await apiClient.saveFile(vaultId, newPath, toWrite)
  view.dispatch({ changes: { from: range.from, to: range.to, insert: `[[${baseName}]]` } })
}
