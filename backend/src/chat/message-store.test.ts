import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { mkdir, rm, readFile } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { MessageStore } from './message-store.js'
import type { ILogger } from '../logger/index.js'
import type { Message } from './types.js'

// ─── Test Helpers ────────────────────────────────────────────────────────────

function createMockLogger(): ILogger & { warnings: Array<{ message: string; meta: object | undefined }> } {
  const warnings: Array<{ message: string; meta: object | undefined }> = []
  return {
    warnings,
    debug() {},
    info() {},
    warn(message: string, meta?: object) {
      warnings.push({ message, meta })
    },
    error() {},
  }
}

function createMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: crypto.randomBytes(12).toString('hex'),
    conversationId: 'aabbccddee112233aabbccdd',
    senderId: 'user-1',
    content: 'Hello, world!',
    timestamp: new Date().toISOString(),
    ...overrides,
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('MessageStore', () => {
  let tempDir: string
  let logger: ReturnType<typeof createMockLogger>
  let store: MessageStore

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `slatebase-msg-test-${crypto.randomBytes(8).toString('hex')}`)
    await mkdir(tempDir, { recursive: true })
    logger = createMockLogger()
    store = new MessageStore(tempDir, logger)
  })

  afterAll(async () => {
    // Clean up all temp directories created during tests
    try {
      await rm(path.join(os.tmpdir()), { recursive: true, force: true })
    } catch {
      // Ignore cleanup errors
    }
  })

  describe('append()', () => {
    it('should create a new JSONL file for the first message', async () => {
      const msg = createMessage()
      await store.append(msg)

      const filePath = path.join(tempDir, 'chat', 'messages', `${msg.conversationId}.jsonl`)
      const content = await readFile(filePath, 'utf-8')
      const parsed = JSON.parse(content.trim()) as Message

      expect(parsed.id).toBe(msg.id)
      expect(parsed.content).toBe(msg.content)
      expect(parsed.senderId).toBe(msg.senderId)
    })

    it('should append to an existing JSONL file', async () => {
      const convId = 'aabbccddee112233aabbccdd'
      const msg1 = createMessage({ conversationId: convId, content: 'First' })
      const msg2 = createMessage({ conversationId: convId, content: 'Second' })

      await store.append(msg1)
      await store.append(msg2)

      const filePath = path.join(tempDir, 'chat', 'messages', `${convId}.jsonl`)
      const content = await readFile(filePath, 'utf-8')
      const lines = content.trim().split('\n')

      expect(lines).toHaveLength(2)
      expect(JSON.parse(lines[0]!)).toMatchObject({ content: 'First' })
      expect(JSON.parse(lines[1]!)).toMatchObject({ content: 'Second' })
    })

    it('should update lastMessageCache after append', async () => {
      const msg = createMessage()
      await store.append(msg)

      const lastMsg = await store.getLastMessage(msg.conversationId)
      expect(lastMsg).toEqual(msg)
    })

    it('should auto-create the messages directory', async () => {
      const msg = createMessage()
      await store.append(msg)

      const filePath = path.join(tempDir, 'chat', 'messages', `${msg.conversationId}.jsonl`)
      const content = await readFile(filePath, 'utf-8')
      expect(content.trim()).not.toBe('')
    })
  })

  describe('findByConversation()', () => {
    it('should return empty result if file does not exist', async () => {
      const result = await store.findByConversation('nonexistent000000000000', 1, 50)

      expect(result.messages).toEqual([])
      expect(result.total).toBe(0)
      expect(result.page).toBe(1)
      expect(result.pageSize).toBe(50)
      expect(result.hasMore).toBe(false)
    })

    it('should return messages sorted ascending by timestamp', async () => {
      const convId = 'aabbccddee112233aabbccdd'
      const msg1 = createMessage({ conversationId: convId, timestamp: '2025-01-15T10:00:00.000Z', content: 'First' })
      const msg3 = createMessage({ conversationId: convId, timestamp: '2025-01-15T12:00:00.000Z', content: 'Third' })
      const msg2 = createMessage({ conversationId: convId, timestamp: '2025-01-15T11:00:00.000Z', content: 'Second' })

      // Append out of order
      await store.append(msg1)
      await store.append(msg3)
      await store.append(msg2)

      const result = await store.findByConversation(convId, 1, 50)

      expect(result.messages).toHaveLength(3)
      expect(result.messages[0]!.content).toBe('First')
      expect(result.messages[1]!.content).toBe('Second')
      expect(result.messages[2]!.content).toBe('Third')
    })

    it('should apply pagination correctly', async () => {
      const convId = 'aabbccddee112233aabbccdd'
      const messages: Message[] = []
      for (let i = 0; i < 5; i++) {
        messages.push(createMessage({
          conversationId: convId,
          timestamp: `2025-01-15T10:0${i}:00.000Z`,
          content: `Message ${i}`,
        }))
      }

      for (const msg of messages) {
        await store.append(msg)
      }

      // Page 1, pageSize 2
      const page1 = await store.findByConversation(convId, 1, 2)
      expect(page1.messages).toHaveLength(2)
      expect(page1.total).toBe(5)
      expect(page1.page).toBe(1)
      expect(page1.pageSize).toBe(2)
      expect(page1.hasMore).toBe(true)
      expect(page1.messages[0]!.content).toBe('Message 0')
      expect(page1.messages[1]!.content).toBe('Message 1')

      // Page 2, pageSize 2
      const page2 = await store.findByConversation(convId, 2, 2)
      expect(page2.messages).toHaveLength(2)
      expect(page2.hasMore).toBe(true)
      expect(page2.messages[0]!.content).toBe('Message 2')
      expect(page2.messages[1]!.content).toBe('Message 3')

      // Page 3, pageSize 2
      const page3 = await store.findByConversation(convId, 3, 2)
      expect(page3.messages).toHaveLength(1)
      expect(page3.hasMore).toBe(false)
      expect(page3.messages[0]!.content).toBe('Message 4')
    })

    it('should skip corrupt lines and log a warning', async () => {
      const convId = 'aabbccddee112233aabbccdd'
      const msg = createMessage({ conversationId: convId })

      await store.append(msg)

      // Manually corrupt the file by appending invalid JSON
      const { appendFile: appendFileFs } = await import('node:fs/promises')
      const filePath = path.join(tempDir, 'chat', 'messages', `${convId}.jsonl`)
      await appendFileFs(filePath, 'this is not valid json\n', 'utf-8')

      const result = await store.findByConversation(convId, 1, 50)

      expect(result.messages).toHaveLength(1)
      expect(result.messages[0]!.id).toBe(msg.id)
      expect(logger.warnings).toHaveLength(1)
      expect(logger.warnings[0]!.message).toContain('corrupt')
    })
  })

  describe('getLastMessage()', () => {
    it('should return null if file does not exist', async () => {
      const result = await store.getLastMessage('nonexistent000000000000')
      expect(result).toBeNull()
    })

    it('should return the last message from cache', async () => {
      const convId = 'aabbccddee112233aabbccdd'
      const msg1 = createMessage({ conversationId: convId, timestamp: '2025-01-15T10:00:00.000Z' })
      const msg2 = createMessage({ conversationId: convId, timestamp: '2025-01-15T11:00:00.000Z' })

      await store.append(msg1)
      await store.append(msg2)

      const result = await store.getLastMessage(convId)
      expect(result).toEqual(msg2)
    })

    it('should read from file on cache miss', async () => {
      const convId = 'aabbccddee112233aabbccdd'
      const msg1 = createMessage({ conversationId: convId, timestamp: '2025-01-15T10:00:00.000Z' })
      const msg2 = createMessage({ conversationId: convId, timestamp: '2025-01-15T11:00:00.000Z' })

      await store.append(msg1)
      await store.append(msg2)

      // Create a new store instance (no cache)
      const freshStore = new MessageStore(tempDir, logger)
      const result = await freshStore.getLastMessage(convId)

      expect(result).toEqual(msg2)
    })

    it('should return null for empty file', async () => {
      // Create an empty file
      const convId = 'aabbccddee112233aabbccdd'
      const { writeFile: writeFileFs } = await import('node:fs/promises')
      const messagesDir = path.join(tempDir, 'chat', 'messages')
      await mkdir(messagesDir, { recursive: true })
      await writeFileFs(path.join(messagesDir, `${convId}.jsonl`), '', 'utf-8')

      const freshStore = new MessageStore(tempDir, logger)
      const result = await freshStore.getLastMessage(convId)

      expect(result).toBeNull()
    })
  })
})
