/**
 * Accent-insensitive search normalization (Obsidian 1.15 / 1.15.1).
 *
 * `foldForSearch` lowercases, strips combining accents (so `é` → `e`, `ä` → `a`)
 * and replaces letters that have no decomposition (`ø ł đ ð ħ ı ß æ œ þ`) with
 * their ASCII spelling (`ß` → `ss`, `æ` → `ae`, …). German umlauts fold to the
 * base letter, NOT to `ae/oe/ue` — this mirrors Obsidian.
 *
 * Some replacements change the length, so a folded match position can differ
 * from the position in the original text. `FoldedText.map` records, for every
 * UTF-16 unit of the folded text, the index of the original code point it came
 * from; `toOriginalRange` converts a folded range back for highlighting.
 */

export interface FoldedText {
  /** The folded text. */
  text: string
  /** `map[i]` = index in the original string for folded position `i`; `null` when positions are identical. */
  map: number[] | null
}

const SPECIAL_LETTERS: Readonly<Record<string, string>> = {
  'ø': 'o',
  'ł': 'l',
  'đ': 'd',
  'ð': 'd',
  'ħ': 'h',
  'ı': 'i',
  'ß': 'ss',
  'æ': 'ae',
  'œ': 'oe',
  'þ': 'th',
}

const ASCII_ONLY = /^[\x00-\x7f]*$/
const COMBINING_MARK = /\p{M}/u

export function foldForSearch(input: string): FoldedText {
  if (ASCII_ONLY.test(input)) return { text: input.toLowerCase(), map: null }

  let out = ''
  const map: number[] = []
  let index = 0
  for (const ch of input) {
    const origin = index
    index += ch.length
    for (const part of ch.toLowerCase().normalize('NFD')) {
      if (COMBINING_MARK.test(part)) continue
      const replacement = SPECIAL_LETTERS[part] ?? part
      for (let k = 0; k < replacement.length; k++) {
        out += replacement[k]
        map.push(origin)
      }
    }
  }
  return { text: out, map }
}

/** Folds a query string (positions are irrelevant for queries). */
export function foldQuery(input: string): string {
  return foldForSearch(input).text
}

/**
 * Converts a half-open range `[from, to)` in the folded text to the matching
 * half-open range in the original text.
 */
export function toOriginalRange(
  folded: FoldedText,
  original: string,
  from: number,
  to: number,
): [number, number] {
  const { map } = folded
  if (!map) return [from, to]
  const start = map[from] ?? original.length
  const lastIndex = map[to - 1] ?? start
  const codePoint = original.codePointAt(lastIndex)
  const end = lastIndex + (codePoint !== undefined && codePoint > 0xffff ? 2 : 1)
  return [start, Math.max(end, start)]
}

/** Merges touching or overlapping ranges (keeps highlight output tidy after folding). */
export function mergeRanges(ranges: Array<[number, number]>): Array<[number, number]> {
  const merged: Array<[number, number]> = []
  for (const [from, to] of ranges) {
    const last = merged[merged.length - 1]
    if (last && from <= last[1]) last[1] = Math.max(last[1], to)
    else merged.push([from, to])
  }
  return merged
}
