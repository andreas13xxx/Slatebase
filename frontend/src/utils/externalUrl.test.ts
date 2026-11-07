import { describe, it, expect, vi, afterEach } from 'vitest'
import { isHttpUrl, openExternalUrl } from './externalUrl'

describe('externalUrl', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it.each([
    'https://example.com',
    'http://example.com/a?b=c',
    'HTTPS://EXAMPLE.COM',
    '  https://example.com  ',
  ])('opens %j via window.open with noopener,noreferrer', (url) => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
    expect(isHttpUrl(url)).toBe(true)
    expect(openExternalUrl(url)).toBe(true)
    expect(openSpy).toHaveBeenCalledWith(url.trim(), '_blank', 'noopener,noreferrer')
  })

  it.each([
    'javascript:alert(1)',
    'JavaScript:alert(1)',
    '  javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    'ftp://example.com',
    '//example.com',
    'notes/page.md',
    '',
  ])('never calls window.open for %j', (url) => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
    expect(isHttpUrl(url)).toBe(false)
    expect(openExternalUrl(url)).toBe(false)
    expect(openSpy).not.toHaveBeenCalled()
  })
})
