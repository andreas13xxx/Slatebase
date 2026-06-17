import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { AdminConfigPage } from './AdminConfigPage'
import { FeatureProvider } from '../state/featureContext'
import type { IApiClient } from '../api'

/** Sample server config returned by the API. */
const SAMPLE_CONFIG = {
  port: 3000,
  host: '127.0.0.1',
  allowedOrigins: ['http://localhost:5173'],
  maxFileSize: 5242880,
  logLevel: 'info' as const,
  trash: { retentionDays: 30 },
  versions: { maxPerFile: 20 },
}

/** Creates a mock API client with token/csrf methods. */
function createMockApiClient(overrides: Partial<IApiClient> = {}): IApiClient {
  return {
    setToken: vi.fn(),
    getToken: vi.fn().mockReturnValue('test-token'),
    setCsrfToken: vi.fn(),
    getCsrfToken: vi.fn().mockReturnValue('test-csrf'),
    setOnSessionExpired: vi.fn(),
    fetchVaults: vi.fn().mockResolvedValue([]),
    fetchVaultTree: vi.fn().mockResolvedValue({ name: 'root', type: 'directory', path: '/', children: [] }),
    fetchFileContent: vi.fn().mockResolvedValue({ path: '', name: '', content: '', size: 0, encoding: 'utf-8', isBinary: false, isTruncated: false }),
    createVault: vi.fn().mockResolvedValue({ id: 'new-id', name: 'New Vault' }),
    deleteVault: vi.fn().mockResolvedValue(undefined),
    importFile: vi.fn().mockResolvedValue(undefined),
    importFolder: vi.fn().mockResolvedValue(undefined),
    deleteContent: vi.fn().mockResolvedValue(undefined),
    saveFile: vi.fn().mockResolvedValue({ path: '', name: '', size: 0 }),
    login: vi.fn().mockResolvedValue({ token: '', csrfToken: '', user: {}, expiresAt: '' }),
    logout: vi.fn().mockResolvedValue(undefined),
    getSessions: vi.fn().mockResolvedValue([]),
    invalidateSession: vi.fn().mockResolvedValue(undefined),
    getProfile: vi.fn(),
    updateProfile: vi.fn(),
    changePassword: vi.fn(),
    deleteSelf: vi.fn(),
    ...overrides,
  } as IApiClient
}

/** Renders AdminConfigPage wrapped in required providers. */
function renderAdminConfigPage(apiClient: IApiClient) {
  return render(
    React.createElement(FeatureProvider, null,
      React.createElement(AdminConfigPage, { apiClient })
    )
  )
}

describe('AdminConfigPage', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  /**
   * Helper: sets up fetch mocks accounting for the VersionCheckCard's
   * /api/v1/version call that fires on mount.
   */
  function mockFetchWithVersion(...responses: (Response | Promise<Response>)[]) {
    // Use implementation to route version requests vs config requests
    fetchSpy.mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      if (url.endsWith('/api/v1/version')) {
        return Promise.resolve(new Response(JSON.stringify({ version: '0.1.0' }), { status: 200 }))
      }
      if (url.includes('api.github.com')) {
        return Promise.resolve(new Response(JSON.stringify({ tag_name: 'v0.1.0', html_url: 'https://github.com' }), { status: 200 }))
      }
      const response = responses.shift()
      if (response instanceof Promise) return response
      return response ? Promise.resolve(response) : Promise.resolve(new Response('{}', { status: 200 }))
    })
  }

  it('shows loading state initially', () => {
    // Never-resolving promise for config; version returns immediately
    fetchSpy.mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      if (url.endsWith('/api/v1/version')) {
        return Promise.resolve(new Response(JSON.stringify({ version: '0.1.0' }), { status: 200 }))
      }
      if (url.includes('api.github.com')) {
        return Promise.resolve(new Response(JSON.stringify({ tag_name: 'v0.1.0' }), { status: 200 }))
      }
      return new Promise(() => {}) // never resolves for config
    })
    const apiClient = createMockApiClient()

    renderAdminConfigPage(apiClient)

    expect(screen.getByText('Laden…')).toBeInTheDocument()
  })

  it('displays config fields after successful load', async () => {
    mockFetchWithVersion(new Response(JSON.stringify(SAMPLE_CONFIG), { status: 200 }))
    const apiClient = createMockApiClient()

    renderAdminConfigPage(apiClient)

    await waitFor(() => {
      expect(screen.getByLabelText('Port')).toHaveValue(3000)
    })

    expect(screen.getByLabelText('Host')).toHaveValue('127.0.0.1')
    expect(screen.getByLabelText('Erlaubte Origins')).toHaveValue('http://localhost:5173')
    expect(screen.getByLabelText('Max. Dateigröße (Bytes)')).toHaveValue(5242880)
    expect(screen.getByLabelText('Log-Level')).toHaveValue('info')
  })

  it('shows error message when config load fails', async () => {
    mockFetchWithVersion(new Response(JSON.stringify({ message: 'Forbidden' }), { status: 403 }))
    const apiClient = createMockApiClient()

    renderAdminConfigPage(apiClient)

    await waitFor(() => {
      expect(screen.getByText('Forbidden')).toBeInTheDocument()
    })
  })

  it('sends Authorization and CSRF headers on load', async () => {
    mockFetchWithVersion(new Response(JSON.stringify(SAMPLE_CONFIG), { status: 200 }))
    const apiClient = createMockApiClient()

    renderAdminConfigPage(apiClient)

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith('/api/v1/admin/config', expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          'Authorization': 'Bearer test-token',
          'X-CSRF-Token': 'test-csrf',
        }),
      }))
    })
  })

  it('validates port must be between 1 and 65535', async () => {
    mockFetchWithVersion(new Response(JSON.stringify(SAMPLE_CONFIG), { status: 200 }))
    const apiClient = createMockApiClient()
    const user = userEvent.setup()

    renderAdminConfigPage(apiClient)

    await waitFor(() => {
      expect(screen.getByLabelText('Port')).toBeInTheDocument()
    })

    const portInput = screen.getByLabelText('Port')
    await user.clear(portInput)
    await user.type(portInput, '99999')
    await user.click(screen.getByRole('button', { name: 'Konfiguration speichern' }))

    expect(screen.getByText('Port muss zwischen 1 und 65535 liegen.')).toBeInTheDocument()
  })

  it('validates host must not be empty', async () => {
    mockFetchWithVersion(new Response(JSON.stringify(SAMPLE_CONFIG), { status: 200 }))
    const apiClient = createMockApiClient()
    const user = userEvent.setup()

    renderAdminConfigPage(apiClient)

    await waitFor(() => {
      expect(screen.getByLabelText('Host')).toBeInTheDocument()
    })

    const hostInput = screen.getByLabelText('Host')
    await user.clear(hostInput)
    await user.click(screen.getByRole('button', { name: 'Konfiguration speichern' }))

    expect(screen.getByText('Host darf nicht leer sein.')).toBeInTheDocument()
  })

  it('validates maxFileSize must be positive', async () => {
    mockFetchWithVersion(new Response(JSON.stringify(SAMPLE_CONFIG), { status: 200 }))
    const apiClient = createMockApiClient()
    const user = userEvent.setup()

    renderAdminConfigPage(apiClient)

    await waitFor(() => {
      expect(screen.getByLabelText('Max. Dateigröße (Bytes)')).toBeInTheDocument()
    })

    const maxFileSizeInput = screen.getByLabelText('Max. Dateigröße (Bytes)')
    await user.clear(maxFileSizeInput)
    await user.type(maxFileSizeInput, '0')
    await user.click(screen.getByRole('button', { name: 'Konfiguration speichern' }))

    expect(screen.getByText('Muss eine positive Ganzzahl sein.')).toBeInTheDocument()
  })

  it('submits valid config via PUT', async () => {
    mockFetchWithVersion(
      new Response(JSON.stringify(SAMPLE_CONFIG), { status: 200 }),
      new Response(JSON.stringify({ message: 'OK', config: SAMPLE_CONFIG }), { status: 200 })
    )
    const apiClient = createMockApiClient()
    const user = userEvent.setup()

    renderAdminConfigPage(apiClient)

    await waitFor(() => {
      expect(screen.getByLabelText('Port')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: 'Konfiguration speichern' }))

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith('/api/v1/admin/config', expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({
          port: 3000,
          host: '127.0.0.1',
          logLevel: 'info',
          maxFileSize: 5242880,
          allowedOrigins: ['http://localhost:5173'],
          trash: { retentionDays: 30 },
          versions: { maxPerFile: 20 },
        }),
      }))
    })
  })

  it('shows success message after saving', async () => {
    mockFetchWithVersion(
      new Response(JSON.stringify(SAMPLE_CONFIG), { status: 200 }),
      new Response(JSON.stringify({ message: 'OK' }), { status: 200 })
    )
    const apiClient = createMockApiClient()
    const user = userEvent.setup()

    renderAdminConfigPage(apiClient)

    await waitFor(() => {
      expect(screen.getByLabelText('Port')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: 'Konfiguration speichern' }))

    await waitFor(() => {
      expect(screen.getByText('Konfiguration gespeichert. Neustart erforderlich.')).toBeInTheDocument()
    })
  })

  it('shows error message when save fails', async () => {
    mockFetchWithVersion(
      new Response(JSON.stringify(SAMPLE_CONFIG), { status: 200 }),
      new Response(JSON.stringify({ message: 'Validation failed' }), { status: 400 })
    )
    const apiClient = createMockApiClient()
    const user = userEvent.setup()

    renderAdminConfigPage(apiClient)

    await waitFor(() => {
      expect(screen.getByLabelText('Port')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: 'Konfiguration speichern' }))

    await waitFor(() => {
      expect(screen.getByText('Validation failed')).toBeInTheDocument()
    })
  })

  it('shows restart button', async () => {
    mockFetchWithVersion(new Response(JSON.stringify(SAMPLE_CONFIG), { status: 200 }))
    const apiClient = createMockApiClient()

    renderAdminConfigPage(apiClient)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Server neustarten' })).toBeInTheDocument()
    })
  })

  it('shows confirmation dialog before restart', async () => {
    mockFetchWithVersion(new Response(JSON.stringify(SAMPLE_CONFIG), { status: 200 }))
    const apiClient = createMockApiClient()
    const user = userEvent.setup()

    renderAdminConfigPage(apiClient)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Server neustarten' })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: 'Server neustarten' }))

    // ConfirmModal should be visible
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    expect(screen.getByText('Server wirklich neustarten? Alle aktiven Verbindungen werden unterbrochen.')).toBeInTheDocument()

    // Cancel — should not have made a POST to restart
    await user.click(screen.getByRole('button', { name: 'Abbrechen' }))
    // Only config GET + version-related calls, no restart POST
    expect(fetchSpy).not.toHaveBeenCalledWith('/api/v1/admin/restart', expect.anything())
  })

  it('sends POST /api/v1/admin/restart when confirmed', async () => {
    mockFetchWithVersion(
      new Response(JSON.stringify(SAMPLE_CONFIG), { status: 200 }),
      new Response(JSON.stringify({ message: 'Restart initiated' }), { status: 202 })
    )
    const apiClient = createMockApiClient()
    const user = userEvent.setup()

    renderAdminConfigPage(apiClient)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Server neustarten' })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: 'Server neustarten' }))

    // Confirm in the modal
    const confirmBtns = screen.getAllByRole('button', { name: 'Server neustarten' })
    const modalConfirmBtn = confirmBtns[confirmBtns.length - 1]!
    await user.click(modalConfirmBtn)

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith('/api/v1/admin/restart', expect.objectContaining({
        method: 'POST',
      }))
    })
  })

  it('shows restart success message', async () => {
    mockFetchWithVersion(
      new Response(JSON.stringify(SAMPLE_CONFIG), { status: 200 }),
      new Response(JSON.stringify({ message: 'Restart initiated' }), { status: 202 })
    )
    const apiClient = createMockApiClient()
    const user = userEvent.setup()

    renderAdminConfigPage(apiClient)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Server neustarten' })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: 'Server neustarten' }))

    // Confirm in the modal
    const confirmBtns = screen.getAllByRole('button', { name: 'Server neustarten' })
    const modalConfirmBtn = confirmBtns[confirmBtns.length - 1]!
    await user.click(modalConfirmBtn)

    await waitFor(() => {
      expect(screen.getByText('Server wird neu gestartet…')).toBeInTheDocument()
    })
  })
})
