import { describe, it, expect, vi, afterEach } from 'vitest'
import { MarkdownRendererShim } from './markdown-renderer-shim'
import { setActiveWorkspaceShim } from '../active-workspace-shim'
import { onHoverPreview } from '../hover-link-bus'
import type { WorkspaceShim } from './workspace-shim'

/**
 * Plugins hand their output to the shim as markdown. Dataview writes every
 * file reference as a wikilink, so `[[…]]` support here is what decides
 * whether a query result shows links or raw brackets.
 */
describe('MarkdownRendererShim — wikilinks', () => {
  afterEach(() => {
    setActiveWorkspaceShim(null)
    document.body.innerHTML = ''
  })

  function render(markdown: string, sourcePath = 'Menu.md'): HTMLElement {
    const el = document.createElement('div')
    document.body.appendChild(el)
    void MarkdownRendererShim.render(null, markdown, el, sourcePath, null)
    return el
  }

  it('renders [[target|display]] as an internal link', () => {
    const el = render('[[Rezepte/Bratkartoffeln.md|Bratkartoffeln]]')

    const link = el.querySelector('a.internal-link')
    expect(link).not.toBeNull()
    expect(link?.getAttribute('data-href')).toBe('Rezepte/Bratkartoffeln.md')
    expect(link?.textContent).toBe('Bratkartoffeln')
  })

  it('renders a bare [[target]] with the target as its text', () => {
    const el = render('[[Bratkartoffeln]]')

    const link = el.querySelector('a.internal-link')
    expect(link?.getAttribute('data-href')).toBe('Bratkartoffeln')
    expect(link?.textContent).toBe('Bratkartoffeln')
  })

  it('keeps the subpath of [[target#heading]] in data-href', () => {
    const el = render('[[Rezepte#Beilagen]]')

    expect(el.querySelector('a.internal-link')?.getAttribute('data-href')).toBe('Rezepte#Beilagen')
  })

  it('renders links inside a list, alongside other inline markdown', () => {
    const el = render('- **Heute:** [[Rezepte/Reis.md|Reis]]')

    expect(el.querySelectorAll('li a.internal-link')).toHaveLength(1)
    expect(el.querySelector('strong')?.textContent).toBe('Heute:')
  })

  it('opens the linked file on click', () => {
    const openLinkText = vi.fn()
    setActiveWorkspaceShim({ openLinkText } as unknown as WorkspaceShim)

    const el = render('[[Rezepte/Bratkartoffeln.md|Bratkartoffeln]]')
    el.querySelector<HTMLElement>('a.internal-link')?.click()

    expect(openLinkText).toHaveBeenCalledWith('Rezepte/Bratkartoffeln.md', 'Menu.md')
  })

  it('drops the subpath before resolving the click target', () => {
    const openLinkText = vi.fn()
    setActiveWorkspaceShim({ openLinkText } as unknown as WorkspaceShim)

    const el = render('[[Rezepte#Beilagen]]')
    el.querySelector<HTMLElement>('a.internal-link')?.click()

    expect(openLinkText).toHaveBeenCalledWith('Rezepte', 'Menu.md')
  })

  it('asks for a hover preview of the link under the pointer', () => {
    const onRequest = vi.fn()
    const unsubscribe = onHoverPreview(onRequest, () => {})

    const el = render('[[Rezepte/Bratkartoffeln.md|Bratkartoffeln]]')
    const link = el.querySelector<HTMLElement>('a.internal-link')
    link?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))

    expect(onRequest).toHaveBeenCalledWith({
      linkPath: 'Rezepte/Bratkartoffeln.md',
      targetEl: link,
      source: 'internal-link',
      sourcePath: 'Menu.md',
    })
    unsubscribe()
  })

  it('withdraws the preview when the pointer leaves the link', () => {
    const onDismiss = vi.fn()
    const unsubscribe = onHoverPreview(() => {}, onDismiss)

    const el = render('[[Reis]]')
    el.querySelector<HTMLElement>('a.internal-link')?.dispatchEvent(
      new MouseEvent('mouseout', { bubbles: true }),
    )

    expect(onDismiss).toHaveBeenCalledTimes(1)
    unsubscribe()
  })

  it('binds the listeners once, however often the container is re-rendered', () => {
    const openLinkText = vi.fn()
    setActiveWorkspaceShim({ openLinkText } as unknown as WorkspaceShim)

    const el = render('[[Reis]]')
    void MarkdownRendererShim.render(null, '[[Reis]]', el, 'Menu.md', null)
    el.querySelector<HTMLElement>('a.internal-link')?.click()

    expect(openLinkText).toHaveBeenCalledTimes(1)
  })
})
