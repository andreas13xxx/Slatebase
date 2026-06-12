/**
 * Bug Condition Exploration Test — MESSAGE_SENT does not update conversation list.
 *
 * **Validates: Requirements 1.3, 2.3**
 *
 * This test encodes the EXPECTED behavior after the fix:
 * - MESSAGE_SENT must update the matching conversation's lastMessagePreview
 * - MESSAGE_SENT must update the matching conversation's lastMessageTimestamp
 * - MESSAGE_SENT must move the conversation to index 0 (top of list)
 *
 * On UNFIXED code, this test FAILS — confirming the bug exists.
 * After the fix, this test PASSES — confirming the bug is resolved.
 */
import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import {
  chatReducer,
  initialChatState,
  type ChatState,
  type ConversationListItem,
  type Message,
} from './chatState'

/**
 * Truncates content to 100 characters, appending ellipsis if truncated.
 * This mirrors the expected behavior of the fixed reducer.
 */
function truncate(content: string, maxLength: number): string {
  if (content.length <= maxLength) return content
  return content.slice(0, maxLength) + '…'
}

/**
 * Arbitrary for generating a valid ConversationListItem.
 */
const arbConversationListItem = (id: string): fc.Arbitrary<ConversationListItem> =>
  fc.record({
    id: fc.constant(id),
    participants: fc.array(fc.uuid(), { minLength: 2, maxLength: 4 }),
    participantNames: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 2, maxLength: 4 }),
    lastMessageTimestamp: fc.oneof(
      fc.constant(null),
      fc.date({ min: new Date('2024-01-01'), max: new Date('2025-12-31') }).map(d => d.toISOString())
    ),
    lastMessagePreview: fc.oneof(
      fc.constant(null),
      fc.string({ minLength: 1, maxLength: 50 })
    ),
    unreadCount: fc.nat({ max: 99 }),
    archived: fc.oneof(fc.constant(undefined), fc.boolean()),
  }) as fc.Arbitrary<ConversationListItem>

/**
 * Arbitrary for generating a state with at least 2 conversations,
 * where the target conversation is NOT at index 0.
 * This ensures we can verify the sort-to-top behavior.
 */
const arbStateWithTargetConversation = fc.gen().chain(() => {
  const targetId = fc.uuid()
  const otherId = fc.uuid().filter(() => true) // will be filtered below

  return fc.tuple(targetId, otherId).chain(([tId, oId]) => {
    if (tId === oId) return fc.constant(null) as fc.Arbitrary<{ state: ChatState; targetConversationId: string; message: Message } | null>

    const targetConv = arbConversationListItem(tId)
    const otherConv = arbConversationListItem(oId)

    return fc.tuple(targetConv, otherConv).chain(([target, other]) => {
      // Place target AFTER other so it's not at index 0
      const state: ChatState = {
        ...initialChatState,
        conversations: [other, target],
      }

      const messageArb = fc.record({
        id: fc.uuid(),
        conversationId: fc.constant(tId),
        senderId: fc.uuid(),
        content: fc.string({ minLength: 1, maxLength: 200 }),
        timestamp: fc.date({ min: new Date('2025-01-01'), max: new Date('2025-12-31') }).map(d => d.toISOString()),
      }) as fc.Arbitrary<Message>

      return messageArb.map(message => ({
        state,
        targetConversationId: tId,
        message,
      }))
    })
  }).filter((v): v is { state: ChatState; targetConversationId: string; message: Message } => v !== null)
})

describe('Bug Condition Exploration: MESSAGE_SENT does not update conversation list', () => {
  it('Property 1: MESSAGE_SENT updates lastMessagePreview to truncated content', () => {
    /**
     * **Validates: Requirements 1.3, 2.3**
     *
     * For any MESSAGE_SENT action where action.payload.conversationId matches
     * an existing conversation, the reducer MUST update that conversation's
     * lastMessagePreview to truncate(action.payload.content, 100).
     */
    fc.assert(
      fc.property(
        arbStateWithTargetConversation,
        ({ state, targetConversationId, message }) => {
          const result = chatReducer(state, { type: 'MESSAGE_SENT', payload: message })

          const updatedConv = result.conversations.find(c => c.id === targetConversationId)
          expect(updatedConv).toBeDefined()
          expect(updatedConv!.lastMessagePreview).toBe(truncate(message.content, 100))
        }
      ),
      { numRuns: 100 }
    )
  })

  it('Property 1: MESSAGE_SENT updates lastMessageTimestamp to message timestamp', () => {
    /**
     * **Validates: Requirements 1.3, 2.3**
     *
     * For any MESSAGE_SENT action where action.payload.conversationId matches
     * an existing conversation, the reducer MUST set that conversation's
     * lastMessageTimestamp to action.payload.timestamp.
     */
    fc.assert(
      fc.property(
        arbStateWithTargetConversation,
        ({ state, targetConversationId, message }) => {
          const result = chatReducer(state, { type: 'MESSAGE_SENT', payload: message })

          const updatedConv = result.conversations.find(c => c.id === targetConversationId)
          expect(updatedConv).toBeDefined()
          expect(updatedConv!.lastMessageTimestamp).toBe(message.timestamp)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('Property 1: MESSAGE_SENT moves conversation to index 0', () => {
    /**
     * **Validates: Requirements 1.3, 2.3**
     *
     * For any MESSAGE_SENT action where action.payload.conversationId matches
     * an existing conversation, the reducer MUST move that conversation to
     * index 0 of the conversations array (most recent first).
     */
    fc.assert(
      fc.property(
        arbStateWithTargetConversation,
        ({ state, targetConversationId, message }) => {
          const result = chatReducer(state, { type: 'MESSAGE_SENT', payload: message })

          expect(result.conversations[0]!.id).toBe(targetConversationId)
        }
      ),
      { numRuns: 100 }
    )
  })
})
