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
    it('calls onSessionExpired callback on 401 response', async () => {
      const onExpired = vi.fn()
      client.setToken('expired-token')
      client.setCsrfToken('csrf')
      client.setOnSessionExpired(onExpired)

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

    it('clears token and csrfToken on 401 response', async () => {
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
