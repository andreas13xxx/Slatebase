import { describe, it, expect, vi } from 'vitest'
import type { Dispatch } from 'react'
import type { ChatAction } from './chatState'
import type { IApiClient } from '../api'
import { leaveConversation, pollUnreadTotal } from './chatActions'

function createMockDispatch(): Dispatch<ChatAction> & { calls: ChatAction[] } {
  const calls: ChatAction[] = []
  const dispatch = ((action: ChatAction) => {
    calls.push(action)
  }) as Dispatch<ChatAction> & { calls: ChatAction[] }
  dispatch.calls = calls
  return dispatch
}

function createMockApiClient(overrides: Partial<IApiClient> = {}): IApiClient {
  return {
    setToken: vi.fn(),
    getToken: vi.fn(() => null),
    setCsrfToken: vi.fn(),
    getCsrfToken: vi.fn(() => null),
    setOnSessionExpired: vi.fn(),
    fetchVaults: vi.fn(),
    fetchAllVaults: vi.fn(),
    fetchVaultTree: vi.fn(),
    fetchFileContent: vi.fn(),
    createVault: vi.fn(),
    deleteVault: vi.fn(),
    importFile: vi.fn(),
    importFolder: vi.fn(),
    deleteContent: vi.fn(),
    saveFile: vi.fn(),
    moveContent: vi.fn(),
    renameContent: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    getSessions: vi.fn(),
    invalidateSession: vi.fn(),
    invalidateAllOtherSessions: vi.fn(),
    getProfile: vi.fn(),
    updateProfile: vi.fn(),
    changePassword: vi.fn(),
    deleteSelf: vi.fn(),
    searchUsers: vi.fn(),
    createConversation: vi.fn(),
    listConversations: vi.fn(),
    getMessages: vi.fn(),
    sendMessage: vi.fn(),
    leaveConversation: vi.fn(async () => {}),
    getUnreadTotal: vi.fn(async () => ({ total: 0 })),
    ...overrides,
  } as IApiClient
}

describe('leaveConversation', () => {
  it('calls API and dispatches CONVERSATION_LEFT on success', async () => {
    const dispatch = createMockDispatch()
    const apiClient = createMockApiClient()

    await leaveConversation(dispatch, apiClient, 'conv123', 5)

    expect(apiClient.leaveConversation).toHaveBeenCalledWith('conv123')
    expect(dispatch.calls).toHaveLength(1)
    expect(dispatch.calls[0]).toEqual({
      type: 'CONVERSATION_LEFT',
      payload: { conversationId: 'conv123', unreadCount: 5 },
    })
  })

  it('dispatches CHAT_ERROR_OCCURRED on API failure', async () => {
    const dispatch = createMockDispatch()
    const apiClient = createMockApiClient({
      leaveConversation: vi.fn(async () => {
        throw { code: 'NOT_FOUND', message: 'Conversation not found' }
      }),
    })

    await leaveConversation(dispatch, apiClient, 'conv123', 3)

    expect(dispatch.calls).toHaveLength(1)
    expect(dispatch.calls[0]).toEqual({
      type: 'CHAT_ERROR_OCCURRED',
      payload: 'Conversation not found',
    })
  })

  it('passes unreadCount of 0 correctly', async () => {
    const dispatch = createMockDispatch()
    const apiClient = createMockApiClient()

    await leaveConversation(dispatch, apiClient, 'conv456', 0)

    expect(dispatch.calls[0]).toEqual({
      type: 'CONVERSATION_LEFT',
      payload: { conversationId: 'conv456', unreadCount: 0 },
    })
  })
})

describe('pollUnreadTotal', () => {
  it('calls API and dispatches GLOBAL_UNREAD_UPDATED on success', async () => {
    const dispatch = createMockDispatch()
    const apiClient = createMockApiClient({
      getUnreadTotal: vi.fn(async () => ({ total: 7 })),
    })

    await pollUnreadTotal(dispatch, apiClient)

    expect(apiClient.getUnreadTotal).toHaveBeenCalled()
    expect(dispatch.calls).toHaveLength(1)
    expect(dispatch.calls[0]).toEqual({
      type: 'GLOBAL_UNREAD_UPDATED',
      payload: 7,
    })
  })

  it('dispatches GLOBAL_UNREAD_UPDATED with 0 when no unread', async () => {
    const dispatch = createMockDispatch()
    const apiClient = createMockApiClient({
      getUnreadTotal: vi.fn(async () => ({ total: 0 })),
    })

    await pollUnreadTotal(dispatch, apiClient)

    expect(dispatch.calls[0]).toEqual({
      type: 'GLOBAL_UNREAD_UPDATED',
      payload: 0,
    })
  })

  it('dispatches CHAT_ERROR_OCCURRED on API failure', async () => {
    const dispatch = createMockDispatch()
    const apiClient = createMockApiClient({
      getUnreadTotal: vi.fn(async () => {
        throw new Error('Network error')
      }),
    })

    await pollUnreadTotal(dispatch, apiClient)

    expect(dispatch.calls).toHaveLength(1)
    expect(dispatch.calls[0]).toEqual({
      type: 'CHAT_ERROR_OCCURRED',
      payload: 'Network error',
    })
  })
})
