/** Parsing of the Bases cards `image` property value. */

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i

/** What the cover area shows for one card. */
export type CardImage =
  | { kind: 'color'; color: string }
  | { kind: 'url'; src: string }
  | { kind: 'file'; target: string }

/** Classifies a raw image property value; null when there is nothing usable. */
export function parseCardImage(raw: string): CardImage | null {
  const value = raw.trim()
  if (!value) return null
  if (HEX_COLOR.test(value)) return { kind: 'color', color: value }
  const wiki = /^!?\[\[([^\]|#]+)/.exec(value)
  if (wiki) return { kind: 'file', target: wiki[1]!.trim() }
  if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value)
      if (url.protocol === 'http:' || url.protocol === 'https:') return { kind: 'url', src: url.href }
    } catch {
      return null
    }
    return null
  }
  return { kind: 'file', target: value }
}
