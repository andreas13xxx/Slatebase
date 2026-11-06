/**
 * CodeMirror 6 completion source for wikilinks: typing `[[` (or `![[`) suggests
 *
 *   [[na          notes by name, plus their frontmatter aliases
 *   [[Note#he     headings of that note        ([[#he]]  headings of this note)
 *   [[Note#^bl    block ids of that note       ([[^bl]]  block ids of this note)
 *   [[##he        headings of the whole vault
 *
 * Candidates are plain strings inserted as document text, never rendered as HTML.
 *
 * shortcut: block suggestions list only blocks that already carry a `^id`
 * (Obsidian also offers to add an id to any paragraph); vault-wide headings come
 * from a regex search (first 500 hits, headings inside code fences included).
 * Upgrade with a heading index on the backend if either matters.
 *
 * @module link-complete
 */

import type { Completion, CompletionContext, CompletionResult, CompletionSource } from '@codemirror/autocomplete'
import type { EditorView } from '@codemirror/view'
import type { DirectoryTree } from '../../types'
import { getAliasMapSnapshot, getAliasEntriesSnapshot } from '../../state/aliasStore'
import { collectFilesSorted, resolveWikilinkTarget } from '../../plugins/link-resolver'

/** Where the completion source gets its candidates from. */
export interface LinkSuggestSource {
  /** All linkable files of the vault. */
  notes(): Array<{ name: string; path: string }>
  /** All frontmatter aliases with the file declaring them. */
  aliases(): ReadonlyArray<{ alias: string; path: string }>
  /** Resolves a link target (name, alias or path) to a vault path, or null. */
  resolve(target: string): string | null
  /** Text of a vault file, or null when unreadable. */
  readFile(path: string): Promise<string | null>
  /** Every heading of the vault (for `[[##`). */
  vaultHeadings(): Promise<Array<{ path: string; heading: string }>>
}

/** Labels shown next to the suggestions. */
export interface LinkSuggestLabels {
  alias: string
  heading: string
  block: string
}

const MAX_OPTIONS = 50

/** Headings of a markdown text (not those inside code fences or the frontmatter). */
export function parseHeadings(text: string): string[] {
  const out: string[] = []
  let fence: string | null = null
  const lines = text.split('\n')
  let i = 0
  if (lines[0]?.trimEnd() === '---') {
    const end = lines.findIndex((l, n) => n > 0 && (l.trimEnd() === '---' || l.trimEnd() === '...'))
    if (end > 0) i = end + 1
  }
  for (; i < lines.length; i++) {
    const line = lines[i]!
    const f = /^\s*(```+|~~~+)/.exec(line)?.[1]
    if (f) {
      if (fence === null) fence = f.slice(0, 3)
      else if (f.startsWith(fence)) fence = null
      continue
    }
    if (fence !== null) continue
    const m = /^#{1,6}\s+(.+?)\s*#*\s*$/.exec(line)
    if (m?.[1]) out.push(m[1])
  }
  return out
}

/** Blocks that carry a `^id` marker at the end of the line. */
export function parseBlockIds(text: string): Array<{ id: string; text: string }> {
  const out: Array<{ id: string; text: string }> = []
  for (const line of text.split('\n')) {
    const m = /^(?:(.*\S)\s+)?\^([A-Za-z0-9-]+)$/.exec(line.trim())
    if (m?.[2]) out.push({ id: m[2], text: m[1] ?? '' })
  }
  return out
}

/** Obsidian replaces characters that would break a link in a heading with a space. */
function linkSafeHeading(heading: string): string {
  return heading.replace(/[#|^:%[\]]/g, ' ').replace(/\s+/g, ' ').trim()
}

/** Case-insensitive substring filter; prefix matches first. */
function rank<T>(items: T[], text: (item: T) => string, query: string): T[] {
  const q = query.trim().toLowerCase()
  if (q === '') return items.slice(0, MAX_OPTIONS)
  const starts: T[] = []
  const contains: T[] = []
  for (const item of items) {
    const idx = text(item).toLowerCase().indexOf(q)
    if (idx === 0) starts.push(item)
    else if (idx > 0) contains.push(item)
  }
  return [...starts, ...contains].slice(0, MAX_OPTIONS)
}

/** Inserts `text`, closing the link with `]]` unless it is already closed, and puts the cursor behind it. */
function applyLink(text: string) {
  return (view: EditorView, _completion: Completion, from: number, to: number) => {
    const closed = view.state.sliceDoc(to, to + 2) === ']]'
    view.dispatch({
      changes: { from, to: closed ? to + 2 : to, insert: `${text}]]` },
      selection: { anchor: from + text.length + 2 },
      userEvent: 'input.complete',
    })
  }
}

function option(label: string, insert: string, detail: string, type: string): Completion {
  return { label, detail, type, apply: applyLink(insert) }
}

async function suggest(
  source: LinkSuggestSource,
  context: CompletionContext,
  typed: string,
  from: number,
  labels: LinkSuggestLabels,
): Promise<CompletionResult | null> {
  const done = (options: Completion[]): CompletionResult | null =>
    options.length === 0 ? null : { from, options, filter: false }

  // [[##heading: headings of the whole vault
  if (typed.startsWith('##')) {
    const all = await source.vaultHeadings()
    const hits = rank(all, (h) => h.heading, typed.slice(2))
    return done(hits.map((h) => {
      const name = h.path.split('/').pop()!.replace(/\.md$/i, '')
      return option(h.heading, `${name}#${linkSafeHeading(h.heading)}`, name, 'heading')
    }))
  }

  const hash = typed.indexOf('#')
  const caret = typed.indexOf('^')
  const noteEnd = hash >= 0 ? hash : caret
  if (noteEnd >= 0) {
    const note = typed.slice(0, noteEnd)
    const lastHash = typed.lastIndexOf('#')
    const blockMode = hash >= 0 ? typed.startsWith('^', hash + 1) : true
    // The text of the note the link points to: this document for `[[#` / `[[^`.
    let text: string | null
    if (note === '') text = context.state.doc.toString()
    else {
      const path = source.resolve(note)
      text = path ? await source.readFile(path) : null
    }
    if (text === null) return null
    if (blockMode) {
      const filter = typed.slice(typed.indexOf('^') + 1)
      const prefix = `${note}#^`
      return done(rank(parseBlockIds(text), (b) => `${b.id} ${b.text}`, filter)
        .map((b) => option(`^${b.id}`, `${prefix}${b.id}`, b.text || labels.block, 'text')))
    }
    const prefix = typed.slice(0, lastHash + 1)
    return done(rank(parseHeadings(text), (h) => h, typed.slice(lastHash + 1))
      .map((h) => option(h, `${prefix}${linkSafeHeading(h)}`, labels.heading, 'heading')))
  }

  // [[name: notes and aliases
  const notes = source.notes()
  const nameCount = new Map<string, number>()
  for (const n of notes) nameCount.set(n.name, (nameCount.get(n.name) ?? 0) + 1)
  const noteOptions = rank(notes, (n) => n.path, typed).map((n) => {
    const base = /\.md$/i.test(n.name) ? n.name.replace(/\.md$/i, '') : n.name
    // A name shared by several files needs its folder to be unambiguous.
    const insert = (nameCount.get(n.name) ?? 0) > 1 ? n.path.replace(/\.md$/i, '') : base
    return option(base, insert, n.path.includes('/') ? n.path : '', 'file')
  })
  const aliasOptions = rank([...source.aliases()], (a) => a.alias, typed).map((a) =>
    option(a.alias, a.alias, `${labels.alias}: ${a.path}`, 'variable'))
  return done([...noteOptions, ...aliasOptions].slice(0, MAX_OPTIONS))
}

/**
 * Creates the completion source. `getSource` is read on every request so it
 * follows vault/tab changes without rebuilding the editor extensions.
 */
export function createLinkCompletions(
  getSource: () => LinkSuggestSource | null,
  labels: LinkSuggestLabels = { alias: 'Alias', heading: 'Überschrift', block: 'Block' },
): CompletionSource {
  return async (context): Promise<CompletionResult | null> => {
    const source = getSource()
    if (!source) return null
    const line = context.state.doc.lineAt(context.pos)
    const before = line.text.slice(0, context.pos - line.from)
    const open = before.lastIndexOf('[[')
    if (open < 0) return null
    const typed = before.slice(open + 2)
    // Closed already, or past the target into the display text (`|`).
    if (/[\]|[]/.test(typed)) return null
    return suggest(source, context, typed, line.from + open + 2, labels)
  }
}

/** The slice of the editor options and API client the link source needs. */
export interface LinkSourceDeps {
  vaultId: string
  directoryTree: DirectoryTree | null
  sourcePath: string
  aliasMap: Map<string, string[]>
  aliasEntries: ReadonlyArray<{ alias: string; path: string }>
  apiClient?: {
    fetchFileContent?: (vaultId: string, path: string) => Promise<{ content: string; isBinary: boolean }>
    searchVault?: (vaultId: string, params: Record<string, string>) => Promise<unknown>
  } | null | undefined
}

/** How long a fetched file or heading list is reused while the user keeps typing. */
const CACHE_TTL_MS = 10_000

/** Regex (for the search API) matching every markdown heading line. */
const HEADING_SEARCH = '^#{1,6}\\s+\\S'

/**
 * Builds the source from the vault's directory tree, alias store and API client.
 * `getDeps` is read lazily so the tree/aliases are always the current ones; keep the
 * returned source alive across editor rebuilds so its caches survive.
 * Files and the vault-wide heading list are cached briefly and concurrent requests
 * share one promise, so typing does not refetch on every key. A failed request is
 * not cached.
 */
export function createLinkSource(getDeps: () => LinkSourceDeps): LinkSuggestSource {
  const files = new Map<string, { at: number; value: Promise<string | null> }>()
  let headingsCache: { at: number; vaultId: string; value: Promise<Array<{ path: string; heading: string }>> } | null = null
  return {
    notes: () => {
      const { directoryTree } = getDeps()
      return directoryTree ? collectFilesSorted(directoryTree) : []
    },
    aliases: () => getDeps().aliasEntries,
    resolve: (target) => {
      const d = getDeps()
      return resolveWikilinkTarget(target, d.directoryTree, d.sourcePath, d.aliasMap)
    },
    readFile: (path) => {
      const d = getDeps()
      const key = `${d.vaultId}\0${path}`
      const hit = files.get(key)
      if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value
      const value = (async () => {
        try {
          const file = await d.apiClient?.fetchFileContent?.(d.vaultId, path)
          if (file && !file.isBinary) return file.content
        } catch { /* not cached, see below */ }
        files.delete(key)
        return null
      })()
      files.set(key, { at: Date.now(), value })
      return value
    },
    vaultHeadings: () => {
      const d = getDeps()
      if (headingsCache && headingsCache.vaultId === d.vaultId && Date.now() - headingsCache.at < CACHE_TTL_MS) {
        return headingsCache.value
      }
      const value = (async () => {
        try {
          const raw = await d.apiClient?.searchVault?.(d.vaultId, {
            query: HEADING_SEARCH, regex: 'true', caseSensitive: 'false', contextLines: '0', maxResults: '500',
          }) as { results?: Array<{ filePath: string; hits: Array<{ matchLine: string }> }> } | undefined
          return (raw?.results ?? []).flatMap((f) => f.hits.flatMap((h) => {
            const heading = /^#{1,6}\s+(.+?)\s*#*\s*$/.exec(h.matchLine)?.[1]
            return heading ? [{ path: f.filePath, heading }] : []
          }))
        } catch {
          headingsCache = null // a failure must not stick for the whole TTL
          return []
        }
      })()
      headingsCache = { at: Date.now(), vaultId: d.vaultId, value }
      return value
    },
  }
}

export type EditorLinkDeps = Pick<LinkSourceDeps, 'vaultId' | 'directoryTree' | 'sourcePath' | 'apiClient'>

/**
 * The editor's source plus a setter for the current tree, path and client. The host calls
 * `setDeps` whenever they change; the source (and with it its caches) stays the same.
 * The alias store is read on every request.
 */
export function createEditorLinkSource(): {
  source: LinkSuggestSource
  setDeps: (deps: EditorLinkDeps) => void
  hasVault: () => boolean
} {
  let deps: EditorLinkDeps = { vaultId: '', directoryTree: null, sourcePath: '' }
  return {
    source: createLinkSource(() => ({ ...deps, aliasMap: getAliasMapSnapshot(), aliasEntries: getAliasEntriesSnapshot() })),
    setDeps: (next) => { deps = next },
    hasVault: () => deps.vaultId !== '',
  }
}
