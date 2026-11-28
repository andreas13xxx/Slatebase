import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  PENDING_PROTOCOL_ACTION_KEY,
  PENDING_PROTOCOL_ACTION_TTL_MS,
  captureProtocolActionFromLocation,
  consumeInvalidProtocolAction,
  consumePendingProtocolAction,
  parseProtocolAction,
  storePendingProtocolAction,
} from './protocolAction'

afterEach(() => {
  window.sessionStorage.clear()
  consumeInvalidProtocolAction()
})

describe('parseProtocolAction', () => {
  it('reads the action and every other parameter', () => {
    expect(parseProtocolAction('?action=auth&code=abc&state=x%20y')).toEqual({
      action: 'auth',
      params: { code: 'abc', state: 'x y' },
    })
  })

  it.each([
    ['no action', '?code=abc'],
    ['empty action', '?action='],
    ['action with a slash', '?action=a/b'],
    ['action that is too long', `?action=${'a'.repeat(65)}`],
    ['a prototype key', '?action=x&__proto__=1'],
    ['an oversized value', `?action=x&v=${'a'.repeat(4097)}`],
    ['too many parameters', `?action=x&${Array.from({ length: 33 }, (_, i) => `k${i}=1`).join('&')}`],
  ])('refuses %s', (_label, search) => {
    expect(parseProtocolAction(search)).toBeNull()
  })
})

describe('pending protocol action', () => {
  const request = { action: 'auth', params: { code: 'abc' } }

  it('is consumed exactly once', () => {
    storePendingProtocolAction(request)
    expect(consumePendingProtocolAction()).toEqual(request)
    expect(consumePendingProtocolAction()).toBeNull()
  })

  it('expires', () => {
    storePendingProtocolAction(request, 1_000)
    expect(consumePendingProtocolAction(1_000 + PENDING_PROTOCOL_ACTION_TTL_MS + 1)).toBeNull()
  })

  it('refuses tampered storage', () => {
    window.sessionStorage.setItem(PENDING_PROTOCOL_ACTION_KEY, JSON.stringify({
      request: { action: '../x', params: {} },
      savedAt: Date.now(),
    }))
    expect(consumePendingProtocolAction()).toBeNull()
    window.sessionStorage.setItem(PENDING_PROTOCOL_ACTION_KEY, JSON.stringify({
      request: { action: 'ok', params: { a: 1 } },
      savedAt: Date.now(),
    }))
    expect(consumePendingProtocolAction()).toBeNull()
  })
})

describe('captureProtocolActionFromLocation', () => {
  it('stores the request and cleans the address bar', () => {
    const replaceState = vi.fn()
    captureProtocolActionFromLocation({ pathname: '/obsidian', search: '?action=auth&code=abc' }, { replaceState })
    expect(replaceState).toHaveBeenCalledWith(null, '', '/')
    expect(consumePendingProtocolAction()).toEqual({ action: 'auth', params: { code: 'abc' } })
  })

  it('flags an unusable link once', () => {
    captureProtocolActionFromLocation({ pathname: '/obsidian', search: '?nothing=1' }, { replaceState: vi.fn() })
    expect(consumePendingProtocolAction()).toBeNull()
    expect(consumeInvalidProtocolAction()).toBe(true)
    expect(consumeInvalidProtocolAction()).toBe(false)
  })

  it('ignores every other path', () => {
    const replaceState = vi.fn()
    captureProtocolActionFromLocation({ pathname: '/', search: '?action=auth' }, { replaceState })
    expect(replaceState).not.toHaveBeenCalled()
    expect(consumePendingProtocolAction()).toBeNull()
  })
})
