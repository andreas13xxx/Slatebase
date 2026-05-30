/**
 * Chat routes module — ChatController and route registration for chat endpoints.
 * Handles conversation creation, listing, message retrieval, and message sending.
 */

import type { Context } from 'hono'
import { Hono } from 'hono'
import type { SessionContext } from '../auth/index.js'
import type { IChatService, IChatRateLimiter } from '../chat/types.js'
import type { ILogger } from '../logger/index.js'
import type { IUserRepository } from '../user/index.js'
import {
  ConversationNotFoundError,
  NotParticipantError,
  InvalidMessageContentError,
  ConversationValidationError,
  ChatRateLimitError,
  ConversationArchivedError,
} from '../chat/errors.js'
import {
  createConversationSchema,
  paginationSchema,
  hexId24Schema,
  sendMessageSchema,
} from '../chat/validation.js'
import type { RouteModule } from './index.js'

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Creates a JSON error response in the standard API error format.
 */
function createApiError(code: string, message: string): { code: string; message: string; timestamp: string } {
  return {
    code,
    message,
    timestamp: new Date().toISOString(),
  }
}

// ─── ChatController Implementation ──────────────────────────────────────────

/**
 * Handles chat HTTP requests: conversation creation/listing, message retrieval/sending.
 * Maps domain errors to appropriate HTTP status codes.
 */
export class ChatController {
  constructor(
    private readonly chatService: IChatService,
    private readonly rateLimiter: IChatRateLimiter,
    private readonly logger: ILogger,
    private readonly userRepository?: IUserRepository,
  ) {}

  /**
   * Checks if the authenticated user's account is suspended.
   * Returns a 403 ACCOUNT_SUSPENDED response if suspended, or null if the user is active.
   */
  private async checkSuspended(c: Context, userId: string): Promise<Response | null> {
    if (!this.userRepository) {
      return null
    }
    const user = await this.userRepository.findById(userId)
    if (user !== null && user.suspended) {
      return c.json(createApiError('ACCOUNT_SUSPENDED', 'Account is suspended'), 403)
    }
    return null
  }

  /**
   * POST /chat/conversations — Create a new conversation.
   * Validates body with createConversationSchema, extracts userId from session,
   * calls chatService.createConversation, returns 201.
   */
  createConversation = async (c: Context): Promise<Response> => {
    const session = c.get('session') as SessionContext
    const userId = session.userId

    // Check if account is suspended
    const suspendedResponse = await this.checkSuspended(c, userId)
    if (suspendedResponse !== null) {
      return suspendedResponse
    }

    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      return c.json(createApiError('VALIDATION_ERROR', 'Invalid JSON body'), 400)
    }

    const result = createConversationSchema.safeParse(body)
    if (!result.success) {
      const firstError = result.error.issues[0]
      return c.json(createApiError('VALIDATION_ERROR', firstError?.message ?? 'Validation failed'), 400)
    }

    try {
      const conversation = await this.chatService.createConversation(userId, result.data.participants)
      return c.json(conversation, 201)
    } catch (error) {
      return this.handleError(c, error)
    }
  }

  /**
   * GET /chat/conversations — List the current user's conversations (paginated).
   * Validates query with paginationSchema, extracts userId from session,
   * calls chatService.listConversations, returns 200.
   */
  listConversations = async (c: Context): Promise<Response> => {
    const session = c.get('session') as SessionContext
    const userId = session.userId

    // Check if account is suspended
    const suspendedResponse = await this.checkSuspended(c, userId)
    if (suspendedResponse !== null) {
      return suspendedResponse
    }

    const queryParams = {
      page: c.req.query('page'),
      pageSize: c.req.query('pageSize'),
    }

    const result = paginationSchema.safeParse(queryParams)
    if (!result.success) {
      const firstError = result.error.issues[0]
      return c.json(createApiError('VALIDATION_ERROR', firstError?.message ?? 'Validation failed'), 400)
    }

    try {
      const conversations = await this.chatService.listConversations(userId, result.data.page)
      return c.json(conversations, 200)
    } catch (error) {
      return this.handleError(c, error)
    }
  }

  /**
   * GET /chat/conversations/:conversationId/messages — Get messages for a conversation (paginated).
   * Validates params (conversationId with hexId24Schema) and query (pagination),
   * extracts userId from session, calls chatService.getMessages, returns 200.
   */
  getMessages = async (c: Context): Promise<Response> => {
    const session = c.get('session') as SessionContext
    const userId = session.userId

    // Check if account is suspended
    const suspendedResponse = await this.checkSuspended(c, userId)
    if (suspendedResponse !== null) {
      return suspendedResponse
    }

    // Validate conversationId param
    const conversationId = c.req.param('conversationId') as string
    const idResult = hexId24Schema.safeParse(conversationId)
    if (!idResult.success) {
      const firstError = idResult.error.issues[0]
      return c.json(createApiError('VALIDATION_ERROR', firstError?.message ?? 'Invalid conversation ID'), 400)
    }

    // Validate pagination query
    const queryParams = {
      page: c.req.query('page'),
      pageSize: c.req.query('pageSize'),
    }

    const paginationResult = paginationSchema.safeParse(queryParams)
    if (!paginationResult.success) {
      const firstError = paginationResult.error.issues[0]
      return c.json(createApiError('VALIDATION_ERROR', firstError?.message ?? 'Validation failed'), 400)
    }

    try {
      const messages = await this.chatService.getMessages(userId, conversationId, paginationResult.data.page)
      return c.json(messages, 200)
    } catch (error) {
      return this.handleError(c, error)
    }
  }

  /**
   * POST /chat/conversations/:conversationId/messages — Send a message to a conversation.
   * Validates params (conversationId) and body (content), checks rate limit,
   * extracts userId from session (ignores any senderId in body),
   * calls chatService.sendMessage, records message on success, returns 201.
   */
  sendMessage = async (c: Context): Promise<Response> => {
    const session = c.get('session') as SessionContext
    const userId = session.userId

    // Check if account is suspended
    const suspendedResponse = await this.checkSuspended(c, userId)
    if (suspendedResponse !== null) {
      return suspendedResponse
    }

    // Validate conversationId param
    const conversationId = c.req.param('conversationId') as string
    const idResult = hexId24Schema.safeParse(conversationId)
    if (!idResult.success) {
      const firstError = idResult.error.issues[0]
      return c.json(createApiError('VALIDATION_ERROR', firstError?.message ?? 'Invalid conversation ID'), 400)
    }

    // Parse and validate body
    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      return c.json(createApiError('VALIDATION_ERROR', 'Invalid JSON body'), 400)
    }

    const bodyResult = sendMessageSchema.safeParse(body)
    if (!bodyResult.success) {
      const firstError = bodyResult.error.issues[0]
      return c.json(createApiError('VALIDATION_ERROR', firstError?.message ?? 'Validation failed'), 400)
    }

    // Check rate limit before sending
    const limitCheck = this.rateLimiter.checkLimit(userId)
    if (!limitCheck.allowed) {
      const retryAfter = limitCheck.retryAfter ?? 60
      c.header('Retry-After', String(retryAfter))
      return c.json(createApiError('CHAT_RATE_LIMITED', `Rate limit exceeded. Retry after ${String(retryAfter)} seconds`), 429)
    }

    try {
      // Use userId from session, ignore any senderId in body
      const message = await this.chatService.sendMessage(userId, conversationId, bodyResult.data.content)

      // Record message for rate limiting after successful send
      this.rateLimiter.recordMessage(userId)

      return c.json(message, 201)
    } catch (error) {
      return this.handleError(c, error)
    }
  }

  /**
   * DELETE /chat/conversations/:conversationId/participants/me — Leave a conversation.
   * Validates conversationId with hexId24Schema, checks suspended status,
   * calls chatService.leaveConversation, returns 204 on success.
   */
  leaveConversation = async (c: Context): Promise<Response> => {
    const session = c.get('session') as SessionContext
    const userId = session.userId

    // Check if account is suspended
    const suspendedResponse = await this.checkSuspended(c, userId)
    if (suspendedResponse !== null) {
      return suspendedResponse
    }

    // Validate conversationId param
    const conversationId = c.req.param('conversationId') as string
    const idResult = hexId24Schema.safeParse(conversationId)
    if (!idResult.success) {
      const firstError = idResult.error.issues[0]
      return c.json(createApiError('VALIDATION_ERROR', firstError?.message ?? 'Invalid conversation ID'), 400)
    }

    try {
      await this.chatService.leaveConversation(userId, conversationId)
      return c.body(null, 204)
    } catch (error) {
      return this.handleError(c, error)
    }
  }

  /**
   * GET /chat/unread/total — Get total unread message count for the authenticated user.
   * Checks suspended status, calls chatService.getUnreadTotal, returns { total }.
   */
  getUnreadTotal = async (c: Context): Promise<Response> => {
    const session = c.get('session') as SessionContext
    const userId = session.userId

    // Check if account is suspended
    const suspendedResponse = await this.checkSuspended(c, userId)
    if (suspendedResponse !== null) {
      return suspendedResponse
    }

    try {
      const total = await this.chatService.getUnreadTotal(userId)
      return c.json({ total }, 200)
    } catch (error) {
      return this.handleError(c, error)
    }
  }

  /**
   * Maps domain errors to HTTP status codes and structured API error responses.
   */
  private handleError(c: Context, error: unknown): Response {
    if (error instanceof ConversationNotFoundError) {
      return c.json(createApiError('CONVERSATION_NOT_FOUND', error.message), 404)
    }

    if (error instanceof NotParticipantError) {
      return c.json(createApiError('NOT_PARTICIPANT', error.message), 403)
    }

    if (error instanceof InvalidMessageContentError) {
      return c.json(createApiError('INVALID_MESSAGE_CONTENT', error.message), 400)
    }

    if (error instanceof ConversationValidationError) {
      return c.json(createApiError(error.code, error.message), 400)
    }

    if (error instanceof ChatRateLimitError) {
      c.header('Retry-After', String(error.retryAfter))
      return c.json(createApiError('CHAT_RATE_LIMITED', error.message), 429)
    }

    if (error instanceof ConversationArchivedError) {
      return c.json(createApiError('CONVERSATION_ARCHIVED', error.message), 403)
    }

    // Unknown errors — log and return 500
    this.logger.error('Unexpected error in ChatController', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })

    return c.json(createApiError('INTERNAL_ERROR', 'Internal server error'), 500)
  }
}

// ─── ChatRouteModule ─────────────────────────────────────────────────────────

/**
 * Route module that registers all chat-related routes on a Hono sub-app.
 * Routes: POST /chat/conversations, GET /chat/conversations,
 * GET /chat/conversations/:conversationId/messages,
 * POST /chat/conversations/:conversationId/messages.
 */
export class ChatRouteModule implements RouteModule {
  constructor(private readonly controller: ChatController) {}

  /**
   * Register chat routes on the provided Hono router.
   */
  register(router: Hono): void {
    router.post('/chat/conversations', this.controller.createConversation)
    router.get('/chat/conversations', this.controller.listConversations)
    router.get('/chat/conversations/:conversationId/messages', this.controller.getMessages)
    router.post('/chat/conversations/:conversationId/messages', this.controller.sendMessage)
    router.delete('/chat/conversations/:conversationId/participants/me', this.controller.leaveConversation)
    router.get('/chat/unread/total', this.controller.getUnreadTotal)
  }
}
