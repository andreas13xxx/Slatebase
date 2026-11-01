/**
 * bookmarksFile — maps Slatebase's bookmark entries to the `items` of `.obsidian/bookmarks.json`
 * and back.
 *
 *   file, no subpath        ⇄ type 'file'      { type: 'file', path, title? }
 *   file with "#Heading"    ⇄ type 'heading'   { type: 'file', path, subpath: '#Heading', title? }
 *   file with "#^block"     ⇄ type 'block'     { type: 'file', path, subpath: '#^block', title? }
 *   search                  ⇄ type 'search'    { type: 'search', query, title? }
 *   group                   ⇄ type 'group'     { type: 'group', title?, items: [...] }
 *
 * `title` is the entry's custom label (a group's name). Groups nest: an entry inside a group has the
 * group's id as `parentId`. Everything else in the file — folders, URLs, graphs, unknown types and
 * the fields Slatebase does not know — is kept exactly as it is and stays where it was. A search
 * bookmark's case/regex switches have no counterpart in Obsidian's file and are kept as two extra fields.
 *
 * @module state/bookmarksFile
 */

import type { FavoriteEntry } from './favoritesStore'

export type RawItem = Record<string, unknown>

function isObject(value: unknown): value is RawItem {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const str = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined)

/** What a mappable item stands for, or null if Slatebase has no use for it (it stays untouched). */
interface Parsed {
  type: 'file' | 'heading' | 'block' | 'search' | 'group'
  path: string
  heading?: string
  blockId?: string
  searchQuery?: string
  label?: string
}

function parse(item: unknown): Parsed | null {
  if (!isObject(item)) return null
  const label = str(item['title'])
  if (item['type'] === 'group') return { type: 'group', path: '', ...(label !== undefined ? { label } : {}) }
  if (item['type'] === 'search') {
    const query = str(item['query'])
    return query === undefined ? null : { type: 'search', path: '', searchQuery: query, ...(label !== undefined ? { label } : {}) }
  }
  if (item['type'] !== 'file') return null
  const path = str(item['path'])
  if (path === undefined) return null
  const subpath = str(item['subpath'])
  const base = { path, ...(label !== undefined ? { label } : {}) }
  if (subpath === undefined || subpath === '') return { type: 'file', ...base }
  if (subpath.startsWith('#^')) return { type: 'block', ...base, blockId: subpath.slice(2) }
  if (subpath.startsWith('#')) return { type: 'heading', ...base, heading: subpath.slice(1) }
  return null
}

/** Small, stable string hash (FNV-1a), for ids that survive a reload. */
function hash(text: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(36)
}

function identity(parsed: Parsed): string {
  return [parsed.type, parsed.path, parsed.heading ?? '', parsed.blockId ?? '', parsed.searchQuery ?? '', parsed.label ?? ''].join('\0')
}

export interface LoadedBookmarks {
  entries: FavoriteEntry[]
  /** The items as the file has them, for writing back. */
  items: RawItem[]
  /** Raw item by entry id, to carry over the fields Slatebase does not know. */
  rawById: Map<string, RawItem>
}

/**
 * The bookmark entries of a vault from the file's `items`. Entries come in file order, a group before
 * its content, and carry the id of the group they sit in as `parentId`. The ids are derived from the
 * content (and the group an entry sits in), plus a counter for identical ones, so they are the same
 * after every load.
 */
export function itemsToEntries(vaultId: string, items: unknown[]): LoadedBookmarks {
  const entries: FavoriteEntry[] = []
  const rawById = new Map<string, RawItem>()
  const seen = new Map<string, number>()

  const walk = (list: unknown[], parentId: string | undefined): void => {
    for (const raw of list) {
      const parsed = parse(raw)
      if (parsed === null || !isObject(raw)) continue
      const key = `${parentId ?? ''}\0${identity(parsed)}`
      const count = (seen.get(key) ?? 0) + 1
      seen.set(key, count)
      const id = `bm-${hash(key)}-${count}`
      const ctime = typeof raw['ctime'] === 'number' ? raw['ctime'] : 0
      entries.push({
        id,
        vaultId,
        path: parsed.path,
        addedAt: new Date(ctime).toISOString(),
        order: entries.length,
        type: parsed.type,
        ...(parentId !== undefined ? { parentId } : {}),
        ...(parsed.label !== undefined ? { label: parsed.label } : {}),
        ...(parsed.heading !== undefined ? { heading: parsed.heading } : {}),
        ...(parsed.blockId !== undefined ? { blockId: parsed.blockId } : {}),
        ...(parsed.searchQuery !== undefined ? {
          searchQuery: parsed.searchQuery,
          searchCaseSensitive: raw['searchCaseSensitive'] === true,
          searchRegex: raw['searchRegex'] === true,
        } : {}),
      })
      rawById.set(id, raw)
      if (parsed.type === 'group' && Array.isArray(raw['items'])) walk(raw['items'], id)
    }
  }
  walk(items, undefined)
  return { entries, items: items as RawItem[], rawById }
}

/** What identifies an entry, apart from its id: type, target, label, and the group it sits in. */
function entryKey(entry: FavoriteEntry, byId: Map<string, FavoriteEntry>, seen: Set<string> = new Set()): string {
  const own = [entry.type ?? 'file', entry.path, entry.heading ?? '', entry.blockId ?? '', entry.searchQuery ?? '', entry.label ?? ''].join('\0')
  const parent = entry.parentId !== undefined ? byId.get(entry.parentId) : undefined
  if (parent === undefined || seen.has(entry.id)) return own
  seen.add(entry.id)
  return `${entryKey(parent, byId, seen)}\u0001${own}`
}

/**
 * A fresh read of the file, with its raw items also reachable by the ids of `entries` (the cache's).
 * Entries made in Slatebase have random ids while the same items read from the file have derived ones;
 * matching them by what they are lets a write keep the unknown fields and the items inside a group
 * that the file holds for them.
 */
export function adoptEntryIds(fresh: LoadedBookmarks, entries: FavoriteEntry[]): LoadedBookmarks {
  const freshById = new Map(fresh.entries.map((entry) => [entry.id, entry]))
  const queues = new Map<string, FavoriteEntry[]>()
  for (const entry of fresh.entries) {
    const key = entryKey(entry, freshById)
    queues.set(key, [...(queues.get(key) ?? []), entry])
  }
  const byId = new Map(entries.map((entry) => [entry.id, entry]))
  const rawById = new Map(fresh.rawById)
  for (const entry of [...entries].sort((a, b) => a.order - b.order)) {
    if (rawById.has(entry.id)) continue // the same id in both: already matched
    const match = queues.get(entryKey(entry, byId))?.shift()
    const raw = match !== undefined ? fresh.rawById.get(match.id) : undefined
    if (raw !== undefined) rawById.set(entry.id, raw)
  }
  return { entries: fresh.entries, items: fresh.items, rawById }
}

/** The item for an entry, on top of the raw item it came from (if any) so unknown fields survive. */
function entryToItem(entry: FavoriteEntry, raw: RawItem | undefined): RawItem {
  const type = entry.type ?? 'file'
  const item: RawItem = { ...(raw ?? {}) }
  if (type === 'group') {
    item['type'] = 'group'
    delete item['path']
    delete item['subpath']
    delete item['query']
  } else if (type === 'search') {
    item['type'] = 'search'
    item['query'] = entry.searchQuery ?? ''
    delete item['path']
    delete item['subpath']
    if (entry.searchCaseSensitive === true) item['searchCaseSensitive'] = true
    else delete item['searchCaseSensitive']
    if (entry.searchRegex === true) item['searchRegex'] = true
    else delete item['searchRegex']
  } else {
    item['type'] = 'file'
    item['path'] = entry.path
    delete item['query']
    if (type === 'heading') item['subpath'] = `#${entry.heading ?? ''}`
    else if (type === 'block') item['subpath'] = `#^${entry.blockId ?? ''}`
    else delete item['subpath']
  }
  if (entry.label !== undefined && entry.label !== '') item['title'] = entry.label
  else delete item['title']
  if (raw === undefined) item['ctime'] = Date.parse(entry.addedAt) || Date.now()
  return item
}

/** What to write: the new `items`, and the ids of the entries in them in the order `itemsToEntries` reads them back. */
export interface BuiltItems {
  items: RawItem[]
  ids: string[]
}

/**
 * The `items` to write: the file's previous items, with the entries Slatebase shows replaced,
 * reordered, removed or added. Items it does not show keep their place; the entries of a level take
 * the places of the ones they replace in their new order, new entries go to the end of their group.
 * A group keeps the items inside it that Slatebase does not show. An entry whose group no longer
 * exists goes to the top level.
 */
export function entriesToItems(entries: FavoriteEntry[], previous: LoadedBookmarks): BuiltItems {
  const known = new Set(entries.map((entry) => entry.id))
  const children = new Map<string | undefined, FavoriteEntry[]>()
  for (const entry of [...entries].sort((a, b) => a.order - b.order)) {
    const parent = entry.parentId !== undefined && known.has(entry.parentId) ? entry.parentId : undefined
    const list = children.get(parent) ?? []
    list.push(entry)
    children.set(parent, list)
  }
  const shown = new Set(previous.rawById.values())
  const ids: string[] = []

  // `source` is what the file had at this level (empty for a new group)
  const build = (parentId: string | undefined, source: unknown[]): RawItem[] => {
    const queue = [...(children.get(parentId) ?? [])]
    const result: RawItem[] = []
    const place = (entry: FavoriteEntry): void => {
      ids.push(entry.id)
      const raw = previous.rawById.get(entry.id)
      const item = entryToItem(entry, raw)
      if ((entry.type ?? 'file') === 'group') {
        const inner = raw?.['items']
        item['items'] = build(entry.id, Array.isArray(inner) ? inner : [])
      }
      result.push(item)
    }
    for (const item of source) {
      if (!isObject(item) || !shown.has(item)) {
        result.push(item as RawItem) // not ours: kept where it is
        continue
      }
      const next = queue.shift()
      if (next !== undefined) place(next)
    }
    for (const entry of queue) place(entry)
    return result
  }
  return { items: build(undefined, previous.items), ids }
}
