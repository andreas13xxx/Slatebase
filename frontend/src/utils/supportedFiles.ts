/**
 * Which files Slatebase can open, for the file explorer's `showUnsupportedFiles` filter (app.json).
 *
 * Obsidian hides files with an unknown extension from its explorer unless the setting is on. Slatebase
 * has always shown everything; this filter is opt-in, so turning the setting off hides the unknown
 * files, turning it on (or leaving the Slatebase default) shows them.
 *
 * Folders are never hidden — only files whose extension Slatebase cannot render.
 *
 * @module utils/supportedFiles
 */
import type { DirectoryTree } from '../types'
import { IMAGE_EXTENSIONS, PDF_EXTENSIONS, AUDIO_EXTENSIONS, VIDEO_EXTENSIONS } from '../plugins/types'

/** Extensions Slatebase opens in a tab (notes, boards, bases and the embeddable media types). */
const SUPPORTED_EXTENSIONS: ReadonlySet<string> = new Set([
  '.md',
  '.canvas',
  '.base',
  ...IMAGE_EXTENSIONS,
  ...PDF_EXTENSIONS,
  ...AUDIO_EXTENSIONS,
  ...VIDEO_EXTENSIONS,
])

/** Whether Slatebase can open a file with this name (by its extension). */
export function isSupportedFile(fileName: string): boolean {
  const dot = fileName.lastIndexOf('.')
  if (dot <= 0 || dot === fileName.length - 1) return false
  return SUPPORTED_EXTENSIONS.has(fileName.slice(dot).toLowerCase())
}

/**
 * Returns a copy of the tree with unsupported files removed. Directories are kept (even when empty
 * after filtering), so the folder structure stays. A new tree is returned; the input is not mutated.
 */
export function filterUnsupportedFiles(tree: DirectoryTree): DirectoryTree {
  if (tree.type !== 'directory' || !tree.children) return tree
  const children = tree.children
    .filter((child) => child.type === 'directory' || isSupportedFile(child.name))
    .map((child) => (child.type === 'directory' ? filterUnsupportedFiles(child) : child))
  return { ...tree, children }
}
