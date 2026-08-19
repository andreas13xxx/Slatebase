/**
 * Backend port of the frontend's wikilink target resolution
 * (frontend/src/plugins/link-resolver.ts) — same-folder-first, then
 * shortest-path, then alphabetical disambiguation.
 *
 * Needed because the persisted Link_Index (link-index-service.ts) only
 * matches wikilink targets by *literal* normalized text against a file's
 * own path — it does not resolve a bare-name link (e.g. `[[Note]]`) to a
 * file living in a subfolder the way the frontend does when rendering.
 * Link migration (rewriting wikilinks after a rename/move) needs that full
 * resolution to find every affected link, not just exact-path matches.
 */
import type { DirectoryTree } from '../vault/index.js'

/** A minimal file reference used throughout link resolution. */
export interface FileCandidate {
  name: string
  path: string
}

/**
 * Resolves a wikilink target against a vault directory tree.
 *
 * @param target - The wikilink target string (e.g. "MyNote", "folder/note", "Note.md")
 * @param tree - The vault's directory tree
 * @param sourcePath - Path of the file the link appears in, used to prefer a same-folder
 *   match when the target name is ambiguous.
 * @returns The full relative path to the resolved file, or null if not found
 */
export function resolveWikilinkTargetOnTree(
  target: string,
  tree: DirectoryTree,
  sourcePath: string,
): string | null {
  const result = resolveWikilinkTargetWithAlternatives(target, tree, sourcePath)
  return result ? result.resolved.path : null
}

/**
 * Same as `resolveWikilinkTargetOnTree`, but also reports how many other files
 * shared the matched name.
 */
export function resolveWikilinkTargetWithAlternatives(
  target: string,
  tree: DirectoryTree,
  sourcePath: string,
): { resolved: FileCandidate; alternativeCount: number } | null {
  if (!target.trim()) return null

  const normalizedTarget = target.trim()
  const files = collectFilesSorted(tree)

  // If target contains a path separator, resolve as relative path (already unambiguous).
  if (normalizedTarget.includes('/')) {
    const resolved = resolvePathTarget(normalizedTarget, files)
    return resolved ? { resolved: { name: resolved.split('/').pop() ?? resolved, path: resolved }, alternativeCount: 0 } : null
  }

  const targetLower = normalizedTarget.toLowerCase()

  // Exact-name matches take priority over the `.md`-appended fallback, so a
  // coexisting "Note" and "Note.md" can't be treated as ambiguous with each other.
  const exactCandidates = files.filter((file) => file.name.toLowerCase() === targetLower)
  if (exactCandidates.length > 0) {
    return resolveAmbiguousMatch(exactCandidates, sourcePath)
  }

  const targetWithMdLower = `${targetLower}.md`
  const mdCandidates = files.filter((file) => file.name.toLowerCase() === targetWithMdLower)
  if (mdCandidates.length === 0) return null

  return resolveAmbiguousMatch(mdCandidates, sourcePath)
}

/**
 * Picks the best candidate among files that share a wikilink target name.
 *
 * Order of preference:
 * 1. A candidate in the same folder as `sourcePath`, if any.
 * 2. The candidate with the shortest path (fewest `/`-separated segments).
 * 3. Alphabetical by full path, as a deterministic final tie-break.
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
 */
export function collectFilesSorted(tree: DirectoryTree): FileCandidate[] {
  const result: FileCandidate[] = []
  collectRecursive(tree, result)
  return result
}

function collectRecursive(node: DirectoryTree, result: FileCandidate[]): void {
  if (node.type === 'file') {
    result.push({ name: node.name, path: node.path })
    return
  }

  if (node.children) {
    const sorted = [...node.children].sort((a, b) => a.name.localeCompare(b.name))
    for (const child of sorted) {
      collectRecursive(child, result)
    }
  }
}

/**
 * Resolves a path-based target (e.g. "folder/file") against the collected files.
 */
export function resolvePathTarget(target: string, files: FileCandidate[]): string | null {
  const targetLower = target.toLowerCase()

  for (const file of files) {
    if (file.path.toLowerCase() === targetLower) return file.path
  }

  const targetWithMd = targetLower + '.md'
  for (const file of files) {
    if (file.path.toLowerCase() === targetWithMd) return file.path
  }

  for (const file of files) {
    const fileLower = file.path.toLowerCase()
    if (fileLower.endsWith('/' + targetLower) || fileLower === targetLower) {
      return file.path
    }
  }

  const targetSuffixWithMd = '/' + targetWithMd
  for (const file of files) {
    const fileLower = file.path.toLowerCase()
    if (fileLower.endsWith(targetSuffixWithMd)) {
      return file.path
    }
  }

  return null
}

/**
 * Finds every wikilink in `parsedLinks` whose resolved target equals `targetPath`.
 * Thin filter helper kept separate from parsing so callers can reuse a single
 * `extractWikilinks()` pass across multiple checks.
 */
export function findLinksTargeting<T extends { target: string }>(
  parsedLinks: T[],
  sourcePath: string,
  targetPath: string,
  tree: DirectoryTree,
): T[] {
  return parsedLinks.filter((link) => resolveWikilinkTargetOnTree(link.target, tree, sourcePath) === targetPath)
}
