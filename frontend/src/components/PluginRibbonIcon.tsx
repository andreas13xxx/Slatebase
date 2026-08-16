/**
 * PluginRibbonIcon — Renders a single plugin ribbon icon in the SidebarToolbar.
 *
 * Resolution order: 1) custom SVGs a plugin registered via `addIcon()`,
 * 2) the shared Lucide resolver in `plugins/compat/lucide-icons.ts` (the same
 * one `window.obsidian.setIcon`/`getIcon` use), 3) a generic puzzle-piece
 * fallback while that resolution is still in flight.
 *
 * @module PluginRibbonIcon
 */

import { Puzzle } from 'lucide-react'
import type { RibbonIconEntry } from '../plugins/compat/ribbon-icon-registry'
import { getCustomIconSvg, sizeCustomIconSvg, useIconResolutionTick } from '../utils/pluginIcon'
import { resolveIconMarkupSync } from '../plugins/compat/lucide-icons'

// ─── Component ───────────────────────────────────────────────────────────────

interface PluginRibbonIconProps {
  entry: RibbonIconEntry
}

/**
 * Renders a plugin ribbon icon button in the toolbar.
 * Uses multi-stage icon resolution:
 * 1. Custom SVG icons registered via addIcon()
 * 2. The shared Lucide resolver (full Lucide set + Obsidian alias table + brand marks)
 * 3. Puzzle fallback while resolution is in flight
 */
export function PluginRibbonIcon({ entry }: PluginRibbonIconProps) {
  // Re-renders once any icon's (async, per-icon) Lucide resolution lands, so
  // an icon that isn't cached yet on first paint still shows up without
  // requiring some other unrelated prop change to trigger a re-render.
  useIconResolutionTick()

  const iconName = entry.icon
  const customSvg = getCustomIconSvg(iconName)
  const markup = customSvg ? sizeCustomIconSvg(customSvg, 15) : resolveIconMarkupSync(iconName, 15)

  if (markup) {
    return (
      <button
        className="toolbar-btn toolbar-btn--plugin"
        title={entry.title}
        aria-label={entry.title}
        onClick={entry.callback}
        dangerouslySetInnerHTML={{ __html: markup }}
      />
    )
  }

  return (
    <button
      className="toolbar-btn toolbar-btn--plugin"
      title={entry.title}
      aria-label={entry.title}
      onClick={entry.callback}
    >
      <Puzzle size={15} />
    </button>
  )
}
