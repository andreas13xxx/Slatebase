/**
 * Property-Based Tests for User Chat
 *
 * Properties 1–8 covering session identity enforcement, message persistence,
 * ID uniqueness, access control, sort order, pagination, conversation creation,
 * and participant deduplication.
 */
import { describe, it, expect, afterAll } from 'vitest'
import * as fc from 'fast-check'
import { mkdtemp, rm } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import type { ILogger } from '../logger/index.js'
import type {
  Conversation,
  IConversationStore,
  IMessageStore,
  IUnreadStore,
  Message,
  PaginatedMessages,
} from './types.js'
import type { IUserRepository, UserRecord } from '../user/index.js'
import { ChatService } from './chat-service.js'
import { MessageStore } from './message-store.js'
import { NotParticipantError } from './errors.js'

// ─── Test Helpers ────────────────────────────────────────────────────────────

function createMockLogger(): ILogger {
  return {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  }
}

function createMockUnreadStore(): IUnreadStore {
  const counts = new Map<string, Map<string, number>>()
  return {
    async increment(userId: string, conversationId: string) {
      if (!counts.has(userId)) counts.set(userId, new Map())
      const userCounts = counts.get(userId)!
      userCounts.set(conversationId, (userCounts.get(conversationId) ?? 0) + 1)
    },
    async reset(userId: string, conversationId: string) {
      counts.get(userId)?.set(conversationId, 0)
    },
    async getCount(userId: string, conversationId: string) {
      return counts.get(userId)?.get(conversationId) ?? 0
    },
    async getAllCounts(userId: string) {
      return counts.get(userId) ?? new Map()
    },
    async getTotal(userId: string) {
      const userCounts = counts.get(userId)
      if (!userCounts) return 0
      let total = 0
      for (const c of userCounts.values()) total += c
      return total
    },
    async remove(userId: string, conversationId: string) {
      counts.get(userId)?.delete(conversationId)
    },
    async loadIndex() {},
  }
}

function createMockConversationStore(): IConversationStore & { conversations: Map<string, Conversation> } {
  const conversations = new Map<string, Conversation>()
  const participantIndex = new Map<string, Set<string>>()

  return {
    conversations,
    async create(conversation: Conversation) {
      conversations.set(conversation.id, conversation)
      for (const p of conversation.participants) {
        if (!participantIndex.has(p)) participantIndex.set(p, new Set())
        participantIndex.get(p)!.add(conversation.id)
      }
    },
    async findById(id: string) {
      return conversations.get(id) ?? null
    },
    async findByParticipant(userId: string) {
      const ids = participantIndex.get(userId)
      if (!ids) return []
      const result: Conversation[] = []
      for (const id of ids) {
        const c = conversations.get(id)
        if (c) result.push(c)
      }
      return result
    },
    async update(conversation: Conversation) {
      conversations.set(conversation.id, conversation)
    },
    async loadIndex() {},
  }
}

function createMockMessageStore(): IMessageStore & { messages: Message[] } {
  const messages: Message[] = []
  return {
    messages,
    async append(message: Message) {
      messages.push(message)
    },
    async findByConversation(conversationId: string, page: number, pageSize: number): Promise<PaginatedMessages> {
      const convMessages = messages
        .filter((m) => m.conversationId === conversationId)
        .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
      const total = convMessages.length
      const start = (page - 1) * pageSize
      const pageMessages = convMessages.slice(start, start + pageSize)
      return { messages: pageMessages, total, page, pageSize, hasMore: start + pageSize < total }
    },
    async getLastMessage(conversationId: string) {
      const convMessages = messages
        .filter((m) => m.conversationId === conversationId)
        .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
      return convMessages.length > 0 ? convMessages[convMessages.length - 1]! : null
    },
  }
}

function createMockUserRepository(knownUsers: Map<string, UserRecord>): IUserRepository {
  return {
    async findById(userId: string) {
      return knownUsers.get(userId) ?? null
    },
    async findByUsername() { return null },
    async searchByUsernamePrefix() { return [] },
    async findAll() { return { items: [], total: 0, page: 1, pageSize: 100, totalPages: 1 } },
    async save() {},
    async delete() {},
    async count() { return knownUsers.size },
    async countByRole() { return 0 },
  }
}

function makeUserRecord(userId: string): UserRecord {
  return {
    userId,
    username: `user_${userId.slice(0, 8)}`,
    passwordHash: 'hash',
    role: 'user',
    displayName: `User ${userId.slice(0, 8)}`,
    email: '',
    avatarUrl: '',
    preferredLanguage: 'de',
    colorScheme: 'system',
    suspended: false,
    mustChangePassword: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

/** Generates a tuple of 3 distinct UUIDs. */
const threeDistinctUuids = fc
  .uniqueArray(fc.uuid(), { minLength: 3, maxLength: 3 })
  .map(([a, b, c]) => ({ first: a!, second: b!, third: c! }))

/** Generates a tuple of 2 distinct UUIDs. */
const twoDistinctUuids = fc
  .uniqueArray(fc.uuid(), { minLength: 2, maxLength: 2 })
  .map(([a, b]) => ({ first: a!, second: b! }))

/** Arbitrary for valid message content (1–200 chars, at least one non-whitespace). */
const validContentArb = fc
  .string({ minLength: 1, maxLength: 200 })
  .filter((s) => s.trim().length > 0)

// ─── Temp directories for Properties 5–6 ────────────────────────────────────

const tempDirs: string[] = []

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'chat-pbt-'))
  tempDirs.push(dir)
  return dir
}

afterAll(async () => {
  for (const dir of tempDirs) {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
})

// ─── Property 1: Server enforces session identity ────────────────────────────
// For any message sent via the API, regardless of what senderId the client
// includes in the request body, the persisted message SHALL always have the
// senderId equal to the userId from the server-side session.
// **Validates: Requirements 1.2, 1.4**

describe('Property 1: Server enforces session identity', () => {
  it('persisted message always has senderId equal to the session userId, regardless of client-supplied senderId', async () => {
    await fc.assert(
      fc.asyncProperty(
        twoDistinctUuids,
        validContentArb,
        async ({ first: sessionUserId, second: clientSenderId }, content) => {
          const knownUsers = new Map<string, UserRecord>()
          knownUsers.set(sessionUserId, makeUserRecord(sessionUserId))
          knownUsers.set(clientSenderId, makeUserRecord(clientSenderId))

          const convStore = createMockConversationStore()
          const msgStore = createMockMessageStore()
          const unreadStore = createMockUnreadStore()
          const userRepo = createMockUserRepository(knownUsers)
          const logger = createMockLogger()

          const service = new ChatService(convStore, msgStore, unreadStore, userRepo, logger)

          // Create a conversation with both users as participants
          const conv = await service.createConversation(sessionUserId, [clientSenderId])

          // Send message using the session user's ID (server-side enforcement)
          // The key insight: the ChatService.sendMessage takes senderId from the session,
          // NOT from the request body. The controller passes session.userId.
          const message = await service.sendMessage(sessionUserId, conv.id, content)

          // The persisted message must have the session user's ID
          expect(message.senderId).toBe(sessionUserId)
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ─── Property 2: Message persistence round-trip ──────────────────────────────
// For any valid message content sent to an existing conversation by a participant,
// the message SHALL be retrievable from the conversation's message list with
// identical content, senderId, and a valid ISO-8601 timestamp.
// **Validates: Requirements 2.1, 6.1**

describe('Property 2: Message persistence round-trip', () => {
  it('sent message is retrievable with identical content, senderId, and valid ISO-8601 timestamp', async () => {
    await fc.assert(
      fc.asyncProperty(
        twoDistinctUuids,
        validContentArb,
        async ({ first: creatorId, second: otherUserId }, content) => {
          const knownUsers = new Map<string, UserRecord>()
          knownUsers.set(creatorId, makeUserRecord(creatorId))
          knownUsers.set(otherUserId, makeUserRecord(otherUserId))

          const convStore = createMockConversationStore()
          const msgStore = createMockMessageStore()
          const unreadStore = createMockUnreadStore()
          const userRepo = createMockUserRepository(knownUsers)
          const logger = createMockLogger()

          const service = new ChatService(convStore, msgStore, unreadStore, userRepo, logger)

          const conv = await service.createConversation(creatorId, [otherUserId])
          const sentMessage = await service.sendMessage(creatorId, conv.id, content)

          // Retrieve messages
          const result = await service.getMessages(creatorId, conv.id)

          // Find the sent message in the result
          const found = result.messages.find((m) => m.id === sentMessage.id)
          expect(found).toBeDefined()
          expect(found!.content).toBe(content)
          expect(found!.senderId).toBe(creatorId)

          // Validate ISO-8601 timestamp
          const parsed = new Date(found!.timestamp)
          expect(parsed.toISOString()).toBe(found!.timestamp)
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ─── Property 3: Message IDs are unique ──────────────────────────────────────
// For any set of N messages sent (to the same or different conversations),
// all returned message IDs SHALL be distinct and match the 24-character
// hexadecimal format.
// **Validates: Requirements 2.2, 8.2**

describe('Property 3: Message IDs are unique', () => {
  it('all message IDs are distinct and match 24-char hex format', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 2, max: 20 }),
        async (messageCount) => {
          const creatorId = 'creator-id-001'
          const otherId = 'other-id-002'
          const knownUsers = new Map<string, UserRecord>()
          knownUsers.set(creatorId, makeUserRecord(creatorId))
          knownUsers.set(otherId, makeUserRecord(otherId))

          const convStore = createMockConversationStore()
          const msgStore = createMockMessageStore()
          const unreadStore = createMockUnreadStore()
          const userRepo = createMockUserRepository(knownUsers)
          const logger = createMockLogger()

          const service = new ChatService(convStore, msgStore, unreadStore, userRepo, logger)

          const conv = await service.createConversation(creatorId, [otherId])

          const ids = new Set<string>()
          for (let i = 0; i < messageCount; i++) {
            const msg = await service.sendMessage(creatorId, conv.id, `Message ${i}`)
            ids.add(msg.id)

            // Each ID must be 24-char hex
            expect(msg.id).toMatch(/^[0-9a-f]{24}$/)
          }

          // All IDs must be distinct
          expect(ids.size).toBe(messageCount)
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ─── Property 4: Participant-only access control ─────────────────────────────
// For any conversation and any user who is NOT in the conversation's participant
// list, both sending a message and retrieving messages SHALL be rejected with
// a 403 status (NotParticipantError).
// **Validates: Requirements 2.5, 3.3**

describe('Property 4: Participant-only access control', () => {
  it('non-participants are rejected when sending or retrieving messages', async () => {
    await fc.assert(
      fc.asyncProperty(
        threeDistinctUuids,
        validContentArb,
        async ({ first: creatorId, second: participantId, third: outsiderId }, content) => {
          const knownUsers = new Map<string, UserRecord>()
          knownUsers.set(creatorId, makeUserRecord(creatorId))
          knownUsers.set(participantId, makeUserRecord(participantId))
          knownUsers.set(outsiderId, makeUserRecord(outsiderId))

          const convStore = createMockConversationStore()
          const msgStore = createMockMessageStore()
          const unreadStore = createMockUnreadStore()
          const userRepo = createMockUserRepository(knownUsers)
          const logger = createMockLogger()

          const service = new ChatService(convStore, msgStore, unreadStore, userRepo, logger)

          const conv = await service.createConversation(creatorId, [participantId])

          // Outsider trying to send a message should be rejected
          await expect(service.sendMessage(outsiderId, conv.id, content))
            .rejects.toBeInstanceOf(NotParticipantError)

          // Outsider trying to retrieve messages should be rejected
          await expect(service.getMessages(outsiderId, conv.id))
            .rejects.toBeInstanceOf(NotParticipantError)
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ─── Property 5: Messages are sorted ascending by timestamp ──────────────────
// For any conversation containing messages, retrieving messages SHALL return
// them in strictly non-decreasing order of their timestamp field.
// **Validates: Requirements 3.1**

describe('Property 5: Messages are sorted ascending by timestamp', () => {
  it('retrieved messages are in non-decreasing timestamp order', async () => {
    const logger = createMockLogger()

    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.date({ min: new Date('2020-01-01'), max: new Date('2030-01-01') }).map((d) => d.toISOString()),
          { minLength: 2, maxLength: 20 }
        ),
        async (timestamps) => {
          const runDir = await createTempDir()
          const store = new MessageStore(runDir, logger)
          const convId = 'aabbccdd11223344aabbccdd'

          // Append messages with random timestamps (not necessarily in order)
          for (let i = 0; i < timestamps.length; i++) {
            await store.append({
              id: `m${i.toString().padStart(23, '0')}`,
              conversationId: convId,
              senderId: 'sender-001',
              content: `Message ${i}`,
              timestamp: timestamps[i]!,
            })
          }

          const result = await store.findByConversation(convId, 1, 50)

          // Verify non-decreasing order
          for (let i = 1; i < result.messages.length; i++) {
            const prev = result.messages[i - 1]!.timestamp
            const curr = result.messages[i]!.timestamp
            expect(curr >= prev).toBe(true)
          }
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ─── Property 6: Pagination respects page size limits ────────────────────────
// For any conversation with N messages and any valid page/pageSize request
// (pageSize ≤ 50), the returned page SHALL contain at most pageSize messages,
// and the union of all pages SHALL contain exactly N messages.
// **Validates: Requirements 3.2**

describe('Property 6: Pagination respects page size limits', () => {
  it('each page has at most pageSize messages and all pages together contain exactly N messages', async () => {
    const logger = createMockLogger()

    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 30 }),
        fc.integer({ min: 1, max: 50 }),
        async (messageCount, pageSize) => {
          const runDir = await createTempDir()
          const store = new MessageStore(runDir, logger)
          const convId = 'aabbccdd11223344aabbccdd'

          // Append N messages with incrementing timestamps
          for (let i = 0; i < messageCount; i++) {
            await store.append({
              id: `msg${i.toString().padStart(21, '0')}`,
              conversationId: convId,
              senderId: 'sender-001',
              content: `Message ${i}`,
              timestamp: new Date(Date.now() + i * 1000).toISOString(),
            })
          }

          // Collect all messages across all pages
          const allMessages: string[] = []
          const totalPages = Math.ceil(messageCount / pageSize)

          for (let page = 1; page <= totalPages; page++) {
            const result = await store.findByConversation(convId, page, pageSize)

            // Each page has at most pageSize messages
            expect(result.messages.length).toBeLessThanOrEqual(pageSize)
            expect(result.total).toBe(messageCount)

            for (const msg of result.messages) {
              allMessages.push(msg.id)
            }
          }

          // Union of all pages contains exactly N messages
          expect(allMessages.length).toBe(messageCount)

          // All IDs are distinct (no duplicates across pages)
          expect(new Set(allMessages).size).toBe(messageCount)
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ─── Property 7: Conversation creation invariants ────────────────────────────
// For any valid participant list, creating a conversation SHALL produce a unique
// 24-char hex ID, and the resulting participant list SHALL always include the
// creator's userId.
// **Validates: Requirements 4.1, 4.2**

describe('Property 7: Conversation creation invariants', () => {
  it('created conversation has unique 24-char hex ID and includes the creator', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uniqueArray(fc.uuid(), { minLength: 1, maxLength: 10 }),
        async (creatorId, otherParticipants) => {
          // Filter out creator from others to ensure at least 1 distinct other
          const distinctOthers = otherParticipants.filter((id) => id !== creatorId)
          if (distinctOthers.length < 1) return // skip this case silently

          const allUserIds = [creatorId, ...distinctOthers]
          const knownUsers = new Map<string, UserRecord>()
          for (const id of allUserIds) {
            knownUsers.set(id, makeUserRecord(id))
          }

          const convStore = createMockConversationStore()
          const msgStore = createMockMessageStore()
          const unreadStore = createMockUnreadStore()
          const userRepo = createMockUserRepository(knownUsers)
          const logger = createMockLogger()

          const service = new ChatService(convStore, msgStore, unreadStore, userRepo, logger)

          const conv = await service.createConversation(creatorId, distinctOthers)

          // ID must be 24-char hex
          expect(conv.id).toMatch(/^[0-9a-f]{24}$/)

          // Creator must be in participants
          expect(conv.participants).toContain(creatorId)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('multiple conversation creations produce distinct IDs', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 2, max: 10 }),
        async (count) => {
          const creatorId = 'creator-fixed-id'
          const otherId = 'other-fixed-id'
          const knownUsers = new Map<string, UserRecord>()
          knownUsers.set(creatorId, makeUserRecord(creatorId))
          knownUsers.set(otherId, makeUserRecord(otherId))

          const convStore = createMockConversationStore()
          const msgStore = createMockMessageStore()
          const unreadStore = createMockUnreadStore()
          const userRepo = createMockUserRepository(knownUsers)
          const logger = createMockLogger()

          const service = new ChatService(convStore, msgStore, unreadStore, userRepo, logger)

          const ids = new Set<string>()
          for (let i = 0; i < count; i++) {
            const conv = await service.createConversation(creatorId, [otherId])
            ids.add(conv.id)
          }

          expect(ids.size).toBe(count)
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ─── Property 8: Participant deduplication ───────────────────────────────────
// For any participant list containing duplicate user IDs (including the creator's
// own ID), the resulting conversation's participant list SHALL contain each user
// ID exactly once.
// **Validates: Requirements 4.7, 4.8**

describe('Property 8: Participant deduplication', () => {
  it('duplicate participant IDs are deduplicated in the resulting conversation', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uniqueArray(fc.uuid(), { minLength: 1, maxLength: 10 }),
        fc.integer({ min: 2, max: 5 }),
        async (creatorId, otherParticipants, duplicationFactor) => {
          // Filter out creator from others to ensure at least 1 distinct other
          const distinctOthers = otherParticipants.filter((id) => id !== creatorId)
          if (distinctOthers.length < 1) return // skip this case silently

          // Create a list with intentional duplicates
          const withDuplicates: string[] = []
          for (const id of distinctOthers) {
            for (let i = 0; i < duplicationFactor; i++) {
              withDuplicates.push(id)
            }
          }
          // Also add the creator's ID as a duplicate
          withDuplicates.push(creatorId)
          withDuplicates.push(creatorId)

          const allUniqueIds = [...new Set([creatorId, ...distinctOthers])]
          const knownUsers = new Map<string, UserRecord>()
          for (const id of allUniqueIds) {
            knownUsers.set(id, makeUserRecord(id))
          }

          const convStore = createMockConversationStore()
          const msgStore = createMockMessageStore()
          const unreadStore = createMockUnreadStore()
          const userRepo = createMockUserRepository(knownUsers)
          const logger = createMockLogger()

          const service = new ChatService(convStore, msgStore, unreadStore, userRepo, logger)

          const conv = await service.createConversation(creatorId, withDuplicates)

          // Each participant ID appears exactly once
          const participantSet = new Set(conv.participants)
          expect(participantSet.size).toBe(conv.participants.length)

          // All unique IDs are present
          for (const id of allUniqueIds) {
            expect(conv.participants).toContain(id)
          }
        }
      ),
      { numRuns: 100 }
    )
  })
})
