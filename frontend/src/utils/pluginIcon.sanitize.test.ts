import { describe, it, expect } from 'vitest'
import { sizeCustomIconSvg } from './pluginIcon'
import { sanitizeSvg } from '../plugins/compat/sanitize-rendered-html'

const wrap = (inner: string) => `<svg viewBox="0 0 24 24">${inner}</svg>`

describe('plugin icon SVG sanitizing', () => {
  it.each([
    ['script', wrap('<script>alert(1)</script><path d="M0 0"/>'), /script/i],
    ['onload', '<svg viewBox="0 0 1 1" onload="alert(1)"><path d="M0 0"/></svg>', /onload/i],
    ['onclick', wrap('<path d="M0 0" onclick="alert(1)"/>'), /onclick/i],
    ['foreignObject', wrap('<foreignObject><img src=x onerror=alert(1)></foreignObject>'), /foreignObject|onerror/i],
    ['xlink javascript', wrap('<a xlink:href="javascript:alert(1)"><path d="M0 0"/></a>'), /javascript/i],
    ['use data', wrap('<use href="data:image/svg+xml,<svg/>"/>'), /data:/i],
    ['image javascript', wrap('<image href="javascript:alert(1)"/>'), /javascript/i],
    ['style url', wrap('<path d="M0 0" style="fill:url(https://evil/x)"/>'), /evil/i],
  ])('strips %s', (_n, input, bad) => {
    expect(sizeCustomIconSvg(input, 16)).not.toMatch(bad)
    expect(sanitizeSvg(input)).not.toMatch(bad)
  })

  it('keeps a normal icon and sizes it', () => {
    const out = sizeCustomIconSvg(
      wrap('<defs><linearGradient id="g"/></defs><g fill="none" stroke="currentColor"><path d="M1 1"/><circle cx="1" cy="1" r="1"/></g><use href="#g"/>'),
      20,
    )
    expect(out).toContain('viewBox="0 0 24 24"')
    expect(out).toContain('width="20"')
    expect(out).toContain('<circle')
    expect(out).toContain('stroke="currentColor"')
    expect(out).toContain('href="#g"')
  })

  it('wraps and sanitizes bare inner markup', () => {
    const out = sizeCustomIconSvg('<path d="M1 1" onclick="x()"/>', 16)
    expect(out).toContain('viewBox="0 0 100 100"')
    expect(out).toContain('<path')
    expect(out).not.toMatch(/onclick/)
    expect(sanitizeSvg('<path d="M1 1"/><script>x</script>')).toBe('<path d="M1 1"></path>')
  })
})
