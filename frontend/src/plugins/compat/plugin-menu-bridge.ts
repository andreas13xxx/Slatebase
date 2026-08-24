/**
 * Bridges the four real Obsidian `workspace.on(...)` context-menu events
 * (`file-menu`, `files-menu`, `editor-menu`, `url-menu` — verified against
 * `obsidian.d.ts`) to Slatebase's own `ContextMenu` React component.
 *
 * Any UI surface that shows a right-click menu on a file, a multi-selection,
 * an editor, or a link should build its native items first, then append the
 * result of `buildPluginMenuItems()` so installed plugins can extend the
 * menu exactly as they do in real Obsidian.
 *
 * @module plugin-menu-bridge
 */
import { createElement } from 'react'
import { Menu, MenuItem, MenuSeparator } from './menu'
import { getActiveWorkspaceShim } from './active-workspace-shim'
import { withPluginContext } from './plugin-execution-context'
import { resolveIconMarkupSync } from './lucide-icons'
import { getCustomIconSvg, sizeCustomIconSvg } from '../../utils/pluginIcon'
import type { ContextMenuItem } from '../../components/ContextMenu'

/** The workspace menu events plugins can hook via `workspace.on(name, (menu, ...) => ...)`. */
export type PluginMenuEvent = 'file-menu' | 'files-menu' | 'editor-menu' | 'url-menu'

/**
 * Resolves a plugin `MenuItem.icon` name (an Obsidian/Lucide icon id, the
 * same string `setIcon()` takes — see menu.ts) to a renderable node, the
 * same way ribbon/tab icons do. Returns `undefined` while a not-yet-cached
 * Lucide icon's async resolution is still in flight — the menu is rebuilt
 * from scratch on every open, so a first-open miss self-corrects the next
 * time this same item is right-clicked once the icon is cached.
 */
function resolveMenuItemIcon(iconId: string): ContextMenuItem['icon'] {
  if (!iconId) return undefined
  const customSvg = getCustomIconSvg(iconId)
  const markup = customSvg ? sizeCustomIconSvg(customSvg, 14) : resolveIconMarkupSync(iconId, 14)
  if (!markup) return undefined
  return createElement('span', { dangerouslySetInnerHTML: { __html: markup } })
}

/** Converts a built `Menu`'s entries into `ContextMenuItem`s for the React menu. */
function convertMenuItems(menu: Menu, idPrefix: string): ContextMenuItem[] {
  const items: ContextMenuItem[] = []
  menu.items.forEach((entry, index) => {
    if (entry instanceof MenuSeparator) {
      items.push({ id: `${idPrefix}-sep-${index}`, label: '', separator: true })
      return
    }
    const item = entry as MenuItem
    const itemId = `${idPrefix}-item-${index}`
    items.push({
      id: itemId,
      label: item.title,
      disabled: item.disabled,
      // MenuItem's `checked` defaults to `false` (never unset) — only surface
      // it as a checkbox item when the plugin actually called setChecked(),
      // which is the only thing that ever makes it `true`. Erring toward
      // "not a checkbox" for every never-checked item keeps the vast
      // majority of plain menu items rendering as plain `menuitem`s.
      checked: item.checked ? true : undefined,
      icon: resolveMenuItemIcon(item.icon),
      // A submenu-carrying item (MenuItem.setSubmenu(), e.g. a "Text Tools"/
      // "AI Tools"-style plugin grouping several actions under one entry)
      // opens its own nested items instead of running a direct action —
      // matches ContextMenu.tsx's handling of `submenu`, which ignores `run`
      // when present.
      submenu: item.submenu ? convertMenuItems(item.submenu, itemId) : undefined,
      run: item.submenu ? undefined : () => {
        try {
          // Replay the plugin context captured at addItem()-time (see
          // MenuItem.pluginId's doc comment in menu.ts) so DOM the callback
          // builds synchronously is tagged for CssInjector's scoping.
          withPluginContext(item.pluginId, () => item.callback(new MouseEvent('click')))
        } catch (err) {
          console.error(`[PluginMenuBridge] A plugin's ${idPrefix} item threw:`, err)
        }
      },
    })
  })
  return items
}

/**
 * Fires the given workspace menu event on a fresh `Menu` and returns the
 * plugin-contributed entries as `ContextMenuItem`s, with a leading separator
 * — ready to append to a native menu's own item list. Returns `[]` when no
 * plugin is listening (or none are loaded yet), in which case the caller's
 * menu looks exactly as it would without this call.
 */
export function buildPluginMenuItems(event: PluginMenuEvent, args: unknown[], idPrefix: string): ContextMenuItem[] {
  const workspaceShim = getActiveWorkspaceShim()
  if (!workspaceShim) return []

  const menu = new Menu()
  try {
    workspaceShim.trigger(event, menu, ...args)
  } catch (err) {
    console.error(`[PluginMenuBridge] A plugin's ${event} handler threw:`, err)
  }

  const items = convertMenuItems(menu, idPrefix)
  if (items.length === 0) return []
  return [{ id: `${idPrefix}-sep-leading`, label: '', separator: true }, ...items]
}
