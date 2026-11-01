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
  // Build via the URL API (not string concatenation) so the result is a
  // structured, host-pinned URL: the origin is a fixed literal and the seed
  // goes through URLSearchParams encoding. This also keeps static analysis from
  // treating the value as unsanitized DOM text when it is used as an <img src>.
  const url = new URL(`https://${DICEBEAR_HOST}/${DICEBEAR_VERSION}/${style}/svg`)
  url.searchParams.set('seed', safeSeed)
  return url.toString()
}

/**
 * Fixed gallery seed words. The gallery is only a picker, so the seeds are
 * constant literals — deliberately NOT derived from the username. Deriving them
 * from user input would route a user-controlled string into the `<img src>`
 * sink (a DOM-XSS taint path), and the stable-per-user nicety is not worth that.
 */
const GALLERY_SEEDS = [
  'avatar', 'nova', 'ember', 'coral', 'slate', 'willow',
  'maple', 'pebble', 'quartz', 'iris', 'cedar', 'flint',
] as const

/**
 * Returns a stable set of gallery seeds. The `_base` argument is accepted for
 * call-site compatibility but intentionally ignored — see {@link GALLERY_SEEDS}.
 */
export function dicebearSeeds(_base: string, count: number = 6): string[] {
  return GALLERY_SEEDS.slice(0, Math.min(count, GALLERY_SEEDS.length))
}
