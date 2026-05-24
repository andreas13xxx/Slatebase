import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { SessionsPage } from './SessionsPage'
import type { IApiClient, SessionInfo } from '../api'

/** Creates a mock API client with overridable methods. */
function createMockApiClient(overrides: Partial<IApiClient> = {}): IApiClient {
  return {
    setToken: vi.fn(),
    getToken: vi.fn().mockReturnValue(null),
    setCsrfToken: vi.fn(),
    getCsrfToken: vi.fn().mockReturnValue(null),
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
    login: vi.fn().mockResolvedValue({ token: 't', csrfToken: 'c', user: {}, expiresAt: '' }),
    logout: vi.fn().mockResolvedValue(undefined),
    getSessions: vi.fn().mockResolvedValue([]),
    invalidateSession: vi.fn().mockResolvedValue(undefined),
    invalidateAllOtherSessions: vi.fn().mockResolvedValue(undefined),
    getProfile: vi.fn(),
    updateProfile: vi.fn(),
    changePassword: vi.fn().mockResolvedValue(undefined),
    deleteSelf: vi.fn(),
    ...overrides,
  } as IApiClient
}

/** Sample sessions for testing. */
const sampleSessions: SessionInfo[] = [
  {
    sessionId: 'session-1',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120',
    ipAddress: '192.168.1.10',
    createdAt: '2025-01-10T08:00:00.000Z',
    lastActivity: '2025-01-10T09:30:00.000Z',
  },
  {
    sessionId: 'session-2',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Safari/605',
    ipAddress: '192.168.1.20',
    createdAt: '2025-01-10T10:00:00.000Z',
    lastActivity: '2025-01-10T11:00:00.000Z',
  },
]

describe('SessionsPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('renders the page title "Aktive Sitzungen"', async () => {
    const apiClient = createMockApiClient()
    render(React.createElement(SessionsPage, { apiClient }))

    expect(screen.getByRole('heading', { name: 'Aktive Sitzungen' })).toBeInTheDocument()
  })

  it('shows loading state initially', () => {
    const apiClient = createMockApiClient({
      getSessions: vi.fn().mockImplementation(() => new Promise(() => { /* never resolves */ })),
    })
    render(React.createElement(SessionsPage, { apiClient }))

    expect(screen.getByText('Laden…')).toBeInTheDocument()
  })

  it('calls apiClient.getSessions on mount', () => {
    const apiClient = createMockApiClient()
    render(React.createElement(SessionsPage, { apiClient }))

    expect(apiClient.getSessions).toHaveBeenCalledTimes(1)
  })

  it('displays sessions with userAgent, lastActivity, and createdAt', async () => {
    const apiClient = createMockApiClient({
      getSessions: vi.fn().mockResolvedValue(sampleSessions),
    })
    render(React.createElement(SessionsPage, { apiClient }))

    await waitFor(() => {
      expect(screen.getByText('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120')).toBeInTheDocument()
      expect(screen.getByText('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Safari/605')).toBeInTheDocument()
    })
  })

  it('highlights the current session (most recently created)', async () => {
    const apiClient = createMockApiClient({
      getSessions: vi.fn().mockResolvedValue(sampleSessions),
    })
    render(React.createElement(SessionsPage, { apiClient }))

    await waitFor(() => {
      expect(screen.getByText('Aktuelle Sitzung')).toBeInTheDocument()
    })

    // session-2 is the most recent, so it should be marked as current
    const currentBadge = screen.getByText('Aktuelle Sitzung')
    const listItem = currentBadge.closest('.sessions-item')
    expect(listItem).toHaveClass('sessions-item--current')
  })

  it('does not show "Beenden" button for the current session', async () => {
    const apiClient = createMockApiClient({
      getSessions: vi.fn().mockResolvedValue(sampleSessions),
    })
    render(React.createElement(SessionsPage, { apiClient }))

    await waitFor(() => {
      expect(screen.getByText('Aktuelle Sitzung')).toBeInTheDocument()
    })

    // Only one "Beenden" button should exist (for the non-current session)
    // The "Alle anderen beenden" button also matches, so we check for session-specific buttons
    const sessionButtons = screen.getAllByRole('button', { name: /Sitzung beenden/ })
    expect(sessionButtons).toHaveLength(1)
  })

  it('calls apiClient.invalidateSession when "Beenden" is clicked', async () => {
    const user = userEvent.setup()
    const apiClient = createMockApiClient({
      getSessions: vi.fn().mockResolvedValue(sampleSessions),
    })
    render(React.createElement(SessionsPage, { apiClient }))

    await waitFor(() => {
      expect(screen.getByText('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120')).toBeInTheDocument()
    })

    const invalidateButton = screen.getByRole('button', { name: /Sitzung beenden/ })
    await user.click(invalidateButton)

    await waitFor(() => {
      expect(apiClient.invalidateSession).toHaveBeenCalledWith('session-1')
    })
  })

  it('refreshes the session list after invalidating a session', async () => {
    const user = userEvent.setup()
    const getSessions = vi.fn()
      .mockResolvedValueOnce(sampleSessions)
      .mockResolvedValueOnce([sampleSessions[1]!])
    const apiClient = createMockApiClient({ getSessions })
    render(React.createElement(SessionsPage, { apiClient }))

    await waitFor(() => {
      expect(screen.getByText('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120')).toBeInTheDocument()
    })

    const invalidateButton = screen.getByRole('button', { name: /Sitzung beenden/ })
    await user.click(invalidateButton)

    await waitFor(() => {
      expect(getSessions).toHaveBeenCalledTimes(2)
    })
  })

  it('shows "Alle anderen beenden" button when multiple sessions exist', async () => {
    const apiClient = createMockApiClient({
      getSessions: vi.fn().mockResolvedValue(sampleSessions),
    })
    render(React.createElement(SessionsPage, { apiClient }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Alle anderen beenden' })).toBeInTheDocument()
    })
  })

  it('does not show "Alle anderen beenden" button with only one session', async () => {
    const apiClient = createMockApiClient({
      getSessions: vi.fn().mockResolvedValue([sampleSessions[0]!]),
    })
    render(React.createElement(SessionsPage, { apiClient }))

    await waitFor(() => {
      expect(screen.getByText(sampleSessions[0]!.userAgent)).toBeInTheDocument()
    })

    expect(screen.queryByRole('button', { name: 'Alle anderen beenden' })).not.toBeInTheDocument()
  })

  it('calls apiClient.invalidateAllOtherSessions when "Alle anderen beenden" is clicked', async () => {
    const user = userEvent.setup()
    const apiClient = createMockApiClient({
      getSessions: vi.fn().mockResolvedValue(sampleSessions),
    })
    render(React.createElement(SessionsPage, { apiClient }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Alle anderen beenden' })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: 'Alle anderen beenden' }))

    await waitFor(() => {
      expect(apiClient.invalidateAllOtherSessions).toHaveBeenCalledTimes(1)
    })
  })

  it('shows error message when getSessions fails', async () => {
    const apiClient = createMockApiClient({
      getSessions: vi.fn().mockRejectedValue({ code: 'INTERNAL_ERROR', message: 'Server-Fehler' }),
    })
    render(React.createElement(SessionsPage, { apiClient }))

    await waitFor(() => {
      expect(screen.getByText('Server-Fehler')).toBeInTheDocument()
    })
  })

  it('shows generic error when getSessions fails without message', async () => {
    const apiClient = createMockApiClient({
      getSessions: vi.fn().mockRejectedValue(null),
    })
    render(React.createElement(SessionsPage, { apiClient }))

    await waitFor(() => {
      expect(screen.getByText('Sitzungen konnten nicht geladen werden.')).toBeInTheDocument()
    })
  })

  it('shows error when invalidateSession fails', async () => {
    const user = userEvent.setup()
    const apiClient = createMockApiClient({
      getSessions: vi.fn().mockResolvedValue(sampleSessions),
      invalidateSession: vi.fn().mockRejectedValue({ code: 'NOT_FOUND', message: 'Sitzung nicht gefunden.' }),
    })
    render(React.createElement(SessionsPage, { apiClient }))

    await waitFor(() => {
      expect(screen.getByText('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120')).toBeInTheDocument()
    })

    const invalidateButton = screen.getByRole('button', { name: /Sitzung beenden/ })
    await user.click(invalidateButton)

    await waitFor(() => {
      expect(screen.getByText('Sitzung nicht gefunden.')).toBeInTheDocument()
    })
  })

  it('disables buttons while an action is pending', async () => {
    const user = userEvent.setup()
    const apiClient = createMockApiClient({
      getSessions: vi.fn().mockResolvedValue(sampleSessions),
      invalidateAllOtherSessions: vi.fn().mockImplementation(() => new Promise(() => { /* never resolves */ })),
    })
    render(React.createElement(SessionsPage, { apiClient }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Alle anderen beenden' })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: 'Alle anderen beenden' }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Alle anderen beenden…' })).toBeDisabled()
    })
  })

  it('shows empty state when no sessions are returned', async () => {
    const apiClient = createMockApiClient({
      getSessions: vi.fn().mockResolvedValue([]),
    })
    render(React.createElement(SessionsPage, { apiClient }))

    await waitFor(() => {
      expect(screen.getByText('Keine aktiven Sitzungen gefunden.')).toBeInTheDocument()
    })
  })
})
