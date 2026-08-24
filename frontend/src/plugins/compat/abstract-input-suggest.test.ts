/**
 * `AbstractInputSuggest` — real trigger loop.
 *
 * Previously this class had `setValue`/`getValue`/`onSelect` but nothing ever
 * called `getSuggestions()`: no dropdown, no keyboard navigation. Plugins like
 * Templater bind it to a plain `<input>` in a settings tab and expect typing to
 * pop up a positioned, navigable suggestion list — exactly what EditorSuggest
 * already does for the CM6 editor. This covers the input/keydown/blur wiring
 * that makes that real.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { installObsidianGlobals } from './install-globals'

type AbstractInputSuggestCtor = new (app: unknown, textInputEl: HTMLInputElement) => {
  textInputEl: HTMLInputElement
  suggestEl: HTMLElement
  limit: number
  setValue(value: string): void
  getValue(): string
  onSelect(cb: (value: unknown, evt: MouseEvent | KeyboardEvent) => void): unknown
  getSuggestions(query: string): unknown[] | Promise<unknown[]>
  renderSuggestion(value: unknown, el: HTMLElement): void
  selectSuggestion(value: unknown, evt: MouseEvent | KeyboardEvent): void
  open(): void
  close(): void
}

function makeInput(): HTMLInputElement {
  const el = document.createElement('input')
  document.body.appendChild(el)
  return el
}

function dispatchInput(el: HTMLInputElement, value: string): void {
  el.value = value
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

function dispatchKey(el: HTMLInputElement, key: string): void {
  el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
}

describe('AbstractInputSuggest', () => {
  let AbstractInputSuggest: AbstractInputSuggestCtor

  beforeEach(() => {
    installObsidianGlobals()
    AbstractInputSuggest = (window.obsidian as Record<string, unknown>)['AbstractInputSuggest'] as AbstractInputSuggestCtor
    document.body.innerHTML = ''
  })

  function makeSuggest(items: string[]) {
    const input = makeInput()
    class TestSuggest extends AbstractInputSuggest {
      getSuggestions(query: string): string[] {
        return items.filter((i) => i.includes(query))
      }
      renderSuggestion(value: unknown, el: HTMLElement): void {
        el.textContent = String(value)
      }
    }
    const suggest = new TestSuggest({}, input) as unknown as InstanceType<AbstractInputSuggestCtor>
    return { input, suggest }
  }

  it('shows no dropdown until the user types', () => {
    const { suggest } = makeSuggest(['apple', 'banana'])
    expect(document.querySelectorAll('.suggestion-container').length).toBe(0)
    expect(suggest.suggestEl.isConnected).toBe(false)
  })

  it('renders matching suggestions via renderSuggestion() on input', () => {
    const { input, suggest } = makeSuggest(['apple', 'apricot', 'banana'])
    dispatchInput(input, 'ap')

    expect(suggest.suggestEl.isConnected).toBe(true)
    const items = suggest.suggestEl.querySelectorAll('.suggestion-item')
    expect(items.length).toBe(2)
    expect(items[0].textContent).toBe('apple')
    expect(items[1].textContent).toBe('apricot')
  })

  it('closes the dropdown when there are no matches', () => {
    const { input, suggest } = makeSuggest(['apple'])
    dispatchInput(input, 'ap')
    expect(suggest.suggestEl.isConnected).toBe(true)

    dispatchInput(input, 'zzz')
    expect(suggest.suggestEl.isConnected).toBe(false)
  })

  it('navigates with ArrowDown/ArrowUp, wrapping at both ends', () => {
    const { input, suggest } = makeSuggest(['a', 'b', 'c'])
    dispatchInput(input, '')

    const selected = () => suggest.suggestEl.querySelector('.is-selected')?.textContent
    expect(selected()).toBe('a')

    dispatchKey(input, 'ArrowDown')
    expect(selected()).toBe('b')

    dispatchKey(input, 'ArrowUp')
    dispatchKey(input, 'ArrowUp')
    expect(selected()).toBe('c') // wrapped past the start
  })

  it('Enter calls selectSuggestion() with the highlighted item and closes', () => {
    const { input, suggest } = makeSuggest(['a', 'b', 'c'])
    const onSelect = vi.fn()
    suggest.onSelect(onSelect)
    dispatchInput(input, '')

    dispatchKey(input, 'ArrowDown') // -> 'b'
    dispatchKey(input, 'Enter')

    expect(onSelect).toHaveBeenCalledWith('b', expect.any(KeyboardEvent))
    expect(suggest.suggestEl.isConnected).toBe(false)
  })

  it('Escape closes without selecting', () => {
    const { input, suggest } = makeSuggest(['a', 'b'])
    const onSelect = vi.fn()
    suggest.onSelect(onSelect)
    dispatchInput(input, '')

    dispatchKey(input, 'Escape')

    expect(onSelect).not.toHaveBeenCalled()
    expect(suggest.suggestEl.isConnected).toBe(false)
  })

  it('clicking a suggestion selects it without blurring the input first', () => {
    const { input, suggest } = makeSuggest(['apple', 'banana'])
    const onSelect = vi.fn()
    suggest.onSelect(onSelect)
    dispatchInput(input, '')

    const secondItem = suggest.suggestEl.querySelectorAll('.suggestion-item')[1] as HTMLElement
    const mousedown = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    const preventDefaultSpy = vi.spyOn(mousedown, 'preventDefault')
    secondItem.dispatchEvent(mousedown)

    expect(preventDefaultSpy).toHaveBeenCalled()
    expect(onSelect).toHaveBeenCalledWith('banana', mousedown)
  })

  it('blurring the input (not via a suggestion click) closes the dropdown', () => {
    const { input, suggest } = makeSuggest(['a'])
    dispatchInput(input, '')
    expect(suggest.suggestEl.isConnected).toBe(true)

    input.dispatchEvent(new FocusEvent('blur', { bubbles: true }))
    expect(suggest.suggestEl.isConnected).toBe(false)
  })

  it('supports async getSuggestions() and discards stale results', async () => {
    const input = makeInput()
    let resolveFirst!: (v: string[]) => void
    const firstPromise = new Promise<string[]>((resolve) => { resolveFirst = resolve })

    class AsyncSuggest extends AbstractInputSuggest {
      calls = 0
      getSuggestions(query: string): Promise<string[]> {
        this.calls++
        if (this.calls === 1) return firstPromise
        return Promise.resolve([`${query}-fast`])
      }
      renderSuggestion(value: unknown, el: HTMLElement): void {
        el.textContent = String(value)
      }
    }
    const suggest = new AsyncSuggest({}, input) as unknown as InstanceType<AbstractInputSuggestCtor> & { calls: number }

    dispatchInput(input, 'slow') // triggers the pending firstPromise
    dispatchInput(input, 'quick') // resolves before 'slow' does

    await new Promise((r) => setTimeout(r, 0))
    expect(suggest.suggestEl.textContent).toBe('quick-fast')

    resolveFirst(['stale'])
    await new Promise((r) => setTimeout(r, 0))
    // The stale first response must not clobber the newer render.
    expect(suggest.suggestEl.textContent).toBe('quick-fast')
  })

  it('respects a custom limit', () => {
    const input = makeInput()
    class LimitedSuggest extends AbstractInputSuggest {
      limit = 2
      getSuggestions(): string[] {
        return ['a', 'b', 'c', 'd']
      }
      renderSuggestion(value: unknown, el: HTMLElement): void {
        el.textContent = String(value)
      }
    }
    const suggest = new LimitedSuggest({}, input) as unknown as InstanceType<AbstractInputSuggestCtor>
    dispatchInput(input, '')
    expect(suggest.suggestEl.querySelectorAll('.suggestion-item').length).toBe(2)
  })
})
