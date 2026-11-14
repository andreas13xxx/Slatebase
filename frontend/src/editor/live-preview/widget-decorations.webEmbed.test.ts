import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { waitFor } from '@testing-library/react'
import { EditorState } from '@codemirror/state'
import { markdown } from '@codemirror/lang-markdown'
import { GFM } from '@lezer/markdown'
import { buildWidgetDecorations, stripLinkTitle } from './widget-decorations'
import { shouldEmbedWebUrl } from '../../hooks/useWebEmbed'

const webEmbed = vi.hoisted(() => ({ enabled: false }))
vi.mock('../../state/vaultSettingsStore', () => ({
  getVaultSettings: () => ({ webEmbedEnabled: webEmbed.enabled }),
  updateVaultSettings: vi.fn(),
  useVaultSetting: vi.fn(),
}))

interface TestWidget {
  toDOM: (view?: unknown) => HTMLElement
  eq: (other: TestWidget) => boolean
  destroy: () => void
}

function widgetFor(doc: string): TestWidget | null {
  const state = EditorState.create({ doc, extensions: [markdown({ extensions: GFM })] })
  const result = buildWidgetDecorations(state, { vaultId: 'v1' })
  const deco = result.decorations.find((r) => {
    const spec = r.value.spec as { widget?: { toDOM?: () => HTMLElement } }
    return typeof spec.widget?.toDOM === 'function'
  })
  return deco ? (deco.value.spec as { widget: TestWidget }).widget : null
}

const mounted: TestWidget[] = []
function mount(doc: string): { widget: TestWidget; el: HTMLElement } | null {
  const widget = widgetFor(doc)
  if (!widget) return null
  mounted.push(widget)
  return { widget, el: widget.toDOM() }
}

afterEach(() => {
  // Unmount every nested React root a test created.
  while (mounted.length > 0) mounted.pop()?.destroy()
})

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

describe('stripLinkTitle', () => {
  it('removes a trailing title and keeps everything else', () => {
    expect(stripLinkTitle('https://example.org "Titel"')).toBe('https://example.org')
    expect(stripLinkTitle("https://example.org 'Titel'")).toBe('https://example.org')
    expect(stripLinkTitle('https://example.org')).toBe('https://example.org')
    expect(stripLinkTitle('Bilder/mein Foto.png')).toBe('Bilder/mein Foto.png')
  })
})

describe('Live Preview ![](url)', () => {
  beforeEach(() => {
    webEmbed.enabled = false
  })

  it('renders an external URL as a plain image while the opt-in is off', () => {
    const m = mount('![alt](https://example.org/page)')
    expect(m?.el.tagName).toBe('IMG')
    expect(m?.el.classList.contains('cm-lp-image')).toBe(true)
  })

  it('mounts the sandboxed frame when the opt-in is on', async () => {
    webEmbed.enabled = true
    const m = mount('![alt](https://example.org/page)')
    expect(m?.el.classList.contains('cm-lp-web-embed')).toBe(true)
    await waitFor(() => expect(m?.el.querySelector('iframe')).not.toBeNull())
    const frame = m?.el.querySelector('iframe')
    expect(frame?.getAttribute('src')).toBe('https://example.org/page')
    expect(frame?.getAttribute('sandbox')).not.toContain('allow-same-origin')
    expect(frame?.getAttribute('referrerpolicy')).toBe('no-referrer')
  })

  it('embeds the URL without a trailing link title', async () => {
    webEmbed.enabled = true
    const m = mount('![alt](https://example.org/page "Mein Titel")')
    await waitFor(() => expect(m?.el.querySelector('iframe')).not.toBeNull())
    expect(m?.el.querySelector('iframe')?.getAttribute('src')).toBe('https://example.org/page')
  })

  it('keeps vault-relative images as images even with the opt-in on', () => {
    webEmbed.enabled = true
    expect(mount('![alt](Bilder/foto.png)')?.el.tagName).toBe('IMG')
  })

  it('treats the same URL as equal and another as different', () => {
    webEmbed.enabled = true
    const a = widgetFor('![](https://example.org/a)')
    const a2 = widgetFor('![x](https://example.org/a)')
    const b = widgetFor('![](https://example.org/b)')
    expect(a?.eq(a2 as TestWidget)).toBe(true)
    expect(a?.eq(b as TestWidget)).toBe(false)
  })

  it('does not leak a React root when its DOM is built twice, and destroy is safe to repeat', async () => {
    webEmbed.enabled = true
    const m = mount('![](https://example.org/a)')!
    const second = m.widget.toDOM()
    await waitFor(() => expect(second.querySelector('iframe')).not.toBeNull())
    expect(() => { m.widget.destroy(); m.widget.destroy() }).not.toThrow()
  })
})
