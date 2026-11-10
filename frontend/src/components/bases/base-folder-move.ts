/**
 * Kanban grouped by `file.folder` (Obsidian 1.14.2): a column is a folder, so
 * dragging a card to another column moves the note into that folder instead of
 * writing a property.
 */

/** Grouping property whose columns are folders. */
export const FOLDER_GROUP_PROPERTY = 'file.folder'

/** Header text of the column of notes in the vault root (empty `file.folder`). */
export const ROOT_FOLDER_LABEL = '(Wurzel)'

/**
 * Path of the note at `path` after moving it into `folder` ('' = vault root),
 * keeping its file name. Returns `null` when the note is already there.
 */
export function folderMoveTarget(path: string, folder: string): string | null {
  const slash = path.lastIndexOf('/')
  const fileName = slash === -1 ? path : path.slice(slash + 1)
  const currentFolder = slash === -1 ? '' : path.slice(0, slash)
  const cleanFolder = folder.replace(/^\/+|\/+$/g, '')
  if (currentFolder === cleanFolder) return null
  return cleanFolder === '' ? fileName : `${cleanFolder}/${fileName}`
}
