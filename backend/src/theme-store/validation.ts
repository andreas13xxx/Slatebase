import { z } from 'zod'
import { compareSemver } from '../shared/semver.js'
import type { ThemeScreenshot } from './types.js'

// ─── Repo ─────────────────────────────────────────────────────────────────────

const REPO_PATTERN = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/

/**
 * True for a GitHub `owner/repo`. Stricter than the plugin store's pattern: a segment made only of dots (`..`, `.`)
 * is rejected, because the value is interpolated into a URL path and `../x` would climb out of it.
 */
export function isValidRepo(repo: string): boolean {
  if (!REPO_PATTERN.test(repo)) return false
  return repo.split('/').every((segment) => !/^\.+$/.test(segment))
}

// ─── Catalog ──────────────────────────────────────────────────────────────────

/** Upper bounds on the catalog, far above the ~910 entries upstream has today. */
export const MAX_CATALOG_BYTES = 5 * 1024 * 1024
export const MAX_CATALOG_ENTRIES = 5000

/** Schema for one entry of `community-css-themes.json`. */
export const communityThemeEntrySchema = z.object({
  name: z.string().trim().min(1).max(200),
  author: z.string().max(200).default(''),
  repo: z.string().refine(isValidRepo, 'repo must be "owner/repo"'),
  screenshot: z.string().max(500).default(''),
  modes: z.array(z.string()).default([]).transform((modes) => modes.filter((m): m is 'dark' | 'light' => m === 'dark' || m === 'light')),
  legacy: z.boolean().default(false),
})

// ─── Screenshot ───────────────────────────────────────────────────────────────

/** Screenshots above this size are not proxied (the card shows a placeholder). */
export const MAX_SCREENSHOT_BYTES = 2 * 1024 * 1024

/**
 * Turns the repo-relative screenshot path from the catalog into a URL path: strips leading `./` and `/`, rejects `..`
 * segments, percent-encodes each segment. Returns null when nothing usable is left.
 */
export function normalizeScreenshotPath(raw: string): string | null {
  const trimmed = raw.trim().replace(/^(\.\/)+/, '').replace(/^\/+/, '')
  if (trimmed === '') return null
  const segments = trimmed.split('/')
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) return null
  return segments.map((segment) => encodeURIComponent(segment)).join('/')
}

/**
 * Identifies PNG, JPEG, GIF and WebP by their leading bytes. The upstream `Content-Type` is not trusted:
 * SVG (script-capable) and unknown types yield null.
 */
export function sniffImageType(data: Buffer): ThemeScreenshot['contentType'] | null {
  if (data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png'
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'image/jpeg'
  if (data.length >= 6 && (data.subarray(0, 6).toString('latin1') === 'GIF87a' || data.subarray(0, 6).toString('latin1') === 'GIF89a')) return 'image/gif'
  if (data.length >= 12 && data.subarray(0, 4).toString('latin1') === 'RIFF' && data.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp'
  return null
}

// ─── Versions ─────────────────────────────────────────────────────────────────

const VERSION_PATTERN = /^v?(\d+(?:\.\d+){0,3})(?:[-+].*)?$/

/** Numeric core of a version (`v1.2.3-beta` → `1.2.3`), or null if it is not a dotted number. */
export function parseVersion(version: unknown): string | null {
  if (typeof version !== 'string') return null
  const match = VERSION_PATTERN.exec(version.trim())
  return match?.[1] ?? null
}

/**
 * Whether `remote` is newer than `installed`. Null means "cannot tell" (either side not parseable) — the caller
 * must treat that as unknown, never as "no update". Pre-release suffixes are ignored.
 */
export function isNewerVersion(installed: unknown, remote: unknown): boolean | null {
  const a = parseVersion(installed)
  const b = parseVersion(remote)
  if (a === null || b === null) return null
  return compareSemver(a, b) === -1
}
