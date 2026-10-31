import { afterEach, describe, expect, it } from 'vitest'
import { applyAppearanceVariables, clearAppearanceVariables } from './appearance-variables'

describe('applyAppearanceVariables', () => {
  afterEach(() => clearAppearanceVariables())

  it('sets the variables on the body', () => {
    applyAppearanceVariables({ '--accent-h': '10', '--font-text-size': '18px' })
    expect(document.body.style.getPropertyValue('--accent-h')).toBe('10')
    expect(document.body.style.getPropertyValue('--font-text-size')).toBe('18px')
  })

  it('removes a variable that is no longer wanted, and leaves foreign ones alone', () => {
    document.body.style.setProperty('--foreign', 'x')
    applyAppearanceVariables({ '--accent-h': '10', '--font-text-size': '18px' })
    applyAppearanceVariables({ '--accent-h': '20' })
    expect(document.body.style.getPropertyValue('--accent-h')).toBe('20')
    expect(document.body.style.getPropertyValue('--font-text-size')).toBe('')
    expect(document.body.style.getPropertyValue('--foreign')).toBe('x')
    document.body.style.removeProperty('--foreign')
  })

  it('keeps track per target', () => {
    const other = document.createElement('div')
    applyAppearanceVariables({ '--accent-h': '10' })
    applyAppearanceVariables({ '--accent-h': '30' }, other)
    applyAppearanceVariables({}, other)
    expect(other.style.getPropertyValue('--accent-h')).toBe('')
    expect(document.body.style.getPropertyValue('--accent-h')).toBe('10')
  })

  it('clears everything it set', () => {
    applyAppearanceVariables({ '--accent-h': '10' })
    clearAppearanceVariables()
    expect(document.body.style.getPropertyValue('--accent-h')).toBe('')
  })
})
