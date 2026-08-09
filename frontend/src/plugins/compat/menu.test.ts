/**
 * Behaviour of the `Menu` shim registered by `installObsidianGlobals()`.
 *
 * The shim used to store icons, separators, checked state, disabled state and
 * submenus and then render none of them — a plugin's context menu came out as a
 * flat list of titles with no way to tell that anything had been dropped. These
 * tests pin down that each of those survives to the DOM.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { installObsidianGlobals } from './install-globals'

installObsidianGlobals()

interface MenuItemBuilder {
  setTitle(t: string): MenuItemBuilder
  setIcon(i: string): MenuItemBuilder
  setSection(s: string): MenuItemBuilder
  setChecked(c: boolean): MenuItemBuilder
  setDisabled(d: boolean): MenuItemBuilder
  onClick(fn: (evt: MouseEvent) => void): MenuItemBuilder
  setSubmenu(cb?: (m: MenuLike) => void): MenuItemBuilder | MenuLike
}

interface MenuLike {
  addItem(cb: (item: MenuItemBuilder) => void): MenuLike
  addSeparator(): MenuLike
  setNoIcon(): MenuLike
  onHide(cb: () => void): MenuLike
  showAtPosition(pos: { x: number; y: number }): MenuLike
  close(): void
  dom: HTMLElement | null
}

const MenuCtor = window.obsidian?.['Menu'] as unknown as { new (): MenuLike }

function openMenu(build: (menu: MenuLike) => void): { menu: MenuLike; dom: HTMLElement } {
  const menu = new MenuCtor()
  build(menu)
  menu.showAtPosition({ x: 10, y: 10 })
  const dom = document.querySelector('.menu')
  if (!dom) throw new Error('menu did not render')
  return { menu, dom: dom as HTMLElement }
}

describe('Menu', () => {
  beforeEach(() => {
    document.querySelectorAll('.menu-overlay').forEach((el) => { el.remove() })
  })

  afterEach(() => {
    document.querySelectorAll('.menu-overlay').forEach((el) => { el.remove() })
  })

  it('renders one .menu-item per item, with its title', () => {
    const { dom } = openMenu((menu) => {
      menu.addItem((i) => i.setTitle('Erste'))
      menu.addItem((i) => i.setTitle('Zweite'))
    })
    const titles = [...dom.querySelectorAll('.menu-item-title')].map((n) => n.textContent)
    expect(titles).toEqual(['Erste', 'Zweite'])
  })

  it('renders separators in the position they were added', () => {
    const { dom } = openMenu((menu) => {
      menu.addItem((i) => i.setTitle('Oben'))
      menu.addSeparator()
      menu.addItem((i) => i.setTitle('Unten'))
    })
    const classes = [...dom.children].map((c) => c.className)
    expect(classes).toEqual(['menu-item', 'menu-separator', 'menu-item'])
  })

  it('marks checked items so a checkmark can be shown', () => {
    const { dom } = openMenu((menu) => {
      menu.addItem((i) => i.setTitle('An').setChecked(true))
      menu.addItem((i) => i.setTitle('Aus').setChecked(false))
    })
    const items = [...dom.querySelectorAll('.menu-item')]
    expect(items[0]?.classList.contains('is-checked')).toBe(true)
    expect(items[1]?.classList.contains('is-checked')).toBe(false)
  })

  it('does not fire a disabled item, and marks it as disabled', () => {
    const onClick = vi.fn()
    const { dom } = openMenu((menu) => {
      menu.addItem((i) => i.setTitle('Gesperrt').setDisabled(true).onClick(onClick))
    })
    const item = dom.querySelector('.menu-item')
    expect(item?.classList.contains('is-disabled')).toBe(true)
    expect(item?.getAttribute('aria-disabled')).toBe('true')
    ;(item as HTMLElement).click()
    expect(onClick).not.toHaveBeenCalled()
  })

  it('fires an enabled item and closes the menu', () => {
    const onClick = vi.fn()
    const { dom } = openMenu((menu) => {
      menu.addItem((i) => i.setTitle('Los').onClick(onClick))
    })
    ;(dom.querySelector('.menu-item') as HTMLElement).click()
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(document.querySelector('.menu')).toBeNull()
  })

  it('renders an icon slot for items that asked for an icon', () => {
    const { dom } = openMenu((menu) => {
      menu.addItem((i) => i.setTitle('Mit Icon').setIcon('file-text'))
    })
    expect(dom.querySelector('.menu-item-icon')).not.toBeNull()
  })

  it('marks items carrying a submenu and gives them an arrow', () => {
    const { dom } = openMenu((menu) => {
      menu.addItem((i) => i.setTitle('Mehr').setSubmenu((sub) => {
        sub.addItem((s) => s.setTitle('Untereintrag'))
      }))
    })
    const item = dom.querySelector('.menu-item')
    expect(item?.classList.contains('mod-submenu')).toBe(true)
    expect(item?.querySelector('.mod-submenu-arrow')).not.toBeNull()
  })

  it('returns the submenu for the no-argument setSubmenu() overload', () => {
    const menu = new MenuCtor()
    let submenu: unknown
    menu.addItem((i) => { submenu = i.setSubmenu() })
    expect(submenu).toBeInstanceOf(MenuCtor)
  })

  it('separates sections with a divider', () => {
    const { dom } = openMenu((menu) => {
      menu.addItem((i) => i.setTitle('A').setSection('erste'))
      menu.addItem((i) => i.setTitle('B').setSection('zweite'))
    })
    expect(dom.querySelectorAll('.menu-separator')).toHaveLength(1)
  })

  it('exposes the menu element as `dom`, as Obsidian does', () => {
    const { menu, dom } = openMenu((m) => { m.addItem((i) => i.setTitle('X')) })
    expect(menu.dom).toBe(dom)
  })

  it('runs onHide callbacks when closed', () => {
    const onHide = vi.fn()
    const { menu } = openMenu((m) => {
      m.onHide(onHide)
      m.addItem((i) => i.setTitle('X'))
    })
    menu.close()
    expect(onHide).toHaveBeenCalledTimes(1)
  })

  it('closes on Escape', () => {
    const { dom } = openMenu((menu) => { menu.addItem((i) => i.setTitle('X')) })
    dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(document.querySelector('.menu')).toBeNull()
  })

  it('moves focus between items with the arrow keys', () => {
    const { dom } = openMenu((menu) => {
      menu.addItem((i) => i.setTitle('Erste'))
      menu.addItem((i) => i.setTitle('Zweite'))
    })
    dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    expect(document.activeElement?.textContent).toBe('Erste')
    dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    expect(document.activeElement?.textContent).toBe('Zweite')
  })

  it('skips disabled items when navigating with the keyboard', () => {
    const { dom } = openMenu((menu) => {
      menu.addItem((i) => i.setTitle('Gesperrt').setDisabled(true))
      menu.addItem((i) => i.setTitle('Aktiv'))
    })
    dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    expect(document.activeElement?.textContent).toBe('Aktiv')
  })

  it('marks the menu when setNoIcon() was called, so CSS can drop the gutter', () => {
    const { dom } = openMenu((menu) => {
      menu.setNoIcon()
      menu.addItem((i) => i.setTitle('Ohne Icon'))
    })
    expect(dom.classList.contains('mod-no-icon')).toBe(true)
  })

  it('survives a throwing item callback rather than leaving the menu open', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { dom } = openMenu((menu) => {
      menu.addItem((i) => i.setTitle('Kaputt').onClick(() => { throw new Error('boom') }))
    })
    expect(() => { (dom.querySelector('.menu-item') as HTMLElement).click() }).not.toThrow()
    expect(document.querySelector('.menu')).toBeNull()
    expect(error).toHaveBeenCalled()
    error.mockRestore()
  })

  it('does not leave a second menu behind when shown twice', () => {
    const menu = new MenuCtor()
    menu.addItem((i) => i.setTitle('X'))
    menu.showAtPosition({ x: 0, y: 0 })
    menu.showAtPosition({ x: 20, y: 20 })
    expect(document.querySelectorAll('.menu')).toHaveLength(1)
  })
})
