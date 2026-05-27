/**
 * Chat state management for the messaging system.
 * Manages conversations, messages, loading states, and pagination.
 */

// ─── Data Models (local until task 7.1 adds them to types.ts) ────────────────

/** A single conversation between participants. */
export interface Conversation {
  id: string
  participants: string[]
  createdAt: string
  createdBy: string
}

/** A single chat message within a conversation. */
export interface Message {
  id: string
  conversationId: string
  senderId: string
  content: string
  timestamp: string
}

/** Summary item for the conversation list view. */
export interface ConversationListItem {
  id: string
  participants: string[]
  participantNames: string[]
  lastMessageTimestamp: string | null
  lastMessagePreview: string | null
  unreadCount: number
  archived?: boolean
}

/** Paginated response for messages. */
export interface PaginatedMessages {
  messages: Message[]
  total: number
  page: number
  pageSize: number
  hasMore: boolean
}

/** Paginated response for conversations. */
export interface PaginatedConversations {
  conversations: ConversationListItem[]
  total: number
  page: number
  pageSize: number
  hasMore: boolean
}

// ─── State ───────────────────────────────────────────────────────────────────

/** Global chat state. */
export interface ChatState {
  conversations: ConversationListItem[]
  currentConversation: string | null
  messages: Message[]
  isLoading: boolean
  error: string | null
  isSending: boolean
  totalMessages: number
  currentPage: number
  hasMoreMessages: boolean
  totalConversations: number
  conversationsPage: number
  hasMoreConversations: boolean
  globalUnreadCount: number
}

/** Initial chat state with no conversations or messages. */
export const initialChatState: ChatState = {
  conversations: [],
  currentConversation: null,
  messages: [],
  isLoading: false,
  error: null,
  isSending: false,
  totalMessages: 0,
  currentPage: 1,
  hasMoreMessages: false,
  totalConversations: 0,
  conversationsPage: 1,
  hasMoreConversations: false,
  globalUnreadCount: 0,
}

// ─── Actions ─────────────────────────────────────────────────────────────────

/** Discriminated union of all chat actions. */
export type ChatAction =
  | { type: 'CHAT_LOADING_STARTED' }
  | { type: 'CONVERSATIONS_LOADED'; payload: PaginatedConversations }
  | {
      type: 'MESSAGES_LOADED'
      payload: { conversationId: string; data: PaginatedMessages }
    }
  | { type: 'MESSAGE_SENT'; payload: Message }
  | { type: 'CONVERSATION_CREATED'; payload: ConversationListItem }
  | { type: 'CHAT_ERROR_OCCURRED'; payload: string }
  | { type: 'CHAT_CLEARED' }
  | { type: 'CONVERSATION_LEFT'; payload: { conversationId: string; unreadCount: number } }
  | { type: 'GLOBAL_UNREAD_UPDATED'; payload: number }
  | { type: 'CONVERSATION_UNREAD_RESET'; payload: string }

// ─── Reducer ─────────────────────────────────────────────────────────────────

/**
 * Pure reducer handling all chat state transitions.
 */
export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'CHAT_LOADING_STARTED':
      return {
        ...state,
        isLoading: true,
        error: null,
      }

    case 'CONVERSATIONS_LOADED':
      return {
        ...state,
        conversations: action.payload.conversations,
        totalConversations: action.payload.total,
        conversationsPage: action.payload.page,
        hasMoreConversations: action.payload.hasMore,
        isLoading: false,
      }

    case 'MESSAGES_LOADED': {
      const { conversationId, data } = action.payload
      const messages = data.page > 1
        ? [...state.messages, ...data.messages]
        : data.messages

      return {
        ...state,
        messages,
        totalMessages: data.total,
        currentPage: data.page,
        hasMoreMessages: data.hasMore,
        currentConversation: conversationId,
        isLoading: false,
      }
    }

    case 'MESSAGE_SENT': {
      const convIndex = state.conversations.findIndex(
        c => c.id === action.payload.conversationId
      )
      let updatedConversations = state.conversations
      if (convIndex !== -1) {
        const content = action.payload.content
        const preview = content.length > 100
          ? content.slice(0, 100) + '\u2026'
          : content
        const updated = {
          ...state.conversations[convIndex]!,
          lastMessagePreview: preview,
          lastMessageTimestamp: action.payload.timestamp,
        }
        updatedConversations = [
          updated,
          ...state.conversations.slice(0, convIndex),
          ...state.conversations.slice(convIndex + 1),
        ]
      }
      return {
        ...state,
        messages: [...state.messages, action.payload],
        conversations: updatedConversations,
        isSending: false,
      }
    }

    case 'CONVERSATION_CREATED':
      return {
        ...state,
        conversations: [action.payload, ...state.conversations],
      }

    case 'CHAT_ERROR_OCCURRED':
      return {
        ...state,
        error: action.payload,
        isLoading: false,
        isSending: false,
      }

    case 'CHAT_CLEARED':
      return initialChatState

    case 'CONVERSATION_LEFT': {
      const { conversationId, unreadCount } = action.payload
      const isCurrentConversation = state.currentConversation === conversationId
      return {
        ...state,
        conversations: state.conversations.filter(c => c.id !== conversationId),
        globalUnreadCount: Math.max(0, state.globalUnreadCount - unreadCount),
        currentConversation: isCurrentConversation ? null : state.currentConversation,
        messages: isCurrentConversation ? [] : state.messages,
      }
    }

    case 'GLOBAL_UNREAD_UPDATED':
      return {
        ...state,
        globalUnreadCount: action.payload,
      }

    case 'CONVERSATION_UNREAD_RESET':
      return {
        ...state,
        conversations: state.conversations.map(c =>
          c.id === action.payload ? { ...c, unreadCount: 0 } : c
        ),
      }
  }
}
