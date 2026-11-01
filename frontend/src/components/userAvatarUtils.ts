/**
 * Pure helpers for rendering a user's avatar. DOM-free so they can be
 * unit-tested without a browser. The `UserAvatar` component consumes these.
 */

/**
 * Derives up to two uppercase initials from a name. Uses the first letter of
 * the first two whitespace-separated words, falling back to the first two
 * characters of a single word. Empty input yields `'?'`.
 */
export function getInitials(name: string): string {
  const trimmed = name.trim()
  if (trimmed === '') return '?'
  const parts = trimmed.split(/\s+/)
  if (parts.length >= 2) {
    return (parts[0]!.charAt(0) + parts[1]!.charAt(0)).toUpperCase()
  }
  return trimmed.slice(0, 2).toUpperCase()
}

/**
 * Palette for deterministic initials-tile background colours. Mid-tone hues so
 * both black and white text can meet contrast depending on the colour.
 */
const AVATAR_COLORS = [
  '#e4572e', '#f3a712', '#4c9f70', '#2d7dd2', '#8e44ad',
  '#d64550', '#1b998b', '#3d5a80', '#c1666b', '#5f6caf',
] as const

/**
 * Deterministically maps a name to one of the palette colours, so a given
 * user always gets the same tile colour without storing one.
 */
export function colorFromName(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0
  }
  const index = Math.abs(hash) % AVATAR_COLORS.length
  return AVATAR_COLORS[index]!
}

/**
 * Picks black or white text for a given `#rrggbb` background using the WCAG
 * relative-luminance threshold, so initials stay readable on any tile colour.
 * A malformed colour falls back to white text.
 */
export function readableTextColor(hexColor: string): '#000000' | '#ffffff' {
  const match = /^#([0-9a-fA-F]{6})$/.exec(hexColor)
  if (!match) return '#ffffff'
  const hex = match[1]!
  const r = parseInt(hex.slice(0, 2), 16) / 255
  const g = parseInt(hex.slice(2, 4), 16) / 255
  const b = parseInt(hex.slice(4, 6), 16) / 255
  const toLinear = (c: number): number =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  const luminance = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
  return luminance > 0.179 ? '#000000' : '#ffffff'
}
