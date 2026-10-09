/**
 * Shared logic for the `note-composer:*` commands (`split-file`,
 * `extract-heading`, `merge-file`) — cutting a range of the active document
 * into a new file, linked back from where it was cut.
 */
import type { EditorView } from '@codemirror/view'
import type { IApiClient } from '../api'
import type { DirectoryTree } from '../types'
import { extractWikilinks } from '../plugins/wikilink/extract'
import { resolveWikilinkTarget } from '../plugins/link-resolver'

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

  let result = content
  // Rewrite from the end backwards so earlier offsets stay valid as we splice.
  const links = extractWikilinks(content)
  for (const link of links) {
    // Path-qualified links (containing `/`) are already unambiguous.
    if (link.target.includes('/')) continue

    const fromSource = resolveWikilinkTarget(link.target, tree, sourcePath)
    const fromNew = resolveWikilinkTarget(link.target, tree, newPath)
    if (!fromSource || fromSource === fromNew) continue

    // Resolution changed: pin the link to the file it meant in the source note.
    const explicit = fromSource.replace(/\.md$/i, '')
    const headingPart = link.heading ? `#${link.heading}` : link.blockRef ? `#^${link.blockRef}` : ''
    const displayPart = link.display && link.display !== link.target ? `|${link.display}` : ''
    const oldLink = `[[${link.target}${headingPart ? headingPart : ''}${displayPart}]]`
    const newLink = `[[${explicit}${headingPart}${displayPart}]]`
    // Replace the first occurrence of this exact link text that still appears.
    result = result.replace(oldLink, newLink)
  }
  return result
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
