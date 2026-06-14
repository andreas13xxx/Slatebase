import crypto from 'node:crypto'
import type { ILogger } from '../logger/index.js'
import type { IUserRepository } from '../user/index.js'
import type { IEventBus } from '../realtime/types.js'
import type {
  Conversation,
  ConversationListItem,
  IChatService,
  IConversationStore,
  IMessageStore,
  IUnreadStore,
  Message,
  PaginatedConversations,
  PaginatedMessages,
} from './types.js'
import { ConversationArchivedError, ConversationNotFoundError, ConversationValidationError, InvalidMessageContentError, NotParticipantError } from './errors.js'

// ─── Constants ───────────────────────────────────────────────────────────────

/** Default page size for paginated queries. */
const DEFAULT_PAGE_SIZE = 50

/** Maximum allowed page size. */
const MAX_PAGE_SIZE = 50

/** Maximum length for last message preview in conversation list. */
const MAX_PREVIEW_LENGTH = 100

/** Minimum number of participants (including creator). */
const MIN_PARTICIPANTS = 2

/** Maximum number of participants (including creator). */
const MAX_PARTICIPANTS = 50

/** Maximum message content length. */
const MAX_CONTENT_LENGTH = 4000

// ─── ChatService Implementation ─────────────────────────────────────────────

/**
 * Business logic for chat operations.
 * Orchestrates conversation and message stores, validates permissions,
 * and enforces business rules (participant limits, content validation, access control).
 */
export class ChatService implements IChatService {
  private eventBus?: IEventBus

  constructor(
    private readonly conversationStore: IConversationStore,
    private readonly messageStore: IMessageStore,
    private readonly unreadStore: IUnreadStore,
    private readonly userRepository: IUserRepository,
    private readonly logger: ILogger,
  ) {}

  /** Set the optional EventBus for realtime event publishing. */
  setEventBus(eventBus: IEventBus): void {
    this.eventBus = eventBus
  }

  /**
   * Remove the user from a conversation. Archives if only one participant remains.
   * @param userId - User ID of the participant leaving.
   * @param conversationId - ID of the conversation to leave.
   */
  async leaveConversation(userId: string, conversationId: string): Promise<void> {
    // 1. Find conversation
    const conversation = await this.conversationStore.findById(conversationId)
    if (conversation === null) {
      throw new ConversationNotFoundError(conversationId)
    }

    // 2. Check user is participant
    if (!conversation.participants.includes(userId)) {
      throw new NotParticipantError(userId, conversationId)
    }

    // 3. Remove user from participants array
    conversation.participants = conversation.participants.filter((id) => id !== userId)

    // 4. If remaining participants < 2: set archived = true
    if (conversation.participants.length < 2) {
      conversation.archived = true
    }

    // 5. Update conversation via conversationStore.update()
    await this.conversationStore.update(conversation)

    // 6. Remove unread entry via unreadStore.remove(userId, conversationId)
    await this.unreadStore.remove(userId, conversationId)

    this.logger.info('User left conversation', { userId, conversationId, archived: conversation.archived ?? false })
  }

  /**
   * Get total unread message count across all active conversations for a user.
   * @param userId - User ID to get unread total for.
   * @returns Total unread count.
   */
  async getUnreadTotal(userId: string): Promise<number> {
    return this.unreadStore.getTotal(userId)
  }

  /**
   * Create a new conversation with the given participants.
   * Deduplicates participant IDs, ensures the creator is included,
   * validates participant count (2–50), checks each participant exists and is not suspended,
   * generates a 24-char hex ID, and persists via ConversationStore.
   *
   * @param creatorId - User ID of the conversation creator.
   * @param participantIds - Array of user IDs to include as participants.
   * @returns The created Conversation object.
   */
  async createConversation(creatorId: string, participantIds: string[]): Promise<Conversation> {
    // 1. Deduplicate participant IDs
    const uniqueIds = [...new Set(participantIds)]

    // 2. Add creator if not already present
    if (!uniqueIds.includes(creatorId)) {
      uniqueIds.push(creatorId)
    }

    // 3. Validate participant count
    if (uniqueIds.length < MIN_PARTICIPANTS) {
      throw new ConversationValidationError(
        'TOO_FEW_PARTICIPANTS',
        `A conversation requires at least ${MIN_PARTICIPANTS} participants (including creator)`,
      )
    }

    if (uniqueIds.length > MAX_PARTICIPANTS) {
      throw new ConversationValidationError(
        'TOO_MANY_PARTICIPANTS',
        `A conversation allows at most ${MAX_PARTICIPANTS} participants`,
      )
    }

    // 4. Validate each participant exists and is not suspended
    for (const participantId of uniqueIds) {
      const user = await this.userRepository.findById(participantId)
      if (user === null) {
        throw new ConversationValidationError(
          'PARTICIPANT_NOT_FOUND',
          `Participant not found: ${participantId}`,
        )
      }
      if (user.suspended) {
        throw new ConversationValidationError(
          'PARTICIPANT_SUSPENDED',
          `Participant is suspended: ${participantId}`,
        )
      }
    }

    // 5. Generate conversation ID
    const id = crypto.randomBytes(12).toString('hex')

    // 6. Create conversation object
    const conversation: Conversation = {
      id,
      participants: uniqueIds,
      createdAt: new Date().toISOString(),
      createdBy: creatorId,
    }

    // 7. Persist
    await this.conversationStore.create(conversation)

    this.logger.info('Conversation created', { conversationId: id, creatorId, participantCount: uniqueIds.length })

    // 8. Return
    return conversation
  }

  /**
   * Send a message to a conversation.
   * Verifies the conversation exists, the sender is a participant,
   * validates content (1–4000 chars, non-whitespace), generates a message ID, and persists.
   *
   * @param senderId - User ID of the message sender.
   * @param conversationId - ID of the target conversation.
   * @param content - Message text content.
   * @returns The created Message object.
   */
  async sendMessage(senderId: string, conversationId: string, content: string): Promise<Message> {
    // 1. Find conversation
    const conversation = await this.conversationStore.findById(conversationId)
    if (conversation === null) {
      throw new ConversationNotFoundError(conversationId)
    }

    // 2. Check sender is participant
    if (!conversation.participants.includes(senderId)) {
      throw new NotParticipantError(senderId, conversationId)
    }

    // 3. Check archived status (fail fast before content validation)
    if (conversation.archived === true) {
      throw new ConversationArchivedError(conversationId)
    }

    // 4. Validate content
    const trimmed = content.trim()
    if (trimmed.length === 0) {
      throw new InvalidMessageContentError('Message content must not be empty or whitespace-only')
    }
    if (content.length > MAX_CONTENT_LENGTH) {
      throw new InvalidMessageContentError(`Message content must not exceed ${MAX_CONTENT_LENGTH} characters`)
    }

    // 5. Generate message ID
    const id = crypto.randomBytes(12).toString('hex')

    // 6. Create message object
    const message: Message = {
      id,
      conversationId,
      senderId,
      content,
      timestamp: new Date().toISOString(),
    }

    // 7. Persist
    await this.messageStore.append(message)

    // 8. Increment unread counts for all participants except sender
    for (const participantId of conversation.participants) {
      if (participantId !== senderId) {
        await this.unreadStore.increment(participantId, conversationId)

        // Publish chat:unread event to affected user
        if (this.eventBus) {
          const newTotal = await this.unreadStore.getTotal(participantId)
          this.eventBus.publish({
            type: 'chat:unread',
            payload: { totalUnread: newTotal },
            target: { kind: 'user', userId: participantId },
          })
        }
      }
    }

    this.logger.debug('Message sent', { messageId: id, conversationId, senderId })

    // 9. Publish chat:message event to conversation participants (exclude sender)
    if (this.eventBus) {
      const sender = await this.userRepository.findById(senderId)
      const senderName = sender ? (sender.displayName || sender.username) : senderId
      const participantIds = conversation.participants.filter((p) => p !== senderId)

      this.eventBus.publish({
        type: 'chat:message',
        payload: {
          conversationId,
          messageId: message.id,
          senderId,
          senderName,
          content: message.content,
          timestamp: message.timestamp,
        },
        target: { kind: 'users', userIds: participantIds },
        excludeUserId: senderId,
      })
    }

    // 10. Return
    return message
  }

  /**
   * Get messages for a conversation (paginated).
   * Verifies the conversation exists and the user is a participant,
   * then delegates to MessageStore with pagination.
   *
   * @param userId - User ID requesting messages.
   * @param conversationId - ID of the conversation.
   * @param page - Page number (1-based, defaults to 1).
   * @returns Paginated messages result.
   */
  async getMessages(userId: string, conversationId: string, page?: number): Promise<PaginatedMessages> {
    // 1. Find conversation
    const conversation = await this.conversationStore.findById(conversationId)
    if (conversation === null) {
      throw new ConversationNotFoundError(conversationId)
    }

    // 2. Check user is participant
    if (!conversation.participants.includes(userId)) {
      throw new NotParticipantError(userId, conversationId)
    }

    // 3. Delegate to message store
    const effectivePage = page ?? 1
    const pageSize = DEFAULT_PAGE_SIZE

    const result = await this.messageStore.findByConversation(conversationId, effectivePage, pageSize)

    // 4. Reset unread count for this user and conversation
    await this.unreadStore.reset(userId, conversationId)

    return result
  }

  /**
   * List conversations for a user (paginated, sorted by last message timestamp descending).
   * Enriches each conversation with last message preview and resolved participant names.
   *
   * @param userId - User ID whose conversations to list.
   * @param page - Page number (1-based, defaults to 1).
   * @returns Paginated conversations result.
   */
  async listConversations(userId: string, page?: number): Promise<PaginatedConversations> {
    // 1. Get user's conversations
    const conversations = await this.conversationStore.findByParticipant(userId)

    // 2. Enrich each conversation with last message and participant names
    const enriched: Array<{ item: ConversationListItem; sortTimestamp: string | null }> = []

    for (const conversation of conversations) {
      // Get last message
      const lastMessage = await this.messageStore.getLastMessage(conversation.id)

      // Resolve participant names
      const participantNames: string[] = []
      for (const participantId of conversation.participants) {
        const user = await this.userRepository.findById(participantId)
        if (user !== null) {
          participantNames.push(user.displayName || user.username)
        } else {
          participantNames.push(participantId)
        }
      }

      // Build preview
      let lastMessagePreview: string | null = null
      let lastMessageTimestamp: string | null = null

      if (lastMessage !== null) {
        lastMessageTimestamp = lastMessage.timestamp
        if (lastMessage.content.length > MAX_PREVIEW_LENGTH) {
          lastMessagePreview = lastMessage.content.slice(0, MAX_PREVIEW_LENGTH) + '\u2026'
        } else {
          lastMessagePreview = lastMessage.content
        }
      }

      const unreadCount = await this.unreadStore.getCount(userId, conversation.id)
      const item: ConversationListItem = {
        id: conversation.id,
        participants: conversation.participants,
        participantNames,
        lastMessageTimestamp,
        lastMessagePreview,
        unreadCount,
      }
      if (conversation.archived === true) {
        item.archived = true
      }

      enriched.push({ item, sortTimestamp: lastMessageTimestamp })
    }

    // 3. Sort by lastMessageTimestamp descending (null timestamps go to end)
    enriched.sort((a, b) => {
      if (a.sortTimestamp === null && b.sortTimestamp === null) return 0
      if (a.sortTimestamp === null) return 1
      if (b.sortTimestamp === null) return -1
      return b.sortTimestamp.localeCompare(a.sortTimestamp)
    })

    // 4. Paginate
    const effectivePage = page ?? 1
    const pageSize = MAX_PAGE_SIZE
    const total = enriched.length
    const start = (effectivePage - 1) * pageSize
    const pageItems = enriched.slice(start, start + pageSize).map((e) => e.item)
    const hasMore = start + pageSize < total

    return {
      conversations: pageItems,
      total,
      page: effectivePage,
      pageSize,
      hasMore,
    }
  }
}
