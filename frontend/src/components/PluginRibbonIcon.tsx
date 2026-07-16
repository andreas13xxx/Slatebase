/**
 * PluginRibbonIcon — Renders a single plugin ribbon icon in the SidebarToolbar.
 *
 * Maps Obsidian icon names to Lucide React icons. Falls back to a generic
 * puzzle-piece icon for unrecognized icon names.
 *
 * @module PluginRibbonIcon
 */

import {
  Calendar,
  FileText,
  List,
  CheckSquare,
  Layout,
  Columns,
  Table,
  Star,
  Bookmark,
  Clock,
  Globe,
  Map,
  Tag,
  Hash,
  Search,
  Zap,
  type LucideIcon,
  Puzzle,
} from 'lucide-react'
import type { RibbonIconEntry } from '../plugins/compat/ribbon-icon-registry'

// ─── Icon Mapping ────────────────────────────────────────────────────────────

/**
 * Maps Obsidian icon names to Lucide React icon components.
 * Obsidian uses a subset of Lucide icons (often without the "lucide-" prefix).
 */
const ICON_MAP: Record<string, LucideIcon> = {
  'calendar': Calendar,
  'calendar-days': Calendar,
  'calendar-with-checkmark': Calendar,
  'file-text': FileText,
  'document': FileText,
  'list': List,
  'bullet-list': List,
  'check-square': CheckSquare,
  'checkbox': CheckSquare,
  'layout': Layout,
  'layout-dashboard': Layout,
  'columns': Columns,
  'table': Table,
  'star': Star,
  'bookmark': Bookmark,
  'clock': Clock,
  'globe': Globe,
  'map': Map,
  'tag': Tag,
  'hash': Hash,
  'search': Search,
  'zap': Zap,
}

// ─── Component ───────────────────────────────────────────────────────────────

interface PluginRibbonIconProps {
  entry: RibbonIconEntry
}

/**
 * Renders a plugin ribbon icon button in the toolbar.
 * Uses the Obsidian icon name to look up the corresponding Lucide icon.
 */
export function PluginRibbonIcon({ entry }: PluginRibbonIconProps) {
  const IconComponent = ICON_MAP[entry.icon] ?? Puzzle

  return (
    <button
      className="toolbar-btn toolbar-btn--plugin"
      title={entry.title}
      aria-label={entry.title}
      onClick={entry.callback}
    >
      <IconComponent size={15} />
    </button>
  )
}
