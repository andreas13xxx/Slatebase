// Chat Integration Tests — Full lifecycle through ChatService with real filesystem stores
// Tests: create conversation → send message → retrieve messages → list conversations
// Uses real ConversationStore, MessageStore, UnreadStore with temp directories

import { describe, it, expect, afterAll } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

import { ConversationStore } from './conversation-store.js'
import { MessageStore } from './message-store.js'
import { UnreadStore } from './unread-store.js'
import { ChatService } from './chat-service.js'
import { ChatRateLimiter } from './rate-limiter.js'
import { ConversationNotFoundError, NotParticipantError } from './errors.js'
import type { ILogger } from '../logger/index.js'
import type { IUserRepository, UserRecord } from '../user/index.js'

// ─── Silent Logger ───────────────────────────────────────────────────────────

const silentLogger: ILogger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
}

// ─── Mock User Repository ────────────────────────────────────────────────────

function createMockUserRepository(users: Map<string, UserRecord>): IUserRepository {
  return {
    async findById(userId: string) {
      return users.get(userId) ?? null
    },
    async findByUsername() {
      return null
    },
    async searchByUsernamePrefix() {
      return []
    },
    async findAll() {
      return { items: [], total: 0, page: 1, pageSize: 100, totalPages: 0 }
    },
    async save() {},
    async delete() {},
    async count() {
      return users.size
    },
    async countByRole() {
      return 0
    },
  }
}

// ─── Test Users ──────────────────────────────────────────────────────────────

const now = new Date().toISOString()

const userAlice: UserRecord = {
  userId: 'user-alice-001',
  username: 'alice',
  passwordHash: 'hash',
  role: 'user',
  displayName: 'Alice',
  email: 'alice@example.com',
  avatarUrl: '',
  preferredLanguage: 'de',
  colorScheme: 'system',
  suspended: false,
  mustChangePassword: false,
  createdAt: now,
  updatedAt: now,
}

const userBob: UserRecord = {
  userId: 'user-bob-002',
  username: 'bob',
  passwordHash: 'hash',
  role: 'user',
  displayName: 'Bob',
  email: 'bob@example.com',
  avatarUrl: '',
  preferredLanguage: 'en',
  colorScheme: 'system',
  suspended: false,
  mustChangePassword: false,
  createdAt: now,
  updatedAt: now,
}

const userCharlie: UserRecord = {
  userId: 'user-charlie-003',
  username: 'charlie',
  passwordHash: 'hash',
  role: 'user',
  displayName: 'Charlie',
  email: 'charlie@example.com',
  avatarUrl: '',
  preferredLanguage: 'de',
  colorScheme: 'system',
  suspended: false,
  mustChangePassword: false,
  createdAt: now,
  updatedAt: now,
}

const users = new Map<string, UserRecord>([
  [userAlice.userId, userAlice],
  [userBob.userId, userBob],
  [userCharlie.userId, userCharlie],
])

// ─── Test Setup ──────────────────────────────────────────────────────────────

let tempDir: string
let conversationStore: ConversationStore
let messageStore: MessageStore
let unreadStore: UnreadStore
let chatService: ChatService
let rateLimiter: ChatRateLimiter
let userRepository: IUserRepository

async function setup() {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'slatebase-chat-integration-'))
  conversationStore = new ConversationStore(tempDir, silentLogger)
  messageStore = new MessageStore(tempDir, silentLogger)
  unreadStore = new UnreadStore(tempDir, silentLogger)
  rateLimiter = new ChatRateLimiter()
  userRepository = createMockUserRepository(users)

  await conversationStore.loadIndex()
  await unreadStore.loadIndex()

  chatService = new ChatService(conversationStore, messageStore, unreadStore, userRepository, silentLogger)
}

const setupPromise = setup()

afterAll(async () => {
  await setupPromise
  if (tempDir) {
    await fs.rm(tempDir, { recursive: true, force: true })
  }
})

// ─── Integration Tests ───────────────────────────────────────────────────────

describe('Chat Integration: Full Lifecycle', () => {
  let conversationId: string

  it('creates a conversation with multiple participants', async () => {
    await setupPromise

    const conversation = await chatService.createConversation(userAlice.userId, [
      userAlice.userId,
      userBob.userId,
      userCharlie.userId,
    ])

    expect(conversation.id).toMatch(/^[0-9a-f]{24}$/)
    expect(conversation.participants).toContain(userAlice.userId)
    expect(conversation.participants).toContain(userBob.userId)
    expect(conversation.participants).toContain(userCharlie.userId)
    expect(conversation.createdBy).toBe(userAlice.userId)
    expect(conversation.createdAt).toBeTruthy()

    conversationId = conversation.id
  })

  it('sends messages from different participants', async () => {
    await setupPromise

    const msg1 = await chatService.sendMessage(userAlice.userId, conversationId, 'Hello everyone!')
    expect(msg1.id).toMatch(/^[0-9a-f]{24}$/)
    expect(msg1.conversationId).toBe(conversationId)
    expect(msg1.senderId).toBe(userAlice.userId)
    expect(msg1.content).toBe('Hello everyone!')
    expect(msg1.timestamp).toBeTruthy()

    const msg2 = await chatService.sendMessage(userBob.userId, conversationId, 'Hi Alice!')
    expect(msg2.senderId).toBe(userBob.userId)
    expect(msg2.content).toBe('Hi Alice!')

    const msg3 = await chatService.sendMessage(userCharlie.userId, conversationId, 'Hey team!')
    expect(msg3.senderId).toBe(userCharlie.userId)
    expect(msg3.content).toBe('Hey team!')

    // Verify message IDs are unique
    const ids = new Set([msg1.id, msg2.id, msg3.id])
    expect(ids.size).toBe(3)
  })

  it('retrieves messages with correct content and ascending order', async () => {
    await setupPromise

    const result = await chatService.getMessages(userAlice.userId, conversationId)

    expect(result.messages.length).toBe(3)
    expect(result.total).toBe(3)
    expect(result.page).toBe(1)
    expect(result.pageSize).toBe(50)
    expect(result.hasMore).toBe(false)

    // Verify ascending order by timestamp
    for (let i = 1; i < result.messages.length; i++) {
      const prev = result.messages[i - 1]!
      const curr = result.messages[i]!
      expect(prev.timestamp <= curr.timestamp).toBe(true)
    }

    // Verify content
    expect(result.messages[0]!.content).toBe('Hello everyone!')
    expect(result.messages[1]!.content).toBe('Hi Alice!')
    expect(result.messages[2]!.content).toBe('Hey team!')
  })

  it('lists conversations with correct sorting and preview', async () => {
    await setupPromise

    const result = await chatService.listConversations(userAlice.userId)

    expect(result.conversations.length).toBe(1)
    expect(result.total).toBe(1)
    expect(result.conversations[0]!.id).toBe(conversationId)
    expect(result.conversations[0]!.lastMessagePreview).toBe('Hey team!')
    expect(result.conversations[0]!.lastMessageTimestamp).toBeTruthy()
    expect(result.conversations[0]!.participantNames).toContain('Alice')
    expect(result.conversations[0]!.participantNames).toContain('Bob')
    expect(result.conversations[0]!.participantNames).toContain('Charlie')
  })

  it('truncates long message previews to 100 characters', async () => {
    await setupPromise

    // Create a second conversation with a long message
    const conv2 = await chatService.createConversation(userAlice.userId, [userBob.userId])
    const longContent = 'A'.repeat(150)
    await chatService.sendMessage(userAlice.userId, conv2.id, longContent)

    const result = await chatService.listConversations(userAlice.userId)
    const conv2Item = result.conversations.find((c) => c.id === conv2.id)

    expect(conv2Item).toBeDefined()
    expect(conv2Item!.lastMessagePreview!.length).toBeLessThanOrEqual(101) // 100 chars + ellipsis character
    expect(conv2Item!.lastMessagePreview!.endsWith('\u2026')).toBe(true)
  })

  it('sorts conversations by lastMessageTimestamp descending', async () => {
    await setupPromise

    const result = await chatService.listConversations(userAlice.userId)

    // Should have at least 2 conversations
    expect(result.conversations.length).toBeGreaterThanOrEqual(2)

    // Verify descending order
    for (let i = 1; i < result.conversations.length; i++) {
      const prev = result.conversations[i - 1]!
      const curr = result.conversations[i]!
      if (prev.lastMessageTimestamp && curr.lastMessageTimestamp) {
        expect(prev.lastMessageTimestamp >= curr.lastMessageTimestamp).toBe(true)
      }
    }
  })
})

describe('Chat Integration: Persistence Across Store Reload', () => {
  let conversationId: string

  it('data persists after reloading store indexes from disk', async () => {
    await setupPromise

    // Create a conversation and send a message
    const conversation = await chatService.createConversation(userAlice.userId, [userBob.userId])
    conversationId = conversation.id
    await chatService.sendMessage(userAlice.userId, conversationId, 'Persistence test message')

    // Reload the conversation store from disk (simulates server restart)
    await conversationStore.loadIndex()

    // Verify conversation is still accessible
    const reloadedConv = await conversationStore.findById(conversationId)
    expect(reloadedConv).not.toBeNull()
    expect(reloadedConv!.id).toBe(conversationId)
    expect(reloadedConv!.participants).toContain(userAlice.userId)
    expect(reloadedConv!.participants).toContain(userBob.userId)

    // Verify messages are still accessible
    const messages = await chatService.getMessages(userAlice.userId, conversationId)
    expect(messages.messages.length).toBe(1)
    expect(messages.messages[0]!.content).toBe('Persistence test message')
  })

  it('participant index is rebuilt correctly after reload', async () => {
    await setupPromise

    // Reload
    await conversationStore.loadIndex()

    // findByParticipant should still work
    const aliceConversations = await conversationStore.findByParticipant(userAlice.userId)
    expect(aliceConversations.length).toBeGreaterThan(0)

    const found = aliceConversations.find((c) => c.id === conversationId)
    expect(found).toBeDefined()
  })
})

describe('Chat Integration: Error Responses', () => {
  it('returns 403 (NotParticipantError) when non-participant tries to read messages', async () => {
    await setupPromise

    // Create a conversation between Alice and Bob only
    const conversation = await chatService.createConversation(userAlice.userId, [userBob.userId])

    // Charlie is not a participant — should get NotParticipantError
    await expect(
      chatService.getMessages(userCharlie.userId, conversation.id),
    ).rejects.toThrow(NotParticipantError)
  })

  it('returns 403 (NotParticipantError) when non-participant tries to send a message', async () => {
    await setupPromise

    const conversation = await chatService.createConversation(userAlice.userId, [userBob.userId])

    await expect(
      chatService.sendMessage(userCharlie.userId, conversation.id, 'Intruder!'),
    ).rejects.toThrow(NotParticipantError)
  })

  it('returns 404 (ConversationNotFoundError) for non-existent conversation', async () => {
    await setupPromise

    const fakeId = 'aabbccddee112233aabbccdd'

    await expect(
      chatService.getMessages(userAlice.userId, fakeId),
    ).rejects.toThrow(ConversationNotFoundError)

    await expect(
      chatService.sendMessage(userAlice.userId, fakeId, 'Hello?'),
    ).rejects.toThrow(ConversationNotFoundError)
  })

  it('returns 429 equivalent when rate limit is exceeded (30 messages per 60s)', async () => {
    await setupPromise

    const conversation = await chatService.createConversation(userAlice.userId, [userBob.userId])
    const senderId = userAlice.userId

    // Send 30 messages (should all be allowed)
    for (let i = 0; i < 30; i++) {
      const check = rateLimiter.checkLimit(senderId)
      expect(check.allowed).toBe(true)
      rateLimiter.recordMessage(senderId)
    }

    // 31st message should be rejected
    const check31 = rateLimiter.checkLimit(senderId)
    expect(check31.allowed).toBe(false)
    expect(check31.retryAfter).toBeGreaterThan(0)
    expect(check31.retryAfter).toBeLessThanOrEqual(60)

    // Verify the conversation still works for Bob (per-user independence)
    const bobCheck = rateLimiter.checkLimit(userBob.userId)
    expect(bobCheck.allowed).toBe(true)

    // Suppress unused variable warning — conversation is needed to set up the test context
    expect(conversation.id).toBeTruthy()
  })
})

describe('Chat Integration: Pagination', () => {
  it('paginates messages correctly', async () => {
    await setupPromise

    // Create a conversation and send many messages
    const conversation = await chatService.createConversation(userAlice.userId, [userBob.userId])

    // Send 55 messages to test pagination (page size is 50)
    for (let i = 0; i < 55; i++) {
      await chatService.sendMessage(userAlice.userId, conversation.id, `Message ${i + 1}`)
    }

    // Page 1: should have 50 messages
    const page1 = await chatService.getMessages(userAlice.userId, conversation.id, 1)
    expect(page1.messages.length).toBe(50)
    expect(page1.total).toBe(55)
    expect(page1.hasMore).toBe(true)
    expect(page1.page).toBe(1)

    // Page 2: should have 5 messages
    const page2 = await messageStore.findByConversation(conversation.id, 2, 50)
    expect(page2.messages.length).toBe(5)
    expect(page2.total).toBe(55)
    expect(page2.hasMore).toBe(false)
    expect(page2.page).toBe(2)
  })
})

describe('Chat Integration: Conversation Creation Validation', () => {
  it('deduplicates participant IDs', async () => {
    await setupPromise

    const conversation = await chatService.createConversation(userAlice.userId, [
      userBob.userId,
      userBob.userId,
      userAlice.userId,
    ])

    // Should have exactly 2 unique participants
    expect(conversation.participants.length).toBe(2)
    expect(new Set(conversation.participants).size).toBe(2)
  })

  it('always includes creator in participants', async () => {
    await setupPromise

    // Creator not in the list — should be added automatically
    const conversation = await chatService.createConversation(userAlice.userId, [userBob.userId])

    expect(conversation.participants).toContain(userAlice.userId)
    expect(conversation.participants).toContain(userBob.userId)
  })

  it('rejects conversation with too few participants', async () => {
    await setupPromise

    // Only the creator — after dedup, only 1 participant
    await expect(
      chatService.createConversation(userAlice.userId, [userAlice.userId]),
    ).rejects.toThrow('at least 2 participants')
  })
})
