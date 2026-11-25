import { describe, expect, it, vi } from 'vitest'
import { MarkdownRenderChild } from './code-block-processor-registry'

describe('internal MarkdownRenderChild', () => {
  it('runs every registered cleanup, not just the last', () => {
    const child = new MarkdownRenderChild(document.createElement('div'))
    const a = vi.fn()
    const b = vi.fn()
    child.register(a)
    child.register(b)
    child.unload()
    expect(a).toHaveBeenCalledOnce()
    expect(b).toHaveBeenCalledOnce()
  })

  it('attaches DOM listeners and removes them on unload', () => {
    const el = document.createElement('div')
    const child = new MarkdownRenderChild(el)
    const cb = vi.fn()
    child.registerDomEvent(el, 'click', cb)
    el.click()
    expect(cb).toHaveBeenCalledTimes(1)
    child.unload()
    el.click()
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('loads an added child once and unloads it with the holder', () => {
    const holder = new MarkdownRenderChild(document.createElement('div'))
    const plugin = { _loaded: false, load: vi.fn(), unload: vi.fn() }
    holder.addChild(plugin)
    expect(plugin.load).toHaveBeenCalledOnce()
    const preLoaded = { _loaded: true, load: vi.fn(), unload: vi.fn() }
    holder.addChild(preLoaded)
    expect(preLoaded.load).not.toHaveBeenCalled()
    holder.unload()
    expect(plugin.unload).toHaveBeenCalledOnce()
    expect(preLoaded.unload).toHaveBeenCalledOnce()
  })

  it('clears registered intervals on unload', () => {
    vi.useFakeTimers()
    const child = new MarkdownRenderChild(document.createElement('div'))
    const tick = vi.fn()
    child.registerInterval(window.setInterval(tick, 10))
    child.unload()
    vi.advanceTimersByTime(50)
    expect(tick).not.toHaveBeenCalled()
    vi.useRealTimers()
  })
})
