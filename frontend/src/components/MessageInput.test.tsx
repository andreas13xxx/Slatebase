import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import { MessageInput } from './MessageInput'
import { ChatContext, type ChatContextValue } from '../state/chatContext'
import { AppContext, type AppContextValue } from '../state/index'
import { initialChatState } from '../state/chatState'
import type { IApiClient } from '../api'

/** Creates a minimal mock API client with chat methods. */
function createMockApiClient(): IApiClient {
  return {
    fetchVaults: vi.fn(),
    fetchVaultTree: vi.fn(),
    fetchFileContent: vi.fn(),
    createVault: vi.fn(),
    deleteVault: vi.fn(),
    importFile: vi.fn(),
    importFolder: vi.fn(),
    deleteContent: vi.fn(),
    saveFile: vi.fn(),
    getToken: vi.fn().mockReturnValue('test-token'),
    setToken: vi.fn(),
    setCsrfToken: vi.fn(),
    setOnSessionExpired: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    getSessions: vi.fn(),
    invalidateSession: vi.fn(),
    invalidateAllOtherSessions: vi.fn(),
    getProfile: vi.fn(),
    updateProfile: vi.fn(),
    changePassword: vi.fn(),
    deleteAccount: vi.fn(),
    listUsers: vi.fn(),
    createUser: vi.fn(),
    deleteUser: vi.fn(),
    changeUserRole: vi.fn(),
    resetUserPassword: vi.fn(),
    suspendUser: vi.fn(),
    unsuspendUser: vi.fn(),
    getServerConfig: vi.fn(),
    updateServerConfig: vi.fn(),
    restartServer: vi.fn(),
    getAuditLog: vi.fn(),
    listShares: vi.fn(),
    createShare: vi.fn(),
    revokeShare: vi.fn(),
    updateSharePermission: vi.fn(),
    transferOwnership: vi.fn(),
    searchUsers: vi.fn(),
    moveContent: vi.fn(),
    createConversation: vi.fn(),
    listConversations: vi.fn(),
    getMessages: vi.fn(),
    sendMessage: vi.fn().mockResolvedValue({
      id: 'abc123def456abc123def456',
      conversationId: 'conv123456789012345678',
      senderId: 'user1',
      content: 'Hello',
      timestamp: '2025-01-15T10:31:00.000Z',
    }),
  } as unknown as IApiClient
}

/** Renders MessageInput wrapped in required providers. */
function renderMessageInput(
  overrides?: Partial<{ chatState: typeof initialChatState; apiClient: IApiClient }>,
) {
  const chatState = overrides?.chatState ?? { ...initialChatState }
  const dispatch = vi.fn()
  const apiClient = overrides?.apiClient ?? createMockApiClient()

  const chatValue: ChatContextValue = { state: chatState, dispatch }
  const appValue: AppContextValue = { state: { vaults: [], selectedVaultId: null, directoryTree: null, selectedFile: null, loading: false, error: null }, dispatch: vi.fn(), apiClient }

  render(
    React.createElement(AppContext.Provider, { value: appValue },
      React.createElement(ChatContext.Provider, { value: chatValue },
        React.createElement(MessageInput, { conversationId: 'conv123456789012345678' }),
      ),
    ),
  )

  return { dispatch, apiClient }
}

describe('MessageInput', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders textarea with placeholder', () => {
    renderMessageInput()
    const textarea = screen.getByRole('textbox')
    expect(textarea).toBeInTheDocument()
    expect(textarea).toHaveAttribute('placeholder')
  })

  it('renders send button', () => {
    renderMessageInput()
    const button = screen.getByRole('button')
    expect(button).toBeInTheDocument()
  })

  it('disables send button when textarea is empty', () => {
    renderMessageInput()
    const button = screen.getByRole('button')
    expect(button).toBeDisabled()
  })

  it('enables send button when textarea has content', () => {
    renderMessageInput()
    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: 'Hello' } })
    const button = screen.getByRole('button')
    expect(button).not.toBeDisabled()
  })

  it('disables send button when content is only whitespace', () => {
    renderMessageInput()
    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: '   \n  ' } })
    const button = screen.getByRole('button')
    expect(button).toBeDisabled()
  })

  it('disables send button when content exceeds max length', () => {
    renderMessageInput()
    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: 'a'.repeat(4001) } })
    const button = screen.getByRole('button')
    expect(button).toBeDisabled()
  })

  it('shows character counter when approaching limit', () => {
    renderMessageInput()
    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: 'a'.repeat(3801) } })
    expect(screen.getByText('3801/4000')).toBeInTheDocument()
  })

  it('does not show character counter below threshold', () => {
    renderMessageInput()
    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: 'a'.repeat(3800) } })
    expect(screen.queryByText(/\/4000/)).not.toBeInTheDocument()
  })

  it('shows counter with warning style when over limit', () => {
    renderMessageInput()
    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: 'a'.repeat(4001) } })
    const counter = screen.getByText('4001/4000')
    expect(counter).toHaveClass('message-input-counter--over')
  })

  it('disables textarea and send button when isSending is true', () => {
    renderMessageInput({ chatState: { ...initialChatState, isSending: true } })
    const textarea = screen.getByRole('textbox')
    const button = screen.getByRole('button')
    expect(textarea).toBeDisabled()
    expect(button).toBeDisabled()
  })

  it('calls sendMessage on Enter key press', async () => {
    const { apiClient } = renderMessageInput()
    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: 'Hello' } })
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })

    await waitFor(() => {
      expect((apiClient as { sendMessage: ReturnType<typeof vi.fn> }).sendMessage).toHaveBeenCalledWith(
        'conv123456789012345678',
        'Hello',
      )
    })
  })

  it('allows newline on Shift+Enter', () => {
    renderMessageInput()
    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: 'Hello' } })
    const event = new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true })
    const preventDefaultSpy = vi.spyOn(event, 'preventDefault')
    textarea.dispatchEvent(event)
    expect(preventDefaultSpy).not.toHaveBeenCalled()
  })

  it('clears textarea after successful send', async () => {
    renderMessageInput()
    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: 'Hello' } })
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })

    await waitFor(() => {
      expect(textarea).toHaveValue('')
    })
  })

  it('does not clear textarea on send failure', async () => {
    const apiClient = createMockApiClient()
    ;(apiClient as { sendMessage: ReturnType<typeof vi.fn> }).sendMessage = vi.fn().mockRejectedValue({ code: 'ERROR', message: 'Failed' })
    renderMessageInput({ apiClient })
    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: 'Hello' } })
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })

    await waitFor(() => {
      expect(textarea).toHaveValue('Hello')
    })
  })
})
