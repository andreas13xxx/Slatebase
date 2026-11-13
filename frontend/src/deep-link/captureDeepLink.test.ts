import { describe, it, expect, vi, beforeEach } from 'vitest'
import { captureDeepLinkFromLocation, consumeInvalidDeepLink } from './captureDeepLink'
import { PENDING_DEEP_LINK_KEY, consumePendingDeepLink } from './pendingDeepLink'

describe('captureDeepLinkFromLocation', () => {
  beforeEach(() => {
    window.sessionStorage.clear()
    consumeInvalidDeepLink()
  })

  it('stores a valid /open link and cleans the address bar', () => {
    const replaceState = vi.fn()
    captureDeepLinkFromLocation({ pathname: '/open', search: '?vault=v1&file=a.md' }, { replaceState })
    expect(replaceState).toHaveBeenCalledWith(null, '', '/')
    expect(consumePendingDeepLink()).toEqual({ vault: 'v1', path: 'a.md', anchor: null })
    expect(consumeInvalidDeepLink()).toBe(false)
  })

  it('cleans the address bar and remembers an unusable link, storing nothing', () => {
    const replaceState = vi.fn()
    captureDeepLinkFromLocation({ pathname: '/open', search: '?vault=v1&file=..%2Fx.md' }, { replaceState })
    expect(replaceState).toHaveBeenCalledWith(null, '', '/')
    expect(window.sessionStorage.getItem(PENDING_DEEP_LINK_KEY)).toBeNull()
    expect(consumeInvalidDeepLink()).toBe(true)
    expect(consumeInvalidDeepLink()).toBe(false)
  })

  it.each(['/', '/s/token', '/reset-password', '/open/extra'])('ignores %s', (pathname) => {
    const replaceState = vi.fn()
    captureDeepLinkFromLocation({ pathname, search: '?vault=v1&file=a.md' }, { replaceState })
    expect(replaceState).not.toHaveBeenCalled()
    expect(window.sessionStorage.getItem(PENDING_DEEP_LINK_KEY)).toBeNull()
  })
})
