import { mkdir, appendFile, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import type { ILogger } from '../logger/index.js'
import type { IMessageStore, Message, PaginatedMessages } from './types.js'

// ─── MessageStore ────────────────────────────────────────────────────────────

/**
 * Filesystem-based message store using JSONL (one file per conversation).
 * Messages are appended one per line. Supports pagination and last-message caching.
 */
export class MessageStore implements IMessageStore {
  private readonly messagesDir: string
  private readonly lastMessageCache: Map<string, Message> = new Map()
  private dirEnsured = false

  /**
   * Creates a new MessageStore instance.
   * @param dataDir - Base data directory (e.g., `data/`). Messages are stored under `<dataDir>/chat/messages/`.
   * @param logger - Logger instance for warnings and errors.
   */
  constructor(dataDir: string, private readonly logger: ILogger) {
    this.messagesDir = path.join(dataDir, 'chat', 'messages')
  }

  /**
   * Append a message to a conversation's JSONL file.
   * Uses atomic write (temp → rename) for new files, appendFile for existing files.
   * Updates the lastMessageCache after successful write.
   */
  async append(message: Message): Promise<void> {
    await this.ensureDirectory()

    const filePath = this.getFilePath(message.conversationId)
    const line = JSON.stringify(message) + '\n'

    let fileExists = true
    try {
      await readFile(filePath, { flag: 'r' })
    } catch {
      fileExists = false
    }

    if (fileExists) {
      await appendFile(filePath, line, 'utf-8')
    } else {
      // Atomic write for new files: write to temp, then rename
      const tempPath = `${filePath}.${crypto.randomBytes(8).toString('hex')}.tmp`
      await writeFile(tempPath, line, 'utf-8')
      try {
        await rename(tempPath, filePath)
      } catch (err: unknown) {
        const code = (err as NodeJS.ErrnoException).code
        if (code === 'EPERM' || code === 'EACCES') {
          try { await unlink(filePath) } catch { /* may not exist */ }
          try {
            await rename(tempPath, filePath)
          } catch {
            await writeFile(filePath, line, 'utf-8')
            try { await unlink(tempPath) } catch { /* cleanup */ }
          }
        } else {
          try { await unlink(tempPath) } catch { /* ignore */ }
          throw err
        }
      }
    }

    this.lastMessageCache.set(message.conversationId, message)
  }

  /**
   * Read messages for a conversation with pagination (ascending by timestamp).
   * Skips corrupt lines with a warning log. Returns empty result if file doesn't exist.
   */
  async findByConversation(conversationId: string, page: number, pageSize: number): Promise<PaginatedMessages> {
    const filePath = this.getFilePath(conversationId)

    let content: string
    try {
      content = await readFile(filePath, 'utf-8')
    } catch {
      return { messages: [], total: 0, page, pageSize, hasMore: false }
    }

    const messages = this.parseMessages(content, conversationId)

    // Sort ascending by timestamp
    messages.sort((a, b) => a.timestamp.localeCompare(b.timestamp))

    const total = messages.length
    const start = (page - 1) * pageSize
    const pageMessages = messages.slice(start, start + pageSize)
    const hasMore = start + pageSize < total

    return { messages: pageMessages, total, page, pageSize, hasMore }
  }

  /**
   * Get the last message of a conversation (for list preview).
   * Returns from cache first, falls back to reading the file.
   */
  async getLastMessage(conversationId: string): Promise<Message | null> {
    const cached = this.lastMessageCache.get(conversationId)
    if (cached) {
      return cached
    }

    const filePath = this.getFilePath(conversationId)

    let content: string
    try {
      content = await readFile(filePath, 'utf-8')
    } catch {
      return null
    }

    const messages = this.parseMessages(content, conversationId)
    if (messages.length === 0) {
      return null
    }

    // Sort ascending by timestamp, take last
    messages.sort((a, b) => a.timestamp.localeCompare(b.timestamp))
    const lastMessage = messages[messages.length - 1]!
    this.lastMessageCache.set(conversationId, lastMessage)
    return lastMessage
  }

  /**
   * Parse JSONL content into Message objects, skipping corrupt lines.
   */
  private parseMessages(content: string, conversationId: string): Message[] {
    const lines = content.split('\n')
    const messages: Message[] = []

    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed === '') continue

      try {
        const parsed = JSON.parse(trimmed) as Message
        messages.push(parsed)
      } catch {
        this.logger.warn('Skipping corrupt message line in JSONL file', {
          conversationId,
          line: trimmed.slice(0, 100),
        })
      }
    }

    return messages
  }

  /**
   * Get the file path for a conversation's message file.
   */
  private getFilePath(conversationId: string): string {
    return path.join(this.messagesDir, `${conversationId}.jsonl`)
  }

  /**
   * Ensures the messages directory exists, creating it if necessary.
   */
  private async ensureDirectory(): Promise<void> {
    if (this.dirEnsured) return
    await mkdir(this.messagesDir, { recursive: true })
    this.dirEnsured = true
  }
}
