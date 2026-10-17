/**
 * Pure helpers for `bases:add-item` — deriving where a new note goes and what
 * its blank frontmatter looks like, from the base's own definition. Kept out of
 * BasesView so they are unit-testable without mounting the component.
 */

import type { BaseDocument, BaseFilterNode, BaseView } from '@slatebase/shared-contracts'
import type { IApiClient } from '../../api'

/** Matches `file.inFolder("X")` / `file.inFolder('X')` and captures the folder. */
const IN_FOLDER_RE = /file\.inFolder\(\s*["']([^"']+)["']\s*\)/

/**
 * Target folder for a new note: the folder named by the first `file.inFolder`
 * filter (document or view), else '' (vault root). A note created there will
 * satisfy that folder filter and so appear as a row.
 */
export function deriveBaseScopeFolder(doc: BaseDocument, view: BaseView | undefined): string {
  const fromView = view ? findInFolder(view.filters) : null
  if (fromView) return fromView
  const fromDoc = findInFolder(doc.filters)
  return fromDoc ?? ''
}

/** Walks a filter tree (strings + and/or/not groups) for the first file.inFolder folder. */
function findInFolder(node: BaseFilterNode | undefined): string | null {
  if (!node) return null
  if (typeof node === 'string') {
    const m = IN_FOLDER_RE.exec(node)
    return m ? m[1]! : null
  }
  const children = 'and' in node ? node.and : 'or' in node ? node.or : node.not
  for (const child of children) {
    const found = findInFolder(child)
    if (found) return found
  }
  return null
}

/**
 * Blank YAML frontmatter for the displayed property columns, each key left
 * empty, so the new note starts with the base's shape ready to fill in. A
 * `property == "X"` equality filter pre-fills that key with X, so the new note
 * actually matches the base. Returns '' when there are no property columns.
 */
export function buildBlankFrontmatter(columns: string[], doc: BaseDocument, view: BaseView | undefined): string {
  if (columns.length === 0) return ''
  const prefills = collectEqualityPrefills(doc.filters)
  if (view) Object.assign(prefills, collectEqualityPrefills(view.filters))
  const lines = columns.map((key) => {
    const value = prefills[key]
    return value !== undefined ? `${key}: ${value}` : `${key}:`
  })
  return `---\n${lines.join('\n')}\n---\n`
}

/** Matches `prop == "value"` / `prop == 'value'` equality predicates. */
const EQUALITY_RE = /([A-Za-z_][\w-]*)\s*==\s*["']([^"']*)["']/g

/** Collects `prop == "value"` equalities from a filter tree as key→value prefills. */
function collectEqualityPrefills(node: BaseFilterNode | undefined, into: Record<string, string> = {}): Record<string, string> {
  if (!node) return into
  if (typeof node === 'string') {
    EQUALITY_RE.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = EQUALITY_RE.exec(node)) !== null) {
      const key = m[1]!
      if (!key.startsWith('file.') && !key.startsWith('formula.')) into[key] = m[2]!
    }
    return into
  }
  const children = 'and' in node ? node.and : 'or' in node ? node.or : node.not
  for (const child of children) collectEqualityPrefills(child, into)
  return into
}

/**
 * Finds a non-colliding `<folder>/<base>.md` path by appending ` 1`, ` 2`, …
 * until the vault tree has no such file. Scans the current tree rather than
 * probing each path, so it is one round-trip.
 */
export async function resolveNewNotePath(
  apiClient: IApiClient,
  vaultId: string,
  folder: string,
  baseName: string,
): Promise<string> {
  const tree = await apiClient.fetchVaultTree(vaultId)
  const existing = new Set<string>()
  collectPaths(tree, existing)
  const prefix = folder ? `${folder}/` : ''
  let candidate = `${prefix}${baseName}.md`
  let n = 1
  while (existing.has(candidate)) {
    candidate = `${prefix}${baseName} ${String(n)}.md`
    n++
  }
  return candidate
}

/** Collects every file path in a directory tree into `into`. */
function collectPaths(node: unknown, into: Set<string>): void {
  if (!node || typeof node !== 'object') return
  const n = node as { path?: string; type?: string; children?: unknown[] }
  if (n.type === 'file' && typeof n.path === 'string') into.add(n.path)
  if (Array.isArray(n.children)) for (const c of n.children) collectPaths(c, into)
}
