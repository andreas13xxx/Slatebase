import { describe, it, expect, vi } from 'vitest'
import { AbstractTextComponent, SearchComponent, Setting, SliderComponent, TextComponent, ToggleComponent } from './setting-tab'

describe('AbstractTextComponent.onChanged', () => {
  it('runs a subclass override on every edit', () => {
    const seen: string[] = []
    class Upper extends TextComponent {
      override onChanged(): void { seen.push(this.inputEl.value.toUpperCase()) }
    }
    const text = new Upper(document.createElement('div'))
    text.inputEl.value = 'abc'
    text.inputEl.dispatchEvent(new Event('input'))
    expect(seen).toEqual(['ABC'])
  })
})

describe('SearchComponent', () => {
  it('is an AbstractTextComponent and keeps Obsidian\'s DOM', () => {
    const host = document.createElement('div')
    const search = new SearchComponent(host)
    expect(search).toBeInstanceOf(AbstractTextComponent)
    expect(host.querySelector('.search-input-container > input.search-input')).toBe(search.inputEl)
    expect(search.clearButtonEl.parentElement).toBe(search.containerEl)
  })

  it('shows the clear button only with content, and clearing notifies onChange', () => {
    const search = new SearchComponent(document.createElement('div'))
    const onChange = vi.fn()
    search.onChange(onChange)
    expect(search.clearButtonEl.classList.contains('is-hidden')).toBe(true)

    search.inputEl.value = 'query'
    search.inputEl.dispatchEvent(new Event('input'))
    expect(onChange).toHaveBeenLastCalledWith('query')
    expect(search.clearButtonEl.classList.contains('is-hidden')).toBe(false)

    search.clearButtonEl.dispatchEvent(new Event('click'))
    expect(onChange).toHaveBeenLastCalledWith('')
    expect(search.clearButtonEl.classList.contains('is-hidden')).toBe(true)
  })

  it('is what Setting.addSearch() hands out', () => {
    let received: unknown = null
    new Setting(document.createElement('div')).addSearch((c) => { received = c })
    expect(received).toBeInstanceOf(SearchComponent)
  })
})

describe('ToggleComponent.onClick', () => {
  // jsdom only fires `change` for a click on a connected checkbox.
  function connectedHost(): HTMLElement {
    return document.body.appendChild(document.createElement('div'))
  }

  it('flips the value and notifies onChange on a user click', () => {
    const toggle = new ToggleComponent(connectedHost())
    const onChange = vi.fn()
    toggle.onChange(onChange)
    const input = toggle.toggleEl.querySelector('input') as HTMLInputElement
    input.click()
    expect(toggle.getValue()).toBe(true)
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('lets a subclass override decide what a click does', () => {
    class Locked extends ToggleComponent {
      override onClick(): void {}
    }
    const toggle = new Locked(connectedHost())
    const input = toggle.toggleEl.querySelector('input') as HTMLInputElement
    input.click()
    expect(toggle.getValue()).toBe(false)
  })
})

describe('SliderComponent.getValuePretty', () => {
  it('returns the formatted value', () => {
    const slider = new SliderComponent(document.createElement('div'))
    slider.setLimits(0, 100, 1)
    slider.setValue(42)
    expect(slider.getValuePretty()).toBe('42')
    slider.setDisplayFormat((v) => `${v} %`)
    expect(slider.getValuePretty()).toBe('42 %')
  })
})
