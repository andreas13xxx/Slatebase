/**
 * Enhanced wikilink target resolution against a vault's DirectoryTree.
 *
 * Resolution strategy:
 * 1. If target is empty or tree is null → return null
 * 2. Collect all files from tree in depth-first, alphabetical order
 * 3. If target contains `/` → resolve as relative path (case-insensitive, with .md fallback)
 * 4. Try exact match (case-insensitive) against file names
 * 5. Try with `.md` extension appended (case-insensitive)
 * 6. Return full relative path if found, null otherwise
 */

import type { DirectoryTree } from '../types'

/**
 * Resolves a wikilink target against the vault directory tree.
 *
 * Supports:
 * - Case-insensitive file name matching
 * - Automatic `.md` extension fallback
 * - Path-based resolution (e.g. `folder/file`)
 * - Depth-first alphabetical ordering for ambiguous matches
 *
 * @param target - The wikilink target string (e.g. "MyNote", "folder/note", "Note.md")
 * @param tree - The vault's directory tree, or null if unavailable
 * @returns The full relative path to the resolved file, or null if not found
 */
export function resolveWikilinkTarget(
  target: string,
  tree: DirectoryTree | null
): string | null {
  if (!tree || !target.trim()) return null

  const normalizedTarget = target.trim()

  // Collect all files (depth-first, alphabetical)
  const files = collectFilesSorted(tree)

  // If target contains path separator, resolve as relative path
  if (normalizedTarget.includes('/')) {
    return resolvePathTarget(normalizedTarget, files)
  }

  // Try exact match (case-insensitive) against file names
  const targetLower = normalizedTarget.toLowerCase()
  for (const file of files) {
    const nameLower = file.name.toLowerCase()
    if (nameLower === targetLower) return file.path
  }

  // Try with .md extension appended (case-insensitive)
  const targetWithMd = targetLower + '.md'
  for (const file of files) {
    const nameLower = file.name.toLowerCase()
    if (nameLower === targetWithMd) return file.path
  }

  return null
}

/**
 * Collects all files from a directory tree in depth-first, alphabetical order.
 *
 * Children at each level are sorted alphabetically by name before traversal.
 * Only entries with `type === 'file'` are included in the result.
 *
 * @param tree - The root directory tree node
 * @returns Array of file entries with name and path
 */
export function collectFilesSorted(tree: DirectoryTree): Array<{ name: string; path: string }> {
  const result: Array<{ name: string; path: string }> = []
  collectRecursive(tree, result)
  return result
}

function collectRecursive(
  node: DirectoryTree,
  result: Array<{ name: string; path: string }>
): void {
  if (node.type === 'file') {
    result.push({ name: node.name, path: node.path })
    return
  }

  // Directory: sort children alphabetically, then recurse
  if (node.children) {
    const sorted = [...node.children].sort((a, b) =>
      a.name.localeCompare(b.name)
    )
    for (const child of sorted) {
      collectRecursive(child, result)
    }
  }
}

/**
 * Resolves a path-based target (e.g. "folder/file") against the collected files.
 *
 * Performs case-insensitive matching against the full relative path.
 * Falls back to appending `.md` if no exact match is found.
 *
 * @param target - The path-based target string (contains `/`)
 * @param files - The collected files from the directory tree
 * @returns The resolved file path, or null if not found
 */
export function resolvePathTarget(
  target: string,
  files: Array<{ name: string; path: string }>
): string | null {
  const targetLower = target.toLowerCase()

  // Try exact path match (case-insensitive)
  for (const file of files) {
    if (file.path.toLowerCase() === targetLower) return file.path
  }

  // Try with .md extension appended (case-insensitive)
  const targetWithMd = targetLower + '.md'
  for (const file of files) {
    if (file.path.toLowerCase() === targetWithMd) return file.path
  }

  // Try matching against path suffix (for partial paths)
  for (const file of files) {
    const fileLower = file.path.toLowerCase()
    if (fileLower.endsWith('/' + targetLower) || fileLower === targetLower) {
      return file.path
    }
  }

  // Try suffix match with .md fallback
  const targetSuffixWithMd = '/' + targetWithMd
  for (const file of files) {
    const fileLower = file.path.toLowerCase()
    if (fileLower.endsWith(targetSuffixWithMd)) {
      return file.path
    }
  }

  return null
}
