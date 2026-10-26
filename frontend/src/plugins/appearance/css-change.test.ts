import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CSS_CHANGE_EVENT, notifyCssChange } from './css-change'
import { ThemeInjector } from './theme-injector'
import { SnippetInjector } from './snippet-injector'

/** Lets the coalescing microtask run. */
const flush = (): Promise<void> => Promise.resolve()

let listener: ReturnType<typeof vi.fn>
let styleListener: (() => void) | undefined

beforeEach(() => {
  listener = vi.fn()
  window.addEventListener(CSS_CHANGE_EVENT, listener)
})

afterEach(async () => {
  // Drain a pending coalesced event: its flag is module state and would otherwise swallow the next test's notification.
  await flush()
  window.removeEventListener(CSS_CHANGE_EVENT, listener)
  if (styleListener) window.removeEventListener(CSS_CHANGE_EVENT, styleListener)
  styleListener = undefined
  document.head.querySelectorAll('style[data-slatebase-theme], style[data-snippet-id]').forEach((el) => el.remove())
  document.documentElement.removeAttribute('data-obsidian-theme')
})

describe('notifyCssChange', () => {
  it('coalesces several changes in one turn into a single event', async () => {
    notifyCssChange()
    notifyCssChange()
    notifyCssChange()
    expect(listener).not.toHaveBeenCalled() // announced after the current turn, when the DOM is settled
    await flush()
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('announces again for a later change', async () => {
    notifyCssChange()
    await flush()
    notifyCssChange()
    await flush()
    expect(listener).toHaveBeenCalledTimes(2)
  })
})

describe('ThemeInjector announces css-change', () => {
  it('when a theme is applied, with the style already in the document', async () => {
    let styleAtEvent: string | null | undefined
    styleListener = () => {
      styleAtEvent = document.head.querySelector('style[data-slatebase-theme]')?.textContent
    }
    window.addEventListener(CSS_CHANGE_EVENT, styleListener)

    new ThemeInjector().apply('Things', 'body { --x: 1 }')
    await flush()

    expect(listener).toHaveBeenCalledTimes(1)
    expect(styleAtEvent).toBe('body { --x: 1 }')
  })

  it('when the theme or its CSS changes, but not when the same theme is applied again', async () => {
    const injector = new ThemeInjector()
    injector.apply('Things', 'a{}')
    await flush()
    listener.mockClear()

    injector.apply('Things', 'a{}') // the lifecycle does this on every vault change event
    await flush()
    expect(listener).not.toHaveBeenCalled()

    injector.apply('Things', 'b{}')
    await flush()
    expect(listener).toHaveBeenCalledTimes(1)

    injector.apply('Minimal', 'b{}')
    await flush()
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('when the theme is removed, but not when there is nothing to remove', async () => {
    const injector = new ThemeInjector()
    injector.remove()
    await flush()
    expect(listener).not.toHaveBeenCalled()

    injector.apply('Things', 'a{}')
    await flush()
    listener.mockClear()
    injector.remove()
    await flush()
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('not when a theme is rejected for its size', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    new ThemeInjector().apply('Big', 'a'.repeat(6 * 1024 * 1024 + 1))
    await flush()
    expect(listener).not.toHaveBeenCalled()
    error.mockRestore()
  })
})

describe('SnippetInjector announces css-change', () => {
  it('once for an apply, even though it replaces an existing tag internally', async () => {
    const injector = new SnippetInjector()
    injector.apply('s1', 'a{}')
    await flush()
    listener.mockClear()

    injector.apply('s1', 'b{}')
    await flush()

    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('for a remove that removed something, not for one that did not', async () => {
    const injector = new SnippetInjector()
    injector.remove('missing')
    await flush()
    expect(listener).not.toHaveBeenCalled()

    injector.apply('s2', 'a{}')
    await flush()
    listener.mockClear()
    injector.remove('s2')
    await flush()
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('removes a snippet whose id contains quotes and backslashes', async () => {
    const injector = new SnippetInjector()
    const id = 'a"b\\c.css'
    injector.apply(id, 'a{}')
    await flush()
    listener.mockClear()

    injector.remove(id)
    await flush()

    expect(document.head.querySelector('style[data-snippet-id]')).toBeNull()
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('once for removeAll, however many snippets it removes', async () => {
    const injector = new SnippetInjector()
    injector.apply('a', 'a{}')
    injector.apply('b', 'b{}')
    injector.apply('c', 'c{}')
    await flush()
    listener.mockClear()

    injector.removeAll()
    await flush()

    expect(listener).toHaveBeenCalledTimes(1)
    injector.removeAll() // nothing left
    await flush()
    expect(listener).toHaveBeenCalledTimes(1)
  })
})
