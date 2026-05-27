import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { ConversationStore } from './conversation-store.js'
import type { Conversation } from './types.js'
import type { ILogger } from '../logger/index.js'

// --- Mock Logger ---

function createMockLogger(): ILogger & { warnings: string[]; errors: string[]; infos: string[] } {
  const warnings: string[] = []
  const errors: string[] = []
  const infos: string[] = []
  return {
    warnings,
    errors,
    infos,
    debug() {},
    info(msg: string) { infos.push(msg) },
    warn(msg: string) { warnings.push(msg) },
    error(msg: string) { errors.push(msg) },
  }
}

// --- Test Helpers ---

function makeConversation(overrides?: Partial<Conversation>): Conversation {
  return {
    id: 'a1b2c3d4e5f6a1b2c3d4e5f6',
    participants: ['user1', 'user2'],
    createdAt: '2025-01-15T10:30:00.000Z',
    createdBy: 'user1',
    ...overrides,
  }
}

// --- Tests ---

describe('ConversationStore', () => {
  let tmpDir: string
  let store: ConversationStore
  let logger: ReturnType<typeof createMockLogger>

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'conv-store-test-'))
    logger = createMockLogger()
    store = new ConversationStore(tmpDir, logger)
  })

  afterAll(async () => {
    // Cleanup is best-effort
    try {
      await fs.rm(tmpDir, { recursive: true, force: true })
    } catch {
      // Ignore
    }
  })

  describe('loadIndex', () => {
    it('should create the conversations directory if missing', async () => {
      await store.loadIndex()
      const stat = await fs.stat(path.join(tmpDir, 'chat', 'conversations'))
      expect(stat.isDirectory()).toBe(true)
    })

    it('should load conversations from disk', async () => {
      const conv = makeConversation()
      const convDir = path.join(tmpDir, 'chat', 'conversations')
      await fs.mkdir(convDir, { recursive: true })
      await fs.writeFile(path.join(convDir, `${conv.id}.json`), JSON.stringify(conv))

      await store.loadIndex()

      const result = await store.findById(conv.id)
      expect(result).toEqual(conv)
    })

    it('should skip corrupt JSON files and log error', async () => {
      const convDir = path.join(tmpDir, 'chat', 'conversations')
      await fs.mkdir(convDir, { recursive: true })
      await fs.writeFile(path.join(convDir, 'corrupt.json'), '{invalid json')

      await store.loadIndex()

      expect(logger.errors.length).toBe(1)
      expect(logger.errors[0]).toContain('Failed to load conversation file')
    })

    it('should skip files with missing required fields', async () => {
      const convDir = path.join(tmpDir, 'chat', 'conversations')
      await fs.mkdir(convDir, { recursive: true })
      await fs.writeFile(path.join(convDir, 'bad.json'), JSON.stringify({ name: 'no id' }))

      await store.loadIndex()

      expect(logger.warnings.length).toBe(1)
      expect(logger.warnings[0]).toContain('Skipping invalid conversation file')
    })

    it('should skip non-json files', async () => {
      const convDir = path.join(tmpDir, 'chat', 'conversations')
      await fs.mkdir(convDir, { recursive: true })
      await fs.writeFile(path.join(convDir, 'readme.txt'), 'not a conversation')

      await store.loadIndex()

      expect(await store.findById('anything')).toBeNull()
    })

    it('should populate participant index', async () => {
      const conv = makeConversation({ participants: ['userA', 'userB'] })
      const convDir = path.join(tmpDir, 'chat', 'conversations')
      await fs.mkdir(convDir, { recursive: true })
      await fs.writeFile(path.join(convDir, `${conv.id}.json`), JSON.stringify(conv))

      await store.loadIndex()

      const resultA = await store.findByParticipant('userA')
      const resultB = await store.findByParticipant('userB')
      expect(resultA).toHaveLength(1)
      expect(resultB).toHaveLength(1)
      expect(resultA[0]).toEqual(conv)
    })
  })

  describe('create', () => {
    it('should persist conversation to disk as JSON', async () => {
      const conv = makeConversation()
      await store.create(conv)

      const filePath = path.join(tmpDir, 'chat', 'conversations', `${conv.id}.json`)
      const raw = await fs.readFile(filePath, 'utf-8')
      const persisted = JSON.parse(raw)
      expect(persisted).toEqual(conv)
    })

    it('should update in-memory cache after create', async () => {
      const conv = makeConversation()
      await store.create(conv)

      const result = await store.findById(conv.id)
      expect(result).toEqual(conv)
    })

    it('should update participant index after create', async () => {
      const conv = makeConversation({ participants: ['alice', 'bob'] })
      await store.create(conv)

      const aliceConvs = await store.findByParticipant('alice')
      const bobConvs = await store.findByParticipant('bob')
      expect(aliceConvs).toHaveLength(1)
      expect(bobConvs).toHaveLength(1)
    })

    it('should create directory if it does not exist', async () => {
      const conv = makeConversation()
      await store.create(conv)

      const stat = await fs.stat(path.join(tmpDir, 'chat', 'conversations'))
      expect(stat.isDirectory()).toBe(true)
    })
  })

  describe('findById', () => {
    it('should return null for non-existent conversation', async () => {
      await store.loadIndex()
      const result = await store.findById('nonexistent000000000000')
      expect(result).toBeNull()
    })

    it('should return conversation from cache', async () => {
      const conv = makeConversation()
      await store.create(conv)

      const result = await store.findById(conv.id)
      expect(result).toEqual(conv)
    })
  })

  describe('findByParticipant', () => {
    it('should return empty array for user with no conversations', async () => {
      await store.loadIndex()
      const result = await store.findByParticipant('unknown-user')
      expect(result).toEqual([])
    })

    it('should return all conversations for a participant', async () => {
      const conv1 = makeConversation({ id: 'conv1conv1conv1conv1conv1', participants: ['user1', 'user2'] })
      const conv2 = makeConversation({ id: 'conv2conv2conv2conv2conv2', participants: ['user1', 'user3'] })
      const conv3 = makeConversation({ id: 'conv3conv3conv3conv3conv3', participants: ['user2', 'user3'] })

      await store.create(conv1)
      await store.create(conv2)
      await store.create(conv3)

      const user1Convs = await store.findByParticipant('user1')
      expect(user1Convs).toHaveLength(2)
      expect(user1Convs.map((c) => c.id).sort()).toEqual(['conv1conv1conv1conv1conv1', 'conv2conv2conv2conv2conv2'])

      const user3Convs = await store.findByParticipant('user3')
      expect(user3Convs).toHaveLength(2)
    })
  })

  describe('persistence round-trip', () => {
    it('should survive reload from disk', async () => {
      const conv = makeConversation()
      await store.create(conv)

      // Create a new store instance pointing to the same directory
      const store2 = new ConversationStore(tmpDir, logger)
      await store2.loadIndex()

      const result = await store2.findById(conv.id)
      expect(result).toEqual(conv)

      const byParticipant = await store2.findByParticipant('user1')
      expect(byParticipant).toHaveLength(1)
      expect(byParticipant[0]).toEqual(conv)
    })
  })
})
