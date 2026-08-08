/**
 * PluginRibbonIcon — Renders a single plugin ribbon icon in the SidebarToolbar.
 *
 * Maps Obsidian icon names to Lucide React icons. Uses a two-stage resolution:
 * 1. Known Obsidian→Lucide mappings
 * 2. Generic kebab-case → PascalCase conversion against the full Lucide library
 * Falls back to a generic puzzle-piece icon only if both fail.
 *
 * @module PluginRibbonIcon
 */

import {
  icons as allLucideIcons,
  Puzzle,
} from 'lucide-react'
import type { RibbonIconEntry } from '../plugins/compat/ribbon-icon-registry'

// ─── Icon Resolution ─────────────────────────────────────────────────────────

/**
 * Known Obsidian icon name → Lucide PascalCase key mappings.
 * Covers common names that don't follow the simple kebab→PascalCase pattern.
 */
const OBSIDIAN_ICON_MAP: Record<string, string> = {
  'calendar-with-checkmark': 'CalendarCheck',
  'calendar-days': 'CalendarDays',
  'calendar': 'Calendar',
  'lucide-calendar': 'Calendar',
  'file-text': 'FileText',
  'document': 'FileText',
  'list': 'List',
  'bullet-list': 'List',
  'check-square': 'CheckSquare',
  'checkbox': 'CheckSquare',
  'layout': 'Layout',
  'layout-dashboard': 'LayoutDashboard',
  'columns': 'Columns',
  'table': 'Table',
  'star': 'Star',
  'bookmark': 'Bookmark',
  'clock': 'Clock',
  'globe': 'Globe',
  'map': 'Map',
  'tag': 'Tag',
  'hash': 'Hash',
  'search': 'Search',
  'zap': 'Zap',
  'pencil': 'Pencil',
  'pen': 'Pen',
  'edit': 'Pencil',
  'trash': 'Trash2',
  'trash-2': 'Trash2',
  'settings': 'Settings',
  'eye': 'Eye',
  'eye-off': 'EyeOff',
  'link': 'Link',
  'unlink': 'Unlink',
  'image': 'Image',
  'code': 'Code',
  'quote': 'Quote',
  'bold': 'Bold',
  'italic': 'Italic',
  'heading': 'Heading',
  'strikethrough': 'Strikethrough',
  'underline': 'Underline',
  'palette': 'Palette',
  'paintbrush': 'Paintbrush',
  'brush': 'Paintbrush',
  'scissors': 'Scissors',
  'copy': 'Copy',
  'clipboard': 'Clipboard',
  'download': 'Download',
  'upload': 'Upload',
  'folder': 'Folder',
  'folder-open': 'FolderOpen',
  'file': 'File',
  'file-plus': 'FilePlus',
  'plus': 'Plus',
  'minus': 'Minus',
  'x': 'X',
  'check': 'Check',
  'alert-triangle': 'AlertTriangle',
  'info': 'Info',
  'help-circle': 'HelpCircle',
  'book': 'Book',
  'book-open': 'BookOpen',
  'git-branch': 'GitBranch',
  'git-commit': 'GitCommit',
  'terminal': 'Terminal',
  'command': 'Command',
  'shield': 'Shield',
  'lock': 'Lock',
  'unlock': 'Unlock',
  'key': 'Key',
  'database': 'Database',
  'server': 'Server',
  'cloud': 'Cloud',
  'wifi': 'Wifi',
  'bluetooth': 'Bluetooth',
  'camera': 'Camera',
  'mic': 'Mic',
  'video': 'Video',
  'music': 'Music',
  'play': 'Play',
  'pause': 'Pause',
  'skip-forward': 'SkipForward',
  'skip-back': 'SkipBack',
  'repeat': 'Repeat',
  'shuffle': 'Shuffle',
  'volume': 'Volume',
  'bell': 'Bell',
  'mail': 'Mail',
  'send': 'Send',
  'message-square': 'MessageSquare',
  'phone': 'Phone',
  'user': 'User',
  'users': 'Users',
  'heart': 'Heart',
  'thumbs-up': 'ThumbsUp',
  'thumbs-down': 'ThumbsDown',
  'flag': 'Flag',
  'award': 'Award',
  'target': 'Target',
  'crosshair': 'Crosshair',
  'compass': 'Compass',
  'navigation': 'Navigation',
  'move': 'Move',
  'maximize': 'Maximize',
  'minimize': 'Minimize',
  'expand': 'Expand',
  'shrink': 'Shrink',
  'rotate-cw': 'RotateCw',
  'rotate-ccw': 'RotateCcw',
  'refresh-cw': 'RefreshCw',
  'sync': 'RefreshCw',
  'undo': 'Undo',
  'redo': 'Redo',
  'arrow-left': 'ArrowLeft',
  'arrow-right': 'ArrowRight',
  'arrow-up': 'ArrowUp',
  'arrow-down': 'ArrowDown',
  'chevron-left': 'ChevronLeft',
  'chevron-right': 'ChevronRight',
  'chevron-up': 'ChevronUp',
  'chevron-down': 'ChevronDown',
  'external-link': 'ExternalLink',
  'corner-up-right': 'CornerUpRight',
  'log-in': 'LogIn',
  'log-out': 'LogOut',
  'power': 'Power',
  'activity': 'Activity',
  'bar-chart': 'BarChart',
  'pie-chart': 'PieChart',
  'trending-up': 'TrendingUp',
  'filter': 'Filter',
  'sort': 'ArrowUpDown',
  'layers': 'Layers',
  'grid': 'Grid',
  'sidebar': 'Sidebar',
  'panel-left': 'PanelLeft',
  'panel-right': 'PanelRight',
  'wrench': 'Wrench',
  'tool': 'Wrench',
  'hammer': 'Hammer',
  'bug': 'Bug',
  'flame': 'Flame',
  'rocket': 'Rocket',
  'sparkles': 'Sparkles',
  'wand': 'Wand',
  'magic-wand': 'Wand',
  'dice': 'Dice1',
  'puzzle': 'Puzzle',
  'brain': 'Brain',
  'lightbulb': 'Lightbulb',
  'sun': 'Sun',
  'moon': 'Moon',
  'cloud-sun': 'CloudSun',
  'droplet': 'Droplet',
  'feather': 'Feather',
  'leaf': 'Leaf',
  'tree': 'TreePine',
  'flower': 'Flower',
  'mountain': 'Mountain',
  'waves': 'Waves',
  'wind': 'Wind',
  'snowflake': 'Snowflake',
  'circle': 'Circle',
  'square': 'Square',
  'triangle': 'Triangle',
  'hexagon': 'Hexagon',
  'diamond': 'Diamond',
  'infinity': 'Infinity',
  'at-sign': 'AtSign',
  'percent': 'Percent',
  'dollar-sign': 'DollarSign',
  'credit-card': 'CreditCard',
  'shopping-cart': 'ShoppingCart',
  'package': 'Package',
  'box': 'Box',
  'archive': 'Archive',
  'save': 'Save',
  'printer': 'Printer',
  'type': 'Type',
  'align-left': 'AlignLeft',
  'align-center': 'AlignCenter',
  'align-right': 'AlignRight',
  'indent': 'Indent',
  'outdent': 'Outdent',
  'list-ordered': 'ListOrdered',
  'list-checks': 'ListChecks',
  'kanban': 'Kanban',
  'lucide-trello': 'Kanban',
  'trello': 'Kanban',
}

/**
 * Resolve an Obsidian icon name to a Lucide icon key string.
 * Returns 'Puzzle' as a last resort fallback, but logs a warning for unknown icons.
 */
function resolveIconKey(iconName: string): string {
  // 1. Direct mapping lookup
  const mapped = OBSIDIAN_ICON_MAP[iconName]
  if (mapped && mapped in allLucideIcons) {
    return mapped
  }

  // 2. Strip common prefixes (lucide-, obsidian-)
  const stripped = iconName.replace(/^(lucide-|obsidian-)/, '')
  const strippedMapped = OBSIDIAN_ICON_MAP[stripped]
  if (strippedMapped && strippedMapped in allLucideIcons) {
    return strippedMapped
  }

  // 3. Generic kebab-case → PascalCase conversion
  const pascalCase = stripped.split('-').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('')
  if (pascalCase in allLucideIcons) {
    return pascalCase
  }

  // 4. Try with common number suffixes (e.g. "dice" → "Dice1")
  if (`${pascalCase}1` in allLucideIcons) {
    return `${pascalCase}1`
  }

  // Fallback — log so we can add mappings for newly discovered icons
  console.warn(`[PluginRibbonIcon] Unknown icon "${iconName}" — using fallback`)
  return ''
}

// ─── Component ───────────────────────────────────────────────────────────────

interface PluginRibbonIconProps {
  entry: RibbonIconEntry
}

/**
 * Renders a plugin ribbon icon button in the toolbar.
 * Uses multi-stage icon resolution:
 * 1. Custom SVG icons registered via addIcon()
 * 2. Lucide icon library (known mappings → kebab→PascalCase)
 * 3. Puzzle fallback
 */
export function PluginRibbonIcon({ entry }: PluginRibbonIconProps) {
  const iconName = entry.icon

  // Check custom icon registry first (plugins register SVG icons via addIcon())
  const customIcons = (window as unknown as { __obsidianCustomIcons?: Map<string, string> }).__obsidianCustomIcons
  const customSvg = customIcons?.get(iconName)

  if (customSvg) {
    // Obsidian's addIcon() expects SVG content (inner paths) without the <svg> wrapper,
    // rendered into a 100x100 viewBox. Wrap if needed and ensure consistent sizing.
    let svgHtml: string
    if (customSvg.trim().startsWith('<svg')) {
      // Full SVG element — just ensure size attributes
      svgHtml = customSvg.replace(/<svg([^>]*)>/, (_match, attrs: string) => {
        // Remove existing width/height, add our own
        const cleaned = attrs.replace(/\s*width="[^"]*"/g, '').replace(/\s*height="[^"]*"/g, '')
        return `<svg${cleaned} width="15" height="15" style="width:15px;height:15px;">`
      })
    } else {
      // SVG inner content only — wrap in a properly sized SVG element
      svgHtml = `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" style="width:15px;height:15px;">${customSvg}</svg>`
    }
    return (
      <button
        className="toolbar-btn toolbar-btn--plugin"
        title={entry.title}
        aria-label={entry.title}
        onClick={entry.callback}
        dangerouslySetInnerHTML={{ __html: svgHtml }}
      />
    )
  }

  // Resolve to a Lucide key string
  const lucideKey = resolveIconKey(iconName)
  const Icon = allLucideIcons[lucideKey as keyof typeof allLucideIcons] ?? Puzzle

  return (
    <button
      className="toolbar-btn toolbar-btn--plugin"
      title={entry.title}
      aria-label={entry.title}
      onClick={entry.callback}
    >
      {/* Render the resolved icon */}
      <Icon size={15} />
    </button>
  )
}
