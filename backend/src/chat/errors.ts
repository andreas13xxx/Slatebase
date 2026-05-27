// ─── Chat Error Classes ──────────────────────────────────────────────────────

/**
 * Thrown when a conversation cannot be found by ID.
 */
export class ConversationNotFoundError extends Error {
  constructor(public readonly conversationId: string) {
    super(`Conversation not found: ${conversationId}`)
    this.name = 'ConversationNotFoundError'
  }
}

/**
 * Thrown when a user is not a participant of a conversation.
 */
export class NotParticipantError extends Error {
  constructor(public readonly userId: string, public readonly conversationId: string) {
    super(`User ${userId} is not a participant of conversation ${conversationId}`)
    this.name = 'NotParticipantError'
  }
}

/**
 * Thrown when message content fails validation.
 */
export class InvalidMessageContentError extends Error {
  constructor(public readonly reason: string) {
    super(`Invalid message content: ${reason}`)
    this.name = 'InvalidMessageContentError'
  }
}

/**
 * Thrown when conversation creation fails validation.
 */
export class ConversationValidationError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message)
    this.name = 'ConversationValidationError'
  }
}

/**
 * Thrown when the chat rate limit is exceeded.
 */
export class ChatRateLimitError extends Error {
  constructor(public readonly retryAfter: number) {
    super(`Chat rate limit exceeded. Retry after ${retryAfter} seconds`)
    this.name = 'ChatRateLimitError'
  }
}

/**
 * Thrown when attempting to send a message to an archived conversation.
 */
export class ConversationArchivedError extends Error {
  constructor(public readonly conversationId: string) {
    super(`Conversation is archived: ${conversationId}`)
    this.name = 'ConversationArchivedError'
  }
}
