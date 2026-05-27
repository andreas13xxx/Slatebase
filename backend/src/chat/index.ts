// ─── Chat Module ─────────────────────────────────────────────────────────────
// Barrel export for the chat module.

// Data models and interfaces
export type {
  Conversation,
  Message,
  ConversationListItem,
  PaginatedMessages,
  PaginatedConversations,
  IConversationStore,
  IMessageStore,
  IChatService,
  IChatRateLimiter,
  IUnreadStore,
} from './types.js'

// Error classes
export {
  ConversationNotFoundError,
  NotParticipantError,
  InvalidMessageContentError,
  ConversationValidationError,
  ChatRateLimitError,
  ConversationArchivedError,
} from './errors.js'

// Store implementations
export { ConversationStore } from './conversation-store.js'
export { MessageStore } from './message-store.js'
export { UnreadStore } from './unread-store.js'

// Validation schemas
export {
  hexId24Schema,
  sendMessageSchema,
  createConversationSchema,
  paginationSchema,
} from './validation.js'

export type {
  SendMessageInput,
  CreateConversationInput,
  PaginationInput,
} from './validation.js'

// Rate limiter
export { ChatRateLimiter, WINDOW_MS, MAX_MESSAGES } from './rate-limiter.js'

// Chat service
export { ChatService } from './chat-service.js'
