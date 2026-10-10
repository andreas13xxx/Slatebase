/**
 * Shared definition of Obsidian-compatible highlight colors.
 *
 * Obsidian 1.14 added colored highlights: a leading color emoji inside a
 * `==...==` highlight picks its color (🔴 red, 🟠 orange, 🟢 green, 🔵 blue,
 * 🟣 purple); a plain `==text==` with no emoji stays the default yellow. The
 * emoji is part of the stored Markdown, so a highlight round-trips as portable
 * text that other Obsidian-compatible tools understand.
 *
 * This module is the ONE place the color set is declared. The Live Preview
 * decorator (`editor/live-preview/inline-decorations.ts`), the reading-view
 * remark plugin (`plugins/highlight/`) and the `==`-autocomplete all import
 * from here, so the three surfaces cannot drift on which emoji means which
 * color or which CSS class carries it.
 *
 * @module highlight-colors
 */

/** Stable color identifier used as the CSS class suffix (`cm-lp-hl-<name>` / `hl-<name>`). */
export type HighlightColorName = 'yellow' | 'red' | 'orange' | 'green' | 'blue' | 'purple'

/** One selectable highlight color. */
export interface HighlightColor {
  /** Stable identifier; also the CSS class suffix. */
  readonly name: HighlightColorName
  /** Leading emoji that selects this color inside `==...==`. `null` for the default (no emoji). */
  readonly emoji: string | null
  /** Human-facing label (German UI). */
  readonly label: string
}

/**
 * The six highlight colors, in menu/autocomplete order. `yellow` is the
 * default (no emoji) and is listed first; the five emoji colors follow in
 * Obsidian's own order.
 */
export const HIGHLIGHT_COLORS: readonly HighlightColor[] = [
  { name: 'yellow', emoji: null, label: 'Gelb (Standard)' },
  { name: 'red', emoji: '🔴', label: 'Rot' },
  { name: 'orange', emoji: '🟠', label: 'Orange' },
  { name: 'green', emoji: '🟢', label: 'Grün' },
  { name: 'blue', emoji: '🔵', label: 'Blau' },
  { name: 'purple', emoji: '🟣', label: 'Lila' },
]

/** Emoji -> color name, built once from {@link HIGHLIGHT_COLORS}. */
const EMOJI_TO_COLOR = new Map<string, HighlightColorName>(
  HIGHLIGHT_COLORS.flatMap((c) => (c.emoji ? [[c.emoji, c.name] as const] : []))
)

/**
 * Result of inspecting a highlight's inner content for a leading color emoji.
 * `color` is the resolved color (default `yellow` when no emoji leads the
 * content); `markerLength` is how many UTF-16 code units the emoji (plus the
 * single optional separating space) occupies, so callers can style only the
 * text after it, or leave the emoji visible.
 */
export interface HighlightColorMatch {
  readonly color: HighlightColorName
  /** Length in UTF-16 code units of the leading emoji + optional single space, or 0 when none. */
  readonly markerLength: number
}

/**
 * Inspects the inner text of a highlight (the part between the `==` markers)
 * for a leading color emoji. Returns the resolved color and how long the
 * leading emoji marker is. A plain highlight with no leading emoji resolves to
 * `yellow` with `markerLength` 0.
 *
 * The emoji may be followed by a single space, which is treated as part of the
 * marker so `==🔴 text==` highlights "text" the same as `==🔴text==`.
 */
export function matchHighlightColor(inner: string): HighlightColorMatch {
  // Color emojis are outside the BMP, so a single emoji is two UTF-16 code
  // units; iterate by code point to read the first visible character.
  const first = [...inner][0]
  if (first) {
    const color = EMOJI_TO_COLOR.get(first)
    if (color) {
      let markerLength = first.length
      if (inner[markerLength] === ' ') markerLength += 1
      return { color, markerLength }
    }
  }
  return { color: 'yellow', markerLength: 0 }
}
