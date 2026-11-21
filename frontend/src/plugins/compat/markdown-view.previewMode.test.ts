import { describe, it, expect, vi, beforeAll } from 'vitest'
import { installObsidianGlobals } from './install-globals'

type PreviewMode = {
  set(data: string, clear: boolean): void
  get(): string
  clear(): void
  rerender(full?: boolean): void
  containerEl: HTMLElement
}

describe('MarkdownView.previewMode', () => {
  beforeAll(() => installObsidianGlobals())

  function makeView(): { previewMode: PreviewMode } {
    const MV = window.obsidian!.MarkdownView as unknown as new (leaf: unknown) => { previewMode: PreviewMode }
    return new MV({ view: null })
  }

  it('is a real sub-view with its own container, not a logging stub', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const pm = makeView().previewMode
    expect(pm.containerEl).toBeInstanceOf(HTMLElement)
    pm.set('hello', true)
    expect(pm.get()).toBe('hello')
    pm.clear()
    expect(pm.get()).toBe('')
    pm.rerender(true)
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it('renders set() content into the container', async () => {
    const pm = makeView().previewMode
    pm.set('some text', true)
    await vi.waitFor(() => expect(pm.containerEl.textContent).toContain('some text'))
    pm.clear()
    expect(pm.containerEl.textContent).toBe('')
  })

  it('never touches the view contentEl', () => {
    const MV = window.obsidian!.MarkdownView as unknown as new (leaf: unknown) => { previewMode: PreviewMode; contentEl: HTMLElement }
    const view = new MV({ view: null })
    view.contentEl.appendChild(document.createElement('span'))
    view.previewMode.clear()
    view.previewMode.rerender(true)
    expect(view.contentEl.children).toHaveLength(1)
  })

  it('does not duplicate output on repeated set() and drops a stale render', async () => {
    const pm = makeView().previewMode
    pm.set('first', false)
    pm.set('second', false)
    await vi.waitFor(() => expect(pm.containerEl.textContent).toContain('second'))
    expect(pm.containerEl.textContent).not.toContain('first')
    pm.set('third', false)
    pm.clear()
    await new Promise((r) => setTimeout(r, 50))
    expect(pm.containerEl.textContent).toBe('')
  })
})
