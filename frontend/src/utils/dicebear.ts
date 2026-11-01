/**
 * DiceBear avatar URL builder.
 *
 * Pure string construction only — no network calls. The gallery renders each
 * URL via an `<img src>`, so DiceBear stays entirely outside the app's fetch
 * surface (no CSP `connect-src` change). The host is fixed to
 * `api.dicebear.com`, matching the backend's allowlist for `avatarDicebear`.
 */

/** DiceBear API version this builder targets. */
export const DICEBEAR_VERSION = '9.x'

/** DiceBear host, pinned to match the backend `avatarDicebear` allowlist. */
export const DICEBEAR_HOST = 'api.dicebear.com'

/**
 * The curated set of DiceBear styles offered in the gallery. Each is a free,
 * self-hosted-by-DiceBear style id from the public catalog.
 */
export const DICEBEAR_STYLES = [
  'adventurer',
  'avataaars',
  'bottts',
  'fun-emoji',
  'icons',
  'identicon',
  'initials',
  'lorelei',
  'notionists',
  'pixel-art',
  'shapes',
  'thumbs',
] as const

/** A DiceBear style id from {@link DICEBEAR_STYLES}. */
export type DicebearStyle = (typeof DICEBEAR_STYLES)[number]

/**
 * Builds a DiceBear SVG URL for a style + seed.
 *
 * The seed is first reduced to a safe identifier character set
 * (`[A-Za-z0-9._-]`) and then URL-encoded, so no user-controlled
 * meta-characters from the username can reach the URL that is later used as an
 * `<img src>`. The host and path segments are fixed literals, so the result is
 * always a constant-host `https://api.dicebear.com/...` URL.
 */
export function dicebearUrl(style: DicebearStyle, seed: string): string {
  const safeSeed = seed.replace(/[^A-Za-z0-9._-]/g, '') || 'avatar'
  return `https://${DICEBEAR_HOST}/${DICEBEAR_VERSION}/${style}/svg?seed=${encodeURIComponent(safeSeed)}`
}

/**
 * Derives a stable set of gallery seeds from a base string (the username),
 * so a given user always sees the same gallery and a picked avatar is
 * reproducible. Returns `count` seeds.
 */
export function dicebearSeeds(base: string, count: number = 6): string[] {
  const seeds: string[] = []
  for (let i = 0; i < count; i++) {
    seeds.push(i === 0 ? base : `${base}-${i}`)
  }
  return seeds
}
