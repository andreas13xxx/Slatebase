import { describe, it, expect } from 'vitest'
import { SliderComponent } from './setting-tab'

describe('SliderComponent', () => {
  it('fires onChange only on release by default (Obsidian 1.5.9+)', () => {
    const container = document.createElement('div')
    const slider = new SliderComponent(container)
    const values: number[] = []
    slider.setLimits(0, 10, 1)
    slider.onChange((v) => values.push(v))

    slider.sliderEl.value = '3'
    slider.sliderEl.dispatchEvent(new Event('input'))
    expect(values).toEqual([])

    slider.sliderEl.dispatchEvent(new Event('change'))
    expect(values).toEqual([3])
  })

  it('fires onChange on every drag tick after setInstant(true)', () => {
    const container = document.createElement('div')
    const slider = new SliderComponent(container)
    const values: number[] = []
    slider.setLimits(0, 10, 1)
    slider.setInstant(true)
    slider.onChange((v) => values.push(v))

    slider.sliderEl.value = '4'
    slider.sliderEl.dispatchEvent(new Event('input'))
    slider.sliderEl.value = '5'
    slider.sliderEl.dispatchEvent(new Event('input'))

    expect(values).toEqual([4, 5])
  })

  it('setInstant(true) does not also fire on release', () => {
    const container = document.createElement('div')
    const slider = new SliderComponent(container)
    const values: number[] = []
    slider.setInstant(true)
    slider.onChange((v) => values.push(v))

    slider.sliderEl.value = '7'
    slider.sliderEl.dispatchEvent(new Event('input'))
    slider.sliderEl.dispatchEvent(new Event('change'))

    expect(values).toEqual([7])
  })

  it('updates the dynamic tooltip live on drag regardless of setInstant', () => {
    const container = document.createElement('div')
    const slider = new SliderComponent(container)
    slider.setDynamicTooltip()

    slider.sliderEl.value = '9'
    slider.sliderEl.dispatchEvent(new Event('input'))

    expect(container.querySelector('.setting-slider-tooltip')?.textContent).toBe('9')
  })

  it('setDisplayFormat() formats the dynamic tooltip text (Obsidian 1.13.1+)', () => {
    const container = document.createElement('div')
    const slider = new SliderComponent(container)
    slider.setDynamicTooltip()
    slider.setDisplayFormat((v) => `${v}%`)

    slider.sliderEl.value = '42'
    slider.sliderEl.dispatchEvent(new Event('input'))

    expect(container.querySelector('.setting-slider-tooltip')?.textContent).toBe('42%')
  })

  it('setValue() also applies the display format', () => {
    const container = document.createElement('div')
    const slider = new SliderComponent(container)
    slider.setDynamicTooltip()
    slider.setDisplayFormat((v) => `~${v}`)

    slider.setValue(5)

    expect(container.querySelector('.setting-slider-tooltip')?.textContent).toBe('~5')
  })
})
