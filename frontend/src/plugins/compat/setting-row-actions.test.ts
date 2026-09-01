/**
 * Setting.setNavigable()/setAction()/setIcon() — Obsidian 1.13 row APIs that are
 * missing from the published obsidian.d.ts but used by first-party bundles
 * (Importer declares them in its own augment.d.ts and builds its whole format
 * picker out of navigable rows).
 */
import { describe, it, expect, vi } from 'vitest'
import { Setting } from './setting-tab'

function row(): { container: HTMLElement; setting: Setting } {
  const container = document.createElement('div')
  return { container, setting: new Setting(container) }
}

describe('Setting.setNavigable() (Obsidian 1.13)', () => {
  it('marks the row navigable and adds a chevron', () => {
    const { setting } = row()
    setting.setNavigable(() => {})
    expect(setting.settingEl.classList.contains('mod-navigable')).toBe(true)
    expect(setting.settingEl.classList.contains('setting-item--navigable')).toBe(true)
    expect(setting.settingEl.querySelectorAll('.setting-item-arrow')).toHaveLength(1)
  })

  it('runs the callback on click', () => {
    const { setting } = row()
    const onNavigate = vi.fn()
    setting.setNavigable(onNavigate)
    setting.settingEl.click()
    expect(onNavigate).toHaveBeenCalledTimes(1)
  })

  it('makes the row focusable and activatable by keyboard', () => {
    const { setting } = row()
    const onNavigate = vi.fn()
    setting.setNavigable(onNavigate)
    expect(setting.settingEl.getAttribute('role')).toBe('button')
    expect(setting.settingEl.tabIndex).toBe(0)

    setting.settingEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    setting.settingEl.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }))
    expect(onNavigate).toHaveBeenCalledTimes(2)
  })

  it('does not double-fire when the plugin binds its own Enter handler on the row', () => {
    // Importer's row list adds exactly this handler on top of setNavigable().
    const { setting } = row()
    const choose = vi.fn()
    setting.setNavigable(choose)
    setting.settingEl.addEventListener('keydown', (evt) => {
      if (evt.key === 'Enter') choose()
    })

    setting.settingEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(choose).toHaveBeenCalledTimes(1)
  })

  it('leaves other keys to the plugin, which uses them for row navigation', () => {
    const { setting } = row()
    const onArrowDown = vi.fn()
    setting.setNavigable(() => {})
    setting.settingEl.addEventListener('keydown', (evt) => {
      if (evt.key === 'ArrowDown') onArrowDown()
    })

    setting.settingEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    expect(onArrowDown).toHaveBeenCalledTimes(1)
  })

  it('replaces the callback rather than stacking listeners when called again', () => {
    const { setting } = row()
    const first = vi.fn()
    const second = vi.fn()
    setting.setNavigable(first)
    setting.setNavigable(second)

    setting.settingEl.click()
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
    expect(setting.settingEl.querySelectorAll('.setting-item-arrow')).toHaveLength(1)
  })
})

describe('Setting.setAction() (Obsidian 1.13)', () => {
  it('runs the callback on click without adding a navigation chevron', () => {
    const { setting } = row()
    const onAction = vi.fn()
    setting.setAction(onAction)

    setting.settingEl.click()
    expect(onAction).toHaveBeenCalledTimes(1)
    expect(setting.settingEl.classList.contains('mod-clickable')).toBe(true)
    expect(setting.settingEl.querySelector('.setting-item-arrow')).toBeNull()
  })
})

describe('Setting.setIcon() (Obsidian 1.13)', () => {
  it('prepends a .setting-item-icon element to the row', () => {
    const { setting } = row()
    setting.setIcon('lucide-plus')
    expect(setting.iconEl?.className).toBe('setting-item-icon')
    expect(setting.settingEl.firstElementChild).toBe(setting.iconEl)
  })

  it('reuses the element on a second call and removes it on null', () => {
    const { setting } = row()
    setting.setIcon('lucide-plus')
    const iconEl = setting.iconEl
    setting.setIcon('lucide-folder')
    expect(setting.iconEl).toBe(iconEl)
    expect(setting.settingEl.querySelectorAll('.setting-item-icon')).toHaveLength(1)

    setting.setIcon(null)
    expect(setting.iconEl).toBeNull()
    expect(setting.settingEl.querySelector('.setting-item-icon')).toBeNull()
  })
})
