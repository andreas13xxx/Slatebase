import { useState, type ReactNode } from 'react'
import {
  Upload, FolderOpen, Download, Settings,
  FileText, FilePlus, MessageCircle, ScrollText,
  Plus, Share2, CalendarDays, Trash2, LayoutDashboard,
  Command, FileSearch, Shuffle, FileInput, PanelLeftClose,
} from 'lucide-react'
import { useFeatureContext } from '../state/featureContext'
import { usePluginContext } from '../plugins/compat/plugin-context'
import { PluginRibbonGlyph } from './PluginRibbonIcon'
import { ContextMenu, type ContextMenuItem } from './ContextMenu'
import {
  useToolbarPrefs, resolveOrder, reorderEntry, setToolbarVisible,
  PLUGIN_ENTRY_PREFIX,
} from '../state/toolbarStore'
import {
  buildToolbarContextMenuItems,
  buildToolbarButtonContextMenuItems,
  type ToolbarMenuEntry,
} from './toolbar-context-menu'

import type { AppPage } from '../App'

/** Icon size shared by built-in icons and plugin ribbon glyphs. */
const ICON_SIZE = 15

/**
 * A built-in toolbar button, before availability filtering.
 * Plugin ribbon icons are converted into the same shape (see `buildEntries`)
 * so that everything downstream — ordering, hiding, colouring, drag-and-drop,
 * context menus — treats both kinds identically.
 */
interface ToolbarItem {
  id: string
  icon: ReactNode
  label: string
  action: (evt: React.MouseEvent) => void
  adminOnly?: boolean
  ownerOnly?: boolean
  requiresVault?: boolean
  requiresWrite?: boolean
  feature?: string
  /** Marks a plugin ribbon icon — adds Obsidian's own ribbon classes. */
  isPlugin?: boolean
}

interface SidebarToolbarProps {
  vaultId: string | null
  vaultPermission?: string | null
  onCreateVault: () => void
  onCreateFile: () => void
  onCreateCanvas: () => void
  onImportFile: () => void
  onImportFolder: () => void
  onExportVault: () => void
  onNavigate: (page: AppPage) => void
  onOpenGraph: () => void
  onOpenTrash?: () => void
  onDailyNote?: () => void
  onOpenSettings?: () => void
  onOpenCommandPalette?: () => void
  onOpenQuickSwitcher?: () => void
  onOpenRandomNote?: () => void
  onInsertTemplate?: () => void
  isAdmin: boolean
  isVaultOwner?: boolean
  globalUnreadCount?: number
}

/**
 * Vertical toolbar docked to the left or right of the editor pane
 * (`toolbarStore.position`). Buttons can be reordered by drag-and-drop or via
 * their context menu, individually hidden, and given a colour; the whole bar
 * can be hidden from its own context menu or the "Werkzeugleiste
 * ein-/ausblenden" command.
 *
 * Built-in buttons and plugin ribbon icons are merged into one entry list and
 * rendered by the same code, so a plugin's ribbon icon supports exactly the
 * same interactions as "Neue Datei" does.
 *
 * Accessibility Landmark Assessment (R3.2):
 * This component uses `role="toolbar"` with `aria-label` — NOT `<header>`.
 * Rationale: The toolbar is a vertical icon action strip (create, import, graph,
 * settings, etc.), not a page-level header or navigation banner. A `<header>`
 * landmark would mislead screenreader users into expecting page title/navigation.
 * The existing `role="toolbar"` correctly identifies this region as a collection
 * of related action buttons per WAI-ARIA toolbar pattern. Screenreaders announce
 * it as "Werkzeugleiste toolbar" which is accurate. No change needed.
 */
export function SidebarToolbar({
  vaultId, vaultPermission, onCreateVault, onCreateFile, onCreateCanvas,
  onImportFile, onImportFolder, onExportVault, onNavigate, onOpenGraph,
  onOpenTrash, onDailyNote, onOpenSettings, onOpenCommandPalette,
  onOpenQuickSwitcher, onOpenRandomNote, onInsertTemplate,
  isAdmin, isVaultOwner, globalUnreadCount,
}: SidebarToolbarProps) {
  const { isEnabled } = useFeatureContext()
  const { ribbonIcons } = usePluginContext()
  const prefs = useToolbarPrefs()

  // Which button is being dragged and which one it is currently over. Both
  // drive the drag styling during the drag and the reorder on drop.
  const [dragId, setDragId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; entryId: string | null } | null>(null)

  const builtinItems: ToolbarItem[] = [
    { id: 'create-vault', icon: <Plus size={ICON_SIZE} />, label: 'Neuer Vault', action: onCreateVault },
    { id: 'create-file', icon: <FilePlus size={ICON_SIZE} />, label: 'Neue Datei', action: onCreateFile, requiresVault: true, requiresWrite: true },
    { id: 'create-canvas', icon: <LayoutDashboard size={ICON_SIZE} />, label: 'Neues Canvas', action: onCreateCanvas, requiresVault: true, requiresWrite: true },
    { id: 'daily-note', icon: <CalendarDays size={ICON_SIZE} />, label: 'Tagesnotiz (Ctrl+Alt+D)', action: () => onDailyNote?.(), requiresVault: true, requiresWrite: true },
    { id: 'insert-template', icon: <FileInput size={ICON_SIZE} />, label: 'Vorlage einfügen', action: () => onInsertTemplate?.(), requiresVault: true, requiresWrite: true },
    { id: 'command-palette', icon: <Command size={ICON_SIZE} />, label: 'Befehlspalette öffnen (Ctrl+P)', action: () => onOpenCommandPalette?.() },
    { id: 'quick-switcher', icon: <FileSearch size={ICON_SIZE} />, label: 'Schnellwechsler öffnen (Ctrl+O)', action: () => onOpenQuickSwitcher?.(), requiresVault: true },
    { id: 'random-note', icon: <Shuffle size={ICON_SIZE} />, label: 'Zufällige Notiz öffnen', action: () => onOpenRandomNote?.(), requiresVault: true },
    { id: 'import-file', icon: <Upload size={ICON_SIZE} />, label: 'Datei importieren', action: onImportFile, requiresVault: true, requiresWrite: true },
    { id: 'import-folder', icon: <FolderOpen size={ICON_SIZE} />, label: 'Ordner importieren', action: onImportFolder, requiresVault: true, requiresWrite: true },
    { id: 'export-vault', icon: <Download size={ICON_SIZE} />, label: 'Vault exportieren', action: onExportVault, requiresVault: true },
    { id: 'trash', icon: <Trash2 size={ICON_SIZE} />, label: 'Papierkorb', action: () => onOpenTrash?.(), requiresVault: true },
    { id: 'graph', icon: <Share2 size={ICON_SIZE} />, label: 'Graph', action: onOpenGraph, requiresVault: true },
    { id: 'chat', icon: <MessageCircle size={ICON_SIZE} />, label: 'Chat', action: () => onNavigate('chat'), feature: 'chat' },
    { id: 'admin-audit', icon: <FileText size={ICON_SIZE} />, label: 'Audit-Log', action: () => onNavigate('admin-audit'), adminOnly: true },
    { id: 'admin-logs', icon: <ScrollText size={ICON_SIZE} />, label: 'Server-Logs', action: () => onNavigate('admin-logs'), adminOnly: true },
    { id: 'toggle-toolbar', icon: <PanelLeftClose size={ICON_SIZE} />, label: 'Werkzeugleiste ausblenden', action: () => setToolbarVisible(false) },
    { id: 'settings', icon: <Settings size={ICON_SIZE} />, label: 'Einstellungen (Ctrl+,)', action: () => onOpenSettings?.() },
  ]

  // Plugin ribbon icons become ordinary entries. Their id has to survive a
  // reload so a saved position/colour sticks, hence pluginId+title rather than
  // the registration index; a plugin registering the same title twice gets a
  // disambiguating suffix.
  const pluginItems: ToolbarItem[] = []
  if (isEnabled('obsidian-plugin-compat')) {
    const usedIds = new Map<string, number>()
    for (const entry of ribbonIcons) {
      const base = `${PLUGIN_ENTRY_PREFIX}${entry.pluginId}:${entry.title}`
      const seen = usedIds.get(base) ?? 0
      usedIds.set(base, seen + 1)
      pluginItems.push({
        id: seen === 0 ? base : `${base}#${seen}`,
        icon: <PluginRibbonGlyph icon={entry.icon} size={ICON_SIZE} />,
        label: entry.title,
        action: (evt) => entry.callback(evt.nativeEvent),
        isPlugin: true,
      })
    }
  }

  const availableItems = [...builtinItems, ...pluginItems].filter((item) => {
    if (item.adminOnly && !isAdmin) return false
    if (item.ownerOnly && !isVaultOwner) return false
    if (item.feature && !isEnabled(item.feature)) return false
    return true
  })

  const byId = new Map(availableItems.map((item) => [item.id, item]))
  const orderedIds = resolveOrder(prefs.order, availableItems.map((i) => i.id))
  const visibleIds = orderedIds.filter((id) => !prefs.hidden.includes(id))

  /** Every entry (hidden ones included) — the context menus list them all. */
  const menuEntries: ToolbarMenuEntry[] = orderedIds.map((id) => ({
    id,
    label: byId.get(id)?.label ?? id,
    hidden: prefs.hidden.includes(id),
  }))

  // ─── Drag & drop reordering ────────────────────────────────────────────────

  function handleDragStart(id: string): void {
    setDragId(id)
    setDragOverId(null)
  }

  function handleDragEnter(id: string): void {
    setDragOverId(id)
  }

  function handleDragEnd(): void {
    // `dragId`/`dragOverId`/`visibleIds` come from the render this handler was
    // attached in. dragstart and dragenter both re-render before dragend fires,
    // so those are the values as of the drop.
    if (dragId && dragOverId && dragId !== dragOverId) {
      reorderEntry(dragId, dragOverId, visibleIds)
    }
    setDragId(null)
    setDragOverId(null)
  }

  // ─── Context menus ─────────────────────────────────────────────────────────

  function openToolbarMenu(e: React.MouseEvent): void {
    e.preventDefault()
    e.stopPropagation()
    setMenu({ x: e.clientX, y: e.clientY, entryId: null })
  }

  function openButtonMenu(e: React.MouseEvent, id: string): void {
    e.preventDefault()
    e.stopPropagation()
    setMenu({ x: e.clientX, y: e.clientY, entryId: id })
  }

  // Rebuilt on every render so a `keepOpen` toggle inside the menu (the
  // per-button visibility checkboxes) immediately shows its new checked state.
  const menuItems: ContextMenuItem[] = menu === null
    ? []
    : menu.entryId === null
      ? buildToolbarContextMenuItems(menuEntries, prefs.position)
      : buildToolbarButtonContextMenuItems(menu.entryId, visibleIds, prefs.colors[menu.entryId], menuEntries, prefs.position)

  return (
    <div
      className={`app-toolbar app-toolbar--${prefs.position}`}
      role="toolbar"
      aria-label="Werkzeugleiste"
      onContextMenu={openToolbarMenu}
    >
      {visibleIds.map((id) => {
        const item = byId.get(id)
        if (!item) return null
        const disabled = (item.requiresVault && !vaultId) || (item.requiresWrite && vaultPermission === 'read')
        const showBadge = item.id === 'chat' && globalUnreadCount !== undefined && globalUnreadCount > 0
        const color = prefs.colors[id]
        const classes = [
          'toolbar-btn',
          item.isPlugin ? 'toolbar-btn--plugin side-dock-ribbon-action' : '',
          dragId === id ? 'toolbar-btn--dragging' : '',
          dragOverId === id && dragId !== null && dragId !== id ? 'toolbar-btn--drag-over' : '',
        ].filter(Boolean).join(' ')

        return (
          <button
            key={id}
            type="button"
            className={classes}
            title={item.label}
            aria-label={item.label}
            onClick={disabled ? undefined : item.action}
            onContextMenu={(e) => openButtonMenu(e, id)}
            // `aria-disabled` rather than `disabled`: a disabled control fires
            // no mouse events at all, which would swallow the right-click and
            // leave the user unable to hide or move a button that happens to be
            // unavailable right now (no vault selected, read-only vault). The
            // click is guarded above instead, and the WAI-ARIA toolbar pattern
            // prefers keeping unavailable items reachable anyway.
            aria-disabled={disabled || undefined}
            draggable
            onDragStart={() => handleDragStart(id)}
            onDragEnter={() => handleDragEnter(id)}
            onDragEnd={handleDragEnd}
            onDragOver={(e) => e.preventDefault()}
            style={{ opacity: disabled ? 0.35 : 1, ...(color ? { color } : {}) }}
          >
            {item.icon}
            {showBadge && (
              <span className="toolbar-btn-badge" aria-label={`${globalUnreadCount} ungelesene Nachrichten`}>
                {globalUnreadCount}
              </span>
            )}
          </button>
        )
      })}
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={menuItems}
          onClose={() => setMenu(null)}
          onSelect={() => setMenu(null)}
        />
      )}
    </div>
  )
}
