import { describe, it, expect, beforeEach, vi } from 'vitest'
import { SnippetInjector } from './snippet-injector'

describe('SnippetInjector', () => {
  let injector: SnippetInjector

  beforeEach(() => {
    injector = new SnippetInjector()
    document.querySelectorAll('style[data-snippet-id]').forEach((el) => el.remove())
  })

  it('injects a <style> element with the data-snippet-id attribute', () => {
    injector.apply('dark-accent', 'body { color: red; }')

    const style = document.querySelector('style[data-snippet-id="dark-accent"]')
    expect(style).not.toBeNull()
    expect(style?.textContent).toBe('body { color: red; }')
  })

  it('injects CSS unscoped — no selector prefixing', () => {
    injector.apply('s1', ':root { --accent: red; } body { margin: 0; }')

    const style = document.querySelector('style[data-snippet-id="s1"]')
    expect(style?.textContent).toBe(':root { --accent: red; } body { margin: 0; }')
  })

  it('removes the style element for a snippet', () => {
    injector.apply('s1', 'a {}')
    injector.remove('s1')

    expect(document.querySelector('style[data-snippet-id="s1"]')).toBeNull()
  })

  it('re-injecting the same id replaces the previous content', () => {
    injector.apply('s1', 'a { color: red; }')
    injector.apply('s1', 'a { color: blue; }')

    const styles = document.querySelectorAll('style[data-snippet-id="s1"]')
    expect(styles).toHaveLength(1)
    expect(styles[0]?.textContent).toBe('a { color: blue; }')
  })

  it('removeAll removes every applied snippet', () => {
    injector.apply('s1', 'a {}')
    injector.apply('s2', 'b {}')

    injector.removeAll()

    expect(document.querySelectorAll('style[data-snippet-id]')).toHaveLength(0)
  })

  it('rejects CSS exceeding 512 KB and does not inject it', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const large = 'x'.repeat(512 * 1024 + 1)

    injector.apply('too-large', large)

    expect(document.querySelector('style[data-snippet-id="too-large"]')).toBeNull()
    expect(errorSpy).toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  it('warns but still injects invalid CSS (unmatched braces)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    injector.apply('broken', 'body { color: red;')

    expect(document.querySelector('style[data-snippet-id="broken"]')).not.toBeNull()
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  it('does not warn for valid CSS', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    injector.apply('valid', 'body { color: red; }')

    expect(warnSpy).not.toHaveBeenCalled()
    warnSpy.mockRestore()
  })
})
