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

/** Device names Windows refuses as file or folder names, with or without an extension. */
const WINDOWS_RESERVED_NAME = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i

/** Returns true if `id` is safe to use as a theme folder name on every supported platform. */
export function isValidThemeId(id: string): boolean {
  return THEME_ID_PATTERN.test(id) && !/[. ]$/.test(id) && !WINDOWS_RESERVED_NAME.test(id)
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
  themeId: z.union([themeIdSchema, z.null()]),
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
