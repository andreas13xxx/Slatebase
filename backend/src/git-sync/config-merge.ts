// Three-way merge of Obsidian's JSON config files after `git merge` stopped on a conflict.
//
// Git merges JSON line by line and gives up as soon as both sides touched neighbouring lines. The
// files in this list are settings, not prose: two devices that changed different keys can both be
// right. This module merges the three versions (common base, ours, theirs) by key.
//
// Rules, per key (nested one level for the maps named in NESTED):
//   - both sides equal                     → that value
//   - only one side changed (or deleted)   → the changed side (a one-sided delete stays deleted)
//   - both changed differently             → the side whose commit is newer; reported as a decision
// bookmarks.json: `items` is merged as a list whose entries are matched by identity (type + path /
// query / url / title + subpath); groups merge recursively. An entry removed on one side stays
// removed unless the other side changed it.
//
// Nothing here touches git or the file system.

import { describeValue } from '@slatebase/shared-contracts'

/** Files this module may resolve. Anything else is left to the user. */
export const AUTO_RESOLVABLE_FILES = [
  'app.json', 'appearance.json', 'daily-notes.json', 'bookmarks.json',
  'hotkeys.json', 'graph.json', 'types.json', 'workspaces.json',
] as const

/** Maps whose entries merge on their own (a saved workspace, a property type) instead of as one value. */
const NESTED: Record<string, string> = { 'workspaces.json': 'workspaces', 'types.json': 'types' }

export type JsonObject = Record<string, unknown>

/** A key both sides changed differently; `kept` is the side that won. */
export interface MergeDecision {
  path: string
  ours: string
  theirs: string
  kept: 'ours' | 'theirs'
}

export interface ConfigMergeResult {
  merged: JsonObject
  decisions: MergeDecision[]
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

type Winner = 'ours' | 'theirs'

/** Merges one value that may be absent (`undefined`). Returns `undefined` for "delete the key". */
function mergeValue(
  path: string, base: unknown, ours: unknown, theirs: unknown, oursNewer: boolean, decisions: MergeDecision[],
): unknown {
  if (same(ours, theirs)) return ours
  if (same(base, ours)) return theirs
  if (same(base, theirs)) return ours
  const kept: Winner = oursNewer ? 'ours' : 'theirs'
  decisions.push({ path, ours: describeValue(ours), theirs: describeValue(theirs), kept })
  return kept === 'ours' ? ours : theirs
}

function mergeObjects(
  path: string, base: JsonObject, ours: JsonObject, theirs: JsonObject, oursNewer: boolean,
  decisions: MergeDecision[], nestedKey?: string,
): JsonObject {
  const result: JsonObject = {}
  const keys = [...Object.keys(ours), ...Object.keys(theirs).filter((key) => !(key in ours))]
  for (const key of keys) {
    const keyPath = path === '' ? key : `${path}.${key}`
    let value: unknown
    if (key === nestedKey && isObject(ours[key]) && isObject(theirs[key])) {
      value = mergeObjects(
        keyPath, isObject(base[key]) ? base[key] : {}, ours[key], theirs[key], oursNewer, decisions,
      )
    } else {
      value = mergeValue(keyPath, base[key], ours[key], theirs[key], oursNewer, decisions)
    }
    if (value !== undefined) result[key] = value
  }
  return result
}

// ─── bookmarks.json ──────────────────────────────────────────────────────────

function itemIdentity(item: unknown): string {
  if (!isObject(item)) return JSON.stringify(item)
  const part = (key: string): string => (typeof item[key] === 'string' ? (item[key] as string) : '')
  if (item['type'] === 'group') return `group\0${part('title')}`
  return [part('type'), part('path'), part('subpath'), part('query'), part('url'), part('title')].join('\0')
}

/** Identities with a counter, so two entries that look alike do not collapse into one. */
function identities(items: unknown[]): string[] {
  const seen = new Map<string, number>()
  return items.map((item) => {
    const base = itemIdentity(item)
    const count = (seen.get(base) ?? 0) + 1
    seen.set(base, count)
    return `${base}\0#${count}`
  })
}

function mergeItemLists(
  path: string, base: unknown[], ours: unknown[], theirs: unknown[], oursNewer: boolean, decisions: MergeDecision[],
): unknown[] {
  const baseIds = identities(base)
  const ourIds = identities(ours)
  const theirIds = identities(theirs)
  const baseById = new Map(baseIds.map((id, i) => [id, base[i]]))
  const theirById = new Map(theirIds.map((id, i) => [id, theirs[i]]))
  const ourById = new Map(ourIds.map((id, i) => [id, ours[i]]))
  const result: unknown[] = []

  const mergeEntry = (id: string, o: unknown, t: unknown): unknown => {
    const b = baseById.get(id)
    if (isObject(o) && isObject(t) && o['type'] === 'group' && t['type'] === 'group') {
      const entryPath = `${path}[${String(o['title'])}]`
      const nested = mergeObjects(entryPath, isObject(b) ? b : {}, { ...o, items: undefined }, { ...t, items: undefined }, oursNewer, decisions)
      const items = mergeItemLists(
        `${entryPath}.items`,
        isObject(b) && Array.isArray(b['items']) ? b['items'] : [],
        Array.isArray(o['items']) ? o['items'] : [],
        Array.isArray(t['items']) ? t['items'] : [],
        oursNewer, decisions,
      )
      return { ...nested, items }
    }
    return mergeValue(`${path}[${id.split('\0').filter(Boolean).slice(0, 3).join(' ')}]`, b, o, t, oursNewer, decisions)
  }

  ourIds.forEach((id, i) => {
    const o = ours[i]
    if (theirById.has(id)) {
      result.push(mergeEntry(id, o, theirById.get(id)))
    } else if (baseById.has(id) && same(baseById.get(id), o)) {
      // Removed on their side and untouched on ours: stays removed.
    } else {
      result.push(o)
    }
  })
  theirIds.forEach((id, i) => {
    if (ourById.has(id)) return
    const t = theirs[i]
    if (baseById.has(id) && same(baseById.get(id), t)) return // removed on our side, untouched on theirs
    result.push(t)
  })
  return result
}

// ─── Entry point ─────────────────────────────────────────────────────────────

/**
 * Merges the three versions of `.obsidian/<file>`. `base` is `null` when the file did not exist at
 * the common ancestor (both sides added it). `oursNewer` decides every key both sides changed.
 * Returns `null` when the structure is not one this module handles (the caller leaves the conflict).
 */
export function mergeObsidianConfig(
  file: string, base: JsonObject | null, ours: JsonObject, theirs: JsonObject, oursNewer: boolean,
): ConfigMergeResult | null {
  if (!(AUTO_RESOLVABLE_FILES as readonly string[]).includes(file)) return null
  const decisions: MergeDecision[] = []
  const baseObject = base ?? {}
  const nestedKey = NESTED[file]
  if (file !== 'bookmarks.json') {
    return { merged: mergeObjects('', baseObject, ours, theirs, oursNewer, decisions, nestedKey), decisions }
  }

  // `items` is a list of entries: merge everything else by key, the list by entry, and put the
  // list back where it was in our file so the key order stays stable.
  const without = (object: JsonObject): JsonObject => ({ ...object, items: undefined })
  const others = mergeObjects('', without(baseObject), without(ours), without(theirs), oursNewer, decisions)
  const items = mergeItemLists(
    'items',
    Array.isArray(baseObject['items']) ? baseObject['items'] : [],
    Array.isArray(ours['items']) ? ours['items'] : [],
    Array.isArray(theirs['items']) ? theirs['items'] : [],
    oursNewer, decisions,
  )
  const merged: JsonObject = {}
  for (const key of Object.keys(ours)) merged[key] = key === 'items' ? items : others[key]
  for (const key of Object.keys(others)) if (!(key in merged)) merged[key] = others[key]
  if (!('items' in merged)) merged['items'] = items
  for (const key of Object.keys(merged)) if (merged[key] === undefined) delete merged[key]
  return { merged, decisions }
}
