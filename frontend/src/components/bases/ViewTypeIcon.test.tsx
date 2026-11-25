import { describe, it, expect, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { ViewTypeIcon } from './ViewTypeIcon'
import { registerBasesView, resetForVault } from '../../plugins/compat/bases-view-registry'

const factory = () => ({ containerEl: document.createElement('div'), load() {}, onDataUpdated() {} })

describe('ViewTypeIcon', () => {
  beforeEach(() => resetForVault())

  it('draws a different icon for each built-in type', () => {
    const html = (type: string) => render(<ViewTypeIcon type={type} />).container.innerHTML
    const icons = ['table', 'cards', 'kanban', 'list'].map(html)
    expect(new Set(icons).size).toBe(4)
  })

  it('uses the icon a plugin registered with its view type', () => {
    registerBasesView('plugin-view', { name: 'Plugin', icon: 'check-square', factory }, 'p')
    const withIcon = render(<ViewTypeIcon type="plugin-view" />).container
    expect(withIcon.querySelector('.toolbar-btn-glyph, svg')).not.toBeNull()
  })

  it('falls back to a generic icon for an unknown type', () => {
    const { container } = render(<ViewTypeIcon type="never-registered" />)
    expect(container.querySelector('svg')).not.toBeNull()
  })

  it('hides the icon from assistive technology', () => {
    const { container } = render(<ViewTypeIcon type="table" />)
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true')
  })
})
