/**
 * Unit tests for the centralized client IP extraction utility.
 */

import { describe, it, expect, vi } from 'vitest'
import { getClientIp } from './client-ip.js'
import type { TrustedProxyConfig } from './client-ip.js'
import type { Context } from 'hono'

// Mock @hono/node-server's getConnInfo
vi.mock('@hono/node-server/conninfo', () => ({
  getConnInfo: vi.fn(),
}))

import { getConnInfo } from '@hono/node-server/conninfo'
const mockGetConnInfo = vi.mocked(getConnInfo)

function createMockContext(headers: Record<string, string> = {}): Context {
  return {
    req: {
      header: (name: string) => {
        // Case-insensitive header lookup
        const lower = name.toLowerCase()
        for (const [key, value] of Object.entries(headers)) {
          if (key.toLowerCase() === lower) return value
        }
        return undefined
      },
    },
  } as unknown as Context
}

describe('getClientIp', () => {
  const noProxies: TrustedProxyConfig = { trustedProxies: [] }

  describe('without trusted proxies', () => {
    it('returns socket remote address when no proxies configured', () => {
      mockGetConnInfo.mockReturnValue({ remote: { address: '192.168.1.100' } } as ReturnType<typeof getConnInfo>)
      const c = createMockContext({ 'X-Forwarded-For': '10.0.0.1' })

      const ip = getClientIp(c, noProxies)

      expect(ip).toBe('192.168.1.100')
    })

    it('ignores X-Forwarded-For when no proxies configured', () => {
      mockGetConnInfo.mockReturnValue({ remote: { address: '172.17.0.1' } } as ReturnType<typeof getConnInfo>)
      const c = createMockContext({ 'X-Forwarded-For': '1.2.3.4, 5.6.7.8' })

      const ip = getClientIp(c, noProxies)

      expect(ip).toBe('172.17.0.1')
    })

    it('returns 0.0.0.0 when getConnInfo throws', () => {
      mockGetConnInfo.mockImplementation(() => { throw new Error('not available') })
      const c = createMockContext()

      const ip = getClientIp(c, noProxies)

      expect(ip).toBe('0.0.0.0')
    })
  })

  describe('with trusted proxies', () => {
    const config: TrustedProxyConfig = { trustedProxies: ['172.17.0.1', '10.0.0.0/8'] }

    it('returns X-Forwarded-For leftmost IP when connection is from trusted proxy', () => {
      mockGetConnInfo.mockReturnValue({ remote: { address: '172.17.0.1' } } as ReturnType<typeof getConnInfo>)
      const c = createMockContext({ 'X-Forwarded-For': '203.0.113.50, 172.17.0.1' })

      const ip = getClientIp(c, config)

      expect(ip).toBe('203.0.113.50')
    })

    it('returns X-Real-IP when X-Forwarded-For is absent and connection is trusted', () => {
      mockGetConnInfo.mockReturnValue({ remote: { address: '172.17.0.1' } } as ReturnType<typeof getConnInfo>)
      const c = createMockContext({ 'X-Real-IP': '198.51.100.23' })

      const ip = getClientIp(c, config)

      expect(ip).toBe('198.51.100.23')
    })

    it('returns socket IP when connection is NOT from trusted proxy', () => {
      mockGetConnInfo.mockReturnValue({ remote: { address: '192.168.1.50' } } as ReturnType<typeof getConnInfo>)
      const c = createMockContext({ 'X-Forwarded-For': '1.2.3.4' })

      const ip = getClientIp(c, config)

      expect(ip).toBe('192.168.1.50')
    })

    it('matches CIDR range for trusted proxy', () => {
      mockGetConnInfo.mockReturnValue({ remote: { address: '10.255.0.1' } } as ReturnType<typeof getConnInfo>)
      const c = createMockContext({ 'X-Forwarded-For': '82.100.50.1' })

      const ip = getClientIp(c, config)

      expect(ip).toBe('82.100.50.1')
    })

    it('returns socket IP when CIDR does not match', () => {
      mockGetConnInfo.mockReturnValue({ remote: { address: '11.0.0.1' } } as ReturnType<typeof getConnInfo>)
      const c = createMockContext({ 'X-Forwarded-For': '82.100.50.1' })

      const ip = getClientIp(c, config)

      expect(ip).toBe('11.0.0.1')
    })
  })

  describe('IPv6 loopback normalization', () => {
    const config: TrustedProxyConfig = { trustedProxies: ['127.0.0.1'] }

    it('treats ::1 as 127.0.0.1 for trusted proxy matching', () => {
      mockGetConnInfo.mockReturnValue({ remote: { address: '::1' } } as ReturnType<typeof getConnInfo>)
      const c = createMockContext({ 'X-Forwarded-For': '203.0.113.1' })

      const ip = getClientIp(c, config)

      expect(ip).toBe('203.0.113.1')
    })
  })

  describe('wildcard proxy', () => {
    const config: TrustedProxyConfig = { trustedProxies: ['*'] }

    it('trusts any connection when wildcard is configured', () => {
      mockGetConnInfo.mockReturnValue({ remote: { address: '99.99.99.99' } } as ReturnType<typeof getConnInfo>)
      const c = createMockContext({ 'X-Forwarded-For': '1.1.1.1' })

      const ip = getClientIp(c, config)

      expect(ip).toBe('1.1.1.1')
    })
  })

  describe('edge cases', () => {
    const config: TrustedProxyConfig = { trustedProxies: ['172.17.0.1'] }

    it('returns socket IP when X-Forwarded-For is empty string', () => {
      mockGetConnInfo.mockReturnValue({ remote: { address: '172.17.0.1' } } as ReturnType<typeof getConnInfo>)
      const c = createMockContext({ 'X-Forwarded-For': '' })

      const ip = getClientIp(c, config)

      expect(ip).toBe('172.17.0.1')
    })

    it('trims whitespace from X-Forwarded-For entries', () => {
      mockGetConnInfo.mockReturnValue({ remote: { address: '172.17.0.1' } } as ReturnType<typeof getConnInfo>)
      const c = createMockContext({ 'X-Forwarded-For': '  203.0.113.50  , 172.17.0.1' })

      const ip = getClientIp(c, config)

      expect(ip).toBe('203.0.113.50')
    })

    it('trims whitespace from X-Real-IP', () => {
      mockGetConnInfo.mockReturnValue({ remote: { address: '172.17.0.1' } } as ReturnType<typeof getConnInfo>)
      const c = createMockContext({ 'X-Real-IP': '  198.51.100.1  ' })

      const ip = getClientIp(c, config)

      expect(ip).toBe('198.51.100.1')
    })
  })
})
