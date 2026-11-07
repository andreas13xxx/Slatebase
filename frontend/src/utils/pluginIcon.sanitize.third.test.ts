import { describe, it, expect } from 'vitest'
import { sizeCustomIconSvg } from './pluginIcon'
import { sanitizeSvg, MAX_ICON_SVG_LENGTH } from '../plugins/compat/sanitize-rendered-html'

const wrap = (inner: string) => `<svg viewBox="0 0 24 24">${inner}</svg>`

describe('url() paint attribute allowlist', () => {
  it.each([
    ['css escape u\\72l', wrap('<path fill="u\\72l(http://e)" d="M0 0"/>')],
    ['css escape \\75rl', wrap('<path fill="\\75rl(http://e)" d="M0 0"/>')],
    ['local plus external', wrap('<path filter="url(#a http://e)" d="M0 0"/>')],
    ['comment', wrap('<path mask="ur/**/l(#a)" d="M0 0"/>')],
    ['marker', wrap('<path marker-end="url(http://e)" d="M0 0"/>')],
  ])('removes %s', (_n, input) => {
    const out = sanitizeSvg(input)
    expect(out).not.toMatch(/http|\\|\/\*/)
  })

  it.each(['url(#a)', 'url( #a )', "url('#a')", 'url("#a")', 'url(#a) red'])('keeps %s', (v) => {
    const el = document.createElement('div')
    el.innerHTML = sanitizeSvg(wrap(`<path fill="${v.replace(/"/g, '&quot;')}" d="M0 0"/>`))
    expect(el.querySelector('path')?.getAttribute('fill')).toBe(v)
  })
})

describe('availability', () => {
  it('refuses oversized input', () => {
    expect(sanitizeSvg(wrap('<g/>'.repeat(MAX_ICON_SVG_LENGTH)))).toBe('')
  })

  it('deeply nested <g> never throws', () => {
    const deep = (n: number) => wrap('<g>'.repeat(n) + '</g>'.repeat(n))
    expect(() => sizeCustomIconSvg(deep(100_000), 16)).not.toThrow()
    expect(sizeCustomIconSvg(deep(100_000), 16)).toBe('')
    // within the cap but deep enough to stress the parser/serializer
    expect(() => sizeCustomIconSvg(deep(10_000), 16)).not.toThrow()
    expect(() => sanitizeSvg(deep(10_000))).not.toThrow()
  })
})
