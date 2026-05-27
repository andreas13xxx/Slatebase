import { describe, it, expect } from 'vitest'
import {
  chatReducer,
  initialChatState,
  type ChatState,
  type ConversationListItem,
  type Message,
  type PaginatedConversations,
  type PaginatedMessages,
} from './chatState'

describe('chatReducer', () => {
  describe('CHAT_LOADING_STARTED', () => {
    it('sets isLoading to true and clears error', () => {
      const state: ChatState = { ...initialChatState, error: 'previous error' }
      const result = chatReducer(state, { type: 'CHAT_LOADING_STARTED' })

      expect(result.isLoading).toBe(true)
      expect(result.error).toBeNull()
    })
  })

  describe('CONVERSATIONS_LOADED', () => {
    it('sets conversations and pagination metadata, clears loading', () => {
      const conversations: ConversationListItem[] = [
        {
          id: 'conv1',
          participants: ['u1', 'u2'],
          participantNames: ['Alice', 'Bob'],
          lastMessageTimestamp: '2025-01-15T10:00:00.000Z',
          lastMessagePreview: 'Hello!',
        },
      ]
      const payload: PaginatedConversations = {
        conversations,
        total: 1,
        page: 1,
        pageSize: 50,
        hasMore: false,
      }

      const state: ChatState = { ...initialChatState, isLoading: true }
      const result = chatReducer(state, { type: 'CONVERSATIONS_LOADED', payload })

      expect(result.conversations).toEqual(conversations)
      expect(result.totalConversations).toBe(1)
      expect(result.conversationsPage).toBe(1)
      expect(result.hasMoreConversations).toBe(false)
      expect(result.isLoading).toBe(false)
    })
  })

  describe('MESSAGES_LOADED', () => {
    it('replaces messages when page is 1', () => {
      const existingMessages: Message[] = [
        { id: 'old', conversationId: 'conv1', senderId: 'u1', content: 'old', timestamp: '2025-01-01T00:00:00.000Z' },
      ]
      const newMessages: Message[] = [
        { id: 'msg1', conversationId: 'conv1', senderId: 'u1', content: 'Hello', timestamp: '2025-01-15T10:00:00.000Z' },
      ]
      const data: PaginatedMessages = {
        messages: newMessages,
        total: 1,
        page: 1,
        pageSize: 50,
        hasMore: false,
      }

      const state: ChatState = { ...initialChatState, messages: existingMessages, isLoading: true }
      const result = chatReducer(state, {
        type: 'MESSAGES_LOADED',
        payload: { conversationId: 'conv1', data },
      })

      expect(result.messages).toEqual(newMessages)
      expect(result.currentConversation).toBe('conv1')
      expect(result.totalMessages).toBe(1)
      expect(result.currentPage).toBe(1)
      expect(result.hasMoreMessages).toBe(false)
      expect(result.isLoading).toBe(false)
    })

    it('appends messages when page is greater than 1', () => {
      const existingMessages: Message[] = [
        { id: 'msg1', conversationId: 'conv1', senderId: 'u1', content: 'First', timestamp: '2025-01-15T10:00:00.000Z' },
      ]
      const newMessages: Message[] = [
        { id: 'msg2', conversationId: 'conv1', senderId: 'u2', content: 'Second', timestamp: '2025-01-15T10:01:00.000Z' },
      ]
      const data: PaginatedMessages = {
        messages: newMessages,
        total: 2,
        page: 2,
        pageSize: 50,
        hasMore: false,
      }

      const state: ChatState = { ...initialChatState, messages: existingMessages, isLoading: true }
      const result = chatReducer(state, {
        type: 'MESSAGES_LOADED',
        payload: { conversationId: 'conv1', data },
      })

      expect(result.messages).toEqual([...existingMessages, ...newMessages])
      expect(result.currentPage).toBe(2)
    })
  })

  describe('MESSAGE_SENT', () => {
    it('appends the new message and clears isSending', () => {
      const existing: Message[] = [
        { id: 'msg1', conversationId: 'conv1', senderId: 'u1', content: 'Hi', timestamp: '2025-01-15T10:00:00.000Z' },
      ]
      const newMessage: Message = {
        id: 'msg2',
        conversationId: 'conv1',
        senderId: 'u2',
        content: 'Hello back',
        timestamp: '2025-01-15T10:01:00.000Z',
      }

      const state: ChatState = { ...initialChatState, messages: existing, isSending: true }
      const result = chatReducer(state, { type: 'MESSAGE_SENT', payload: newMessage })

      expect(result.messages).toHaveLength(2)
      expect(result.messages[1]).toEqual(newMessage)
      expect(result.isSending).toBe(false)
    })
  })

  describe('CONVERSATION_CREATED', () => {
    it('prepends the new conversation to the list', () => {
      const existing: ConversationListItem[] = [
        {
          id: 'conv1',
          participants: ['u1', 'u2'],
          participantNames: ['Alice', 'Bob'],
          lastMessageTimestamp: null,
          lastMessagePreview: null,
        },
      ]
      const newConv: ConversationListItem = {
        id: 'conv2',
        participants: ['u1', 'u3'],
        participantNames: ['Alice', 'Charlie'],
        lastMessageTimestamp: null,
        lastMessagePreview: null,
      }

      const state: ChatState = { ...initialChatState, conversations: existing }
      const result = chatReducer(state, { type: 'CONVERSATION_CREATED', payload: newConv })

      expect(result.conversations).toHaveLength(2)
      expect(result.conversations[0]).toEqual(newConv)
      expect(result.conversations[1]).toEqual(existing[0])
    })
  })

  describe('CHAT_ERROR_OCCURRED', () => {
    it('sets error and clears loading and sending states', () => {
      const state: ChatState = { ...initialChatState, isLoading: true, isSending: true }
      const result = chatReducer(state, { type: 'CHAT_ERROR_OCCURRED', payload: 'Network error' })

      expect(result.error).toBe('Network error')
      expect(result.isLoading).toBe(false)
      expect(result.isSending).toBe(false)
    })
  })

  describe('CHAT_CLEARED', () => {
    it('resets to initial state', () => {
      const state: ChatState = {
        conversations: [{ id: 'c1', participants: ['u1'], participantNames: ['A'], lastMessageTimestamp: null, lastMessagePreview: null }],
        currentConversation: 'c1',
        messages: [{ id: 'm1', conversationId: 'c1', senderId: 'u1', content: 'x', timestamp: '2025-01-01T00:00:00.000Z' }],
        isLoading: true,
        error: 'some error',
        isSending: true,
        totalMessages: 5,
        currentPage: 2,
        hasMoreMessages: true,
        totalConversations: 3,
        conversationsPage: 2,
        hasMoreConversations: true,
      }

      const result = chatReducer(state, { type: 'CHAT_CLEARED' })
      expect(result).toEqual(initialChatState)
    })
  })
})
