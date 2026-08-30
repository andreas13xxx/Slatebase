/**
 * PluginRibbonGlyph — Renders the *icon* of a plugin ribbon entry.
 *
 * Only the glyph: the surrounding `<button>` (classes, tooltip, drag handles,
 * context menu, colour override) is rendered by SidebarToolbar, exactly as it
 * is for a built-in button. That split is what makes plugin ribbon icons and
 * built-in toolbar buttons behave identically — hiding, reordering, colouring
 * and drag-and-drop all run through one code path instead of two.
 *
 * Resolution order: 1) custom SVGs a plugin registered via `addIcon()`,
 * 2) the shared Lucide resolver in `plugins/compat/lucide-icons.ts` (the same
 * one `window.obsidian.setIcon`/`getIcon` use), 3) a generic puzzle-piece
 * fallback while that resolution is still in flight.
 *
 * The button SidebarToolbar wraps this in carries `side-dock-ribbon-action`
 * alongside our own `toolbar-btn` classes. That is Obsidian's class for a
 * ribbon button and what plugin stylesheets target when they restyle their own
 * ribbon icon; our classes keep carrying the actual styling.
 *
 * @module PluginRibbonIcon
 */

import { Puzzle } from 'lucide-react'
import { getCustomIconSvg, sizeCustomIconSvg, useIconResolutionTick } from '../utils/pluginIcon'
import { resolveIconMarkupSync } from '../plugins/compat/lucide-icons'

// ─── Component ───────────────────────────────────────────────────────────────

interface PluginRibbonGlyphProps {
  /** Icon name (Lucide/Obsidian identifier) the plugin passed to `addRibbonIcon`. */
  icon: string
  /** Rendered pixel size, matching the built-in toolbar icons. */
  size?: number
}

/**
 * Renders a plugin ribbon icon's glyph.
 * Uses multi-stage icon resolution:
 * 1. Custom SVG icons registered via addIcon()
 * 2. The shared Lucide resolver (full Lucide set + Obsidian alias table + brand marks)
 * 3. Puzzle fallback while resolution is in flight
 */
export function PluginRibbonGlyph({ icon, size = 15 }: PluginRibbonGlyphProps) {
  // Re-renders once any icon's (async, per-icon) Lucide resolution lands, so
  // an icon that isn't cached yet on first paint still shows up without
  // requiring some other unrelated prop change to trigger a re-render.
  useIconResolutionTick()

  const customSvg = getCustomIconSvg(icon)
  const markup = customSvg ? sizeCustomIconSvg(customSvg, size) : resolveIconMarkupSync(icon, size)

  if (markup) {
    return <span className="toolbar-btn-glyph" dangerouslySetInnerHTML={{ __html: markup }} />
  }

  return <Puzzle size={size} />
}
