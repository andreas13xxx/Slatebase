import { afterEach, describe, expect, it, vi } from 'vitest'
import { CSS_CHANGE_EVENT } from './css-change'
import { ThemeInjector } from './theme-injector'

const themeTag = (): HTMLStyleElement | null => document.head.querySelector('style[data-slatebase-theme]')

describe('ThemeInjector', () => {
  afterEach(() => {
    document.head.querySelectorAll('style').forEach((el) => el.remove())
    document.documentElement.removeAttribute('data-obsidian-theme')
  })

  it('injects one style tag and sets the bridge marker on <html>', () => {
    const injector = new ThemeInjector()
    expect(injector.apply('Things', 'body { --x: 1 }')).toBe(true)

    expect(themeTag()?.textContent).toBe('body { --x: 1 }')
    expect(document.documentElement.getAttribute('data-obsidian-theme')).toBe('Things')
    expect(injector.currentThemeId()).toBe('Things')
  })

  it('replaces the CSS in place when another theme is applied', () => {
    const injector = new ThemeInjector()
    injector.apply('A', 'a{}')
    injector.apply('B', 'b{}')

    expect(document.head.querySelectorAll('style[data-slatebase-theme]')).toHaveLength(1)
    expect(themeTag()?.textContent).toBe('b{}')
    expect(injector.currentThemeId()).toBe('B')
    expect(document.documentElement.getAttribute('data-obsidian-theme')).toBe('B')
  })

  it('removes the tag and the marker, restoring the default look', () => {
    const injector = new ThemeInjector()
    injector.apply('Things', 'a{}')
    injector.remove()

    expect(themeTag()).toBeNull()
    expect(document.documentElement.hasAttribute('data-obsidian-theme')).toBe(false)
    expect(injector.currentThemeId()).toBeNull()
  })

  it('applies a built-in theme with the marker only and replaces a vault theme tag', () => {
    const injector = new ThemeInjector()
    injector.apply('Things', 'a{}')
    injector.applyBuiltin('builtin:obsidian')

    expect(themeTag()).toBeNull()
    expect(document.documentElement.getAttribute('data-obsidian-theme')).toBe('builtin:obsidian')
    expect(injector.currentThemeId()).toBe('builtin:obsidian')

    injector.remove()
    expect(document.documentElement.hasAttribute('data-obsidian-theme')).toBe(false)
    expect(injector.currentThemeId()).toBeNull()
  })

  it('lets a vault theme take over from a built-in one and notifies only on a change', async () => {
    const injector = new ThemeInjector()
    const listener = vi.fn()
    window.addEventListener(CSS_CHANGE_EVENT, listener)
    injector.applyBuiltin('builtin:obsidian')
    await Promise.resolve()
    injector.applyBuiltin('builtin:obsidian')
    await Promise.resolve()
    expect(listener).toHaveBeenCalledTimes(1)

    injector.apply('Things', 'a{}')
    expect(themeTag()?.textContent).toBe('a{}')
    expect(document.documentElement.getAttribute('data-obsidian-theme')).toBe('Things')
    window.removeEventListener(CSS_CHANGE_EVENT, listener)
  })

  it('is a no-op to remove when nothing is applied', () => {
    expect(() => new ThemeInjector().remove()).not.toThrow()
  })

  it('places the theme before snippets that are already injected (base < theme < snippets)', () => {
    const snippet = document.createElement('style')
    snippet.setAttribute('data-snippet-id', 's1')
    document.head.appendChild(snippet)

    new ThemeInjector().apply('Things', 'a{}')

    const order = [...document.head.querySelectorAll('style')].map((el) =>
      el.hasAttribute('data-slatebase-theme') ? 'theme' : 'snippet',
    )
    expect(order).toEqual(['theme', 'snippet'])
  })

  it('keeps snippets applied later after the theme', () => {
    new ThemeInjector().apply('Things', 'a{}')
    const snippet = document.createElement('style')
    snippet.setAttribute('data-snippet-id', 's1')
    document.head.appendChild(snippet)

    const order = [...document.head.querySelectorAll('style')].map((el) =>
      el.hasAttribute('data-slatebase-theme') ? 'theme' : 'snippet',
    )
    expect(order).toEqual(['theme', 'snippet'])
  })

  it('applies CSS of exactly 3 MB', () => {
    const injector = new ThemeInjector()
    expect(injector.apply('Exact', 'a'.repeat(3 * 1024 * 1024))).toBe(true)
    expect(themeTag()).not.toBeNull()
  })

  it('rejects CSS above 3 MB without touching the DOM', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const injector = new ThemeInjector()

    expect(injector.apply('Big', 'a'.repeat(3 * 1024 * 1024 + 1))).toBe(false)
    expect(themeTag()).toBeNull()
    expect(document.documentElement.hasAttribute('data-obsidian-theme')).toBe(false)
    expect(error).toHaveBeenCalled()
    error.mockRestore()
  })
})
