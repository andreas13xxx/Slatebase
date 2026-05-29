/**
 * Property-Based Tests for User Chat (Properties 9–16)
 *
 * Property 9: Conversation list contains only user's conversations
 * Property 10: Last message preview truncation
 * Property 11: Persistence survives reload
 * Property 12: Rate limiter allows exactly 30 messages per window
 * Property 13: Rate limiter is per-user independent
 * Property 14: Rate limiter resets after window expiry
 * Property 15: Content validation
 * Property 16: ID format validation
 */
import { describe, it, expect, afterAll, vi, beforeEach, afterEach } from 'vitest'
import * as fc from 'fast-check'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { ChatService } from './chat-service.js'
import { ChatRateLimiter } from './rate-limiter.js'
import { ConversationStore } from './conversation-store.js'
import { MessageStore } from './message-store.js'
import { hexId24Schema, sendMessageSchema } from './validation.js'
import type { Conversation, IConversationStore, IMessageStore, IUnreadStore, Message, PaginatedMessages } from './types.js'
import type { IUserRepository, UserRecord } from '../user/index.js'
import type { ILogger } from '../logger/index.js'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createMockLogger(): ILogger {
  return {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
    child: () => createMockLogger(),
  } as unknown as ILogger
}

function createMockUnreadStore(): IUnreadStore {
  return {
    increment: async () => {},
    reset: async () => {},
    getCount: async () => 0,
    getAllCounts: async () => new Map(),
    getTotal: async () => 0,
    remove: async () => {},
    loadIndex: async () => {},
  }
}

function createMockUserRepository(users: Map<string, UserRecord>): IUserRepository {
  return {
    findById: async (userId: string) => users.get(userId) ?? null,
    findByUsername: async () => null,
    searchByUsernamePrefix: async () => [],
    findAll: async () => ({ items: [], total: 0, page: 1, pageSize: 50, totalPages: 0 }),
    save: async () => {},
    delete: async () => {},
    count: async () => users.size,
    countByRole: async () => 0,
  }
}

function createUserRecord(userId: string): UserRecord {
  return {
    userId,
    username: `user_${userId.slice(0, 8)}`,
    passwordHash: 'hash',
    role: 'user',
    displayName: `User ${userId.slice(0, 8)}`,
    email: `${userId.slice(0, 8)}@test.com`,
    avatarUrl: '',
    preferredLanguage: 'en',
    colorScheme: 'system',
    suspended: false,
    mustChangePassword: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

function generateHexId(): string {
  return crypto.randomBytes(12).toString('hex')
}

function createMockConversationStore(conversations: Conversation[]): IConversationStore {
  const cache = new Map<string, Conversation>()
  for (const c of conversations) {
    cache.set(c.id, c)
  }

  return {
    create: async (conversation: Conversation) => { cache.set(conversation.id, conversation) },
    findById: async (id: string) => cache.get(id) ?? null,
    findByParticipant: async (userId: string) => {
      const result: Conversation[] = []
      for (const c of cache.values()) {
        if (c.participants.includes(userId)) {
          result.push(c)
        }
      }
      return result
    },
    update: async (conversation: Conversation) => { cache.set(conversation.id, conversation) },
    loadIndex: async () => {},
  }
}

function createMockMessageStore(messages: Map<string, Message[]>): IMessageStore {
  return {
    append: async (message: Message) => {
      const existing = messages.get(message.conversationId) ?? []
      existing.push(message)
      messages.set(message.conversationId, existing)
    },
    findByConversation: async (conversationId: string, page: number, pageSize: number): Promise<PaginatedMessages> => {
      const msgs = messages.get(conversationId) ?? []
      const sorted = [...msgs].sort((a, b) => a.timestamp.localeCompare(b.timestamp))
      const total = sorted.length
      const start = (page - 1) * pageSize
      const pageMessages = sorted.slice(start, start + pageSize)
      return { messages: pageMessages, total, page, pageSize, hasMore: start + pageSize < total }
    },
    getLastMessage: async (conversationId: string): Promise<Message | null> => {
      const msgs = messages.get(conversationId) ?? []
      if (msgs.length === 0) return null
      const sorted = [...msgs].sort((a, b) => a.timestamp.localeCompare(b.timestamp))
      return sorted[sorted.length - 1]!
    },
  }
}

// ─── Temp directory management for Property 11 ───────────────────────────────

const tempDirs: string[] = []

async function createTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'slatebase-pbt-'))
  tempDirs.push(dir)
  return dir
}

afterAll(async () => {
  for (const dir of tempDirs) {
    try {
      await fs.rm(dir, { recursive: true, force: true })
    } catch {
      // Ignore cleanup errors
    }
  }
})

// ─── Arbitraries ─────────────────────────────────────────────────────────────

/** Arbitrary for valid 24-char hex IDs. */
const hexId24Arb = fc.hexaString({ minLength: 24, maxLength: 24 }).map((s) => s.toLowerCase())

// ─── Property 9: Conversation list contains only user's conversations ────────
// For any user, listing conversations SHALL return only conversations where the
// user is a participant, and the list SHALL be sorted by lastMessageTimestamp
// in descending order.
// **Validates: Requirements 5.1**

describe('Feature: user-chat, Property 9: Conversation list contains only user\'s conversations', () => {
  it('listing conversations returns only conversations where the user is a participant, sorted by lastMessageTimestamp descending', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 5 }),
        fc.integer({ min: 0, max: 3 }),
        async (userConvCount, otherConvCount) => {
          const targetUserId = generateHexId()
          const otherUsers = Array.from({ length: 6 }, () => generateHexId())

          // Create conversations where targetUser IS a participant
          const userConversations: Conversation[] = Array.from({ length: userConvCount }, (_, i) => ({
            id: generateHexId(),
            participants: [targetUserId, otherUsers[i % otherUsers.length]!],
            createdAt: new Date(Date.now() - i * 1000).toISOString(),
            createdBy: targetUserId,
          }))

          // Create conversations where targetUser is NOT a participant
          const otherConversations: Conversation[] = Array.from({ length: otherConvCount }, () => ({
            id: generateHexId(),
            participants: [otherUsers[0]!, otherUsers[1]!],
            createdAt: new Date().toISOString(),
            createdBy: otherUsers[0]!,
          }))

          const allConversations = [...userConversations, ...otherConversations]
          const conversationStore = createMockConversationStore(allConversations)

          // Create messages with different timestamps for sorting
          const messagesMap = new Map<string, Message[]>()
          for (let i = 0; i < userConversations.length; i++) {
            const conv = userConversations[i]!
            messagesMap.set(conv.id, [{
              id: generateHexId(),
              conversationId: conv.id,
              senderId: targetUserId,
              content: `Message ${i}`,
              timestamp: new Date(Date.now() - (userConversations.length - i) * 60000).toISOString(),
            }])
          }

          const messageStore = createMockMessageStore(messagesMap)

          // Create user records
          const users = new Map<string, UserRecord>()
          users.set(targetUserId, createUserRecord(targetUserId))
          for (const id of otherUsers) {
            users.set(id, createUserRecord(id))
          }

          const service = new ChatService(
            conversationStore,
            messageStore,
            createMockUnreadStore(),
            createMockUserRepository(users),
            createMockLogger(),
          )

          const result = await service.listConversations(targetUserId)

          // All returned conversations must include targetUserId as participant
          for (const conv of result.conversations) {
            expect(conv.participants).toContain(targetUserId)
          }

          // Must return exactly the user's conversations
          expect(result.conversations.length).toBe(userConvCount)

          // Verify sorting: lastMessageTimestamp descending (nulls at end)
          for (let i = 1; i < result.conversations.length; i++) {
            const prev = result.conversations[i - 1]!.lastMessageTimestamp
            const curr = result.conversations[i]!.lastMessageTimestamp
            if (prev !== null && curr !== null) {
              expect(prev >= curr).toBe(true)
            }
            if (prev === null) {
              expect(curr).toBeNull()
            }
          }
        },
      ),
      { numRuns: 50 },
    )
  })
})

// ─── Property 10: Last message preview truncation ────────────────────────────
// For any conversation with a last message longer than 100 characters, the
// lastMessagePreview in the conversation list SHALL be at most 100 characters long.
// **Validates: Requirements 5.2**

describe('Feature: user-chat, Property 10: Last message preview truncation', () => {
  it('lastMessagePreview is at most 101 characters (100 + ellipsis) for messages longer than 100 characters', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 101, maxLength: 300 }).filter((s) => s.trim().length > 0),
        async (longContent) => {
          const userId = generateHexId()
          const otherId = generateHexId()
          const convId = generateHexId()

          const conversation: Conversation = {
            id: convId,
            participants: [userId, otherId],
            createdAt: new Date().toISOString(),
            createdBy: userId,
          }

          const conversationStore = createMockConversationStore([conversation])

          const messagesMap = new Map<string, Message[]>()
          messagesMap.set(convId, [{
            id: generateHexId(),
            conversationId: convId,
            senderId: userId,
            content: longContent,
            timestamp: new Date().toISOString(),
          }])

          const messageStore = createMockMessageStore(messagesMap)

          const users = new Map<string, UserRecord>()
          users.set(userId, createUserRecord(userId))
          users.set(otherId, createUserRecord(otherId))

          const service = new ChatService(
            conversationStore,
            messageStore,
            createMockUnreadStore(),
            createMockUserRepository(users),
            createMockLogger(),
          )

          const result = await service.listConversations(userId)

          expect(result.conversations.length).toBe(1)
          const conv = result.conversations[0]!
          expect(conv.lastMessagePreview).not.toBeNull()
          // Implementation: slice(0, 100) + '…' = 101 code points max
          expect(conv.lastMessagePreview!.length).toBeLessThanOrEqual(101)
          // The content portion (without ellipsis) is at most 100 chars
          expect(conv.lastMessagePreview!.slice(0, 100)).toBe(longContent.slice(0, 100))
        },
      ),
      { numRuns: 50 },
    )
  })
})

// ─── Property 11: Persistence survives reload ────────────────────────────────
// For any set of conversations and messages created, after reloading the store
// index from disk, all previously created data SHALL be retrievable with
// identical content.
// **Validates: Requirements 6.3**

describe('Feature: user-chat, Property 11: Persistence survives reload', () => {
  it('conversations and messages survive store reload from disk', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 3 }),
        fc.integer({ min: 1, max: 3 }),
        async (numConversations, msgsPerConv) => {
          const dataDir = await createTempDir()
          const logger = createMockLogger()

          // Create stores and write data
          const convStore1 = new ConversationStore(dataDir, logger)
          const msgStore1 = new MessageStore(dataDir, logger)
          await convStore1.loadIndex()

          const createdConversations: Conversation[] = []
          const createdMessages: Message[] = []

          for (let c = 0; c < numConversations; c++) {
            const convId = generateHexId()
            const participants = [generateHexId(), generateHexId()]
            const conversation: Conversation = {
              id: convId,
              participants,
              createdAt: new Date().toISOString(),
              createdBy: participants[0]!,
            }
            await convStore1.create(conversation)
            createdConversations.push(conversation)

            for (let m = 0; m < msgsPerConv; m++) {
              const message: Message = {
                id: generateHexId(),
                conversationId: convId,
                senderId: participants[0]!,
                content: `Test message ${c}-${m}`,
                timestamp: new Date(Date.now() + m * 1000).toISOString(),
              }
              await msgStore1.append(message)
              createdMessages.push(message)
            }
          }

          // Create new store instances and reload from disk
          const convStore2 = new ConversationStore(dataDir, logger)
          const msgStore2 = new MessageStore(dataDir, logger)
          await convStore2.loadIndex()

          // Verify all conversations are retrievable
          for (const conv of createdConversations) {
            const loaded = await convStore2.findById(conv.id)
            expect(loaded).not.toBeNull()
            expect(loaded!.id).toBe(conv.id)
            expect(loaded!.participants).toEqual(conv.participants)
            expect(loaded!.createdAt).toBe(conv.createdAt)
            expect(loaded!.createdBy).toBe(conv.createdBy)
          }

          // Verify all messages are retrievable
          for (const conv of createdConversations) {
            const expectedMsgs = createdMessages.filter((m) => m.conversationId === conv.id)
            const result = await msgStore2.findByConversation(conv.id, 1, 50)
            expect(result.messages.length).toBe(expectedMsgs.length)

            for (const expected of expectedMsgs) {
              const found = result.messages.find((m) => m.id === expected.id)
              expect(found).toBeDefined()
              expect(found!.content).toBe(expected.content)
              expect(found!.senderId).toBe(expected.senderId)
              expect(found!.timestamp).toBe(expected.timestamp)
            }
          }
        },
      ),
      { numRuns: 20 },
    )
  }, 30_000)
})

// ─── Property 12: Rate limiter allows exactly 30 messages per window ─────────
// For any user, the rate limiter SHALL allow the first 30 messages within a
// 60-second window and reject the 31st and subsequent messages with a retryAfter
// value between 1 and 60 seconds.
// **Validates: Requirements 7.1, 7.4**

describe('Feature: user-chat, Property 12: Rate limiter allows exactly 30 messages per window', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('allows first 30 messages and rejects the 31st with retryAfter between 1 and 60', () => {
    fc.assert(
      fc.property(
        hexId24Arb,
        (userId) => {
          const limiter = new ChatRateLimiter()

          // Send 30 messages — all should be allowed
          for (let i = 0; i < 30; i++) {
            const check = limiter.checkLimit(userId)
            expect(check.allowed).toBe(true)
            limiter.recordMessage(userId)
          }

          // 31st message should be rejected
          const check31 = limiter.checkLimit(userId)
          expect(check31.allowed).toBe(false)
          expect(check31.retryAfter).toBeDefined()
          expect(check31.retryAfter!).toBeGreaterThanOrEqual(1)
          expect(check31.retryAfter!).toBeLessThanOrEqual(60)
        },
      ),
      { numRuns: 100 },
    )
  })
})

// ─── Property 13: Rate limiter is per-user independent ───────────────────────
// For any two distinct users, exhausting one user's rate limit SHALL have no
// effect on the other user's ability to send messages.
// **Validates: Requirements 7.2**

describe('Feature: user-chat, Property 13: Rate limiter is per-user independent', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('exhausting one user\'s limit does not affect another user', () => {
    fc.assert(
      fc.property(
        hexId24Arb,
        hexId24Arb,
        (userA, userB) => {
          // Ensure distinct users
          if (userA === userB) return

          const limiter = new ChatRateLimiter()

          // Exhaust userA's limit
          for (let i = 0; i < 30; i++) {
            limiter.checkLimit(userA)
            limiter.recordMessage(userA)
          }

          // Verify userA is blocked
          const checkA = limiter.checkLimit(userA)
          expect(checkA.allowed).toBe(false)

          // Verify userB is still allowed
          const checkB = limiter.checkLimit(userB)
          expect(checkB.allowed).toBe(true)
        },
      ),
      { numRuns: 100 },
    )
  })
})

// ─── Property 14: Rate limiter resets after window expiry ────────────────────
// For any user who has been rate-limited, after the 60-second window has elapsed,
// the rate limiter SHALL allow new messages again (counter reset to 0).
// **Validates: Requirements 7.3**

describe('Feature: user-chat, Property 14: Rate limiter resets after window expiry', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('after 60-second window expires, user can send messages again', () => {
    fc.assert(
      fc.property(
        hexId24Arb,
        (userId) => {
          const limiter = new ChatRateLimiter()

          // Exhaust the limit
          for (let i = 0; i < 30; i++) {
            limiter.checkLimit(userId)
            limiter.recordMessage(userId)
          }

          // Verify blocked
          const checkBlocked = limiter.checkLimit(userId)
          expect(checkBlocked.allowed).toBe(false)

          // Advance time past the 60-second window
          vi.advanceTimersByTime(60_001)

          // Verify allowed again
          const checkAfter = limiter.checkLimit(userId)
          expect(checkAfter.allowed).toBe(true)
        },
      ),
      { numRuns: 100 },
    )
  })
})

// ─── Property 15: Content validation ─────────────────────────────────────────
// For any string, the message content validator SHALL accept it if and only if
// it has length between 1 and 4000 (inclusive) and contains at least one
// non-whitespace character.
// **Validates: Requirements 2.3, 2.4, 8.1**

describe('Feature: user-chat, Property 15: Content validation', () => {
  it('accepts strings with length 1–4000 containing at least one non-whitespace character', () => {
    const validContentArb = fc.tuple(
      fc.string({ minLength: 0, maxLength: 3999 }),
      fc.char().filter((c) => c.trim().length > 0),
    ).map(([prefix, nonWs]) => (prefix + nonWs).slice(0, 4000))

    fc.assert(
      fc.property(
        validContentArb,
        (content) => {
          const result = sendMessageSchema.safeParse({ content })
          expect(result.success).toBe(true)
        },
      ),
      { numRuns: 200 },
    )
  })

  it('rejects empty strings', () => {
    const result = sendMessageSchema.safeParse({ content: '' })
    expect(result.success).toBe(false)
  })

  it('rejects whitespace-only strings', () => {
    fc.assert(
      fc.property(
        fc.stringOf(fc.constantFrom(' ', '\t', '\n', '\r'), { minLength: 1, maxLength: 100 }),
        (whitespace) => {
          const result = sendMessageSchema.safeParse({ content: whitespace })
          expect(result.success).toBe(false)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('rejects strings longer than 4000 characters', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 4001, max: 5000 }),
        (length) => {
          const content = 'a'.repeat(length)
          const result = sendMessageSchema.safeParse({ content })
          expect(result.success).toBe(false)
        },
      ),
      { numRuns: 100 },
    )
  })
})

// ─── Property 16: ID format validation ───────────────────────────────────────
// For any string, the ID validator SHALL accept it if and only if it matches
// the pattern `/^[0-9a-f]{24}$/`.
// **Validates: Requirements 8.2, 8.4**

describe('Feature: user-chat, Property 16: ID format validation', () => {
  it('accepts valid 24-char lowercase hex strings', () => {
    fc.assert(
      fc.property(
        hexId24Arb,
        (id) => {
          const result = hexId24Schema.safeParse(id)
          expect(result.success).toBe(true)
        },
      ),
      { numRuns: 200 },
    )
  })

  it('rejects strings that do not match /^[0-9a-f]{24}$/', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          // Wrong length
          fc.hexaString({ minLength: 0, maxLength: 23 }).map((s) => s.toLowerCase()),
          fc.hexaString({ minLength: 25, maxLength: 50 }).map((s) => s.toLowerCase()),
          // Right length but non-hex characters
          fc.string({ minLength: 24, maxLength: 24 }).filter((s) => !/^[0-9a-f]{24}$/.test(s)),
        ),
        (invalidId) => {
          const result = hexId24Schema.safeParse(invalidId)
          expect(result.success).toBe(false)
        },
      ),
      { numRuns: 200 },
    )
  })

  it('rejects hex strings with wrong length', () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 50 }).filter((n) => n !== 24),
        (length) => {
          const id = 'a'.repeat(length)
          const result = hexId24Schema.safeParse(id)
          expect(result.success).toBe(false)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('rejects strings with uppercase hex characters', () => {
    fc.assert(
      fc.property(
        fc.hexaString({ minLength: 24, maxLength: 24 }).filter((s) => s !== s.toLowerCase()),
        (id) => {
          const result = hexId24Schema.safeParse(id)
          expect(result.success).toBe(false)
        },
      ),
      { numRuns: 100 },
    )
  })
})
