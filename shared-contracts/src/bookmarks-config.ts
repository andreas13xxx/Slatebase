// `<vault>/.obsidian/bookmarks.json` — the bookmarks of a vault, same for everyone who opens it:
//
//   { "items": [ { "type": "file", "path": "Note.md", "title": "..." },
//                { "type": "file", "path": "Note.md", "subpath": "#Heading" },
//                { "type": "search", "query": "tag:#todo", "title": "..." },
//                { "type": "group", "title": "Work", "items": [ ... ] } ] }
//
// Seen in real files and posts: the types `file`, `folder`, `url`, `search`, `group`, the fields
// `path`, `title`, `subpath` (heading `#Title`, block `#^id`), `query`, `items`. `graph` and `ctime`
// are assumed. Obsidian documents none of it, so the list is kept as the file has it: entries
// Slatebase has no use for (groups, folders, URLs, graphs, unknown types) are preserved untouched.

import { cfg, configDefaults, describeConfigDeviations, mergeConfig, type ConfigKeyMeta, type ConfigValues } from './config-table.js'

export const BOOKMARKS_CONFIG_KEYS = {
  items: cfg.json([], 1024 * 1024, true),
} as const satisfies Record<string, ConfigKeyMeta>

export type BookmarksConfigValues = ConfigValues<typeof BOOKMARKS_CONFIG_KEYS>

export const BOOKMARKS_CONFIG_DEFAULTS: Readonly<BookmarksConfigValues> = configDefaults(BOOKMARKS_CONFIG_KEYS)

/** Entry types of bookmarks.json that are known (seen or assumed). */
export const BOOKMARK_ITEM_TYPES = ['file', 'folder', 'url', 'search', 'group', 'graph'] as const

/** Most entries a vault's bookmarks may have; a guard, not a product limit (Obsidian has none). */
export const MAX_BOOKMARK_ITEMS = 5000

export function describeBookmarksDeviations(fields: Record<string, unknown>): Array<{ key: string; reason: string }> {
  const deviations = describeConfigDeviations(BOOKMARKS_CONFIG_KEYS, fields)
  const items = fields['items']
  if (items !== undefined && !Array.isArray(items)) {
    deviations.push({ key: 'items', reason: 'expected a list of bookmarks' })
    return deviations
  }
  if (Array.isArray(items)) collectItemDeviations(items, 'items', deviations)
  return deviations
}

function collectItemDeviations(items: unknown[], path: string, into: Array<{ key: string; reason: string }>): void {
  items.forEach((item, index) => {
    const here = `${path}.${index}`
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      into.push({ key: here, reason: 'expected a bookmark object' })
      return
    }
    const entry = item as Record<string, unknown>
    const type = entry['type']
    if (typeof type !== 'string' || !(BOOKMARK_ITEM_TYPES as readonly string[]).includes(type)) {
      into.push({ key: `${here}.type`, reason: `unknown bookmark type ${JSON.stringify(type)?.slice(0, 80)}` })
    } else if (type === 'group' && Array.isArray(entry['items'])) {
      collectItemDeviations(entry['items'], `${here}.items`, into)
    }
  })
}

/** The file's list if it is a list (at most MAX_BOOKMARK_ITEMS entries), else the empty list; other keys pass through. */
export function mergeBookmarksConfig(fields: Record<string, unknown>): Record<string, unknown> {
  const merged = mergeConfig(BOOKMARKS_CONFIG_KEYS, BOOKMARKS_CONFIG_DEFAULTS, fields)
  merged['items'] = Array.isArray(merged['items']) ? merged['items'].slice(0, MAX_BOOKMARK_ITEMS) : []
  return merged
}
