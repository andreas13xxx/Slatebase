// Unique Filename Generator Utility

import path from 'node:path'

/**
 * Generates a unique filename by appending a numeric suffix before the extension
 * if the desired name conflicts with existing files.
 *
 * @param desiredName - The filename to use (e.g., "photo.png")
 * @param existingNames - Set or array of filenames already in the target directory
 * @returns A unique filename (e.g., "photo-1.png" if "photo.png" exists)
 */
export function generateUniqueFilename(
  desiredName: string,
  existingNames: string[] | Set<string>
): string {
  const nameSet =
    existingNames instanceof Set ? existingNames : new Set(existingNames)

  if (!nameSet.has(desiredName)) {
    return desiredName
  }

  const ext = path.extname(desiredName)
  const stem = desiredName.slice(0, desiredName.length - ext.length)

  let counter = 1
  while (true) {
    const candidate = `${stem}-${counter}${ext}`
    if (!nameSet.has(candidate)) {
      return candidate
    }
    counter++
  }
}
