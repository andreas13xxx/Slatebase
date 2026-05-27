// UnreadStore — Persistent per-user, per-conversation unread message counts

import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import type { ILogger } from '../logger/index.js'
import type { IUnreadStore } from './types.js'

// --- File format ---

interface UnreadFile {
  counts: Record<string, number>
}

// --- Implementation ---

export class UnreadStore implements IUnreadStore {
  private readonly unreadDir: string
  private index: Map<string, Map<string, number>> = new Map()
  private initialized = false

  constructor(
    dataDir: string,
    private readonly logger: ILogger,
  ) {
    this.unreadDir = path.join(dataDir, 'chat', 'unread')
  }

  /**
   * Ensures the unread directory exists.
   * Called lazily on first write or during loadIndex.
   */
  private async ensureDirectory(): Promise<void> {
    if (this.initialized) return
    await fs.mkdir(this.unreadDir, { recursive: true })
    this.initialized = true
  }

  /**
   * Load all unread data from disk into the in-memory index.
   * Skips corrupt or unreadable files with error logging.
   */
  async loadIndex(): Promise<void> {
    await this.ensureDirectory()

    this.index.clear()

    let files: string[]
    try {
      files = await fs.readdir(this.unreadDir)
    } catch (error: unknown) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        return
      }
      throw error
    }

    for (const file of files) {
      if (!file.endsWith('.json')) continue

      const filePath = path.join(this.unreadDir, file)
      try {
        const raw = await fs.readFile(filePath, 'utf-8')
        const data: UnreadFile = JSON.parse(raw)

        if (!data.counts || typeof data.counts !== 'object') {
          this.logger.warn('Skipping invalid unread file', { file })
          continue
        }

        const userId = file.replace('.json', '')
        const userCounts = new Map<string, number>()

        for (const [conversationId, count] of Object.entries(data.counts)) {
          if (typeof count === 'number' && count >= 0) {
            userCounts.set(conversationId, count)
          }
        }

        if (userCounts.size > 0) {
          this.index.set(userId, userCounts)
        }
      } catch (error: unknown) {
        this.logger.error('Failed to load unread file, skipping', { file, error: String(error) })
      }
    }

    this.logger.info('Unread index loaded', { userCount: this.index.size })
  }

  /**
   * Increment unread count for a user in a conversation by 1.
   */
  async increment(userId: string, conversationId: string): Promise<void> {
    let userCounts = this.index.get(userId)
    if (!userCounts) {
      userCounts = new Map()
      this.index.set(userId, userCounts)
    }

    const current = userCounts.get(conversationId) ?? 0
    userCounts.set(conversationId, current + 1)

    await this.persist(userId)
  }

  /**
   * Reset unread count for a user in a conversation to 0.
   */
  async reset(userId: string, conversationId: string): Promise<void> {
    const userCounts = this.index.get(userId)
    if (!userCounts) return

    userCounts.set(conversationId, 0)
    await this.persist(userId)
  }

  /**
   * Get unread count for a user in a specific conversation.
   */
  async getCount(userId: string, conversationId: string): Promise<number> {
    const userCounts = this.index.get(userId)
    if (!userCounts) return 0
    return userCounts.get(conversationId) ?? 0
  }

  /**
   * Get all unread counts for a user (conversationId → count).
   */
  async getAllCounts(userId: string): Promise<Map<string, number>> {
    const userCounts = this.index.get(userId)
    if (!userCounts) return new Map()
    return new Map(userCounts)
  }

  /**
   * Get total unread count across all conversations for a user.
   */
  async getTotal(userId: string): Promise<number> {
    const userCounts = this.index.get(userId)
    if (!userCounts) return 0

    let total = 0
    for (const count of userCounts.values()) {
      total += count
    }
    return total
  }

  /**
   * Remove unread entry for a user in a conversation (when leaving).
   */
  async remove(userId: string, conversationId: string): Promise<void> {
    const userCounts = this.index.get(userId)
    if (!userCounts) return

    userCounts.delete(conversationId)

    if (userCounts.size === 0) {
      this.index.delete(userId)
      // Remove the file entirely if no counts remain
      await this.deleteFile(userId)
    } else {
      await this.persist(userId)
    }
  }

  /**
   * Persist unread counts for a user to disk using atomic write (temp → rename).
   */
  private async persist(userId: string): Promise<void> {
    await this.ensureDirectory()

    const userCounts = this.index.get(userId)
    if (!userCounts || userCounts.size === 0) {
      await this.deleteFile(userId)
      return
    }

    const counts: Record<string, number> = {}
    for (const [conversationId, count] of userCounts) {
      counts[conversationId] = count
    }

    const data: UnreadFile = { counts }
    const filePath = path.join(this.unreadDir, `${userId}.json`)
    const tempPath = `${filePath}.${crypto.randomBytes(8).toString('hex')}.tmp`
    const content = JSON.stringify(data, null, 2)

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
  }

  /**
   * Delete the unread file for a user (when all entries are removed).
   */
  private async deleteFile(userId: string): Promise<void> {
    const filePath = path.join(this.unreadDir, `${userId}.json`)
    try {
      await fs.unlink(filePath)
    } catch (error: unknown) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        return // File already doesn't exist
      }
      throw error
    }
  }
}

// --- Helpers ---

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error
}
