/**
 * Chat action creators — standalone async functions that call the API
 * and dispatch appropriate ChatActions.
 *
 * Pattern: dispatch CHAT_LOADING_STARTED → call API → dispatch result or CHAT_ERROR_OCCURRED.
 */

import type { Dispatch } from 'react'
import type { ChatAction, ConversationListItem } from './chatState'
import type { IApiClient } from '../api'
import type { Conversation, Message } from '../types'

/**
 * Fetches the current user's conversations (paginated) and dispatches CONVERSATIONS_LOADED.
 */
export async function loadConversations(
  dispatch: Dispatch<ChatAction>,
  apiClient: IApiClient,
  page?: number,
): Promise<void> {
  dispatch({ type: 'CHAT_LOADING_STARTED' })
  try {
    const result = await apiClient.listConversations(page)
    dispatch({ type: 'CONVERSATIONS_LOADED', payload: result })
  } catch (err: unknown) {
    const message = extractErrorMessage(err)
    dispatch({ type: 'CHAT_ERROR_OCCURRED', payload: message })
  }
}

/**
 * Fetches messages for a conversation (paginated) and dispatches MESSAGES_LOADED.
 */
export async function loadMessages(
  dispatch: Dispatch<ChatAction>,
  apiClient: IApiClient,
  conversationId: string,
  page?: number,
): Promise<void> {
  dispatch({ type: 'CHAT_LOADING_STARTED' })
  try {
    const result = await apiClient.getMessages(conversationId, page)
    dispatch({ type: 'MESSAGES_LOADED', payload: { conversationId, data: result } })
  } catch (err: unknown) {
    const message = extractErrorMessage(err)
    dispatch({ type: 'CHAT_ERROR_OCCURRED', payload: message })
  }
}

/**
 * Sends a message to a conversation and dispatches MESSAGE_SENT.
 * Returns the sent message on success, or undefined on failure.
 */
export async function sendMessage(
  dispatch: Dispatch<ChatAction>,
  apiClient: IApiClient,
  conversationId: string,
  content: string,
): Promise<Message | undefined> {
  try {
    const message = await apiClient.sendMessage(conversationId, content)
    dispatch({ type: 'MESSAGE_SENT', payload: message })
    return message
  } catch (err: unknown) {
    const errorMessage = extractErrorMessage(err)
    dispatch({ type: 'CHAT_ERROR_OCCURRED', payload: errorMessage })
    return undefined
  }
}

/**
 * Creates a new conversation with the given participants and dispatches CONVERSATION_CREATED.
 * Returns the created conversation on success, or undefined on failure.
 */
export async function createConversation(
  dispatch: Dispatch<ChatAction>,
  apiClient: IApiClient,
  participantIds: string[],
): Promise<Conversation | undefined> {
  try {
    const conversation = await apiClient.createConversation(participantIds)
    const listItem: ConversationListItem = {
      id: conversation.id,
      participants: conversation.participants,
      participantNames: [],
      lastMessageTimestamp: null,
      lastMessagePreview: null,
      unreadCount: 0,
    }
    dispatch({ type: 'CONVERSATION_CREATED', payload: listItem })
    return conversation
  } catch (err: unknown) {
    const message = extractErrorMessage(err)
    dispatch({ type: 'CHAT_ERROR_OCCURRED', payload: message })
    return undefined
  }
}

/**
 * Leave a conversation. Calls the API and dispatches CONVERSATION_LEFT.
 */
export async function leaveConversation(
  dispatch: Dispatch<ChatAction>,
  apiClient: IApiClient,
  conversationId: string,
  unreadCount: number,
): Promise<void> {
  try {
    await apiClient.leaveConversation(conversationId)
    dispatch({ type: 'CONVERSATION_LEFT', payload: { conversationId, unreadCount } })
  } catch (err: unknown) {
    const message = extractErrorMessage(err)
    dispatch({ type: 'CHAT_ERROR_OCCURRED', payload: message })
  }
}

/**
 * Poll the global unread total from the server and dispatch GLOBAL_UNREAD_UPDATED.
 */
export async function pollUnreadTotal(
  dispatch: Dispatch<ChatAction>,
  apiClient: IApiClient,
): Promise<void> {
  try {
    const result = await apiClient.getUnreadTotal()
    dispatch({ type: 'GLOBAL_UNREAD_UPDATED', payload: result.total })
  } catch (err: unknown) {
    const message = extractErrorMessage(err)
    dispatch({ type: 'CHAT_ERROR_OCCURRED', payload: message })
  }
}

/**
 * Extracts a human-readable error message from an unknown error.
 * Handles the { code, message } shape thrown by ApiClient as well as standard Error instances.
 */
function extractErrorMessage(err: unknown): string {
  if (
    err !== null &&
    typeof err === 'object' &&
    'message' in err &&
    typeof (err as { message: unknown }).message === 'string'
  ) {
    return (err as { message: string }).message
  }
  if (err instanceof Error) {
    return err.message
  }
  return 'An unexpected error occurred'
}
