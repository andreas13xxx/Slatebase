# Implementation Plan: Chat-Enhancements — Konversation verlassen und Ungelesen-Indikator

## Overview

Dieses Feature erweitert das bestehende Chat-System um zwei zusammenhängende Funktionen: (1) Konversation verlassen mit Archivierung und (2) Ungelesen-Indikator (global + pro Konversation). Die Implementierung erfolgt inkrementell: zuerst Backend-Erweiterungen (Typen, UnreadStore, ConversationStore, ChatService, API-Endpoints), dann Frontend-Erweiterungen (State, API-Client, UI-Komponenten).

## Tasks

- [x] 1. Extend types, interfaces, and error classes
  - [x] 1.1 Extend Conversation interface and add ConversationArchivedError
    - Add optional `archived?: boolean` field to `Conversation` interface in `backend/src/chat/types.ts`
    - Add `unreadCount: number` and `archived?: boolean` fields to `ConversationListItem` interface
    - Add `leaveConversation` and `getUnreadTotal` methods to `IChatService` interface
    - Add `update(conversation: Conversation): Promise<void>` method to `IConversationStore` interface
    - Create `ConversationArchivedError` class in `backend/src/chat/errors.ts`
    - _Requirements: 2.4, 4.1_

  - [x] 1.2 Define IUnreadStore interface in `backend/src/chat/types.ts`
    - Add `IUnreadStore` interface with methods: `increment`, `reset`, `getCount`, `getAllCounts`, `getTotal`, `remove`, `loadIndex`
    - _Requirements: 5.1, 5.2, 5.3, 8.1_

- [x] 2. Implement UnreadStore (backend persistence layer)
  - [x] 2.1 Implement UnreadStore class in `backend/src/chat/unread-store.ts`
    - Create `UnreadStore` implementing `IUnreadStore`
    - In-memory index: `Map<string, Map<string, number>>` (userId → conversationId → count)
    - Persist as JSON files under `data/chat/unread/<userId>.json`
    - Atomic writes (temp file → rename)
    - `loadIndex()`: read all JSON files from unread directory, skip corrupt files with error logging
    - _Requirements: 5.3, 8.1, 8.2, 8.3, 8.4_

  - [x]* 2.2 Write unit tests for UnreadStore
    - Test increment, reset, remove, getCount, getTotal, getAllCounts
    - Test loadIndex with valid files, corrupt files, missing directory
    - Test atomic write behavior
    - _Requirements: 5.3, 8.1, 8.2, 8.3, 8.4_

  - [x]* 2.3 Write property test: Unread persistence round-trip
    - **Property 11: Unread persistence round-trip**
    - **Validates: Requirements 5.3, 5.4, 8.1, 8.3**

- [x] 3. Extend ConversationStore with update method
  - [x] 3.1 Add `update` method to ConversationStore in `backend/src/chat/conversation-store.ts`
    - Implement atomic write (temp → rename) for updated conversation
    - Update in-memory cache and participantIndex (remove old participants, add new)
    - Handle participant removal from index when user leaves
    - _Requirements: 1.1, 1.2, 2.4_

  - [x]* 3.2 Write unit tests for ConversationStore.update
    - Test participant removal updates index correctly
    - Test archived flag persistence
    - Test atomic write behavior
    - _Requirements: 1.1, 1.2, 2.4_

- [x] 4. Extend ChatService with leaveConversation and unread integration
  - [x] 4.1 Add UnreadStore dependency to ChatService constructor
    - Extend constructor to accept `IUnreadStore` as new parameter
    - Update composition root wiring in `backend/src/index.ts`
    - Instantiate UnreadStore, call `loadIndex()` at startup
    - _Requirements: 5.1, 5.2_

  - [x] 4.2 Implement `leaveConversation` method in ChatService
    - Find conversation (throw ConversationNotFoundError if not found)
    - Check user is participant (throw NotParticipantError if not)
    - Remove user from participants array
    - If remaining participants < 2: set `archived = true`
    - Call `conversationStore.update(conversation)`
    - Call `unreadStore.remove(userId, conversationId)`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 9.1_

  - [x] 4.3 Implement `getUnreadTotal` method in ChatService
    - Delegate to `unreadStore.getTotal(userId)`
    - _Requirements: 6.1, 6.2_

  - [x] 4.4 Extend `sendMessage` to increment unread counts
    - After successful message persistence, increment unread for all participants except sender
    - Add archived check before sending (throw ConversationArchivedError)
    - _Requirements: 5.1, 2.2_

  - [x] 4.5 Extend `getMessages` to reset unread count
    - After successful message retrieval, call `unreadStore.reset(userId, conversationId)`
    - _Requirements: 5.2_

  - [x] 4.6 Extend `listConversations` to include unreadCount and archived status
    - Enrich each ConversationListItem with `unreadCount` from UnreadStore
    - Include `archived` field from conversation metadata
    - _Requirements: 5.5, 2.3_

  - [x]* 4.7 Write unit tests for ChatService.leaveConversation
    - Test success: 3+ participants (user removed, conversation active)
    - Test success: 2 participants (user removed, conversation archived)
    - Test error: conversation not found (404)
    - Test error: user not participant (403)
    - Test unread entry removal on leave
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 9.1_

  - [x]* 4.8 Write unit tests for sendMessage unread integration
    - Test unread increment for non-senders
    - Test archived conversation rejection
    - _Requirements: 5.1, 2.2_

  - [x]* 4.9 Write unit tests for getMessages unread reset
    - Test unread count reset to 0 after retrieval
    - _Requirements: 5.2_

- [x] 5. Checkpoint — Backend business logic
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Add API endpoints (leave conversation + unread total)
  - [x] 6.1 Add DELETE `/chat/conversations/:conversationId/participants/me` endpoint
    - Validate conversationId with hexId24Schema
    - Check suspended status
    - Call `chatService.leaveConversation(userId, conversationId)`
    - Return 204 on success
    - Map ConversationArchivedError to 403 with code `CONVERSATION_ARCHIVED` in handleError
    - Register route in ChatRouteModule
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [x] 6.2 Add GET `/chat/unread/total` endpoint
    - Check suspended status
    - Call `chatService.getUnreadTotal(userId)`
    - Return `{ total: number }` with 200
    - Register route in ChatRouteModule
    - _Requirements: 6.1, 6.2_

  - [x]* 6.3 Write unit tests for new chat endpoints
    - Test leave: 204 success, 400 invalid ID, 403 not participant, 403 suspended, 404 not found
    - Test unread total: 200 success, 403 suspended
    - Test ConversationArchivedError mapping
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 6.1, 6.2_

- [x] 7. Property-based tests for backend logic
  - [x]* 7.1 Write property tests for leaveConversation (Properties 1–4)
    - **Property 1: Leave removes participant and hides conversation**
    - **Property 2: Leave archives when two participants remain**
    - **Property 3: Non-participant cannot leave**
    - **Property 4: Non-existent conversation leave returns not-found**
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 2.3, 2.4**

  - [x]* 7.2 Write property tests for archived conversation behavior (Properties 5–6)
    - **Property 5: Archived conversation allows read access**
    - **Property 6: Archived conversation blocks message sending**
    - **Validates: Requirements 2.1, 2.2**

  - [x]* 7.3 Write property tests for validation and access control (Properties 7–8)
    - **Property 7: Invalid conversation ID is rejected**
    - **Property 8: Suspended user cannot leave conversation**
    - **Validates: Requirements 4.3, 4.5**

  - [x]* 7.4 Write property tests for unread increment/reset (Properties 9–10)
    - **Property 9: Message increments unread for non-senders**
    - **Property 10: Reading messages resets unread to zero**
    - **Validates: Requirements 5.1, 5.2**

  - [x]* 7.5 Write property tests for unread enrichment and total (Properties 12–13)
    - **Property 12: Conversation list includes correct unreadCount**
    - **Property 13: Total unread is sum of per-conversation counts**
    - **Validates: Requirements 5.5, 6.2**

  - [x]* 7.6 Write property tests for leave/archive unread integration (Properties 14–15)
    - **Property 14: Leave removes unread entry**
    - **Property 15: Archive preserves remaining participant's unread**
    - **Validates: Requirements 9.1, 9.3**

- [x] 8. Checkpoint — Backend complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Extend frontend state and API client
  - [x] 9.1 Extend IApiClient with new methods
    - Add `leaveConversation(conversationId: string): Promise<void>` to IApiClient interface and ApiClient implementation
    - Add `getUnreadTotal(): Promise<{ total: number }>` to IApiClient interface and ApiClient implementation
    - _Requirements: 4.1, 6.1_

  - [x] 9.2 Extend ChatState and chatReducer with new actions
    - Add `globalUnreadCount: number` to ChatState
    - Add `unreadCount: number` and `archived?: boolean` to frontend ConversationListItem
    - Add actions: `CONVERSATION_LEFT`, `GLOBAL_UNREAD_UPDATED`, `CONVERSATION_UNREAD_RESET`
    - Implement reducer cases for all new actions
    - _Requirements: 5.5, 6.3, 7.3, 9.2_

  - [x] 9.3 Implement chat action creators for leave and unread
    - `leaveConversation(dispatch, apiClient, conversationId)` — calls API, dispatches CONVERSATION_LEFT
    - `pollUnreadTotal(dispatch, apiClient)` — calls getUnreadTotal, dispatches GLOBAL_UNREAD_UPDATED
    - _Requirements: 3.3, 6.3, 9.2_

  - [x]* 9.4 Write unit tests for new chatReducer actions
    - Test CONVERSATION_LEFT removes conversation and updates globalUnreadCount
    - Test GLOBAL_UNREAD_UPDATED sets globalUnreadCount
    - Test CONVERSATION_UNREAD_RESET sets unreadCount to 0 for conversation
    - _Requirements: 5.5, 6.3, 7.3, 9.2_

- [x] 10. Implement frontend UI components
  - [x] 10.1 Add global unread badge to SidebarToolbar
    - Add 30-second polling interval in ChatProvider (useEffect + setInterval)
    - Display numeric badge on chat button when globalUnreadCount > 0
    - Hide badge when globalUnreadCount is 0
    - Cleanup interval on unmount
    - _Requirements: 6.3, 6.4, 6.5_

  - [x] 10.2 Add unread indicator to ConversationList
    - Display numeric badge per conversation when unreadCount > 0
    - On conversation open: dispatch CONVERSATION_UNREAD_RESET (optimistic update)
    - Read unreadCount from server response in CONVERSATIONS_LOADED
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

  - [x] 10.3 Add leave conversation button with ConfirmModal
    - Add leave button (LogOut icon from Lucide) per conversation in ConversationList
    - On click: show ConfirmModal with warning text (i18n keys)
    - On confirm: call leaveConversation action, update global badge
    - On cancel: close modal, no action
    - Show archived status label for archived conversations
    - Disable message input for archived conversations
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 2.3_

  - [x] 10.4 Add i18n keys for chat enhancements
    - Add new keys to `frontend/src/i18n/de.ts` and `frontend/src/i18n/en.ts`
    - Keys: `chat.leaveConversation`, `chat.leaveConfirmTitle`, `chat.leaveConfirmMessage`, `chat.leaveConfirmButton`, `chat.archived`, `chat.archivedMessage`
    - _Requirements: 3.2_

  - [x]* 10.5 Write component tests for ConversationList unread and leave UI
    - Test unread badge renders when unreadCount > 0
    - Test leave button triggers ConfirmModal
    - Test confirm dispatches leave action
    - Test cancel closes modal without action
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 7.1, 7.2_

- [x] 11. Final checkpoint — All tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The UnreadStore follows the same persistence pattern as ConversationStore (atomic writes, in-memory index, loadIndex at startup)
- Frontend polling interval (30s) is consistent with the REST-only architecture — no WebSocket needed

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["2.1", "3.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "3.2", "4.1"] },
    { "id": 3, "tasks": ["4.2", "4.3", "4.4", "4.5", "4.6"] },
    { "id": 4, "tasks": ["4.7", "4.8", "4.9", "6.1", "6.2"] },
    { "id": 5, "tasks": ["6.3", "7.1", "7.2", "7.3", "7.4", "7.5", "7.6"] },
    { "id": 6, "tasks": ["9.1", "9.2", "10.4"] },
    { "id": 7, "tasks": ["9.3", "9.4"] },
    { "id": 8, "tasks": ["10.1", "10.2", "10.3"] },
    { "id": 9, "tasks": ["10.5"] }
  ]
}
```
