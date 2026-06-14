# Implementation Plan

## Overview

Fix für die fehlenden Online-Status-Indikatoren im Chat. Die Presence-Map wird über eine Module-Level Bridge (analog realtimeChatBridge/realtimeVaultBridge) exponiert, in ChatPage subscribed und als `onlineUserIds`-Prop an die bereits fertige `ConversationList`-Rendering-Logik weitergereicht. Reiner Frontend-Fix, kein Backend-Change.

## Tasks

- [x] 1. Create module-level presence bridge
  - Create `frontend/src/state/realtimePresenceBridge.ts`
  - Implement `Set<(onlineUserIds: Set<string>) => void>` as module-level subscriber set
  - Export `onPresenceChange(callback): () => void` — register subscriber, return unsubscribe function
  - Export `dispatchPresenceChange(onlineUserIds: Set<string>): void` — notify all subscribers
  - Export `getOnlineUserIds(): Set<string>` — return current snapshot (module-level variable)
  - Store last dispatched Set in module-level variable for synchronous access via `getOnlineUserIds()`
  - Follow same pattern as `realtimeChatBridge.ts` (Set of callbacks, named exports, no class)
  - _Requirements: 2.1_

- [x] 2. Wire RealtimeProvider to dispatch presence changes via bridge
  - In `frontend/src/components/RealtimeProvider.tsx`, import `dispatchPresenceChange` from `../state/realtimePresenceBridge`
  - In the `presence:init` case: after `setPresenceMap(...)`, call `dispatchPresenceChange(new Set(onlineUsers.map(u => u.userId)))`
  - In the `presence:update` case: after `setPresenceMap(...)`, call `dispatchPresenceChange` with the updated key set
  - For `presence:update`, use the `setPresenceMap` callback's return value indirectly: track a module-ref or compute the new set from the event data (add/remove userId from current `getOnlineUserIds()`)
  - Preserve all existing behavior: `onPresenceUpdate` and `onPresenceInit` callbacks still fire
  - _Requirements: 2.1, 2.2, 2.3, 3.1, 3.2_

- [x] 3. Wire ChatPage to subscribe to presence bridge and pass onlineUserIds to ConversationList
  - In `frontend/src/components/ChatPage.tsx`, import `onPresenceChange`, `getOnlineUserIds` from `../state/realtimePresenceBridge`
  - In `ChatPageContent`, add `const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(() => getOnlineUserIds())`
  - Add `useEffect` that subscribes via `onPresenceChange(setOnlineUserIds)` and returns unsubscribe function
  - Change `<ConversationList />` to `<ConversationList onlineUserIds={onlineUserIds} />`
  - _Requirements: 2.4, 3.3_

- [x] 4. Write unit tests for presence bridge
  - Create `frontend/src/state/realtimePresenceBridge.test.ts`
  - Test: `dispatchPresenceChange` calls all registered subscribers with correct Set
  - Test: `getOnlineUserIds()` returns empty Set initially
  - Test: `getOnlineUserIds()` returns last dispatched Set after dispatch
  - Test: Unsubscribe function removes callback from subscriber set
  - Test: Multiple subscribers all receive updates
  - Test: Dispatching after unsubscribe does not call removed callback
  - _Requirements: 2.1, 2.2, 2.3_

- [x] 5. Verify build and all tests pass
  - Run `npm run test` in `frontend/` to verify all existing and new tests pass
  - Run `npm run build` in `frontend/` to verify no TypeScript errors
  - Manually verify: the `ConversationList` component now receives `onlineUserIds` and the existing green dot rendering logic activates for online users
  - _Requirements: 2.1–2.5, 3.1–3.5_


## Task Dependency Graph

```json
{
  "waves": [
    {
      "wave": 1,
      "tasks": ["1"],
      "description": "Create the module-level presence bridge"
    },
    {
      "wave": 2,
      "tasks": ["2", "3"],
      "description": "Wire bridge to RealtimeProvider (producer) and ChatPage (consumer)"
    },
    {
      "wave": 3,
      "tasks": ["4"],
      "description": "Write unit tests for the bridge"
    },
    {
      "wave": 4,
      "tasks": ["5"],
      "description": "Final verification — build + tests green"
    }
  ]
}
```

## Notes

- Die `ConversationList`-Komponente und ihre Rendering-Logik (grüner Dot, inline styles, `--presence-online` Token) sind bereits fertig implementiert — nur das Prop wird nie übergeben
- Das Bridge-Pattern ist konsistent mit `realtimeChatBridge.ts` und `realtimeVaultBridge.ts`
- Kein neuer Provider nötig — Bridge vermeidet unnötige Re-Renders im gesamten Baum
- Kein Backend-Change nötig — PresenceService + SSE-Events funktionieren korrekt
- Kein roter Dot für Offline-User — Design-Entscheidung aus der Original-Spec (nur grüner Dot bei Online). Falls gewünscht, kann das separat als Enhancement ergänzt werden.
