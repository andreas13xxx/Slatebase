// ─── Data Models ─────────────────────────────────────────────────────────────

/**
 * A conversation between two or more participants.
 */
export interface Conversation {
  /** Unique conversation identifier (24-char hex). */
  id: string
  /** User IDs of all participants. */
  participants: string[]
  /** ISO 8601 timestamp of creation. */
  createdAt: string
  /** User ID of the conversation creator. */
  createdBy: string
  /** Whether the conversation is archived (read-only, only one participant remains). */
  archived?: boolean
}

/**
 * A single chat message within a conversation.
 */
export interface Message {
  /** Unique message identifier (24-char hex). */
  id: string
  /** Conversation this message belongs to (24-char hex). */
  conversationId: string
  /** User ID of the sender. */
  senderId: string
  /** Message text content (1–4000 characters). */
  content: string
  /** ISO 8601 timestamp of when the message was sent. */
  timestamp: string
}

/**
 * Summary of a conversation for list display.
 */
export interface ConversationListItem {
  /** Conversation ID. */
  id: string
  /** User IDs of all participants. */
  participants: string[]
  /** Resolved display names (same order as participants). */
  participantNames: string[]
  /** ISO 8601 timestamp of the last message, or null if no messages. */
  lastMessageTimestamp: string | null
  /** Preview of the last message (max 100 chars), or null if no messages. */
  lastMessagePreview: string | null
  /** Number of unread messages for the requesting user. */
  unreadCount: number
  /** Whether the conversation is archived (read-only). */
  archived?: boolean
}

/**
 * Paginated result of messages.
 */
export interface PaginatedMessages {
  /** Messages on the current page. */
  messages: Message[]
  /** Total number of messages in the conversation. */
  total: number
  /** Current page number (1-based). */
  page: number
  /** Number of messages per page. */
  pageSize: number
  /** Whether more pages exist after the current one. */
  hasMore: boolean
}

/**
 * Paginated result of conversations.
 */
export interface PaginatedConversations {
  /** Conversations on the current page. */
  conversations: ConversationListItem[]
  /** Total number of conversations for the user. */
  total: number
  /** Current page number (1-based). */
  page: number
  /** Number of conversations per page. */
  pageSize: number
  /** Whether more pages exist after the current one. */
  hasMore: boolean
}

// ─── Store Interfaces ────────────────────────────────────────────────────────

/**
 * Data access layer for conversation records.
 * Persists conversations as JSON files and maintains an in-memory index.
 */
export interface IConversationStore {
  /** Create a new conversation. */
  create(conversation: Conversation): Promise<void>

  /** Find a conversation by ID. Returns null if not found. */
  findById(id: string): Promise<Conversation | null>

  /** Find all conversations where userId is a participant. */
  findByParticipant(userId: string): Promise<Conversation[]>

  /** Update an existing conversation (atomic write). */
  update(conversation: Conversation): Promise<void>

  /** Load all conversations from disk into memory index. */
  loadIndex(): Promise<void>
}

/**
 * Data access layer for chat messages.
 * Persists messages as JSONL files (append-only) per conversation.
 */
export interface IMessageStore {
  /** Append a message to a conversation's message file. */
  append(message: Message): Promise<void>

  /** Read messages for a conversation with pagination (ascending by timestamp). */
  findByConversation(conversationId: string, page: number, pageSize: number): Promise<PaginatedMessages>

  /** Get the last message of a conversation (for list preview). */
  getLastMessage(conversationId: string): Promise<Message | null>
}

// ─── Service Interfaces ──────────────────────────────────────────────────────

/**
 * Business logic for chat operations.
 * Orchestrates stores, validates permissions, and enforces business rules.
 */
export interface IChatService {
  /** Create a new conversation with the given participants. */
  createConversation(creatorId: string, participantIds: string[]): Promise<Conversation>

  /** Send a message to a conversation. */
  sendMessage(senderId: string, conversationId: string, content: string): Promise<Message>

  /** Get messages for a conversation (paginated). */
  getMessages(userId: string, conversationId: string, page?: number): Promise<PaginatedMessages>

  /** List conversations for a user (paginated, sorted by last message). */
  listConversations(userId: string, page?: number): Promise<PaginatedConversations>

  /** Remove the user from a conversation. Archives if only one participant remains. */
  leaveConversation(userId: string, conversationId: string): Promise<void>

  /** Get total unread message count across all active conversations for a user. */
  getUnreadTotal(userId: string): Promise<number>
}

/**
 * Rate limiter for chat message sending.
 * Enforces a sliding window limit of 30 messages per 60 seconds per user.
 */
export interface IChatRateLimiter {
  /** Check if a user can send a message. Returns remaining seconds if blocked. */
  checkLimit(userId: string): { allowed: boolean; retryAfter?: number }

  /** Record a sent message for rate tracking. */
  recordMessage(userId: string): void
}

/**
 * Manages per-user, per-conversation unread message counts.
 * Persists as JSON files under data/chat/unread/<userId>.json.
 */
export interface IUnreadStore {
  /** Increment unread count for a user in a conversation by 1. */
  increment(userId: string, conversationId: string): Promise<void>

  /** Reset unread count for a user in a conversation to 0. */
  reset(userId: string, conversationId: string): Promise<void>

  /** Get unread count for a user in a specific conversation. */
  getCount(userId: string, conversationId: string): Promise<number>

  /** Get all unread counts for a user (conversationId → count). */
  getAllCounts(userId: string): Promise<Map<string, number>>

  /** Get total unread count across all conversations for a user. */
  getTotal(userId: string): Promise<number>

  /** Remove unread entry for a user in a conversation (when leaving). */
  remove(userId: string, conversationId: string): Promise<void>

  /** Load all unread data from disk into memory. */
  loadIndex(): Promise<void>
}
