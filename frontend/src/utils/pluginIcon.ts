/**
 * Shared resolution for icon names plugins pass around the Obsidian API
 * (`addRibbonIcon`, `ItemView.getIcon()`, context-panel tab metadata, ...).
 *
 * Every consumer must check the plugin's own `addIcon()`-registered SVGs
 * before falling back to a Lucide lookup — a plugin that registered its own
 * "replicate" icon expects to see that icon, not a generic Lucide stand-in.
 * Centralized here so that check can't be forgotten by a new render site.
 *
 * The Lucide lookup itself lives in `plugins/compat/lucide-icons.ts` — the
 * same resolver `window.obsidian.setIcon`/`getIcon` and `ItemView.addAction`
 * use for icons a plugin draws into its own DOM elements. This file used to
 * carry a second, independently-maintained Obsidian→Lucide alias table for
 * React call sites only; that table quietly diverged from the one in
 * lucide-icons.ts (missing aliases, no brand marks), so the exact same icon
 * name could render in a plugin's settings button but fall back to a generic
 * placeholder as a ribbon or tab icon. See `useIconResolutionTick` below for
 * how React call sites now get the async-resolved result from that resolver.
 */
import { useEffect, useReducer } from 'react'
import { subscribeToIconResolution } from '../plugins/compat/lucide-icons'
import { sanitizeSvgElement } from '../plugins/compat/sanitize-rendered-html'

/**
 * Forces the calling component to re-render whenever any icon finishes
 * resolving (see `resolveIconMarkupSync` in lucide-icons.ts). Call once per
 * component that renders plugin icon names via `resolveIconMarkupSync` —
 * needed because that function returns `null` synchronously while its
 * (per-icon, dynamic-import-backed) resolution is still in flight, and
 * without this the component would never know to pick up the real icon
 * once it lands.
 */
export function useIconResolutionTick(): void {
  const [, forceRerender] = useReducer((n: number) => n + 1, 0)
  useEffect(() => subscribeToIconResolution(() => forceRerender()), [])
}

/**
 * Read a plugin's own `addIcon()`-registered SVG for `iconId`, if any.
 *
 * The returned string is raw — callers MUST run it through
 * {@link sizeCustomIconSvg} before inserting it, never `= customSvg` directly.
 * An unsized `<svg>` (no width/height) doesn't just render at the "wrong"
 * size — its viewBox is whatever the plugin authored (e.g. `0 0 1024 1024`
 * for an icon-font-style SVG), so left unsized it renders at the browser's
 * intrinsic replaced-element size, which inside a small toolbar/menu button
 * looks indistinguishable from a missing icon rather than a sizing bug.
 */
export function getCustomIconSvg(iconId: string): string | undefined {
  return (window as unknown as { __obsidianCustomIcons?: Map<string, string> }).__obsidianCustomIcons?.get(iconId)
}

/**
 * A registered custom icon's content is either a full `<svg>...</svg>` string
 * or bare inner markup (Obsidian's `addIcon()` accepts both) meant for a
 * 100x100 viewBox. Normalizes either form to a sized, ready-to-inject
 * `<svg>` string — see {@link getCustomIconSvg} for why skipping this step
 * silently breaks rendering instead of just looking slightly off.
 */
export function sizeCustomIconSvg(svgContent: string, sizePx: number): string {
  const key = `${sizePx}|${svgContent}`
  const hit = sizedCache.get(key)
  if (hit !== undefined) return hit
  // Single choke point for every innerHTML/dangerouslySetInnerHTML sink: the
  // plugin's markup is untrusted. Sanitize first, size afterwards, so the
  // style attribute we add is the only one (sanitizing strips all others).
  let root: Element | null
  try {
    root = sanitizeSvgElement(svgContent, BARE_ICON_WRAPPER)
  } catch {
    root = null // pathological input: '' gets cached so the failure is not re-thrown every render
  }
  let out = ''
  if (root) {
    root.setAttribute('width', String(sizePx))
    root.setAttribute('height', String(sizePx))
    root.setAttribute('style', `width:${sizePx}px;height:${sizePx}px;`)
    out = root.outerHTML
  }
  if (sizedCache.size >= SIZED_CACHE_MAX) sizedCache.clear()
  sizedCache.set(key, out)
  return out
}

/** Sanitizing is not free and render sites call this on every render. */
const sizedCache = new Map<string, string>()
const SIZED_CACHE_MAX = 500

/** Drop cached sized icons, e.g. after `addIcon()`/`removeIcon()` changed the registry. */
export function clearSizedIconCache(): void {
  sizedCache.clear()
}

const BARE_ICON_WRAPPER =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round">'
