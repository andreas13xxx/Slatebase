import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EditorState } from '@codemirror/state'
import { markdown } from '@codemirror/lang-markdown'
import { GFM } from '@lezer/markdown'
import { buildWidgetDecorations, shouldEmbedWebUrl } from './widget-decorations'

const webEmbed = vi.hoisted(() => ({ enabled: false }))
vi.mock('../../hooks/useWebEmbed', () => ({ getWebEmbedEnabled: () => webEmbed.enabled }))

function widgetDomFor(doc: string): HTMLElement | null {
  const state = EditorState.create({ doc, extensions: [markdown({ extensions: GFM })] })
  const result = buildWidgetDecorations(state, { vaultId: 'v1' })
  const deco = result.decorations.find((r) => {
    const spec = r.value.spec as { widget?: { toDOM?: () => HTMLElement } }
    return typeof spec.widget?.toDOM === 'function'
  })
  return deco ? (deco.value.spec as { widget: { toDOM: () => HTMLElement } }).widget.toDOM() : null
}

describe('shouldEmbedWebUrl', () => {
  it('needs the opt-in and an http(s) URL', () => {
    expect(shouldEmbedWebUrl('https://example.org/x', true)).toBe(true)
    expect(shouldEmbedWebUrl('HTTP://example.org', true)).toBe(true)
    expect(shouldEmbedWebUrl('https://example.org/x', false)).toBe(false)
    expect(shouldEmbedWebUrl('Bilder/a.png', true)).toBe(false)
    expect(shouldEmbedWebUrl('javascript:alert(1)', true)).toBe(false)
    expect(shouldEmbedWebUrl('data:text/html,x', true)).toBe(false)
  })

  it('reads the stored setting by default', () => {
    webEmbed.enabled = true
    expect(shouldEmbedWebUrl('https://example.org')).toBe(true)
    webEmbed.enabled = false
    expect(shouldEmbedWebUrl('https://example.org')).toBe(false)
  })
})

describe('Live Preview ![](url)', () => {
  beforeEach(() => {
    webEmbed.enabled = false
  })

  it('renders an external URL as a plain image while the opt-in is off', () => {
    const el = widgetDomFor('![alt](https://example.org/page)')
    expect(el?.tagName).toBe('IMG')
    expect(el?.classList.contains('cm-lp-image')).toBe(true)
  })

  it('mounts the embedded web frame instead when the opt-in is on', () => {
    webEmbed.enabled = true
    const el = widgetDomFor('![alt](https://example.org/page)')
    expect(el?.classList.contains('cm-lp-web-embed')).toBe(true)
    expect(el?.tagName).toBe('DIV')
  })

  it('keeps vault-relative images as images even with the opt-in on', () => {
    webEmbed.enabled = true
    const el = widgetDomFor('![alt](Bilder/foto.png)')
    expect(el?.tagName).toBe('IMG')
  })
})
