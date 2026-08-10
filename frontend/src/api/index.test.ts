import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ApiClient } from './index'

describe('ApiClient', () => {
  let client: ApiClient
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    client = new ApiClient()
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('token management', () => {
    it('stores and retrieves auth token', () => {
      expect(client.getToken()).toBeNull()
      client.setToken('my-token')
      expect(client.getToken()).toBe('my-token')
    })

    it('stores and retrieves CSRF token', () => {
      expect(client.getCsrfToken()).toBeNull()
      client.setCsrfToken('csrf-123')
      expect(client.getCsrfToken()).toBe('csrf-123')
    })

    it('clears token when set to null', () => {
      client.setToken('my-token')
      client.setToken(null)
      expect(client.getToken()).toBeNull()
    })

    it('clears CSRF token when set to null', () => {
      client.setCsrfToken('csrf-123')
      client.setCsrfToken(null)
      expect(client.getCsrfToken()).toBeNull()
    })
  })

  describe('Authorization header', () => {
    it('includes Bearer token on GET requests when token is set', async () => {
      client.setToken('session-token-abc')
      fetchMock.mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }))

      await client.fetchVaults()

      expect(fetchMock).toHaveBeenCalledWith('/api/v1/vaults', expect.objectContaining({
        headers: expect.objectContaining({
          'Authorization': 'Bearer session-token-abc',
        }),
      }))
    })

    it('does not include Authorization header when no token is set', async () => {
      fetchMock.mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }))

      await client.fetchVaults()

      const headers = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>
      expect(headers['Authorization']).toBeUndefined()
    })

    it('includes Bearer token on POST requests', async () => {
      client.setToken('my-token')
      client.setCsrfToken('csrf-token')
      fetchMock.mockResolvedValue(new Response(JSON.stringify({ id: 'v1', name: 'Test' }), { status: 201 }))

      await client.createVault('Test')

      expect(fetchMock).toHaveBeenCalledWith('/api/v1/vaults', expect.objectContaining({
        headers: expect.objectContaining({
          'Authorization': 'Bearer my-token',
        }),
      }))
    })
  })

  describe('CSRF token header', () => {
    it('includes X-CSRF-Token on POST requests', async () => {
      client.setToken('token')
      client.setCsrfToken('csrf-value')
      fetchMock.mockResolvedValue(new Response(JSON.stringify({ id: 'v1', name: 'Test' }), { status: 201 }))

      await client.createVault('Test')

      expect(fetchMock).toHaveBeenCalledWith('/api/v1/vaults', expect.objectContaining({
        headers: expect.objectContaining({
          'X-CSRF-Token': 'csrf-value',
        }),
      }))
    })

    it('includes X-CSRF-Token on PUT requests', async () => {
      client.setToken('token')
      client.setCsrfToken('csrf-value')
      fetchMock.mockResolvedValue(new Response(JSON.stringify({ path: 'a.md', name: 'a.md', size: 5 }), { status: 200 }))

      await client.saveFile('vault-1', 'a.md', 'hello')

      expect(fetchMock).toHaveBeenCalledWith('/api/v1/vaults/vault-1/files', expect.objectContaining({
        headers: expect.objectContaining({
          'X-CSRF-Token': 'csrf-value',
        }),
      }))
    })

    it('includes X-CSRF-Token on DELETE requests', async () => {
      client.setToken('token')
      client.setCsrfToken('csrf-value')
      fetchMock.mockResolvedValue(new Response(null, { status: 204 }))

      await client.deleteVault('vault-1')

      expect(fetchMock).toHaveBeenCalledWith('/api/v1/vaults/vault-1', expect.objectContaining({
        headers: expect.objectContaining({
          'X-CSRF-Token': 'csrf-value',
        }),
      }))
    })

    it('does not include X-CSRF-Token on GET requests', async () => {
      client.setToken('token')
      client.setCsrfToken('csrf-value')
      fetchMock.mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }))

      await client.fetchVaults()

      const headers = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>
      expect(headers['X-CSRF-Token']).toBeUndefined()
    })

    it('does not include X-CSRF-Token when csrfToken is null', async () => {
      client.setToken('token')
      fetchMock.mockResolvedValue(new Response(null, { status: 204 }))

      await client.deleteVault('vault-1')

      const headers = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>
      expect(headers['X-CSRF-Token']).toBeUndefined()
    })
  })

  describe('401 response interceptor', () => {
    it('calls onSessionExpired when the server confirms the session is dead', async () => {
      const onExpired = vi.fn()
      client.setToken('expired-token')
      client.setCsrfToken('csrf')
      client.setOnSessionExpired(onExpired)

      // Every fetch (original request + the confirming probe) sees 401.
      fetchMock.mockResolvedValue(new Response(
        JSON.stringify({ code: 'SESSION_EXPIRED', message: 'Session expired', timestamp: '2025-01-01T00:00:00Z' }),
        { status: 401 },
      ))

      await expect(client.fetchVaults()).rejects.toEqual({
        code: 'SESSION_EXPIRED',
        message: 'Session expired',
      })

      expect(onExpired).toHaveBeenCalledOnce()
    })

    it('clears token and csrfToken once the probe confirms the session is dead', async () => {
      client.setToken('my-token')
      client.setCsrfToken('my-csrf')
      client.setOnSessionExpired(vi.fn())

      fetchMock.mockResolvedValue(new Response(
        JSON.stringify({ code: 'SESSION_EXPIRED', message: 'Expired' }),
        { status: 401 },
      ))

      await expect(client.fetchVaults()).rejects.toBeDefined()

      expect(client.getToken()).toBeNull()
      expect(client.getCsrfToken()).toBeNull()
    })

    it('does not call onSessionExpired when callback is null', async () => {
      client.setToken('token')
      client.setOnSessionExpired(null)

      fetchMock.mockResolvedValue(new Response(
        JSON.stringify({ code: 'SESSION_EXPIRED', message: 'Expired' }),
        { status: 401 },
      ))

      await expect(client.fetchVaults()).rejects.toBeDefined()
      // No error thrown from missing callback
    })

    it('does not call onSessionExpired on other error statuses', async () => {
      const onExpired = vi.fn()
      client.setToken('token')
      client.setOnSessionExpired(onExpired)

      fetchMock.mockResolvedValue(new Response(
        JSON.stringify({ code: 'FORBIDDEN', message: 'Access denied' }),
        { status: 403 },
      ))

      await expect(client.fetchVaults()).rejects.toBeDefined()
      expect(onExpired).not.toHaveBeenCalled()
    })

    it('keeps the session when the confirming probe cannot reach the server', async () => {
      // This is the actual bug this rewrite fixes: a 401 that turns out to be a
      // network hiccup (dropped connection, backend mid-restart after a plugin
      // reload) must NOT be treated as proof the session is dead.
      const onExpired = vi.fn()
      client.setToken('my-token')
      client.setCsrfToken('my-csrf')
      client.setOnSessionExpired(onExpired)

      fetchMock
        .mockResolvedValueOnce(new Response(
          JSON.stringify({ code: 'SESSION_EXPIRED', message: 'Expired' }),
          { status: 401 },
        ))
        .mockRejectedValueOnce(new Error('Network error'))

      await expect(client.fetchVaults()).rejects.toEqual({
        code: 'SESSION_EXPIRED',
        message: 'Expired',
      })

      expect(onExpired).not.toHaveBeenCalled()
      expect(client.getToken()).toBe('my-token')
      expect(client.getCsrfToken()).toBe('my-csrf')
    })

    it('keeps the session when the confirming probe gets a 5xx', async () => {
      const onExpired = vi.fn()
      client.setToken('my-token')
      client.setCsrfToken('my-csrf')
      client.setOnSessionExpired(onExpired)

      fetchMock
        .mockResolvedValueOnce(new Response(
          JSON.stringify({ code: 'SESSION_EXPIRED', message: 'Expired' }),
          { status: 401 },
        ))
        .mockResolvedValueOnce(new Response('Internal Server Error', { status: 500 }))

      await expect(client.fetchVaults()).rejects.toEqual({
        code: 'SESSION_EXPIRED',
        message: 'Expired',
      })

      expect(onExpired).not.toHaveBeenCalled()
      expect(client.getToken()).toBe('my-token')
      expect(client.getCsrfToken()).toBe('my-csrf')
    })

    it('shares one probe across concurrent 401s instead of probing per request', async () => {
      const onExpired = vi.fn()
      client.setToken('my-token')
      client.setCsrfToken('my-csrf')
      client.setOnSessionExpired(onExpired)

      // Two requests fail with 401 back to back; only one confirming probe
      // should go out. Without the shared in-flight probe, each 401 would
      // fire its own /auth/sessions call.
      fetchMock.mockResolvedValue(new Response(
        JSON.stringify({ code: 'SESSION_EXPIRED', message: 'Expired' }),
        { status: 401 },
      ))

      await Promise.all([
        client.fetchVaults().catch(() => {}),
        client.fetchAllVaults().catch(() => {}),
      ])

      // 2 original requests + exactly 1 shared probe = 3 total fetch calls.
      expect(fetchMock).toHaveBeenCalledTimes(3)
      expect(onExpired).toHaveBeenCalledOnce()
    })
  })

  describe('403 CSRF_INVALID recovery', () => {
    it('probes the session on 403 CSRF_INVALID and triggers onSessionExpired if session is dead', async () => {
      const onExpired = vi.fn()
      client.setToken('my-token')
      client.setCsrfToken('old-csrf')
      client.setOnSessionExpired(onExpired)

      // First call: the actual request returns 403 CSRF_INVALID
      // Second call: probeSession GET /auth/sessions returns 401 (session dead)
      fetchMock
        .mockResolvedValueOnce(new Response(
          JSON.stringify({ code: 'CSRF_INVALID', message: 'CSRF token invalid' }),
          { status: 403 },
        ))
        .mockResolvedValueOnce(new Response(
          JSON.stringify({ code: 'SESSION_EXPIRED', message: 'Expired' }),
          { status: 401 },
        ))

      await expect(client.fetchVaults()).rejects.toEqual({
        code: 'CSRF_INVALID',
        message: 'CSRF token invalid',
      })

      expect(onExpired).toHaveBeenCalledOnce()
      expect(client.getToken()).toBeNull()
      expect(client.getCsrfToken()).toBeNull()
      // Verify the probe was called
      expect(fetchMock).toHaveBeenCalledTimes(2)
      expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/v1/auth/sessions')
    })

    it('does NOT call onSessionExpired on 403 CSRF_INVALID if session is alive', async () => {
      const onExpired = vi.fn()
      client.setToken('my-token')
      client.setCsrfToken('old-csrf')
      client.setOnSessionExpired(onExpired)

      // First call: 403 CSRF_INVALID
      // Second call: probeSession returns 200 (session alive)
      fetchMock
        .mockResolvedValueOnce(new Response(
          JSON.stringify({ code: 'CSRF_INVALID', message: 'CSRF token invalid' }),
          { status: 403 },
        ))
        .mockResolvedValueOnce(new Response(
          JSON.stringify([]),
          { status: 200 },
        ))

      await expect(client.fetchVaults()).rejects.toEqual({
        code: 'CSRF_INVALID',
        message: 'CSRF token invalid',
      })

      // Session is alive — should NOT trigger logout
      expect(onExpired).not.toHaveBeenCalled()
      // Tokens should NOT be cleared (session is still valid)
      expect(client.getToken()).toBe('my-token')
      expect(client.getCsrfToken()).toBe('old-csrf')
    })

    it('re-throws CSRF_INVALID error regardless of session liveness', async () => {
      client.setToken('my-token')
      client.setCsrfToken('csrf')
      client.setOnSessionExpired(vi.fn())

      // Session alive case: still throws
      fetchMock
        .mockResolvedValueOnce(new Response(
          JSON.stringify({ code: 'CSRF_INVALID', message: 'Token mismatch' }),
          { status: 403 },
        ))
        .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))

      await expect(client.fetchVaults()).rejects.toEqual({
        code: 'CSRF_INVALID',
        message: 'Token mismatch',
      })
    })

    it('handles non-CSRF 403 responses normally without probing the session', async () => {
      const onExpired = vi.fn()
      client.setToken('token')
      client.setCsrfToken('csrf')
      client.setOnSessionExpired(onExpired)

      fetchMock.mockResolvedValue(new Response(
        JSON.stringify({ code: 'ACCESS_DENIED', message: 'Not allowed' }),
        { status: 403 },
      ))

      await expect(client.fetchVaults()).rejects.toEqual({
        code: 'ACCESS_DENIED',
        message: 'Not allowed',
      })

      // Only the original request should have been made (no session check)
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(onExpired).not.toHaveBeenCalled()
    })

    it('handles 403 with unparseable body without probing the session', async () => {
      client.setToken('token')
      client.setCsrfToken('csrf')
      client.setOnSessionExpired(vi.fn())

      fetchMock.mockResolvedValue(new Response('not json', { status: 403 }))

      await expect(client.fetchVaults()).rejects.toEqual({
        code: 'INTERNAL_ERROR',
        message: 'Request failed with status 403',
      })

      // Only the original request (no session check since body could not be parsed)
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('keeps the session when the probe fails with a network error', async () => {
      // This inverts the old expectation on purpose: a probe that cannot reach
      // the server proves nothing, so the session must survive a CSRF blip
      // that coincides with a dropped connection.
      const onExpired = vi.fn()
      client.setToken('my-token')
      client.setCsrfToken('old-csrf')
      client.setOnSessionExpired(onExpired)

      fetchMock
        .mockResolvedValueOnce(new Response(
          JSON.stringify({ code: 'CSRF_INVALID', message: 'CSRF token invalid' }),
          { status: 403 },
        ))
        .mockRejectedValueOnce(new Error('Network error'))

      await expect(client.fetchVaults()).rejects.toEqual({
        code: 'CSRF_INVALID',
        message: 'CSRF token invalid',
      })

      expect(onExpired).not.toHaveBeenCalled()
      expect(client.getToken()).toBe('my-token')
      expect(client.getCsrfToken()).toBe('old-csrf')
    })
  })

  describe('probeSession', () => {
    it('returns "alive" on a 2xx response', async () => {
      fetchMock.mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }))
      await expect(client.probeSession()).resolves.toBe('alive')
    })

    it('returns "dead" on a 401 response', async () => {
      fetchMock.mockResolvedValue(new Response(
        JSON.stringify({ code: 'SESSION_EXPIRED', message: 'Expired' }),
        { status: 401 },
      ))
      await expect(client.probeSession()).resolves.toBe('dead')
    })

    it('returns "unknown" on a non-401 error status', async () => {
      fetchMock.mockResolvedValue(new Response('Bad Gateway', { status: 502 }))
      await expect(client.probeSession()).resolves.toBe('unknown')
    })

    it('returns "unknown" when the request itself fails', async () => {
      fetchMock.mockRejectedValue(new Error('Network error'))
      await expect(client.probeSession()).resolves.toBe('unknown')
    })
  })

  describe('login', () => {
    it('sends POST to /api/v1/auth/login without Authorization header', async () => {
      client.setToken('existing-token')
      const loginResponse = {
        token: 'new-token',
        csrfToken: 'new-csrf',
        user: { userId: 'u1', username: 'admin', displayName: 'Admin', email: '', role: 'admin', preferredLanguage: 'de', colorScheme: 'system', suspended: false, mustChangePassword: false, createdAt: '2025-01-01' },
        expiresAt: '2025-01-02T00:00:00Z',
      }
      fetchMock.mockResolvedValue(new Response(JSON.stringify(loginResponse), { status: 200 }))

      const result = await client.login('admin', 'password123')

      expect(result).toEqual(loginResponse)
      // Login should NOT include Authorization header (no token yet for login)
      const headers = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>
      expect(headers['Authorization']).toBeUndefined()
      expect(fetchMock).toHaveBeenCalledWith('/api/v1/auth/login', expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ username: 'admin', password: 'password123' }),
      }))
    })

    it('throws AppError on login failure', async () => {
      fetchMock.mockResolvedValue(new Response(
        JSON.stringify({ code: 'INVALID_CREDENTIALS', message: 'Invalid credentials' }),
        { status: 401 },
      ))

      await expect(client.login('admin', 'wrong')).rejects.toEqual({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid credentials',
      })
    })
  })

  describe('logout', () => {
    it('sends POST to /api/v1/auth/logout with auth headers', async () => {
      client.setToken('my-token')
      client.setCsrfToken('my-csrf')
      fetchMock.mockResolvedValue(new Response(null, { status: 204 }))

      await client.logout()

      expect(fetchMock).toHaveBeenCalledWith('/api/v1/auth/logout', expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Authorization': 'Bearer my-token',
          'X-CSRF-Token': 'my-csrf',
        }),
      }))
    })
  })

  describe('getSessions', () => {
    it('sends GET to /api/v1/auth/sessions', async () => {
      client.setToken('token')
      const sessions = [{ sessionId: 's1', userAgent: 'Chrome', ipAddress: '127.0.0.1', createdAt: '2025-01-01', lastActivity: '2025-01-01' }]
      fetchMock.mockResolvedValue(new Response(JSON.stringify(sessions), { status: 200 }))

      const result = await client.getSessions()

      expect(result).toEqual(sessions)
      expect(fetchMock).toHaveBeenCalledWith('/api/v1/auth/sessions', expect.objectContaining({
        method: 'GET',
      }))
    })
  })

  describe('invalidateSession', () => {
    it('sends DELETE to /api/v1/auth/sessions/:sessionId', async () => {
      client.setToken('token')
      client.setCsrfToken('csrf')
      fetchMock.mockResolvedValue(new Response(null, { status: 204 }))

      await client.invalidateSession('session-123')

      expect(fetchMock).toHaveBeenCalledWith('/api/v1/auth/sessions/session-123', expect.objectContaining({
        method: 'DELETE',
        headers: expect.objectContaining({
          'Authorization': 'Bearer token',
          'X-CSRF-Token': 'csrf',
        }),
      }))
    })
  })

  describe('getProfile', () => {
    it('sends GET to /api/v1/users/me', async () => {
      client.setToken('token')
      const profile = { userId: 'u1', username: 'admin', displayName: 'Admin', email: 'a@b.com', role: 'admin', preferredLanguage: 'de', colorScheme: 'system', suspended: false, mustChangePassword: false, createdAt: '2025-01-01' }
      fetchMock.mockResolvedValue(new Response(JSON.stringify(profile), { status: 200 }))

      const result = await client.getProfile()

      expect(result).toEqual(profile)
      expect(fetchMock).toHaveBeenCalledWith('/api/v1/users/me', expect.objectContaining({
        method: 'GET',
      }))
    })
  })

  describe('updateProfile', () => {
    it('sends PUT to /api/v1/users/me with profile data', async () => {
      client.setToken('token')
      client.setCsrfToken('csrf')
      const updatedProfile = { userId: 'u1', username: 'admin', displayName: 'New Name', email: 'new@email.com', role: 'admin', preferredLanguage: 'en', colorScheme: 'dark', suspended: false, mustChangePassword: false, createdAt: '2025-01-01' }
      fetchMock.mockResolvedValue(new Response(JSON.stringify(updatedProfile), { status: 200 }))

      const result = await client.updateProfile({ displayName: 'New Name', email: 'new@email.com' })

      expect(result).toEqual(updatedProfile)
      expect(fetchMock).toHaveBeenCalledWith('/api/v1/users/me', expect.objectContaining({
        method: 'PUT',
        headers: expect.objectContaining({
          'X-CSRF-Token': 'csrf',
        }),
        body: JSON.stringify({ displayName: 'New Name', email: 'new@email.com' }),
      }))
    })
  })

  describe('changePassword', () => {
    it('sends PUT to /api/v1/users/me/password', async () => {
      client.setToken('token')
      client.setCsrfToken('csrf')
      fetchMock.mockResolvedValue(new Response(null, { status: 204 }))

      await client.changePassword('oldpass', 'newpass123')

      expect(fetchMock).toHaveBeenCalledWith('/api/v1/users/me/password', expect.objectContaining({
        method: 'PUT',
        headers: expect.objectContaining({
          'Authorization': 'Bearer token',
          'X-CSRF-Token': 'csrf',
        }),
        body: JSON.stringify({ currentPassword: 'oldpass', newPassword: 'newpass123' }),
      }))
    })
  })

  describe('deleteSelf', () => {
    it('sends DELETE to /api/v1/users/me with password', async () => {
      client.setToken('token')
      client.setCsrfToken('csrf')
      fetchMock.mockResolvedValue(new Response(null, { status: 204 }))

      await client.deleteSelf('mypassword')

      expect(fetchMock).toHaveBeenCalledWith('/api/v1/users/me', expect.objectContaining({
        method: 'DELETE',
        headers: expect.objectContaining({
          'Authorization': 'Bearer token',
          'X-CSRF-Token': 'csrf',
        }),
        body: JSON.stringify({ password: 'mypassword' }),
      }))
    })
  })

  describe('FormData requests with auth', () => {
    it('includes auth and CSRF headers on file import', async () => {
      client.setToken('token')
      client.setCsrfToken('csrf')
      fetchMock.mockResolvedValue(new Response(null, { status: 204 }))

      const file = new File(['content'], 'test.md', { type: 'text/markdown' })
      await client.importFile('vault-1', file)

      const callHeaders = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>
      expect(callHeaders['Authorization']).toBe('Bearer token')
      expect(callHeaders['X-CSRF-Token']).toBe('csrf')
      // Content-Type should NOT be set (browser sets multipart boundary)
      expect(callHeaders['Content-Type']).toBeUndefined()
    })
  })

  describe('error handling', () => {
    it('throws structured AppError on non-2xx responses', async () => {
      client.setToken('token')
      fetchMock.mockResolvedValue(new Response(
        JSON.stringify({ code: 'VAULT_NOT_FOUND', message: 'Vault not found', timestamp: '2025-01-01T00:00:00Z' }),
        { status: 404 },
      ))

      await expect(client.fetchVaultTree('nonexistent')).rejects.toEqual({
        code: 'VAULT_NOT_FOUND',
        message: 'Vault not found',
      })
    })

    it('throws generic error when response body is not JSON', async () => {
      client.setToken('token')
      fetchMock.mockResolvedValue(new Response('Internal Server Error', { status: 500 }))

      await expect(client.fetchVaults()).rejects.toEqual({
        code: 'INTERNAL_ERROR',
        message: 'Request failed with status 500',
      })
    })
  })
})
