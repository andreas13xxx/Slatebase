// `<vault>/.obsidian/types.json` — the property types Obsidian keeps for a vault:
//
//   { "types": { "aliases": "multitext", "cssclasses": "multitext", "tags": "tags", "capo": "number" } }
//
// It holds only the types a user chose on purpose; every other property gets its type from its
// value. The names Obsidian writes are not documented. Seen in real files: `multitext` (the "List"
// type; also used for `aliases`), `tags`, `number`. `text`, `checkbox`, `date`, `datetime` are
// assumed to be written as they are named in the UI. A name this module does not know is kept in
// the file untouched and reported to the console.

import type { PropertyType } from './types.js'

/** Obsidian's type name → Slatebase's. */
const FROM_OBSIDIAN: Record<string, PropertyType> = {
  text: 'text',
  number: 'number',
  checkbox: 'checkbox',
  date: 'date',
  datetime: 'datetime',
  multitext: 'list',
  tags: 'tags',
  aliases: 'aliases',
}

/**
 * Slatebase's type for a name from `types.json`, or null if the name is not known. The reserved
 * `aliases` key is a list in Obsidian's file (`multitext`), a type of its own in Slatebase.
 */
export function fromObsidianType(key: string, name: unknown): PropertyType | null {
  if (typeof name !== 'string') return null
  if (key === 'aliases' && (name === 'multitext' || name === 'aliases')) return 'aliases'
  return Object.hasOwn(FROM_OBSIDIAN, name) ? (FROM_OBSIDIAN[name] ?? null) : null
}

/** The name `types.json` gets for a Slatebase type. */
export function toObsidianType(type: PropertyType): string {
  switch (type) {
    case 'list':
    case 'aliases':
      return 'multitext'
    default:
      return type
  }
}
