# Implementation Plan: User Chat

## Overview

Implementierung des Chat-Systems für Slatebase gemäß Requirements 1–8. Die Umsetzung folgt der bestehenden Layered Architecture: Data Layer (Stores) → Business Layer (ChatService, ChatRateLimiter) → API Layer (ChatController, chatRoutes) → Frontend (State, Components, API-Client). Alle Schichten nutzen Interface-First Design mit manueller DI.

## Tasks

- [x] 1. Backend Data Layer — Interfaces, Models und Stores
  - [x] 1.1 Create chat module structure and shared types
    - Create `backend/src/chat/` directory with `index.ts` barrel export
    - Define `Conversation`, `Message`, `ConversationListItem`, `PaginatedMessages`, `PaginatedConversations` interfaces
    - Define `IConversationStore`, `IMessageStore`, `IChatService`, `IChatRateLimiter` interfaces
    - Define error classes (`ConversationNotFoundError`, `NotParticipantError`, `InvalidMessageContentError`, `ConversationValidationError`, `ChatRateLimitError`)
    - Define Zod validation schemas (`hexId24Schema`, `sendMessageSchema`, `createConversationSchema`, `paginationSchema`)
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

  - [x] 1.2 Implement ConversationStore
    - Implement `IConversationStore` with filesystem persistence under `data/chat/conversations/`
    - In-memory index: `participantIndex` (Map<userId, Set<conversationId>>) and `conversationCache` (Map<conversationId, Conversation>)
    - `loadIndex()`: read all `.json` files from conversations directory, populate caches, skip corrupt files with error logging
    - `create()`: atomic write (temp → rename) of conversation JSON file, update in-memory index
    - `findById()`: lookup from `conversationCache`
    - `findByParticipant()`: lookup from `participantIndex`, resolve to Conversation objects
    - Auto-create `data/chat/conversations/` directory if missing
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [x] 1.3 Implement MessageStore
    - Implement `IMessageStore` with JSONL-based persistence under `data/chat/messages/`
    - `lastMessageCache` (Map<conversationId, Message>) for conversation list preview
    - `append()`: append JSON line to `<conversationId>.jsonl`, atomic write for new files, update `lastMessageCache`
    - `findByConversation()`: read JSONL file, parse lines (skip corrupt lines with warning), sort ascending by timestamp, apply pagination
    - `getLastMessage()`: return from `lastMessageCache`, or read last line from file if cache miss
    - Auto-create `data/chat/messages/` directory if missing
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [ ]* 1.4 Write unit tests for ConversationStore
    - Test create, findById, findByParticipant, loadIndex
    - Test corrupt file handling (skip and log)
    - Test auto-directory creation
    - Use real filesystem with temp directories
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [ ]* 1.5 Write unit tests for MessageStore
    - Test append, findByConversation, getLastMessage
    - Test pagination (page boundaries, empty conversation)
    - Test corrupt JSONL line handling
    - Use real filesystem with temp directories
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

- [x] 2. Backend Business Layer — ChatService and ChatRateLimiter
  - [x] 2.1 Implement ChatRateLimiter
    - Implement `IChatRateLimiter` with sliding window algorithm (30 messages per 60 seconds)
    - In-memory `Map<userId, number[]>` storing timestamps of sent messages
    - `checkLimit()`: filter timestamps within window, return `{ allowed: true }` if count < 30, else `{ allowed: false, retryAfter: ceilSeconds }`
    - `recordMessage()`: push current timestamp to user's array
    - Clean up expired timestamps on each check
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

  - [x] 2.2 Implement ChatService
    - Implement `IChatService` with injected `IConversationStore`, `IMessageStore`, `IUserRepository`, `ILogger`
    - `createConversation()`: validate participants exist and are not suspended (via IUserRepository), deduplicate, ensure creator included, enforce 2–50 participant limit, generate 24-char hex ID, persist via ConversationStore
    - `sendMessage()`: verify conversation exists (404), verify sender is participant (403), validate content (1–4000 chars, non-whitespace), generate message ID, persist via MessageStore
    - `getMessages()`: verify conversation exists (404), verify user is participant (403), delegate to MessageStore with pagination (default pageSize=50, max=50)
    - `listConversations()`: get user's conversations via ConversationStore, enrich with last message preview (max 100 chars truncated), resolve participant names via IUserRepository, sort by lastMessageTimestamp descending, paginate
    - _Requirements: 1.2, 1.4, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 5.1, 5.2, 5.3_

  - [ ]* 2.3 Write unit tests for ChatRateLimiter
    - Test allowing first 30 messages
    - Test rejecting 31st message with correct retryAfter
    - Test window reset after 60 seconds
    - Test per-user independence
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

  - [ ]* 2.4 Write unit tests for ChatService
    - Test createConversation success and error paths (non-existent user, suspended user, too few/many participants, deduplication)
    - Test sendMessage success and error paths (not participant, conversation not found, invalid content)
    - Test getMessages success and error paths (not participant, conversation not found, empty conversation)
    - Test listConversations (sorting, preview truncation, empty list)
    - Use `createMockConversationStore()`, `createMockMessageStore()`, `createMockUserRepository()`
    - _Requirements: 2.1–2.7, 3.1–3.6, 4.1–4.9, 5.1–5.4_

- [x] 3. Checkpoint — Backend Data and Business Layer
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Backend API Layer — ChatController and Routes
  - [x] 4.1 Implement ChatController
    - Create `backend/src/api/chatRoutes.ts` with `ChatController` class
    - Inject `IChatService`, `IChatRateLimiter`, `ILogger`
    - `createConversation()`: validate body with `createConversationSchema`, extract userId from session, call chatService, return 201
    - `listConversations()`: validate query with `paginationSchema`, extract userId from session, call chatService, return 200
    - `getMessages()`: validate params (conversationId with `hexId24Schema`) and query (pagination), extract userId, call chatService, return 200
    - `sendMessage()`: validate params and body, check rate limit (return 429 with Retry-After header if blocked), record message on success, extract userId from session (ignore any senderId in body), call chatService, return 201
    - Error mapping: `ConversationNotFoundError` → 404, `NotParticipantError` → 403, `InvalidMessageContentError` → 400, `ConversationValidationError` → 400, `ChatRateLimitError` → 429, Zod errors → 400
    - All errors in format `{ code, message, timestamp }`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1–2.7, 3.1–3.6, 4.1–4.9, 5.1–5.4, 7.1, 7.4, 8.1–8.4_

  - [x] 4.2 Create ChatRouteModule and register routes
    - Create `ChatRouteModule` class implementing the route module pattern
    - Register routes: `POST /api/v1/chat/conversations`, `GET /api/v1/chat/conversations`, `GET /api/v1/chat/conversations/:conversationId/messages`, `POST /api/v1/chat/conversations/:conversationId/messages`
    - All routes protected by existing auth middleware and CSRF middleware
    - Check for suspended account (403 ACCOUNT_SUSPENDED) via existing middleware or controller check
    - _Requirements: 1.1, 1.3_

  - [ ]* 4.3 Write unit tests for ChatController/Routes
    - Test successful responses (201 for create/send, 200 for list/get)
    - Test error responses (400, 403, 404, 429) with correct format
    - Test that senderId from body is ignored (session userId used)
    - Test rate limit response includes Retry-After header
    - Test suspended account returns 403 ACCOUNT_SUSPENDED
    - _Requirements: 1.1–1.4, 2.1–2.7, 7.1, 7.4, 8.1–8.4_

- [x] 5. Checkpoint — Backend Complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Frontend State — chatReducer and ChatProvider
  - [x] 6.1 Implement chat state and reducer
    - Create `frontend/src/state/chatState.ts` with `ChatState` type, action types, and `chatReducer`
    - State: `conversations`, `currentConversation`, `messages`, `isLoading`, `error`, `isSending`
    - Actions: `CONVERSATIONS_LOADED`, `MESSAGES_LOADED`, `MESSAGE_SENT`, `CONVERSATION_CREATED`, `CHAT_LOADING_STARTED`, `CHAT_ERROR_OCCURRED`, `CHAT_CLEARED`
    - _Requirements: 3.1, 5.1_

  - [x] 6.2 Implement ChatProvider and context
    - Create `frontend/src/state/chatContext.ts` with `ChatProvider` component and `useChatContext()` hook
    - Provide `state` and `dispatch` via context
    - Hook throws error if used outside provider
    - _Requirements: 3.1, 5.1_

  - [x] 6.3 Implement chat action creators
    - Create `frontend/src/state/chatActions.ts` with standalone async functions
    - `loadConversations(dispatch, apiClient, page?)`: fetch and dispatch `CONVERSATIONS_LOADED`
    - `loadMessages(dispatch, apiClient, conversationId, page?)`: fetch and dispatch `MESSAGES_LOADED`
    - `sendMessage(dispatch, apiClient, conversationId, content)`: send and dispatch `MESSAGE_SENT`
    - `createConversation(dispatch, apiClient, participantIds)`: create and dispatch `CONVERSATION_CREATED`
    - Error handling: dispatch `CHAT_ERROR_OCCURRED` on failure
    - _Requirements: 2.1, 3.1, 4.1, 5.1_

- [x] 7. Frontend API Client Extension
  - [x] 7.1 Extend IApiClient with chat methods
    - Add `createConversation(participantIds: string[]): Promise<Conversation>` to `IApiClient`
    - Add `listConversations(page?: number): Promise<PaginatedConversations>` to `IApiClient`
    - Add `getMessages(conversationId: string, page?: number): Promise<PaginatedMessages>` to `IApiClient`
    - Add `sendMessage(conversationId: string, content: string): Promise<Message>` to `IApiClient`
    - Implement methods in `ApiClient` class with correct endpoints and CSRF token handling
    - Add chat-related TypeScript interfaces to `frontend/src/types.ts`
    - _Requirements: 2.1, 3.1, 4.1, 5.1_

- [x] 8. Frontend Components
  - [x] 8.1 Implement ChatPage component
    - Create `frontend/src/components/ChatPage.tsx` as main chat view
    - Two-panel layout: ConversationList (left) + MessageView/MessageInput (right)
    - Mount `ChatProvider` within ChatPage (lazy loading pattern)
    - Load conversations on mount
    - Handle empty state (no conversations selected)
    - _Requirements: 5.1, 5.3_

  - [x] 8.2 Implement ConversationList component
    - Create `frontend/src/components/ConversationList.tsx`
    - Display conversations sorted by last message timestamp (descending)
    - Show participant names, last message preview (max 100 chars), timestamp
    - Highlight selected conversation
    - Button to open NewConversation dialog
    - _Requirements: 5.1, 5.2_

  - [x] 8.3 Implement MessageView component
    - Create `frontend/src/components/MessageView.tsx`
    - Display messages ascending by timestamp
    - Show sender name, content, formatted timestamp per message
    - Scroll to bottom on new messages
    - Handle empty conversation state
    - Pagination: load older messages on scroll to top
    - _Requirements: 3.1, 3.2, 3.4, 3.6_

  - [x] 8.4 Implement MessageInput component
    - Create `frontend/src/components/MessageInput.tsx`
    - Textarea with send button (Send icon from Lucide)
    - Validate: non-empty, max 4000 characters
    - Show character count when approaching limit
    - Disable while sending (isSending state)
    - Handle rate limit error (show toast with retry seconds)
    - Submit on Enter (Shift+Enter for newline)
    - _Requirements: 2.1, 2.3, 2.4, 7.1, 7.4_

  - [x] 8.5 Implement NewConversation component
    - Create `frontend/src/components/NewConversation.tsx`
    - User search input with autocomplete (reuse pattern from VaultSharing.tsx)
    - Debounced search via `/api/v1/users/search?q=...`
    - Display selected participants as chips/tags
    - Validate: at least 1 other participant, max 49 additional participants
    - Create button calls `createConversation` action
    - Error display for invalid participants (not found, suspended)
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

- [x] 9. Frontend Integration — Navigation and i18n
  - [x] 9.1 Add chat navigation to SidebarToolbar
    - Add `MessageCircle` icon button to `SidebarToolbar.tsx`
    - Button opens ChatPage as a settings tab (like Profile, Sessions)
    - Visible for all authenticated users
    - _Requirements: 1.1_

  - [x] 9.2 Add i18n translations for chat
    - Add `chat.*` namespace to `frontend/src/i18n/de.ts` with all German translations
    - Add `chat.*` namespace to `frontend/src/i18n/en.ts` with all English translations
    - Keys: title, newConversation, noConversations, noMessages, sendPlaceholder, send, participants, addParticipant, rateLimited, messageTooLong, messageEmpty, conversationCreated, errorSending, errorLoading, participantNotFound, participantSuspended, tooManyParticipants, tooFewParticipants
    - _Requirements: 5.1, 5.2, 7.1_

- [x] 10. Checkpoint — Frontend Complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Backend Composition Root Wiring
  - [x] 11.1 Wire chat components in composition root
    - In `backend/src/index.ts`: instantiate `ConversationStore`, `MessageStore`, `ChatRateLimiter`, `ChatService`, `ChatController`
    - Add `ChatRouteModule` to `routeModules` array
    - Call `conversationStore.loadIndex()` during startup (after sessionStore.loadIndex())
    - _Requirements: 6.3_

- [ ] 12. Property-Based Tests
  - [ ]* 12.1 Write property test for server identity enforcement
    - **Property 1: Server enforces session identity**
    - **Validates: Requirements 1.2, 1.4**

  - [ ]* 12.2 Write property test for message persistence round-trip
    - **Property 2: Message persistence round-trip**
    - **Validates: Requirements 2.1, 6.1**

  - [ ]* 12.3 Write property test for message ID uniqueness
    - **Property 3: Message IDs are unique**
    - **Validates: Requirements 2.2, 8.2**

  - [ ]* 12.4 Write property test for participant-only access control
    - **Property 4: Participant-only access control**
    - **Validates: Requirements 2.5, 3.3**

  - [ ]* 12.5 Write property test for message sort order
    - **Property 5: Messages are sorted ascending by timestamp**
    - **Validates: Requirements 3.1**

  - [ ]* 12.6 Write property test for pagination limits
    - **Property 6: Pagination respects page size limits**
    - **Validates: Requirements 3.2**

  - [ ]* 12.7 Write property test for conversation creation invariants
    - **Property 7: Conversation creation invariants**
    - **Validates: Requirements 4.1, 4.2**

  - [ ]* 12.8 Write property test for participant deduplication
    - **Property 8: Participant deduplication**
    - **Validates: Requirements 4.7, 4.8**

  - [ ]* 12.9 Write property test for conversation list filtering
    - **Property 9: Conversation list contains only user's conversations**
    - **Validates: Requirements 5.1**

  - [ ]* 12.10 Write property test for last message preview truncation
    - **Property 10: Last message preview truncation**
    - **Validates: Requirements 5.2**

  - [ ]* 12.11 Write property test for persistence reload
    - **Property 11: Persistence survives reload**
    - **Validates: Requirements 6.3**

  - [ ]* 12.12 Write property test for rate limiter threshold
    - **Property 12: Rate limiter allows exactly 30 messages per window**
    - **Validates: Requirements 7.1, 7.4**

  - [ ]* 12.13 Write property test for rate limiter per-user independence
    - **Property 13: Rate limiter is per-user independent**
    - **Validates: Requirements 7.2**

  - [ ]* 12.14 Write property test for rate limiter window reset
    - **Property 14: Rate limiter resets after window expiry**
    - **Validates: Requirements 7.3**

  - [ ]* 12.15 Write property test for content validation
    - **Property 15: Content validation**
    - **Validates: Requirements 2.3, 2.4, 8.1**

  - [ ]* 12.16 Write property test for ID format validation
    - **Property 16: ID format validation**
    - **Validates: Requirements 8.2, 8.4**

- [ ] 13. Integration Tests
  - [ ]* 13.1 Write integration tests for chat API
    - End-to-end: create conversation → send message → retrieve messages → list conversations
    - Real filesystem with temp directories
    - Test persistence across store reload
    - Test error responses (401, 403, 404, 429)
    - Cleanup in `afterAll`
    - _Requirements: 1.1, 2.1, 3.1, 4.1, 5.1, 6.1, 6.3_

- [x] 14. Final Checkpoint
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The design uses TypeScript throughout — no language selection needed
- Backend imports must use `.js` extensions (ESM convention)
- Frontend follows existing patterns: useReducer + Context, action creators as standalone functions
- All new components use Lucide React icons and existing Design Tokens

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "2.1"] },
    { "id": 2, "tasks": ["1.4", "1.5", "2.2", "2.3"] },
    { "id": 3, "tasks": ["2.4", "4.1"] },
    { "id": 4, "tasks": ["4.2", "4.3"] },
    { "id": 5, "tasks": ["6.1", "7.1", "9.2"] },
    { "id": 6, "tasks": ["6.2", "6.3"] },
    { "id": 7, "tasks": ["8.1", "8.2", "8.3", "8.4", "8.5", "9.1"] },
    { "id": 8, "tasks": ["11.1"] },
    { "id": 9, "tasks": ["12.1", "12.2", "12.3", "12.4", "12.5", "12.6", "12.7", "12.8", "12.9", "12.10", "12.11", "12.12", "12.13", "12.14", "12.15", "12.16"] },
    { "id": 10, "tasks": ["13.1"] }
  ]
}
```
