# Implementation Plan

## Overview

Fix the chat conversation list not refreshing after initial load. The fix introduces: (1) optimistic local update of the conversation list when the user sends a message (MESSAGE_SENT reducer update), (2) periodic 30-second refresh of the conversation list, and (3) immediate refresh on visibility change (tab focus). The exploratory bugfix workflow writes tests before the fix to confirm the bug, then implements the fix and verifies.

## Tasks

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - MESSAGE_SENT does not update conversation list & no periodic refresh
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the bug exists
  - **Scoped PBT Approach**: Scope the property to concrete failing cases:
    - (a) Dispatch `MESSAGE_SENT` with a valid message payload → assert that `state.conversations` is updated (lastMessagePreview, lastMessageTimestamp, sort position)
    - (b) For any `MESSAGE_SENT` action where `action.payload.conversationId` matches an existing conversation, the reducer MUST update that conversation's `lastMessagePreview` to `truncate(action.payload.content, 100)`, set `lastMessageTimestamp` to `action.payload.timestamp`, and move the conversation to index 0
  - Test file: `frontend/src/state/chatState.test.ts` (new describe block or separate file `frontend/src/state/chatState.bugfix.test.ts`)
  - Use `fast-check` to generate arbitrary Message payloads with valid conversationId matching an existing ConversationListItem
  - Assert: `state.conversations[0].id === message.conversationId` AND `state.conversations[0].lastMessagePreview === truncate(message.content, 100)` AND `state.conversations[0].lastMessageTimestamp === message.timestamp`
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (the current `MESSAGE_SENT` handler only appends to `messages` array, does not touch `conversations`)
  - Document counterexamples found (e.g., "MESSAGE_SENT with conversationId 'abc' leaves conversations[i].lastMessagePreview unchanged")
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.3, 2.3_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Non-MESSAGE_SENT actions produce identical state
  - **IMPORTANT**: Follow observation-first methodology
  - Observe: For all action types except `MESSAGE_SENT`, the current `chatReducer` produces specific state transitions
  - Observe: `CONVERSATIONS_LOADED` replaces conversations list, `MESSAGES_LOADED` sets messages, `CONVERSATION_CREATED` prepends to conversations, `CHAT_CLEARED` resets to initial, `CONVERSATION_LEFT` removes conversation, `GLOBAL_UNREAD_UPDATED` sets globalUnreadCount, `CONVERSATION_UNREAD_RESET` zeroes unread for a conversation
  - Write property-based test with `fast-check`:
    - For all non-MESSAGE_SENT actions: `chatReducer(state, action)` must produce the same result as the current implementation (snapshot the current behavior)
    - For MESSAGE_SENT: `chatReducer(state, MESSAGE_SENT).messages` must still contain the new message appended at the end (existing behavior preserved)
    - For MESSAGE_SENT: `chatReducer(state, MESSAGE_SENT).isLoading`, `.error`, `.currentConversation`, `.globalUnreadCount` must remain unchanged
  - Generate arbitrary `ChatState` and `ChatAction` combinations using fast-check arbitraries
  - Verify tests pass on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [x] 3. Fix for chat list not refreshing and MESSAGE_SENT not updating conversation list

  - [x] 3.1 Implement MESSAGE_SENT conversation list update in chatReducer
    - In `frontend/src/state/chatState.ts`, modify the `MESSAGE_SENT` case
    - Find the matching conversation in `state.conversations` by `action.payload.conversationId`
    - Update `lastMessagePreview` to `action.payload.content.slice(0, 100)` (add ellipsis if content.length > 100)
    - Update `lastMessageTimestamp` to `action.payload.timestamp`
    - Move the updated conversation to index 0 (top of list)
    - If no matching conversation found, gracefully leave conversations unchanged
    - _Bug_Condition: isBugCondition(input) where input.userSentMessage = true AND input.conversationListReflectsServerState = false_
    - _Expected_Behavior: conv.lastMessagePreview = truncate(content, 100) AND conv.lastMessageTimestamp = timestamp AND conversations[0].id = conversationId_
    - _Preservation: messages array still appends the new message, other state fields unchanged_
    - _Requirements: 1.3, 2.3, 3.3_

  - [x] 3.2 Implement periodic refresh in ChatPageContent
    - In `frontend/src/components/ChatPage.tsx`, add a new `useEffect` in `ChatPageContent`
    - Start a `setInterval` with 30-second interval that calls `loadConversations(dispatch, apiClient)`
    - Return cleanup function with `clearInterval`
    - Dependencies: `[dispatch, apiClient]`
    - _Bug_Condition: isBugCondition(input) where input.timeSinceLastConversationRefresh > 30s_
    - _Expected_Behavior: loadConversations called every 30 seconds while page is mounted_
    - _Preservation: Initial load on mount unchanged, cleanup on unmount prevents memory leaks_
    - _Requirements: 1.2, 1.4, 2.2, 2.4, 3.1, 3.6_

  - [x] 3.3 Implement visibility-change handler in ChatPageContent
    - In `frontend/src/components/ChatPage.tsx`, add a `useEffect` that registers a `visibilitychange` event listener on `document`
    - When `document.visibilityState === 'visible'`, immediately call `loadConversations(dispatch, apiClient)`
    - Return cleanup function with `document.removeEventListener('visibilitychange', handler)`
    - Optionally pause the periodic interval when document is hidden (resource conservation)
    - _Bug_Condition: isBugCondition(input) where input.visibilityChanged AND document.visibilityState = 'visible'_
    - _Expected_Behavior: loadConversations called immediately on tab focus_
    - _Preservation: No effect when document remains visible, cleanup on unmount_
    - _Requirements: 1.5, 2.5, 3.6_

  - [x] 3.4 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - MESSAGE_SENT updates conversation list
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - The test from task 1 encodes the expected behavior (lastMessagePreview, lastMessageTimestamp, sort position)
    - When this test passes, it confirms the MESSAGE_SENT reducer fix works correctly
    - Run bug condition exploration test from step 1
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed)
    - _Requirements: 2.3_

  - [x] 3.5 Verify preservation tests still pass
    - **Property 2: Preservation** - Non-MESSAGE_SENT actions produce identical state
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run preservation property tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - Confirm all tests still pass after fix (no regressions)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [x] 4. Checkpoint - Ensure all tests pass
  - Run `npm run test` in `frontend/` to verify all existing and new tests pass
  - Verify no TypeScript errors with `npm run build` in `frontend/`
  - Ensure all tests pass, ask the user if questions arise.


## Task Dependency Graph

```json
{
  "waves": [
    {
      "wave": 1,
      "tasks": ["1", "2"],
      "description": "Write exploration and preservation tests BEFORE fix"
    },
    {
      "wave": 2,
      "tasks": ["3.1", "3.2", "3.3"],
      "description": "Implement the fix (reducer + periodic refresh + visibility handler)"
    },
    {
      "wave": 3,
      "tasks": ["3.4", "3.5"],
      "description": "Verify tests pass after fix"
    },
    {
      "wave": 4,
      "tasks": ["4"],
      "description": "Final checkpoint - all tests green"
    }
  ]
}
```

## Notes

- Tests use `fast-check` (already a devDependency) for property-based testing
- Reducer tests are pure state transitions — no mocking needed
- Component tests for periodic refresh and visibility-change use fake timers (`vi.useFakeTimers()`)
- The periodic refresh interval (30s) aligns with the existing global unread polling interval in App.tsx
