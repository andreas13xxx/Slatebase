/**
 * Link-text generation shared by `MetadataCache.fileToLinktext()` and
 * `FileManager.generateMarkdownLink()`.
 *
 * Mirrors Obsidian's `newLinkFormat` setting:
 * - `shortest`: the file name when it is unique in the vault, else the full path
 * - `relative`: path relative to the folder of the linking note
 * - `absolute`: full vault path
 *
 * The `.md` extension is dropped for markdown files when requested; every other
 * extension is kept, since `[[image]]` does not resolve to `image.png`.
 *
 * @module link-text
 */

/** Obsidian's `newLinkFormat` vault setting. */
export type NewLinkFormat = 'shortest' | 'relative' | 'absolute'

/** The subset of `TFile` link-text generation needs. */
export interface LinkTarget {
  path: string
  name: string
  extension: string
}

/** Normalize an unknown config value to a known link format (default `shortest`). */
export function toNewLinkFormat(value: unknown): NewLinkFormat {
  return value === 'relative' || value === 'absolute' ? value : 'shortest'
}

function dirOf(path: string): string {
  const slash = path.lastIndexOf('/')
  return slash === -1 ? '' : path.slice(0, slash)
}

function nameOf(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1)
}

/** Path of `target` relative to the folder `fromDir` (both vault-relative). */
function relativePath(fromDir: string, target: string): string {
  const from = fromDir ? fromDir.split('/') : []
  const to = target.split('/')
  let common = 0
  while (common < from.length && common < to.length - 1 && from[common] === to[common]) common++
  const ups = from.length - common
  return [...Array<string>(ups).fill('..'), ...to.slice(common)].join('/')
}

/**
 * Compute the link path for `file` as seen from the note at `sourcePath`.
 *
 * @param allPaths - Vault-relative paths of every file, used to detect name clashes
 *                   for the `shortest` format
 */
export function computeLinkpath(
  file: LinkTarget,
  sourcePath: string,
  allPaths: readonly string[],
  format: NewLinkFormat,
  omitMdExtension: boolean,
): string {
  let linkpath: string
  if (format === 'absolute') {
    linkpath = file.path
  } else if (format === 'relative') {
    linkpath = relativePath(dirOf(sourcePath), file.path)
  } else {
    const lower = file.name.toLowerCase()
    const clash = allPaths.some((p) => p !== file.path && nameOf(p).toLowerCase() === lower)
    linkpath = clash ? file.path : file.name
  }

  if (omitMdExtension && file.extension === 'md' && linkpath.endsWith('.md')) {
    linkpath = linkpath.slice(0, -3)
  }
  return linkpath
}
