/**
 * Where a new note goes, from the vault's `newFileLocation` / `newFileFolderPath` (app.json):
 * `root` the vault root, `current` the folder of the note that is open, `folder` a fixed folder.
 * A folder that does not exist falls back to the vault root, so creating a note never fails for it.
 */
import type { DirectoryTree } from '../types'

/** Whether `path` is a folder in the tree (the empty path is the root). */
export function folderExists(tree: DirectoryTree | null | undefined, path: string): boolean {
  if (path === '') return true
  let node: DirectoryTree | undefined = tree ?? undefined
  for (const segment of path.split('/')) {
    node = node?.children?.find((child) => child.type === 'directory' && child.name === segment)
    if (!node) return false
  }
  return true
}

/** A configured folder as a clean relative path: no leading/trailing slashes, no `.`/`..` segments. */
function normalizeFolder(path: string): string | null {
  const segments = path.split('/').map((s) => s.trim()).filter((s) => s !== '')
  if (segments.some((s) => s === '.' || s === '..')) return null
  return segments.join('/')
}

/** The folder a new note is created in, relative to the vault root. */
export function resolveNewNoteFolder(
  location: 'root' | 'current' | 'folder',
  folderPath: string,
  activeFilePath: string | null,
  tree: DirectoryTree | null | undefined,
): string {
  let candidate: string | null = ''
  if (location === 'folder') {
    candidate = normalizeFolder(folderPath)
  } else if (location === 'current' && activeFilePath && !activeFilePath.startsWith('__')) {
    const slash = activeFilePath.lastIndexOf('/')
    candidate = slash === -1 ? '' : activeFilePath.slice(0, slash)
  }
  return candidate !== null && folderExists(tree, candidate) ? candidate : ''
}
