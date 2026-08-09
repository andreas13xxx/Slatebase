import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { resolveActiveTheme, syncThemeBodyClass } from './body-classes'

/**
 * Replace `window.matchMedia` with one that answers the dark-scheme query.
 *
 * jsdom has no matchMedia, and the theme resolution depends on it whenever
 * `data-theme` is absent or `system`.
 */
function mockMatchMedia(prefersDark: boolean): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query.includes('prefers-color-scheme: dark') ? prefersDark : false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  )
}

describe('body-classes', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-theme')
    document.body.className = ''
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('resolveActiveTheme', () => {
    it('follows an explicit dark preference', () => {
      mockMatchMedia(false)
      document.documentElement.setAttribute('data-theme', 'dark')
      expect(resolveActiveTheme()).toBe('dark')
    })

    it('follows an explicit light preference even when the OS is dark', () => {
      mockMatchMedia(true)
      document.documentElement.setAttribute('data-theme', 'light')
      expect(resolveActiveTheme()).toBe('light')
    })

    it('defers to the OS when the preference is "system"', () => {
      mockMatchMedia(true)
      document.documentElement.setAttribute('data-theme', 'system')
      expect(resolveActiveTheme()).toBe('dark')
    })

    it('defers to the OS when no preference is set', () => {
      mockMatchMedia(true)
      expect(resolveActiveTheme()).toBe('dark')
    })

    it('falls back to light when matchMedia is unavailable', () => {
      vi.stubGlobal('matchMedia', undefined)
      expect(resolveActiveTheme()).toBe('light')
    })
  })

  describe('syncThemeBodyClass', () => {
    it('sets theme-dark for a dark theme', () => {
      mockMatchMedia(false)
      document.documentElement.setAttribute('data-theme', 'dark')
      syncThemeBodyClass()
      expect(document.body.classList.contains('theme-dark')).toBe(true)
      expect(document.body.classList.contains('theme-light')).toBe(false)
    })

    it('sets theme-light for a light theme', () => {
      mockMatchMedia(false)
      document.documentElement.setAttribute('data-theme', 'light')
      syncThemeBodyClass()
      expect(document.body.classList.contains('theme-light')).toBe(true)
      expect(document.body.classList.contains('theme-dark')).toBe(false)
    })

    it('replaces the previous theme class rather than accumulating both', () => {
      mockMatchMedia(false)
      document.documentElement.setAttribute('data-theme', 'dark')
      syncThemeBodyClass()
      document.documentElement.setAttribute('data-theme', 'light')
      syncThemeBodyClass()
      expect(document.body.classList.contains('theme-light')).toBe(true)
      expect(document.body.classList.contains('theme-dark')).toBe(false)
    })

    it('leaves unrelated body classes alone', () => {
      mockMatchMedia(false)
      document.body.classList.add('is-mobile', 'mod-windows')
      document.documentElement.setAttribute('data-theme', 'dark')
      syncThemeBodyClass()
      expect(document.body.classList.contains('is-mobile')).toBe(true)
      expect(document.body.classList.contains('mod-windows')).toBe(true)
    })
  })
})
