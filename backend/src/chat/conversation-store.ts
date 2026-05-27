// ConversationStore — Persistent conversation metadata stored as individual JSON files

import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import type { ILogger } from '../logger/index.js'
import type { Conversation, IConversationStore } from './types.js'

// --- Implementation ---

export class ConversationStore implements IConversationStore {
  private readonly conversationsDir: string
  private participantIndex: Map<string, Set<string>> = new Map()
  private conversationCache: Map<string, Conversation> = new Map()
  private initialized = false

  constructor(
    dataDir: string,
    private readonly logger: ILogger,
  ) {
    this.conversationsDir = path.join(dataDir, 'chat', 'conversations')
  }

  /**
   * Ensures the conversations directory exists.
   * Called lazily on first access.
   */
  private async ensureDirectory(): Promise<void> {
    if (this.initialized) return
    await fs.mkdir(this.conversationsDir, { recursive: true })
    this.initialized = true
  }

  /**
   * Load all conversations from disk into the in-memory index.
   * Skips corrupt or unreadable files with error logging.
   */
  async loadIndex(): Promise<void> {
    await this.ensureDirectory()

    this.participantIndex.clear()
    this.conversationCache.clear()

    let files: string[]
    try {
      files = await fs.readdir(this.conversationsDir)
    } catch (error: unknown) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        return
      }
      throw error
    }

    for (const file of files) {
      if (!file.endsWith('.json')) continue

      const filePath = path.join(this.conversationsDir, file)
      try {
        const raw = await fs.readFile(filePath, 'utf-8')
        const conversation: Conversation = JSON.parse(raw)

        if (!conversation.id || !Array.isArray(conversation.participants)) {
          this.logger.warn('Skipping invalid conversation file', { file })
          continue
        }

        this.conversationCache.set(conversation.id, conversation)
        this.indexParticipants(conversation)
      } catch (error: unknown) {
        this.logger.error('Failed to load conversation file, skipping', { file, error: String(error) })
      }
    }

    this.logger.info('Conversation index loaded', { count: this.conversationCache.size })
  }

  /**
   * Create a new conversation with atomic write (temp → rename).
   * Updates the in-memory index after successful persistence.
   */
  async create(conversation: Conversation): Promise<void> {
    await this.ensureDirectory()

    const filePath = path.join(this.conversationsDir, `${conversation.id}.json`)
    const tempPath = `${filePath}.${crypto.randomBytes(8).toString('hex')}.tmp`
    const content = JSON.stringify(conversation, null, 2)

    await fs.writeFile(tempPath, content, 'utf-8')

    try {
      await fs.rename(tempPath, filePath)
    } catch (renameError) {
      try {
        await fs.unlink(tempPath)
      } catch {
        // Ignore cleanup errors
      }
      throw renameError
    }

    this.conversationCache.set(conversation.id, conversation)
    this.indexParticipants(conversation)
  }

  /**
   * Update an existing conversation with atomic write (temp → rename).
   * Diffs old vs new participants to update the participantIndex correctly.
   */
  async update(conversation: Conversation): Promise<void> {
    await this.ensureDirectory()

    const oldConversation = this.conversationCache.get(conversation.id)
    const filePath = path.join(this.conversationsDir, `${conversation.id}.json`)
    const tempPath = `${filePath}.${crypto.randomBytes(8).toString('hex')}.tmp`
    const content = JSON.stringify(conversation, null, 2)

    await fs.writeFile(tempPath, content, 'utf-8')

    try {
      await fs.rename(tempPath, filePath)
    } catch (renameError) {
      try {
        await fs.unlink(tempPath)
      } catch {
        // Ignore cleanup errors
      }
      throw renameError
    }

    // Remove conversation from old participants' index entries
    if (oldConversation) {
      for (const participantId of oldConversation.participants) {
        const set = this.participantIndex.get(participantId)
        if (set) {
          set.delete(conversation.id)
          if (set.size === 0) {
            this.participantIndex.delete(participantId)
          }
        }
      }
    }

    // Update in-memory cache
    this.conversationCache.set(conversation.id, conversation)

    // Add conversation to new participants' index entries
    this.indexParticipants(conversation)
  }

  /**
   * Find a conversation by ID from the in-memory cache.
   * Returns null if not found.
   */
  async findById(id: string): Promise<Conversation | null> {
    return this.conversationCache.get(id) ?? null
  }

  /**
   * Find all conversations where userId is a participant.
   * Uses the participantIndex for fast lookup.
   */
  async findByParticipant(userId: string): Promise<Conversation[]> {
    const conversationIds = this.participantIndex.get(userId)
    if (!conversationIds) return []

    const conversations: Conversation[] = []
    for (const id of conversationIds) {
      const conversation = this.conversationCache.get(id)
      if (conversation) {
        conversations.push(conversation)
      }
    }
    return conversations
  }

  /**
   * Adds a conversation's participants to the participantIndex.
   */
  private indexParticipants(conversation: Conversation): void {
    for (const participantId of conversation.participants) {
      let set = this.participantIndex.get(participantId)
      if (!set) {
        set = new Set()
        this.participantIndex.set(participantId, set)
      }
      set.add(conversation.id)
    }
  }
}

// --- Helpers ---

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error
}
