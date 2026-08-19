/**
 * `Menu`/`MenuItem`/`MenuSeparator` compat shims.
 *
 * Extracted from `installObsidianGlobals()` so that menu entries are real
 * `MenuItem`/`MenuSeparator` instances (matching
 * `frontend/node_modules/obsidian/obsidian.d.ts`) rather than untyped object
 * literals — plugins commonly narrow menu entries with `instanceof MenuItem`
 * / `instanceof MenuSeparator`, which only works if these are the same
 * classes `Menu.addItem()`/`addSeparator()` actually construct.
 */
import { getCurrentPluginId, withPluginContext } from './plugin-execution-context'
import { renderLucideIconInto } from './lucide-icons'
import { getCustomIconSvg, sizeCustomIconSvg } from '../../utils/pluginIcon'

/** Marker class for entries added via `Menu.addSeparator()`. No public members in real Obsidian. */
export class MenuSeparator {
  readonly dom: HTMLElement

  constructor() {
    this.dom = document.createElement('div')
    this.dom.className = 'menu-separator'
  }
}

/**
 * Real Obsidian's `MenuItem` has a private constructor — plugins only ever
 * get one via `Menu.addItem(cb)`. Mirrored here by taking the owning `Menu`
 * as a constructor arg; nothing outside `menu.ts` is expected to call `new
 * MenuItem()` directly.
 */
export class MenuItem {
  readonly dom: HTMLElement
  iconEl: HTMLElement | null
  titleEl: HTMLElement | null
  title = ''
  icon = ''
  section = ''
  checked = false
  disabled = false
  warning = false
  submenu: Menu | null = null
  callback: (evt: MouseEvent | KeyboardEvent) => void = () => {}
  /**
   * The plugin that was executing when this item was built via addItem(),
   * captured then because by the time the user actually clicks it — a
   * separate later event — any withPluginContext() from menu construction
   * (e.g. the wrapped 'file-menu' dispatch in event-system.ts) has long
   * since unwound. Without replaying it in invoke(), a callback that opens
   * a Modal/picker builds DOM with getCurrentPluginId() === null, so
   * CssInjector's [data-plugin-id] scoping matches nothing inside it and
   * the plugin's own stylesheet (icon grids, layout, ...) never applies.
   */
  pluginId: string | null = null
  private readonly menu: Menu

  constructor(menu: Menu) {
    this.menu = menu
    /**
     * Real Obsidian's MenuItem is imperative: `dom`/`titleEl`/`iconEl` exist
     * the moment addItem()'s callback runs, not only once the menu opens.
     * Plugins rely on that to embed extra components straight into an item
     * — "Editing Toolbar"'s status-bar menu does
     * `new ToggleComponent(item.dom)` inside the addItem() callback, which
     * crashed with "containerEl is undefined" when `dom` didn't exist yet.
     * Built eagerly here and reused as-is at show()-time instead of building
     * fresh DOM there, so anything a plugin appended into `dom` survives
     * into the rendered menu.
     */
    this.dom = document.createElement('div')
    this.dom.className = 'menu-item'
    this.iconEl = document.createElement('div')
    this.iconEl.className = 'menu-item-icon'
    this.dom.appendChild(this.iconEl)
    this.titleEl = document.createElement('div')
    this.titleEl.className = 'menu-item-title'
    this.dom.appendChild(this.titleEl)

    // Wired once here rather than rebuilt per show(): `disabled`/`submenu`
    // are read live off the item at event time, so toggling either after
    // creation (setDisabled()/setSubmenu() called later in the same
    // addItem() callback, as most plugins do) still behaves correctly
    // without re-attaching anything.
    this.dom.setAttribute('tabindex', '0')
    this.dom.addEventListener('click', (e) => {
      if (this.disabled) { e.stopPropagation(); return }
      this.menu._invoke(this, e)
    })
    this.dom.addEventListener('mouseenter', () => {
      if (this.submenu) this.menu._openSubmenu(this, this.dom)
      else this.menu._closeSubmenu()
    })
  }

  setTitle(t: string | DocumentFragment): this {
    // Obsidian accepts a DocumentFragment for rich titles; flatten it,
    // since our renderer sets textContent.
    this.title = typeof t === 'string' ? t : (t.textContent ?? '')
    if (this.titleEl) this.titleEl.textContent = this.title
    return this
  }

  setIcon(i: string | null): this {
    this.icon = i ?? ''
    if (this.iconEl) {
      this.iconEl.innerHTML = ''
      if (this.icon) {
        // Custom icons registered via addIcon() first, same as
        // window.obsidian.setIcon — otherwise a plugin's own SVG used as a
        // menu-item icon falls through to the Lucide-only resolver and
        // warns as an unrecognized Obsidian id. Sized explicitly — see
        // sizeCustomIconSvg's doc comment for why an unsized custom SVG
        // renders invisible/oversized rather than just missing.
        const customSvg = getCustomIconSvg(this.icon)
        if (customSvg) this.iconEl.innerHTML = sizeCustomIconSvg(customSvg, 16)
        else renderLucideIconInto(this.iconEl, this.icon)
      }
    }
    return this
  }

  setSection(s: string): this {
    this.section = s
    return this
  }

  setChecked(c: boolean | null): this {
    this.checked = c === true
    this.dom.classList.toggle('is-checked', this.checked)
    return this
  }

  setDisabled(d: boolean): this {
    this.disabled = d !== false
    this.dom.classList.toggle('is-disabled', this.disabled)
    // A disabled item that still fires its callback is worse than one that
    // does nothing — the click listener checks `disabled` live, this
    // attribute is presentational/a11y only.
    if (this.disabled) this.dom.setAttribute('aria-disabled', 'true')
    else this.dom.removeAttribute('aria-disabled')
    return this
  }

  setIsLabel(isLabel: boolean): this {
    return this.setDisabled(isLabel !== false)
  }

  /** Red/destructive styling for the item, mirroring ButtonComponent.setWarning(). */
  setWarning(w: boolean): this {
    this.warning = w !== false
    this.dom.classList.toggle('is-warning', this.warning)
    return this
  }

  onClick(fn: (evt: MouseEvent | KeyboardEvent) => void): this {
    this.callback = fn
    return this
  }

  setSubmenu(cb?: (m: Menu) => void): this | Menu {
    // Obsidian API: setSubmenu() returns a new Menu (no-arg overload) OR
    // setSubmenu(cb) calls cb with a new Menu (callback overload)
    const submenu = new Menu()
    this.submenu = submenu
    this.dom.classList.add('mod-submenu')
    if (this.dom.querySelector('.mod-submenu-arrow') === null) {
      const arrow = document.createElement('div')
      arrow.className = 'menu-item-icon mod-submenu-arrow'
      renderLucideIconInto(arrow, 'chevron-right')
      this.dom.appendChild(arrow)
    }
    if (typeof cb === 'function') {
      cb(submenu)
      return this
    }
    // No-arg: return the submenu directly (Kanban uses this pattern)
    return submenu
  }
}

export class Menu {
  items: (MenuItem | MenuSeparator)[] = []
  /**
   * Obsidian creates the menu's root element eagerly in the constructor,
   * not at show()-time — plugins routinely do `menu.dom.addClass(...)` or
   * append custom content right after `new Menu()`, before ever calling
   * showAtMouseEvent()/showAtPosition(). Making this lazy (only built in
   * show(), nulled in close()) crashed those plugins with "can't access
   * property addClass, dom is null" the moment they touched `.dom`
   * pre-show, or reused a menu instance after it had closed.
   */
  dom: HTMLElement = document.createElement('div')
  containerEl: HTMLElement | null = null
  private onHideCallbacks: Array<() => void> = []
  private submenuEl: HTMLElement | null = null
  /** Public, like `containerEl`: nothing here reads it, but plugins do (see setParentElement). */
  parentEl: HTMLElement | null = null
  /** Currently-open menus, tracked so `Menu.forEvent()` can find the one an event landed in. */
  private static openMenus: Set<{ containerEl: HTMLElement | null }> = new Set()
  /** Pre-declared section display order, populated by addSections(). */
  private sectionOrder: string[] = []

  constructor() {
    this.dom.className = 'menu'
  }

  /**
   * Sets the element a plugin considers the menu's logical parent (Obsidian
   * API since 1.x). No positioning/window effect in Slatebase's single-window
   * model — stored so `then()`-chained readers of the field don't see `undefined`.
   */
  setParentElement(parentEl: HTMLElement): this {
    this.parentEl = parentEl
    return this
  }

  /** Returns the open Menu instance the given event's target is inside, if any. */
  static forEvent(evt: Event): unknown {
    const target = evt.target as Node | null
    if (!target) return undefined
    for (const menu of Menu.openMenus) {
      if (menu.containerEl && menu.containerEl.contains(target)) return menu
    }
    return undefined
  }

  addItem(cb: (item: MenuItem) => void): this {
    const item = new MenuItem(this)
    item.pluginId = getCurrentPluginId()
    cb(item)
    this.items.push(item)
    return this
  }

  addSeparator(): this {
    this.items.push(new MenuSeparator())
    return this
  }

  /**
   * Pre-declare the display order of named sections (Obsidian 1.x+). Plugins
   * call this once per section, typically right before adding that
   * section's items — "Editing Toolbar"'s status-bar menu is
   * `addSections(["settings"]); <add settings items>; addSections(["viewType"]); ...`.
   * Without this, items still group by `setSection()` (first-seen item
   * order), but a section named before it has any items — as here — has no
   * effect until an item actually claims it, which can visually reorder
   * groups relative to what the plugin declared.
   */
  addSections(sections: string[]): this {
    for (const section of sections) {
      if (!this.sectionOrder.includes(section)) this.sectionOrder.push(section)
    }
    return this
  }

  /** Obsidian's opt-out of the icon gutter, for menus where no item has one. */
  setNoIcon(): this {
    // The class is the whole mechanism — Obsidian's own stylesheet keys the
    // icon gutter off it, so there is no separate flag to track.
    this.dom.classList.add('mod-no-icon')
    return this
  }

  /** Register a callback for when the menu closes, by click or dismissal. */
  onHide(cb: () => void): this {
    this.onHideCallbacks.push(cb)
    return this
  }

  /**
   * Real Obsidian toggles between the OS-native (Electron) context menu and
   * its own HTML one. Slatebase is a web app with no native menu to switch
   * to — always renders the HTML menu — so this is a no-op kept only so
   * plugins that call it (desktop-focused ones toggling native menus off
   * for custom rendering) don't crash.
   */
  setUseNativeMenu(_useNativeMenu: boolean): this {
    return this
  }

  showAtMouseEvent(evt: MouseEvent): this {
    this.show(evt.clientX, evt.clientY)
    return this
  }

  showAtPosition(pos: { x: number; y: number }): this {
    this.show(pos.x, pos.y)
    return this
  }

  /**
   * Build and mount the menu.
   *
   * Everything visual is left to the `.menu`/`.menu-item` classes in
   * obsidian-compat.css so plugin and theme CSS can restyle menus the way it
   * does in Obsidian; only the caller-supplied position is set inline.
   */
  private show(x: number, y: number): void {
    this.close()
    const overlay = document.createElement('div')
    overlay.className = 'menu-overlay'

    // Reuse the eagerly-created `dom` (see the field doc comment) rather
    // than building a fresh element, so any classes/content a plugin
    // already added to `menu.dom` before calling show() survive into the
    // rendered menu.
    const menu = this.dom
    menu.replaceChildren()
    // Grouping by section is what keeps plugin-contributed entries together
    // in the order the plugin declared the sections, as Obsidian does.
    // Each entry's DOM was already built (and possibly added to, by a
    // plugin reaching into `item.dom`) back in its constructor — appendChild
    // here just moves it into the visible tree, it doesn't build it.
    for (const entry of this.sortedBySection()) {
      menu.appendChild(entry.dom)
    }

    overlay.appendChild(menu)
    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) this.close() })
    document.body.appendChild(overlay)
    this.containerEl = overlay
    Menu.openMenus.add(this)

    this.positionAt(menu, x, y)
    this.attachKeyboardNavigation(menu)
    menu.focus()
  }

  /**
   * Entries grouped by section: sections declared via addSections() come
   * first in that order, then any section only ever seen on an item (no
   * addSections() call) in first-seen order. Separators have no section of
   * their own in the real API, so they're treated as belonging to `''`.
   */
  private sortedBySection(): (MenuItem | MenuSeparator)[] {
    const sectionOf = (e: MenuItem | MenuSeparator): string => (e instanceof MenuItem ? e.section : '')
    const sections: string[] = [...this.sectionOrder]
    for (const entry of this.items) {
      const section = sectionOf(entry)
      if (!sections.includes(section)) sections.push(section)
    }
    if (sections.length <= 1) return this.items
    const result: (MenuItem | MenuSeparator)[] = []
    for (const section of sections) {
      const entries = this.items.filter((e) => sectionOf(e) === section)
      // A section pre-declared via addSections() but never actually used
      // by an item renders nothing — not even a stray leading separator.
      if (entries.length === 0) continue
      // A divider between sections, unless the plugin already placed one.
      if (result.length > 0 && !(entries[0] instanceof MenuSeparator)) {
        result.push(new MenuSeparator())
      }
      result.push(...entries)
    }
    return result
  }

  /** @internal Called by MenuItem's click handler; not part of Obsidian's public API. */
  _invoke(item: MenuItem, evt: MouseEvent | KeyboardEvent): void {
    // Close first: a callback that opens a modal must not leave the menu
    // floating above it.
    this.close()
    try {
      // Replay the plugin context captured at addItem()-time (see MenuItem.pluginId)
      // so DOM the callback builds synchronously — e.g. a picker Modal — is tagged
      // for CssInjector's [data-plugin-id] scoping.
      withPluginContext(item.pluginId, () => item.callback(evt))
    } catch (err) {
      console.error('[PluginCompat] Menu item callback threw', item.title, err)
    }
  }

  /** @internal Called by MenuItem's mouseenter handler; not part of Obsidian's public API. */
  _openSubmenu(item: MenuItem, anchor: HTMLElement): void {
    this._closeSubmenu()
    const submenu = item.submenu
    if (!submenu || !this.containerEl) return
    const rect = anchor.getBoundingClientRect()
    submenu.show(rect.right, rect.top)
    this.submenuEl = submenu.containerEl
  }

  /** @internal Called by MenuItem's mouseenter handler; not part of Obsidian's public API. */
  _closeSubmenu(): void {
    this.submenuEl?.remove()
    this.submenuEl = null
  }

  /**
   * Clamp the menu inside the viewport.
   *
   * Menus are opened at the pointer, so one raised near the right or bottom
   * edge would otherwise extend past it and have its last items unreachable.
   */
  private positionAt(menu: HTMLElement, x: number, y: number): void {
    menu.style.left = `${x}px`
    menu.style.top = `${y}px`
    const rect = menu.getBoundingClientRect()
    const margin = 4
    if (rect.right > window.innerWidth) {
      menu.style.left = `${Math.max(margin, window.innerWidth - rect.width - margin)}px`
    }
    if (rect.bottom > window.innerHeight) {
      menu.style.top = `${Math.max(margin, window.innerHeight - rect.height - margin)}px`
    }
  }

  /** Arrow-key/Enter/Escape handling, as Obsidian's menus support. */
  private attachKeyboardNavigation(menu: HTMLElement): void {
    menu.setAttribute('tabindex', '-1')
    menu.addEventListener('keydown', (evt: KeyboardEvent) => {
      const selectable = [...menu.querySelectorAll<HTMLElement>('.menu-item:not(.is-disabled)')]
      if (selectable.length === 0) return
      const current = selectable.findIndex((el) => el === document.activeElement)
      if (evt.key === 'Escape') {
        evt.preventDefault()
        this.close()
      } else if (evt.key === 'ArrowDown') {
        evt.preventDefault()
        selectable[(current + 1) % selectable.length]?.focus()
      } else if (evt.key === 'ArrowUp') {
        evt.preventDefault()
        selectable[(current - 1 + selectable.length) % selectable.length]?.focus()
      } else if (evt.key === 'Enter' || evt.key === ' ') {
        if (current >= 0) {
          evt.preventDefault()
          selectable[current]?.click()
        }
      }
    })
  }

  close(): void {
    this._closeSubmenu()
    Menu.openMenus.delete(this)
    if (!this.containerEl) return
    this.containerEl.remove()
    this.containerEl = null
    for (const cb of this.onHideCallbacks) {
      try {
        cb()
      } catch (err) {
        console.error('[PluginCompat] Menu onHide callback threw', err)
      }
    }
  }

  hide(): this {
    this.close()
    return this
  }
}
