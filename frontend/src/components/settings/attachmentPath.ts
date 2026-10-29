/**
 * Obsidian's `attachmentFolderPath` as a mode plus the folder name that goes with it.
 *   "/"  vault root  |  "" or "./"  next to the note  |  "./name"  subfolder of the note's folder
 *   anything else  a folder relative to the vault root
 */
export type AttachmentMode = 'note' | 'root' | 'subfolder' | 'folder'

/** Splits `attachmentFolderPath` into a mode and the folder name that goes with it. */
export function parseAttachmentPath(path: string): { mode: AttachmentMode; name: string } {
  const trimmed = path.trim()
  if (trimmed === '/') return { mode: 'root', name: '' }
  if (trimmed === '' || trimmed === './') return { mode: 'note', name: '' }
  if (trimmed.startsWith('./')) return { mode: 'subfolder', name: trimmed.slice(2) }
  return { mode: 'folder', name: trimmed }
}

/** The inverse of {@link parseAttachmentPath}. */
export function buildAttachmentPath(mode: AttachmentMode, name: string): string {
  const folder = name.trim().replace(/^\/+|\/+$/g, '')
  switch (mode) {
    case 'root': return '/'
    case 'note': return './'
    case 'subfolder': return folder === '' ? './' : `./${folder}`
    case 'folder': return folder === '' ? '/' : folder
  }
}
