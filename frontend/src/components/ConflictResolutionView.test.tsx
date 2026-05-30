import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { ConflictResolutionView } from './ConflictResolutionView'
import { SyncContext, type SyncContextValue } from '../state/syncContext'
import { AppContext, type AppContextValue } from '../state/index'
import { initialSyncState } from '../state/syncState'
import type { ConflictEntry } from '../state/syncState'
import type { IApiClient } from '../api'

function createMockApiClient(): IApiClient {
  return {
    fetchVaults: vi.fn(),
    fetchVaultTree: vi.fn(),
    fetchFileContent: vi.fn(),
    createVault: vi.fn(),
    deleteVault: vi.fn(),
    saveFile: vi.fn(),
    importFile: vi.fn(),
    importFolder: vi.fn(),
    deleteContent: vi.fn(),
    renameContent: vi.fn(),
    setToken: vi.fn(),
    setCsrfToken: vi.fn(),
    getToken: vi.fn().mockReturnValue('test-token'),
    setOnSessionExpired: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    getSessions: vi.fn(),
    deleteSession: vi.fn(),
    deleteAllOtherSessions: vi.fn(),
    getProfile: vi.fn(),
    updateProfile: vi.fn(),
    changePassword: vi.fn(),
    deleteAccount: vi.fn(),
    searchUsers: vi.fn(),
    getAdminUsers: vi.fn(),
    createUser: vi.fn(),
    deleteUser: vi.fn(),
    changeUserRole: vi.fn(),
    resetUserPassword: vi.fn(),
    suspendUser: vi.fn(),
    unsuspendUser: vi.fn(),
    getAdminConfig: vi.fn(),
    updateAdminConfig: vi.fn(),
    restartServer: vi.fn(),
    getAuditLog: vi.fn(),
    getVaultShares: vi.fn(),
    createShare: vi.fn(),
    revokeShare: vi.fn(),
    updateSharePermission: vi.fn(),
    transferVault: vi.fn(),
    getAdminVaults: vi.fn(),
    adminDeleteVault: vi.fn(),
    getConversations: vi.fn(),
    createConversation: vi.fn(),
    leaveConversation: vi.fn(),
    getMessages: vi.fn(),
    sendMessage: vi.fn(),
    getGlobalUnreadCount: vi.fn(),
    markConversationRead: vi.fn(),
    getSyncConfig: vi.fn(),
    createSyncConfig: vi.fn(),
    updateSyncConfig: vi.fn(),
    disableSyncConfig: vi.fn(),
    enableSyncConfig: vi.fn(),
    removeSyncConfig: vi.fn(),
    triggerSync: vi.fn(),
    triggerAnalysis: vi.fn(),
    resetSyncCheckpoint: vi.fn().mockResolvedValue(undefined),
    getSyncLog: vi.fn(),
    getSyncConflicts: vi.fn(),
    resolveSyncConflict: vi.fn().mockResolvedValue(undefined),
  } as unknown as IApiClient
}

function renderWithProviders(
  ui: React.ReactElement,
  options?: { apiClient?: IApiClient },
) {
  const mockApiClient = options?.apiClient ?? createMockApiClient()
  const dispatch = vi.fn()

  const syncContextValue: SyncContextValue = {
    state: initialSyncState,
    dispatch,
  }

  const appContextValue: AppContextValue = {
    state: {
      vaults: [],
      selectedVaultId: null,
      directoryTree: null,
      selectedFile: null,
      loading: false,
      error: null,
    },
    dispatch: vi.fn(),
    apiClient: mockApiClient,
  }

  return {
    ...render(
      React.createElement(
        AppContext.Provider,
        { value: appContextValue },
        React.createElement(
          SyncContext.Provider,
          { value: syncContextValue },
          ui,
        ),
      ),
    ),
    dispatch,
    apiClient: mockApiClient,
  }
}

const sampleConflict: ConflictEntry = {
  documentPath: 'notes/meeting.md',
  local: {
    modifiedAt: '2024-06-15T10:30:00.000Z',
    size: 2048,
  },
  remote: {
    revision: '3-abc123',
    modifiedAt: '2024-06-15T09:00:00.000Z',
    size: 1536,
  },
  detectedAt: '2024-06-15T11:00:00.000Z',
}

const sampleConflictRemoteNewer: ConflictEntry = {
  documentPath: 'docs/readme.md',
  local: {
    modifiedAt: '2024-06-14T08:00:00.000Z',
    size: 512,
  },
  remote: {
    revision: '5-def456',
    modifiedAt: '2024-06-15T12:00:00.000Z',
    size: 1024,
  },
  detectedAt: '2024-06-15T13:00:00.000Z',
}

describe('ConflictResolutionView', () => {
  it('renders empty state when no conflicts', () => {
    renderWithProviders(
      React.createElement(ConflictResolutionView, {
        vaultId: 'vault123',
        conflicts: [],
        mode: 'bidirectional',
      }),
    )

    expect(screen.getByText('Keine Konflikte vorhanden')).toBeInTheDocument()
  })

  it('renders conflict cards with document paths', () => {
    renderWithProviders(
      React.createElement(ConflictResolutionView, {
        vaultId: 'vault123',
        conflicts: [sampleConflict, sampleConflictRemoteNewer],
        mode: 'bidirectional',
      }),
    )

    expect(screen.getByText('notes/meeting.md')).toBeInTheDocument()
    expect(screen.getByText('docs/readme.md')).toBeInTheDocument()
    expect(screen.getByText('2 Konflikte')).toBeInTheDocument()
  })

  it('shows recommendation badge for local when local is newer', () => {
    renderWithProviders(
      React.createElement(ConflictResolutionView, {
        vaultId: 'vault123',
        conflicts: [sampleConflict],
        mode: 'bidirectional',
      }),
    )

    // sampleConflict has local newer than remote
    const badges = screen.getAllByText('Empfohlen')
    expect(badges).toHaveLength(1)
    // The badge should be in the "Lokal" section
    const localSection = screen.getByText('Lokal').closest('.conflict-card-section-title')
    expect(localSection).toContainElement(badges[0]!)
  })

  it('shows recommendation badge for remote when remote is newer', () => {
    renderWithProviders(
      React.createElement(ConflictResolutionView, {
        vaultId: 'vault123',
        conflicts: [sampleConflictRemoteNewer],
        mode: 'bidirectional',
      }),
    )

    const badges = screen.getAllByText('Empfohlen')
    expect(badges).toHaveLength(1)
    const remoteSection = screen.getByText('Remote').closest('.conflict-card-section-title')
    expect(remoteSection).toContainElement(badges[0]!)
  })

  it('disables "Lokale Version behalten" button in readonly mode', () => {
    renderWithProviders(
      React.createElement(ConflictResolutionView, {
        vaultId: 'vault123',
        conflicts: [sampleConflict],
        mode: 'readonly',
      }),
    )

    const localBtn = screen.getByText('Lokale Version behalten').closest('button')
    expect(localBtn).toBeDisabled()
    expect(localBtn).toHaveAttribute('title', 'Im Nur-Lesen-Modus nicht verfügbar')
  })

  it('enables "Lokale Version behalten" button in bidirectional mode', () => {
    renderWithProviders(
      React.createElement(ConflictResolutionView, {
        vaultId: 'vault123',
        conflicts: [sampleConflict],
        mode: 'bidirectional',
      }),
    )

    const localBtn = screen.getByText('Lokale Version behalten').closest('button')
    expect(localBtn).not.toBeDisabled()
    expect(localBtn).toHaveAttribute('title', 'Lokale Version behalten')
  })

  it('calls resolveConflict with use_remote when clicking remote button', async () => {
    const { apiClient } = renderWithProviders(
      React.createElement(ConflictResolutionView, {
        vaultId: 'vault123',
        conflicts: [sampleConflict],
        mode: 'bidirectional',
      }),
    )

    const remoteBtn = screen.getByText('Remote-Version übernehmen').closest('button')!
    fireEvent.click(remoteBtn)

    expect(apiClient.resolveSyncConflict).toHaveBeenCalledWith(
      'vault123',
      'notes/meeting.md',
      'use_remote',
    )
  })

  it('calls resolveConflict with skip when clicking skip button', async () => {
    const { apiClient } = renderWithProviders(
      React.createElement(ConflictResolutionView, {
        vaultId: 'vault123',
        conflicts: [sampleConflict],
        mode: 'bidirectional',
      }),
    )

    const skipBtn = screen.getByText('Überspringen').closest('button')!
    fireEvent.click(skipBtn)

    expect(apiClient.resolveSyncConflict).toHaveBeenCalledWith(
      'vault123',
      'notes/meeting.md',
      'skip',
    )
  })

  it('displays file sizes formatted correctly', () => {
    renderWithProviders(
      React.createElement(ConflictResolutionView, {
        vaultId: 'vault123',
        conflicts: [sampleConflict],
        mode: 'bidirectional',
      }),
    )

    expect(screen.getByText('Größe: 2.0 KB')).toBeInTheDocument()
    expect(screen.getByText('Größe: 1.5 KB')).toBeInTheDocument()
  })

  it('displays remote revision number', () => {
    renderWithProviders(
      React.createElement(ConflictResolutionView, {
        vaultId: 'vault123',
        conflicts: [sampleConflict],
        mode: 'bidirectional',
      }),
    )

    expect(screen.getByText('Revision: 3-abc123')).toBeInTheDocument()
  })

  it('shows singular "Konflikt" for single conflict', () => {
    renderWithProviders(
      React.createElement(ConflictResolutionView, {
        vaultId: 'vault123',
        conflicts: [sampleConflict],
        mode: 'bidirectional',
      }),
    )

    expect(screen.getByText('1 Konflikt')).toBeInTheDocument()
  })

  it('recommends remote when dates are identical', () => {
    const equalDatesConflict: ConflictEntry = {
      documentPath: 'equal.md',
      local: {
        modifiedAt: '2024-06-15T10:00:00.000Z',
        size: 100,
      },
      remote: {
        revision: '2-xyz',
        modifiedAt: '2024-06-15T10:00:00.000Z',
        size: 200,
      },
      detectedAt: '2024-06-15T11:00:00.000Z',
    }

    renderWithProviders(
      React.createElement(ConflictResolutionView, {
        vaultId: 'vault123',
        conflicts: [equalDatesConflict],
        mode: 'bidirectional',
      }),
    )

    const badges = screen.getAllByText('Empfohlen')
    expect(badges).toHaveLength(1)
    const remoteSection = screen.getByText('Remote').closest('.conflict-card-section-title')
    expect(remoteSection).toContainElement(badges[0]!)
  })
})
