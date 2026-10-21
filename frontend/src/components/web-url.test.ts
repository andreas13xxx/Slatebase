import { describe, it, expect } from 'vitest'
import { parseWebUrl } from './web-url'

describe('parseWebUrl', () => {
  it('accepts https and http URLs', () => {
    expect(parseWebUrl('https://example.com').valid).toBe(true)
    expect(parseWebUrl('http://example.com/path').valid).toBe(true)
  })

  it('derives a display host without a bare trailing slash', () => {
    expect(parseWebUrl('https://example.com/').displayUrl).toBe('example.com')
    expect(parseWebUrl('https://example.com/docs/x').displayUrl).toBe('example.com/docs/x')
  })

  it('rejects non-http(s) schemes (javascript:, data:, file:)', () => {
    expect(parseWebUrl('javascript:alert(1)').valid).toBe(false)
    expect(parseWebUrl('data:text/html,<script>').valid).toBe(false)
    expect(parseWebUrl('file:///etc/passwd').valid).toBe(false)
  })

  it('rejects an unparseable string', () => {
    expect(parseWebUrl('not a url').valid).toBe(false)
    expect(parseWebUrl('').valid).toBe(false)
  })
})
