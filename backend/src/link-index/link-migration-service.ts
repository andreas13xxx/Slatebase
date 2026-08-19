/**
 * LinkMigrationService — rewrites wikilinks across a vault after a file or
 * folder is renamed/moved, so links to the old path don't silently break
 * (Prio 15 "Link-Migration", the largest unintentional gap vs. Obsidian's
 * core rename/move behavior — see .kiro/specs/graph-polish-link-integrity/).
 *
 * Candidate gathering combines two sources because the persisted Link_Index
 * only matches wikilinks by literal normalized target text:
 *  - `ILinkIndex.getBacklinks(oldPath)` — fast, catches exact-path links.
 *  - A vault-wide filename substring search (reusing `ISearchService`) —
 *    catches bare-name links (`[[Note]]`) to a file living in a subfolder,
 *    which the index's literal matching alone would miss entirely.
 * Each candidate's wikilinks are then resolved against the pre-move
 * DirectoryTree via `resolveWikilinkTargetOnTree` to confirm which of them
 * actually targeted the moved/renamed file before rewriting.
 *
 * Reads and writes files via `IVaultService.getFileContent`/`saveFile` —
 * the same atomic-write (temp → rename) path `ReplaceService` uses — rather
 * than touching the filesystem directly, so migrated files also get version
 * history snapshots like any other save.
 */
import type { ILogger } from '../logger/index.js'
import type { IVaultService } from '../business/index.js'
import type { ISearchService } from '../search/types.js'
import type { ILinkIndex } from './types.js'
import type { DirectoryTree } from '../vault/index.js'
import { extractWikilinks } from './wikilink-parser.js'
import { resolveWikilinkTargetOnTree } from './link-match-resolver.js'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LinkMigrationFileResult {
  path: string
  replacements: number
}

export interface LinkMigrationFailure {
  path: string
  reason: string
}

export interface LinkMigrationResult {
  migratedFiles: LinkMigrationFileResult[]
  failedFiles: LinkMigrationFailure[]
}

export interface ILinkMigrationService {
  /**
   * Rewrites all wikilinks across the vault that resolve (against `oldTree`,
   * the DirectoryTree as it was *before* the rename/move) to `oldPath`, so
   * they point to `newPath` instead.
   */
  migrateLinks(vaultId: string, oldPath: string, newPath: string, oldTree: DirectoryTree): Promise<LinkMigrationResult>
}

// ─── Implementation ─────────────────────────────────────────────────────────

export class LinkMigrationService implements ILinkMigrationService {
  constructor(
    private readonly vaultService: IVaultService,
    private readonly searchService: ISearchService,
    private readonly getLinkIndex: (vaultId: string) => ILinkIndex | undefined,
    private readonly logger: ILogger,
  ) {}

  async migrateLinks(vaultId: string, oldPath: string, newPath: string, oldTree: DirectoryTree): Promise<LinkMigrationResult> {
    const linkIndex = this.getLinkIndex(vaultId)
    const candidatePaths = await this.gatherCandidates(vaultId, oldPath, linkIndex)
    candidatePaths.delete(oldPath)
    candidatePaths.delete(newPath)

    const newTargetText = stripMdExtension(newPath)
    const migratedFiles: LinkMigrationFileResult[] = []
    const failedFiles: LinkMigrationFailure[] = []

    for (const candidatePath of candidatePaths) {
      try {
        const fileContent = await this.vaultService.getFileContent(vaultId, candidatePath)
        if (fileContent.isBinary) continue

        const rewritten = rewriteWikilinksInContent(fileContent.content, candidatePath, oldPath, newTargetText, oldTree)
        if (rewritten === null) continue

        await this.vaultService.saveFile(vaultId, candidatePath, rewritten.content)
        migratedFiles.push({ path: candidatePath, replacements: rewritten.count })

        if (linkIndex) {
          await linkIndex.updateFile(candidatePath, rewritten.content)
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        this.logger.warn('Link migration failed for file', { vaultId, candidatePath, oldPath, newPath, error: message })
        failedFiles.push({ path: candidatePath, reason: message })
      }
    }

    return { migratedFiles, failedFiles }
  }

  /** Union of index backlinks (exact-path matches) and a filename substring search (bare-name matches). */
  private async gatherCandidates(vaultId: string, oldPath: string, linkIndex: ILinkIndex | undefined): Promise<Set<string>> {
    const candidates = new Set<string>()

    if (linkIndex) {
      for (const source of linkIndex.getBacklinks(oldPath)) {
        candidates.add(source)
      }
    }

    const baseName = extractBaseName(oldPath)
    if (baseName !== '') {
      try {
        const searchResult = await this.searchService.search(vaultId, {
          query: baseName,
          caseSensitive: false,
          regex: false,
          contextLines: 0,
          maxResults: 500,
        })
        for (const fileResult of searchResult.results) {
          candidates.add(fileResult.filePath)
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        this.logger.warn('Link migration candidate search failed', { vaultId, oldPath, error: message })
      }
    }

    return candidates
  }
}

// ─── Content Rewriting ───────────────────────────────────────────────────────

/**
 * Rewrites every wikilink in `content` that resolves to `oldPath` so its
 * target text becomes `newTargetText`, preserving alias/heading/blockRef and
 * all surrounding text exactly. Returns null if no wikilink in the content
 * actually targets `oldPath` (Requirement 3.10 — no-op, no file touched).
 */
export function rewriteWikilinksInContent(
  content: string,
  sourcePath: string,
  oldPath: string,
  newTargetText: string,
  oldTree: DirectoryTree,
): { content: string; count: number } | null {
  const links = extractWikilinks(content)
  const matching = links.filter((link) => resolveWikilinkTargetOnTree(link.target, oldTree, sourcePath) === oldPath)
  if (matching.length === 0) return null

  const byLine = new Map<number, typeof matching>()
  for (const link of matching) {
    const arr = byLine.get(link.position.line)
    if (arr) {
      arr.push(link)
    } else {
      byLine.set(link.position.line, [link])
    }
  }

  const lines = content.split('\n')
  let count = 0

  for (const [lineNumber, linksOnLine] of byLine) {
    const lineIndex = lineNumber - 1
    let line = lines[lineIndex]
    if (line === undefined) continue

    // Process right-to-left so earlier columns on the same line stay valid
    // after a later replacement changes the line's length.
    const sorted = [...linksOnLine].sort((a, b) => b.position.column - a.position.column)
    for (const link of sorted) {
      // position.column is the 1-based column of the wikilink's opening `[[`.
      const startIndex = link.position.column - 1
      const targetStart = startIndex + 2 // skip `[[`
      const targetEnd = targetStart + link.target.length

      // Safety guard: only rewrite if the target text at that position still
      // matches what the parser extracted (should always hold; skip instead
      // of corrupting the line if it somehow doesn't).
      if (line.slice(targetStart, targetEnd) !== link.target) continue

      line = line.slice(0, targetStart) + newTargetText + line.slice(targetEnd)
      count++
    }
    lines[lineIndex] = line
  }

  if (count === 0) return null
  return { content: lines.join('\n'), count }
}

/**
 * Computes the `{oldPath, newPath}` pairs affected by a rename/move.
 * A file operation yields a single pair; a folder operation yields one pair
 * per descendant file, derived from the pre-operation tree (Requirement 3.7).
 */
export function computeAffectedFilePairs(
  oldTree: DirectoryTree,
  sourcePath: string,
  newPath: string,
): Array<{ oldPath: string; newPath: string }> {
  const node = findNode(oldTree, sourcePath)
  if (!node) return []

  if (node.type === 'file') {
    return [{ oldPath: sourcePath, newPath }]
  }

  const pairs: Array<{ oldPath: string; newPath: string }> = []
  collectDescendantFiles(node, sourcePath, newPath, pairs)
  return pairs
}

function findNode(tree: DirectoryTree, targetPath: string): DirectoryTree | null {
  if (tree.path === targetPath) return tree
  if (tree.children) {
    for (const child of tree.children) {
      const found = findNode(child, targetPath)
      if (found) return found
    }
  }
  return null
}

function collectDescendantFiles(
  node: DirectoryTree,
  oldPrefix: string,
  newPrefix: string,
  out: Array<{ oldPath: string; newPath: string }>,
): void {
  if (node.type === 'file') {
    out.push({ oldPath: node.path, newPath: newPrefix + node.path.slice(oldPrefix.length) })
    return
  }
  if (node.children) {
    for (const child of node.children) {
      collectDescendantFiles(child, oldPrefix, newPrefix, out)
    }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractBaseName(filePath: string): string {
  const segments = filePath.split('/')
  const last = segments[segments.length - 1] ?? ''
  return last.replace(/\.md$/i, '')
}

function stripMdExtension(filePath: string): string {
  return filePath.replace(/\.md$/i, '')
}
