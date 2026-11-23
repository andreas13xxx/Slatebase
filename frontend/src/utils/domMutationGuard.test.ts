import { describe, it, expect, vi } from 'vitest'
import { installDomMutationGuard } from './domMutationGuard'

describe('installDomMutationGuard', () => {
  installDomMutationGuard()

  it('does not throw when the child was already removed by foreign code', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const parent = document.createElement('div')
    const child = document.createElement('span')
    parent.appendChild(child)
    child.remove()
    expect(() => parent.removeChild(child)).not.toThrow()
  })

  it('still removes a real child', () => {
    const parent = document.createElement('div')
    const child = document.createElement('span')
    parent.appendChild(child)
    parent.removeChild(child)
    expect(parent.childNodes.length).toBe(0)
  })

  it('appends when the insertBefore reference is stale', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const parent = document.createElement('div')
    const stale = document.createElement('i')
    const node = document.createElement('b')
    parent.insertBefore(node, stale)
    expect(parent.firstChild).toBe(node)
  })
})
