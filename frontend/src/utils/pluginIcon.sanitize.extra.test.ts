import { describe, it, expect } from 'vitest'
import { sizeCustomIconSvg } from './pluginIcon'
import { sanitizeSvg } from '../plugins/compat/sanitize-rendered-html'

const wrap = (inner: string) => `<svg viewBox="0 0 24 24">${inner}</svg>`

describe('plugin icon SVG sanitizing (review follow-ups)', () => {
  it.each([
    ['css escape', wrap('<path d="M0 0" style="fill:\\75rl(http://e/x)"/>')],
    ['css comment', wrap('<path d="M0 0" style="fill:ur/**/l(http://e)"/>')],
    ['svg root style', '<svg viewBox="0 0 1 1" style="background:url(http://e)"><path d="M0 0"/></svg>'],
  ])('drops style attributes: %s', (_n, input) => {
    const out = sizeCustomIconSvg(input, 16)
    expect(out).not.toMatch(/http:\/\/e|\\75|ur\/\*/)
    // only the sizing style we add ourselves survives
    expect(out.match(/style="/g)?.length ?? 0).toBe(1)
    expect(out).toContain('style="width:16px;height:16px;"')
  })

  it('sizing still works and replaces authored width/height', () => {
    const out = sizeCustomIconSvg('<svg width="999" height="999" viewBox="0 0 24 24"><path d="M1 1"/></svg>', 20)
    expect(out).toContain('width="20"')
    expect(out).not.toContain('999')
  })

  it('removes external url() paint references but keeps url(#id)', () => {
    const out = sanitizeSvg(
      wrap('<defs><linearGradient id="g"/></defs><path fill="url(http://e/x)" filter="url(\'//e/f\')" d="M0 0"/><path fill="url(#g)" d="M1 1"/>'),
    )
    expect(out).not.toMatch(/http:|\/\/e/)
    expect(out).toContain('fill="url(#g)"')
  })

  it('accepts uppercase tag, XML prolog, DOCTYPE and comments', () => {
    const out = sizeCustomIconSvg('<?xml version="1.0"?><!DOCTYPE svg><!-- c --><SVG viewBox="0 0 24 24"><path d="M1 1" onclick="x()"/></SVG>', 16)
    expect(out).toContain('viewBox="0 0 24 24"')
    expect(out).toContain('<path')
    expect(out).not.toMatch(/onclick|DOCTYPE|<!--|\?xml/i)
  })

  it('known limitation: <style> blocks are dropped (colours via classes are lost)', () => {
    const out = sanitizeSvg(wrap('<style>.cls-1{fill:red}</style><path class="cls-1" d="M0 0"/>'))
    expect(out).not.toMatch(/<style|fill:red/)
    expect(out).toContain('class="cls-1"')
  })

  it('returns the same string for repeated calls (cache) and distinguishes sizes', () => {
    const svg = wrap('<path d="M1 1"/>')
    expect(sizeCustomIconSvg(svg, 16)).toBe(sizeCustomIconSvg(svg, 16))
    expect(sizeCustomIconSvg(svg, 14)).not.toBe(sizeCustomIconSvg(svg, 16))
  })
})
