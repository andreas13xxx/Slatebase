/**
 * ViewTypeIcon — the icon of a Bases view type, as Obsidian's view picker shows it: a fixed icon for
 * the built-in types, and for a type a plugin registered through `registerBasesView` the `icon` it
 * passed (its own `addIcon()` SVG or any Lucide/Obsidian icon name).
 *
 * @module components/bases/ViewTypeIcon
 */
import { useSyncExternalStore } from 'react'
import { Kanban, LayoutDashboard, LayoutGrid, List, Table2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { PluginRibbonGlyph } from '../PluginRibbonIcon'
import {
  getBasesViewRegistration,
  getBasesViewRegistryVersion,
  subscribeBasesViewRegistry,
} from '../../plugins/compat/bases-view-registry'

const BUILT_IN_ICONS: Readonly<Record<string, LucideIcon>> = {
  table: Table2,
  cards: LayoutGrid,
  kanban: Kanban,
  list: List,
}

export function ViewTypeIcon({ type, size = 14, className }: { type: string; size?: number; className?: string }) {
  // Re-render when a plugin registers its type after this icon was first drawn.
  useSyncExternalStore(subscribeBasesViewRegistry, getBasesViewRegistryVersion)

  const Builtin = BUILT_IN_ICONS[type]
  if (Builtin) return <Builtin aria-hidden="true" size={size} className={className} />

  const icon = getBasesViewRegistration(type)?.icon
  if (icon) {
    return (
      <span className={className} aria-hidden="true">
        <PluginRibbonGlyph icon={icon} size={size} />
      </span>
    )
  }
  return <LayoutDashboard aria-hidden="true" size={size} className={className} />
}
