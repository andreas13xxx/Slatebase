/**
 * bookmarksFile — maps Slatebase's bookmark entries to the `items` of `.obsidian/bookmarks.json`
 * and back.
 *
 *   file, no subpath        ⇄ type 'file'      { type: 'file', path, title? }
 *   file with "#Heading"    ⇄ type 'heading'   { type: 'file', path, subpath: '#Heading', title? }
 *   file with "#^block"     ⇄ type 'block'     { type: 'file', path, subpath: '#^block', title? }
 *   search                  ⇄ type 'search'    { type: 'search', query, title? }
 *
 * `title` is the entry's custom label. Everything else in the file — groups, folders, URLs, graphs,
 * unknown types and the fields Slatebase does not know — is kept exactly as it is and stays where it
 * was. Entries inside groups are not shown (the group is kept as a whole). A search bookmark's
 * case/regex switches have no counterpart in Obsidian's file and are kept as two extra fields.
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
  type: 'file' | 'heading' | 'block' | 'search'
  path: string
  heading?: string
  blockId?: string
  searchQuery?: string
  label?: string
}

function parse(item: unknown): Parsed | null {
  if (!isObject(item)) return null
  const label = str(item['title'])
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

/** Ids for the items, derived from their content (plus a counter for identical ones), so they are the same after every load. */
function idsFor(parsedItems: Array<Parsed | null>): Array<string | null> {
  const seen = new Map<string, number>()
  return parsedItems.map((parsed) => {
    if (parsed === null) return null
    const key = identity(parsed)
    const count = (seen.get(key) ?? 0) + 1
    seen.set(key, count)
    return `bm-${hash(key)}-${count}`
  })
}

export interface LoadedBookmarks {
  entries: FavoriteEntry[]
  /** The items as the file has them, for writing back. */
  items: RawItem[]
  /** Raw item by entry id, to carry over the fields Slatebase does not know. */
  rawById: Map<string, RawItem>
}

/** The bookmark entries of a vault from the file's `items`. Entries come in file order. */
export function itemsToEntries(vaultId: string, items: unknown[]): LoadedBookmarks {
  const parsedItems = items.map(parse)
  const ids = idsFor(parsedItems)
  const entries: FavoriteEntry[] = []
  const rawById = new Map<string, RawItem>()
  parsedItems.forEach((parsed, index) => {
    const id = ids[index]
    const raw = items[index]
    if (parsed === null || id === null || id === undefined || !isObject(raw)) return
    const ctime = typeof raw['ctime'] === 'number' ? raw['ctime'] : 0
    entries.push({
      id,
      vaultId,
      path: parsed.path,
      addedAt: new Date(ctime).toISOString(),
      order: entries.length,
      type: parsed.type,
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
  })
  return { entries, items: items as RawItem[], rawById }
}

/** The item for an entry, on top of the raw item it came from (if any) so unknown fields survive. */
function entryToItem(entry: FavoriteEntry, raw: RawItem | undefined): RawItem {
  const type = entry.type ?? 'file'
  const item: RawItem = { ...(raw ?? {}) }
  if (type === 'search') {
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

/**
 * The `items` to write: the file's previous items, with the entries Slatebase shows replaced,
 * reordered, removed or added. Items it does not show keep their place; the entries take the places
 * of the ones they replace in their new order, new entries go to the end.
 */
export function entriesToItems(entries: FavoriteEntry[], previous: LoadedBookmarks): RawItem[] {
  const queue = [...entries].sort((a, b) => a.order - b.order).map((entry) => entryToItem(entry, previous.rawById.get(entry.id)))
  const shown = new Set(previous.rawById.values())
  const result: RawItem[] = []
  for (const item of previous.items) {
    if (!shown.has(item)) {
      result.push(item) // not ours: kept where it is
      continue
    }
    const next = queue.shift()
    if (next !== undefined) result.push(next)
  }
  result.push(...queue)
  return result
}
