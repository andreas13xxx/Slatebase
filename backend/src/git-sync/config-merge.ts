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
// removed unless the other side changed it. A rename counts as remove + add (known limit).
//
// Both devices must produce the same bytes from the same two commits, or they would conflict again
// on the merge result. The newer side therefore sets the order of keys and entries (the other side's
// additions follow), and "newer" is the same physical commit on both ends.
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

/** A key both sides changed differently. `kept` names the side whose value is in the result. */
export interface MergeDecision {
  path: string
  kept: 'ours' | 'theirs'
  keptValue: string
  droppedValue: string
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

/** Own properties only: a key called `constructor` or `toString` must not find Object.prototype. */
function get(object: JsonObject, key: string): unknown {
  return Object.hasOwn(object, key) ? object[key] : undefined
}

/** Without a prototype, so a key called `__proto__` becomes an ordinary property. */
function newObject(): JsonObject {
  return Object.create(null) as JsonObject
}

// In the functions below `primary` is the newer side and `secondary` the older one.

interface Context {
  /** Which real side `primary` is. */
  primarySide: 'ours' | 'theirs'
  decisions: MergeDecision[]
}

function mergeValue(ctx: Context, path: string, base: unknown, primary: unknown, secondary: unknown): unknown {
  if (same(primary, secondary)) return primary
  if (same(base, primary)) return secondary
  if (same(base, secondary)) return primary
  ctx.decisions.push({ path, kept: ctx.primarySide, keptValue: describeValue(primary), droppedValue: describeValue(secondary) })
  return primary
}

function mergeObjects(
  ctx: Context, path: string, base: JsonObject, primary: JsonObject, secondary: JsonObject, nestedKey?: string,
): JsonObject {
  const result = newObject()
  const keys = [...Object.keys(primary), ...Object.keys(secondary).filter((key) => !Object.hasOwn(primary, key))]
  for (const key of keys) {
    const keyPath = path === '' ? key : `${path}.${key}`
    const p = get(primary, key)
    const s = get(secondary, key)
    const b = get(base, key)
    const value = key === nestedKey && isObject(p) && isObject(s)
      ? mergeObjects(ctx, keyPath, isObject(b) ? b : {}, p, s)
      : mergeValue(ctx, keyPath, b, p, s)
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
    const identity = itemIdentity(item)
    const count = (seen.get(identity) ?? 0) + 1
    seen.set(identity, count)
    return `${identity}\0#${count}`
  })
}

function mergeItemLists(ctx: Context, path: string, base: unknown[], primary: unknown[], secondary: unknown[]): unknown[] {
  const baseIds = identities(base)
  const primaryIds = identities(primary)
  const secondaryIds = identities(secondary)
  const baseById = new Map(baseIds.map((id, i) => [id, base[i]]))
  const secondaryById = new Map(secondaryIds.map((id, i) => [id, secondary[i]]))
  const primaryById = new Map(primaryIds.map((id, i) => [id, primary[i]]))
  const result: unknown[] = []

  const mergeEntry = (id: string, p: unknown, s: unknown): unknown => {
    const b = baseById.get(id)
    if (isObject(p) && isObject(s) && p['type'] === 'group' && s['type'] === 'group') {
      const entryPath = `${path}[${String(p['title'])}]`
      const without = (object: JsonObject): JsonObject => ({ ...object, items: undefined })
      const fields = mergeObjects(ctx, entryPath, isObject(b) ? without(b) : {}, without(p), without(s))
      const items = mergeItemLists(
        ctx, `${entryPath}.items`,
        isObject(b) && Array.isArray(b['items']) ? b['items'] : [],
        Array.isArray(p['items']) ? p['items'] : [],
        Array.isArray(s['items']) ? s['items'] : [],
      )
      delete fields['items']
      return { ...fields, items }
    }
    return mergeValue(ctx, `${path}[${id.split('\0').filter(Boolean).slice(0, 3).join(' ')}]`, b, p, s)
  }

  primaryIds.forEach((id, i) => {
    const p = primary[i]
    if (secondaryById.has(id)) {
      result.push(mergeEntry(id, p, secondaryById.get(id)))
    } else if (baseById.has(id) && same(baseById.get(id), p)) {
      // Removed on the other side and untouched here: stays removed.
    } else {
      result.push(p)
    }
  })
  secondaryIds.forEach((id, i) => {
    if (primaryById.has(id)) return
    const s = secondary[i]
    if (baseById.has(id) && same(baseById.get(id), s)) return // removed on the newer side, untouched here
    result.push(s)
  })
  return result
}

// ─── Entry point ─────────────────────────────────────────────────────────────

/**
 * Merges the three versions of `.obsidian/<file>`. `base` is `null` when the file did not exist at
 * the common ancestor (both sides added it). `oursNewer` decides every key both sides changed and
 * sets the order. Returns `null` when the structure is not one this module handles (the caller
 * leaves the conflict to the user).
 */
export function mergeObsidianConfig(
  file: string, base: JsonObject | null, ours: JsonObject, theirs: JsonObject, oursNewer: boolean,
): ConfigMergeResult | null {
  if (!(AUTO_RESOLVABLE_FILES as readonly string[]).includes(file)) return null
  const baseObject = base ?? {}
  const ctx: Context = { primarySide: oursNewer ? 'ours' : 'theirs', decisions: [] }
  const primary = oursNewer ? ours : theirs
  const secondary = oursNewer ? theirs : ours

  if (file !== 'bookmarks.json') {
    return { merged: mergeObjects(ctx, '', baseObject, primary, secondary, NESTED[file]), decisions: ctx.decisions }
  }

  // `items` is a list of entries: merge everything else by key and the list by entry.
  for (const object of [baseObject, primary, secondary]) {
    if (get(object, 'items') !== undefined && !Array.isArray(get(object, 'items'))) return null
  }
  const without = (object: JsonObject): JsonObject => ({ ...object, items: undefined })
  const fields = mergeObjects(ctx, '', without(baseObject), without(primary), without(secondary))
  const items = mergeItemLists(
    ctx, 'items',
    Array.isArray(baseObject['items']) ? baseObject['items'] : [],
    Array.isArray(primary['items']) ? primary['items'] : [],
    Array.isArray(secondary['items']) ? secondary['items'] : [],
  )
  // `items` keeps its place in the newer file.
  const merged = newObject()
  for (const key of Object.keys(primary)) {
    if (key === 'items') merged[key] = items
    else if (Object.hasOwn(fields, key)) merged[key] = fields[key]
  }
  for (const key of Object.keys(fields)) if (!Object.hasOwn(merged, key) && fields[key] !== undefined) merged[key] = fields[key]
  if (!Object.hasOwn(merged, 'items')) merged['items'] = items
  return { merged, decisions: ctx.decisions }
}
