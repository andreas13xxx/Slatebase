import { describe, it, expect, afterEach } from 'vitest'
import { findTextElement, revealSettingText } from './revealSettingText'

function makeRoot(html: string): HTMLElement {
  const root = document.createElement('div')
  root.innerHTML = html
  document.body.appendChild(root)
  Element.prototype.scrollIntoView = () => {}
  return root
}

afterEach(() => { document.body.innerHTML = '' })

describe('revealSettingText', () => {
  it('finds the deepest element showing the text', () => {
    const root = makeRoot('<div><section><label id="x">Zeilennummern anzeigen</label></section></div>')
    expect(findTextElement(root, 'zeilennummern')?.id).toBe('x')
  })

  it('finds text in a placeholder attribute', () => {
    const root = makeRoot('<div><input id="i" placeholder="Ordnername" /></div>')
    expect(findTextElement(root, 'Ordnername')?.id).toBe('i')
  })

  it('highlights the element and clears it on cleanup', () => {
    const root = makeRoot('<p id="p">Hallo Welt</p>')
    const cleanup = revealSettingText(root, 'Hallo Welt')
    expect(root.querySelector('#p')?.classList.contains('settings-search-highlight')).toBe(true)
    cleanup()
    expect(root.querySelector('#p')?.classList.contains('settings-search-highlight')).toBe(false)
  })

  it('waits for text that appears later', async () => {
    const root = makeRoot('<div id="host"></div>')
    const cleanup = revealSettingText(root, 'Spaeter da')
    root.querySelector('#host')!.innerHTML = '<span id="late">Spaeter da</span>'
    await new Promise((r) => setTimeout(r, 0))
    expect(root.querySelector('#late')?.classList.contains('settings-search-highlight')).toBe(true)
    cleanup()
  })
})
