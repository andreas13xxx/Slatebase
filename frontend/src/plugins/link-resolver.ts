/**
 * Enhanced wikilink target resolution against a vault's DirectoryTree.
 *
 * Resolution strategy:
 * 1. If target is empty or tree is null → return null
 * 2. Collect all files from tree in depth-first, alphabetical order
 * 3. If target contains `/` → resolve as relative path (case-insensitive, with .md fallback)
 * 4. Collect every name match (with and without `.md` fallback) and disambiguate via
 *    `resolveAmbiguousMatch()`: same folder as the source file, then shortest path,
 *    then alphabetical (see Requirement 6 of navigation-link-polish)
 */

import type { DirectoryTree } from '../types'

/**
 * Resolves a wikilink target against the vault directory tree.
 *
 * Supports:
 * - Case-insensitive file name matching
 * - Automatic `.md` extension fallback
 * - Path-based resolution (e.g. `folder/file`)
 * - Deterministic disambiguation for multiple same-named files (see `resolveAmbiguousMatch`)
 *
 * @param target - The wikilink target string (e.g. "MyNote", "folder/note", "Note.md")
 * @param tree - The vault's directory tree, or null if unavailable
 * @param sourcePath - Path of the file the link appears in, used to prefer a same-folder
 *   match when the target name is ambiguous. Omit when the source file isn't known —
 *   resolution then falls back to shortest-path-then-alphabetical only.
 * @returns The full relative path to the resolved file, or null if not found
 */
export function resolveWikilinkTarget(
  target: string,
  tree: DirectoryTree | null,
  sourcePath?: string,
): string | null {
  const result = resolveWikilinkTargetWithAlternatives(target, tree, sourcePath)
  return result ? result.resolved.path : null
}

/**
 * Same as `resolveWikilinkTarget`, but also reports how many other files shared the
 * matched name — used to surface ambiguity in link tooltips (Requirement 6.6).
 */
export function resolveWikilinkTargetWithAlternatives(
  target: string,
  tree: DirectoryTree | null,
  sourcePath?: string,
): { resolved: FileCandidate; alternativeCount: number } | null {
  if (!tree || !target.trim()) return null

  const normalizedTarget = target.trim()

  // Collect all files (depth-first, alphabetical)
  const files = collectFilesSorted(tree)

  // If target contains path separator, resolve as relative path (paths are already
  // unambiguous by construction — no disambiguation needed).
  if (normalizedTarget.includes('/')) {
    const resolved = resolvePathTarget(normalizedTarget, files)
    return resolved ? { resolved: { name: resolved.split('/').pop() ?? resolved, path: resolved }, alternativeCount: 0 } : null
  }

  const targetLower = normalizedTarget.toLowerCase()

  // Exact-name matches take priority over the `.md`-appended fallback, matching the
  // original two-pass behavior — only fall back to `.md` candidates when there is no
  // bare-name match at all, so a coexisting "Note" and "Note.md" can't be treated as
  // ambiguous with each other.
  const exactCandidates = files.filter((file) => file.name.toLowerCase() === targetLower)
  if (exactCandidates.length > 0) {
    return resolveAmbiguousMatch(exactCandidates, sourcePath)
  }

  const targetWithMdLower = `${targetLower}.md`
  const mdCandidates = files.filter((file) => file.name.toLowerCase() === targetWithMdLower)
  if (mdCandidates.length === 0) return null

  return resolveAmbiguousMatch(mdCandidates, sourcePath)
}

/** A minimal file reference used throughout link resolution. */
export interface FileCandidate {
  name: string
  path: string
}

/**
 * Picks the best candidate among files that share a wikilink target name.
 *
 * Order of preference (Requirements 6.1–6.3):
 * 1. A candidate in the same folder as `sourcePath`, if any.
 * 2. The candidate with the shortest path (fewest `/`-separated segments).
 * 3. Alphabetical by full path, as a deterministic final tie-break.
 *
 * With exactly one candidate, this always returns that candidate unchanged
 * (Requirement 6.7 — single matches are unaffected by disambiguation).
 */
export function resolveAmbiguousMatch(
  candidates: FileCandidate[],
  sourcePath?: string,
): { resolved: FileCandidate; alternativeCount: number } {
  if (candidates.length === 1) {
    return { resolved: candidates[0]!, alternativeCount: 0 }
  }

  let pool = candidates

  if (sourcePath) {
    const sourceFolder = sourcePath.includes('/') ? sourcePath.slice(0, sourcePath.lastIndexOf('/')) : ''
    const sameFolder = pool.filter((c) => {
      const folder = c.path.includes('/') ? c.path.slice(0, c.path.lastIndexOf('/')) : ''
      return folder === sourceFolder
    })
    if (sameFolder.length > 0) pool = sameFolder
  }

  if (pool.length > 1) {
    const shortestSegments = Math.min(...pool.map((c) => c.path.split('/').length))
    pool = pool.filter((c) => c.path.split('/').length === shortestSegments)
  }

  const sorted = [...pool].sort((a, b) => a.path.localeCompare(b.path))
  return { resolved: sorted[0]!, alternativeCount: candidates.length - 1 }
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
