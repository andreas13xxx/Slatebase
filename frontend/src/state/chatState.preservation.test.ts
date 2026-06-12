/**
 * Property-based preservation tests for chatReducer.
 * These tests capture the baseline behavior of the UNFIXED chatReducer
 * to ensure no regressions after the fix is applied.
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6**
 */
import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import {
  chatReducer,
  initialChatState,
  type ChatState,
  type ChatAction,
  type ConversationListItem,
  type Message,
  type PaginatedConversations,
  type PaginatedMessages,
} from './chatState'

// ─── Arbitraries ─────────────────────────────────────────────────────────────

/** Arbitrary for a valid ConversationListItem. */
const arbConversationListItem: fc.Arbitrary<ConversationListItem> = fc.record({
  id: fc.uuid(),
  participants: fc.array(fc.uuid(), { minLength: 1, maxLength: 5 }),
  participantNames: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 5 }),
  lastMessageTimestamp: fc.option(fc.date().map(d => d.toISOString()), { nil: null }),
  lastMessagePreview: fc.option(fc.string({ minLength: 0, maxLength: 200 }), { nil: null }),
  unreadCount: fc.nat({ max: 100 }),
  archived: fc.option(fc.boolean(), { nil: undefined }),
})

/** Arbitrary for a valid Message. */
const arbMessage: fc.Arbitrary<Message> = fc.record({
  id: fc.uuid(),
  conversationId: fc.uuid(),
  senderId: fc.uuid(),
  content: fc.string({ minLength: 1, maxLength: 500 }),
  timestamp: fc.date().map(d => d.toISOString()),
})

/** Arbitrary for PaginatedConversations payload. */
const arbPaginatedConversations: fc.Arbitrary<PaginatedConversations> = fc.record({
  conversations: fc.array(arbConversationListItem, { minLength: 0, maxLength: 10 }),
  total: fc.nat({ max: 100 }),
  page: fc.integer({ min: 1, max: 10 }),
  pageSize: fc.integer({ min: 1, max: 50 }),
  hasMore: fc.boolean(),
})

/** Arbitrary for PaginatedMessages payload. */
const arbPaginatedMessages: fc.Arbitrary<PaginatedMessages> = fc.record({
  messages: fc.array(arbMessage, { minLength: 0, maxLength: 20 }),
  total: fc.nat({ max: 100 }),
  page: fc.integer({ min: 1, max: 10 }),
  pageSize: fc.integer({ min: 1, max: 50 }),
  hasMore: fc.boolean(),
})

/** Arbitrary for a valid ChatState. */
const arbChatState: fc.Arbitrary<ChatState> = fc.record({
  conversations: fc.array(arbConversationListItem, { minLength: 0, maxLength: 10 }),
  currentConversation: fc.option(fc.uuid(), { nil: null }),
  messages: fc.array(arbMessage, { minLength: 0, maxLength: 20 }),
  isLoading: fc.boolean(),
  error: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: null }),
  isSending: fc.boolean(),
  totalMessages: fc.nat({ max: 100 }),
  currentPage: fc.integer({ min: 1, max: 10 }),
  hasMoreMessages: fc.boolean(),
  totalConversations: fc.nat({ max: 100 }),
  conversationsPage: fc.integer({ min: 1, max: 10 }),
  hasMoreConversations: fc.boolean(),
  globalUnreadCount: fc.nat({ max: 999 }),
})

/** Arbitrary for non-MESSAGE_SENT actions. */
const arbNonMessageSentAction: fc.Arbitrary<ChatAction> = fc.oneof(
  fc.constant({ type: 'CHAT_LOADING_STARTED' as const }),
  arbPaginatedConversations.map(payload => ({
    type: 'CONVERSATIONS_LOADED' as const,
    payload,
  })),
  fc.record({
    conversationId: fc.uuid(),
    data: arbPaginatedMessages,
  }).map(payload => ({
    type: 'MESSAGES_LOADED' as const,
    payload,
  })),
  arbConversationListItem.map(payload => ({
    type: 'CONVERSATION_CREATED' as const,
    payload,
  })),
  fc.string({ minLength: 1, maxLength: 100 }).map(payload => ({
    type: 'CHAT_ERROR_OCCURRED' as const,
    payload,
  })),
  fc.constant({ type: 'CHAT_CLEARED' as const }),
  fc.record({
    conversationId: fc.uuid(),
    unreadCount: fc.nat({ max: 100 }),
  }).map(payload => ({
    type: 'CONVERSATION_LEFT' as const,
    payload,
  })),
  fc.nat({ max: 999 }).map(payload => ({
    type: 'GLOBAL_UNREAD_UPDATED' as const,
    payload,
  })),
  fc.uuid().map(payload => ({
    type: 'CONVERSATION_UNREAD_RESET' as const,
    payload,
  })),
)

/** Arbitrary for MESSAGE_SENT action. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const arbMessageSentAction: fc.Arbitrary<ChatAction> = arbMessage.map(payload => ({
  type: 'MESSAGE_SENT' as const,
  payload,
}))

// ─── Preservation Property Tests ─────────────────────────────────────────────

describe('chatReducer — Preservation Property Tests', () => {
  /**
   * Property 2: Preservation — Non-MESSAGE_SENT actions produce identical state.
   *
   * For all action types except MESSAGE_SENT, the chatReducer must produce
   * the same result as the current implementation. This is a snapshot of
   * the current behavior that must not regress after the fix.
   *
   * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6**
   */
  describe('Non-MESSAGE_SENT actions produce identical state', () => {
    it('CHAT_LOADING_STARTED sets isLoading=true and error=null, preserves everything else', () => {
      fc.assert(
        fc.property(arbChatState, (state) => {
          const result = chatReducer(state, { type: 'CHAT_LOADING_STARTED' })
          expect(result.isLoading).toBe(true)
          expect(result.error).toBeNull()
          // All other fields unchanged
          expect(result.conversations).toEqual(state.conversations)
          expect(result.currentConversation).toBe(state.currentConversation)
          expect(result.messages).toEqual(state.messages)
          expect(result.isSending).toBe(state.isSending)
          expect(result.totalMessages).toBe(state.totalMessages)
          expect(result.currentPage).toBe(state.currentPage)
          expect(result.hasMoreMessages).toBe(state.hasMoreMessages)
          expect(result.totalConversations).toBe(state.totalConversations)
          expect(result.conversationsPage).toBe(state.conversationsPage)
          expect(result.hasMoreConversations).toBe(state.hasMoreConversations)
          expect(result.globalUnreadCount).toBe(state.globalUnreadCount)
        }),
        { numRuns: 100 },
      )
    })

    it('CONVERSATIONS_LOADED replaces conversations and pagination, clears loading', () => {
      fc.assert(
        fc.property(arbChatState, arbPaginatedConversations, (state, payload) => {
          const result = chatReducer(state, { type: 'CONVERSATIONS_LOADED', payload })
          expect(result.conversations).toEqual(payload.conversations)
          expect(result.totalConversations).toBe(payload.total)
          expect(result.conversationsPage).toBe(payload.page)
          expect(result.hasMoreConversations).toBe(payload.hasMore)
          expect(result.isLoading).toBe(false)
          // Preserved fields
          expect(result.currentConversation).toBe(state.currentConversation)
          expect(result.messages).toEqual(state.messages)
          expect(result.error).toBe(state.error)
          expect(result.isSending).toBe(state.isSending)
          expect(result.totalMessages).toBe(state.totalMessages)
          expect(result.currentPage).toBe(state.currentPage)
          expect(result.hasMoreMessages).toBe(state.hasMoreMessages)
          expect(result.globalUnreadCount).toBe(state.globalUnreadCount)
        }),
        { numRuns: 100 },
      )
    })

    it('MESSAGES_LOADED sets messages (replace on page 1, append on page > 1)', () => {
      fc.assert(
        fc.property(
          arbChatState,
          fc.uuid(),
          arbPaginatedMessages,
          (state, conversationId, data) => {
            const result = chatReducer(state, {
              type: 'MESSAGES_LOADED',
              payload: { conversationId, data },
            })

            if (data.page > 1) {
              expect(result.messages).toEqual([...state.messages, ...data.messages])
            } else {
              expect(result.messages).toEqual(data.messages)
            }
            expect(result.currentConversation).toBe(conversationId)
            expect(result.totalMessages).toBe(data.total)
            expect(result.currentPage).toBe(data.page)
            expect(result.hasMoreMessages).toBe(data.hasMore)
            expect(result.isLoading).toBe(false)
            // Preserved fields
            expect(result.conversations).toEqual(state.conversations)
            expect(result.error).toBe(state.error)
            expect(result.isSending).toBe(state.isSending)
            expect(result.globalUnreadCount).toBe(state.globalUnreadCount)
          },
        ),
        { numRuns: 100 },
      )
    })

    it('CONVERSATION_CREATED prepends to conversations list', () => {
      fc.assert(
        fc.property(arbChatState, arbConversationListItem, (state, newConv) => {
          const result = chatReducer(state, { type: 'CONVERSATION_CREATED', payload: newConv })
          expect(result.conversations).toEqual([newConv, ...state.conversations])
          // All other fields unchanged
          expect(result.currentConversation).toBe(state.currentConversation)
          expect(result.messages).toEqual(state.messages)
          expect(result.isLoading).toBe(state.isLoading)
          expect(result.error).toBe(state.error)
          expect(result.isSending).toBe(state.isSending)
          expect(result.globalUnreadCount).toBe(state.globalUnreadCount)
        }),
        { numRuns: 100 },
      )
    })

    it('CHAT_CLEARED resets to initialChatState', () => {
      fc.assert(
        fc.property(arbChatState, (state) => {
          const result = chatReducer(state, { type: 'CHAT_CLEARED' })
          expect(result).toEqual(initialChatState)
        }),
        { numRuns: 100 },
      )
    })

    it('CONVERSATION_LEFT removes conversation and decrements globalUnreadCount', () => {
      fc.assert(
        fc.property(
          arbChatState,
          fc.uuid(),
          fc.nat({ max: 100 }),
          (state, conversationId, unreadCount) => {
            const result = chatReducer(state, {
              type: 'CONVERSATION_LEFT',
              payload: { conversationId, unreadCount },
            })
            expect(result.conversations).toEqual(
              state.conversations.filter(c => c.id !== conversationId),
            )
            expect(result.globalUnreadCount).toBe(
              Math.max(0, state.globalUnreadCount - unreadCount),
            )
            // Preserved fields
            expect(result.currentConversation).toBe(state.currentConversation)
            expect(result.messages).toEqual(state.messages)
            expect(result.isLoading).toBe(state.isLoading)
            expect(result.error).toBe(state.error)
            expect(result.isSending).toBe(state.isSending)
          },
        ),
        { numRuns: 100 },
      )
    })

    it('GLOBAL_UNREAD_UPDATED sets globalUnreadCount', () => {
      fc.assert(
        fc.property(arbChatState, fc.nat({ max: 999 }), (state, count) => {
          const result = chatReducer(state, { type: 'GLOBAL_UNREAD_UPDATED', payload: count })
          expect(result.globalUnreadCount).toBe(count)
          // Preserved fields
          expect(result.conversations).toEqual(state.conversations)
          expect(result.currentConversation).toBe(state.currentConversation)
          expect(result.messages).toEqual(state.messages)
          expect(result.isLoading).toBe(state.isLoading)
          expect(result.error).toBe(state.error)
          expect(result.isSending).toBe(state.isSending)
        }),
        { numRuns: 100 },
      )
    })

    it('CONVERSATION_UNREAD_RESET zeroes unread for matching conversation', () => {
      fc.assert(
        fc.property(arbChatState, fc.uuid(), (state, conversationId) => {
          const result = chatReducer(state, {
            type: 'CONVERSATION_UNREAD_RESET',
            payload: conversationId,
          })
          expect(result.conversations).toEqual(
            state.conversations.map(c =>
              c.id === conversationId ? { ...c, unreadCount: 0 } : c,
            ),
          )
          // Preserved fields
          expect(result.currentConversation).toBe(state.currentConversation)
          expect(result.messages).toEqual(state.messages)
          expect(result.isLoading).toBe(state.isLoading)
          expect(result.error).toBe(state.error)
          expect(result.isSending).toBe(state.isSending)
          expect(result.globalUnreadCount).toBe(state.globalUnreadCount)
        }),
        { numRuns: 100 },
      )
    })

    it('for any non-MESSAGE_SENT action, reducer produces deterministic output', () => {
      fc.assert(
        fc.property(arbChatState, arbNonMessageSentAction, (state, action) => {
          const result1 = chatReducer(state, action)
          const result2 = chatReducer(state, action)
          expect(result1).toEqual(result2)
        }),
        { numRuns: 200 },
      )
    })
  })

  /**
   * Property 2b: Preservation — MESSAGE_SENT preserves message append behavior.
   *
   * For MESSAGE_SENT actions, the messages array must still contain the new
   * message appended at the end. Other fields (isLoading, error,
   * currentConversation, globalUnreadCount) must remain unchanged.
   *
   * **Validates: Requirements 3.3**
   */
  describe('MESSAGE_SENT preserves existing behavior', () => {
    it('messages array contains the new message appended at the end', () => {
      fc.assert(
        fc.property(arbChatState, arbMessage, (state, message) => {
          const result = chatReducer(state, { type: 'MESSAGE_SENT', payload: message })
          // New message is appended at the end
          expect(result.messages).toEqual([...state.messages, message])
          expect(result.messages[result.messages.length - 1]).toEqual(message)
        }),
        { numRuns: 200 },
      )
    })

    it('isLoading remains unchanged after MESSAGE_SENT', () => {
      fc.assert(
        fc.property(arbChatState, arbMessage, (state, message) => {
          const result = chatReducer(state, { type: 'MESSAGE_SENT', payload: message })
          expect(result.isLoading).toBe(state.isLoading)
        }),
        { numRuns: 200 },
      )
    })

    it('error remains unchanged after MESSAGE_SENT', () => {
      fc.assert(
        fc.property(arbChatState, arbMessage, (state, message) => {
          const result = chatReducer(state, { type: 'MESSAGE_SENT', payload: message })
          expect(result.error).toBe(state.error)
        }),
        { numRuns: 200 },
      )
    })

    it('currentConversation remains unchanged after MESSAGE_SENT', () => {
      fc.assert(
        fc.property(arbChatState, arbMessage, (state, message) => {
          const result = chatReducer(state, { type: 'MESSAGE_SENT', payload: message })
          expect(result.currentConversation).toBe(state.currentConversation)
        }),
        { numRuns: 200 },
      )
    })

    it('globalUnreadCount remains unchanged after MESSAGE_SENT', () => {
      fc.assert(
        fc.property(arbChatState, arbMessage, (state, message) => {
          const result = chatReducer(state, { type: 'MESSAGE_SENT', payload: message })
          expect(result.globalUnreadCount).toBe(state.globalUnreadCount)
        }),
        { numRuns: 200 },
      )
    })

    it('isSending is set to false after MESSAGE_SENT', () => {
      fc.assert(
        fc.property(arbChatState, arbMessage, (state, message) => {
          const result = chatReducer(state, { type: 'MESSAGE_SENT', payload: message })
          expect(result.isSending).toBe(false)
        }),
        { numRuns: 200 },
      )
    })
  })
})
