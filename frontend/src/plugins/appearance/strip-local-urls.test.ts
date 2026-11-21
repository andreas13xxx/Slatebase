import { describe, expect, it } from 'vitest'
import { stripLocalFileUrls } from './strip-local-urls'

describe('stripLocalFileUrls', () => {
  it('replaces file urls in url()', () => {
    expect(stripLocalFileUrls('a{background:url(file:///C:/x.png)}')).toBe('a{background:url("about:blank")}')
    expect(stripLocalFileUrls("a{background:url( 'FILE:///x.png' )}")).toBe('a{background:url("about:blank")}')
  })

  it('drops file @import', () => {
    expect(stripLocalFileUrls('@import url("file:///x.css");b{}')).toBe('b{}')
  })

  it('keeps other urls untouched', () => {
    const css = 'a{background:url(/api/x.png)} b{background:url(https://e.org/a.png)}'
    expect(stripLocalFileUrls(css)).toBe(css)
  })
})
