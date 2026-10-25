import { z } from 'zod'
import type { ThemeManifest } from './types.js'

/**
 * Maximum `theme.css` size: 3 MB (Minimal is ~270 KB; snippets stay at 512 KB). Measured against the Obsidian community
 * catalog: the median theme is 37 KB, 3 MB admits 824 of 911 listed themes (2 MB would be 818).
 */
export const MAX_THEME_CSS_SIZE = 3 * 1024 * 1024

/**
 * Theme ids are folder names. Letters, digits, space, `_`, `.`, `-`; must start
 * alphanumeric (rules out `.`, `..` and dot-folders) and must not end in `.` or
 * space (Windows strips those, so two ids could collide on disk).
 */
const THEME_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 _.-]{0,119}$/

/**
 * Id under which the Obsidian-look theme that ships with Slatebase is stored as `cssTheme` in `appearance.json`.
 * The colon keeps it out of {@link isValidThemeId}, so it can never be a theme folder name and never collides with one.
 */
export const BUILTIN_OBSIDIAN_THEME_ID = 'builtin:obsidian'

/** Ids of the themes that ship with the frontend bundle: selectable per vault, but no folder, no CSS in the vault. */
const BUILTIN_THEME_IDS: readonly string[] = [BUILTIN_OBSIDIAN_THEME_ID]

/** Returns true if `id` names a theme that ships with Slatebase rather than a folder under `.obsidian/themes/`. */
export function isBuiltinThemeId(id: string): boolean {
  return BUILTIN_THEME_IDS.includes(id)
}

/** Device names Windows refuses as file or folder names, with or without an extension. */
const WINDOWS_RESERVED_NAME = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i

/** Returns true if `id` is safe to use as a theme folder name on every supported platform. */
export function isValidThemeId(id: string): boolean {
  return THEME_ID_PATTERN.test(id) && !/[. ]$/.test(id) && !WINDOWS_RESERVED_NAME.test(id)
}

/** True for ids the backend refuses even though they match the character pattern: `active` and Windows device names. */
function isReservedThemeId(id: string): boolean {
  return id.toLowerCase() === 'active' || WINDOWS_RESERVED_NAME.test(id)
}

/**
 * Derives a valid theme folder name from a display name (mirrors `toThemeId` in the frontend's `themeImport.ts`):
 * strips characters the backend refuses, trims, and appends `-theme` for reserved names.
 * Returns null when nothing usable is left (for example a name made only of symbols).
 */
export function toThemeId(rawName: string): string | null {
  const cleaned = rawName
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9 _.-]/g, '')
    .replace(/^[^A-Za-z0-9]+/, '')
    .replace(/[. ]+$/, '')
    .slice(0, 100) // leaves room for the "-theme" suffix within the 120 characters the pattern allows
    .replace(/[. ]+$/, '')
  if (cleaned === '') return null
  return isReservedThemeId(cleaned) ? `${cleaned}-theme` : cleaned
}

/** Schema for the theme id route parameter. `active` is reserved for the selection endpoint. */
export const themeIdSchema = z.string()
  .refine(isValidThemeId, 'Invalid theme ID: letters, digits, space, underscore, dot and hyphen only, and not a reserved system name')
  .refine((id) => id.toLowerCase() !== 'active', 'The theme ID "active" is reserved')

const manifestSchema = z.object({
  name: z.string().max(200).optional(),
  version: z.string().max(50).optional(),
  author: z.string().max(200).optional(),
  authorUrl: z.string().max(500).optional(),
  minAppVersion: z.string().max(50).optional(),
})

/** Body of `PUT /themes/:themeId`. */
export const saveThemeSchema = z.object({
  css: z.string(),
  manifest: manifestSchema.optional(),
})

/** Body of `PUT /themes/active`. */
export const setActiveThemeSchema = z.object({
  themeId: z.union([z.string().refine(isBuiltinThemeId), themeIdSchema, z.null()]),
})

export type SaveThemeInput = z.infer<typeof saveThemeSchema>

/**
 * Normalises an untrusted manifest (parsed JSON of unknown shape) into a
 * {@link ThemeManifest}. Unknown fields are dropped; a missing/blank name falls
 * back to the theme id.
 */
export function normalizeManifest(raw: unknown, themeId: string): ThemeManifest {
  const parsed = manifestSchema.safeParse(raw)
  const data = parsed.success ? parsed.data : {}
  const manifest: ThemeManifest = { name: data.name !== undefined && data.name.trim() !== '' ? data.name : themeId }
  if (data.version !== undefined) manifest.version = data.version
  if (data.author !== undefined) manifest.author = data.author
  if (data.authorUrl !== undefined) manifest.authorUrl = data.authorUrl
  if (data.minAppVersion !== undefined) manifest.minAppVersion = data.minAppVersion
  return manifest
}

/**
 * Whether a stylesheet carries a Style Settings block: a comment that starts with `@settings` (optionally `/*!`) and
 * has a line break right after it. This is the plugin's own start pattern (`settingRegExp` in obsidian-style-settings),
 * so a block it would read is a block we report, and a lookalike it ignores is one we ignore. The whitespace run is
 * bounded, so the test is linear in the input.
 */
export function hasStyleSettingsBlock(css: string): boolean {
  return /\/\*!?\s{0,200}@settings[\r\n]/.test(css)
}

/**
 * Extracts the hostnames a stylesheet loads resources from via `@import` or
 * `url(...)` with an absolute (`http(s):` or protocol-relative) address. Data
 * URIs and relative URLs are ignored. The pattern has a single bounded
 * whitespace run and no nested quantifiers, so it is linear in the input.
 */
export function extractExternalHosts(css: string): string[] {
  const hosts = new Set<string>()
  const pattern = /(?:@import|url\()\s*['"]?((?:https?:)?\/\/[^'")\s;]+)/gi
  for (const match of css.matchAll(pattern)) {
    const address = match[1] as string
    try {
      hosts.add(new URL(address.startsWith('//') ? `https:${address}` : address).hostname)
    } catch {
      // Not a parseable URL — nothing to report.
    }
  }
  return [...hosts].sort()
}
