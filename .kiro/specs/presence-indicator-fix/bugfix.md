# Bugfix Requirements Document

## Introduction

Die Online-Status-Indikatoren (grüne Punkte) werden in der Chat-Konversationsliste nie angezeigt, obwohl die Presence-Infrastruktur im Backend vollständig implementiert ist. Das Backend sendet korrekt `presence:init` und `presence:update` Events über SSE, und der `RealtimeProvider` empfängt und verarbeitet diese Events in einer lokalen `presenceMap`. Allerdings wird diese Map nie nach außen exponiert — sie bleibt als ungenutzter lokaler State im `RealtimeInner`-Komponent gefangen. Gleichzeitig rendert `ChatPage.tsx` die `ConversationList` ohne das `onlineUserIds`-Prop zu übergeben, weshalb die Presence-Dots nie sichtbar werden.

Das Feature wurde in der `realtime-infrastructure`-Spec als Task 20 markiert (✅ fertig), aber die Integration zwischen RealtimeProvider und ChatPage wurde nicht vollständig verdrahtet.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN the SSE connection is established and the server sends a `presence:init` event with online users THEN the system stores the data in a local `useState` inside `RealtimeInner` but does NOT expose it to any consumer component

1.2 WHEN a user goes online or offline and the server sends a `presence:update` event THEN the system updates the local `presenceMap` state inside `RealtimeInner` but does NOT propagate it to the `ConversationList`

1.3 WHEN `ChatPage` renders the `ConversationList` component THEN the system passes NO `onlineUserIds` prop, causing `onlineUserIds` to be `undefined`

1.4 WHEN `ConversationList` evaluates `isOnline` for each participant THEN the check `onlineUserIds?.has(participantId)` always returns `undefined` (falsy) because `onlineUserIds` is never provided

1.5 WHEN a user is online THEN the system does NOT display a green presence dot next to their name in the conversation list

1.6 WHEN a user is offline THEN the system does NOT display any indicator (neither dot absence nor a grey/red dot), which is by design — however, the online indicator also never appears, making the distinction invisible

### Expected Behavior (Correct)

2.1 WHEN the SSE connection is established and the server sends a `presence:init` event with online users THEN the system SHALL store the online user IDs in a state accessible to chat components (via Context, prop drilling, or a module-level bridge)

2.2 WHEN a user goes online (server sends `presence:update` with status `online`) THEN the system SHALL add that user's ID to the accessible presence set AND the `ConversationList` SHALL display a green dot (8px, `--presence-online` token) next to that user's name

2.3 WHEN a user goes offline (server sends `presence:update` with status `offline`) THEN the system SHALL remove that user's ID from the accessible presence set AND the green dot SHALL disappear from the `ConversationList`

2.4 WHEN `ChatPage` renders the `ConversationList` component THEN the system SHALL pass the current set of online user IDs as the `onlineUserIds` prop

2.5 WHEN the SSE connection drops and reconnects THEN the system SHALL receive a fresh `presence:init` event and update the presence state accordingly (potentially removing stale entries)

### Unchanged Behavior (Regression Prevention)

3.1 WHEN the SSE connection handles `chat:message`, `chat:unread`, `vault:change`, or other non-presence events THEN the system SHALL CONTINUE TO route them to the appropriate handlers unchanged

3.2 WHEN the `RealtimeProvider` manages connection status (connected, disconnected, fallback, reconnect) THEN the system SHALL CONTINUE TO work exactly as before

3.3 WHEN the `ConversationList` receives `onlineUserIds` with user IDs THEN the existing rendering logic (green dot with inline styles and `--presence-online` token) SHALL CONTINUE TO work without modification

3.4 WHEN the CSS tokens `--presence-online` are defined in `index.css` (Light: #22c55e, Dark: #4ade80) THEN they SHALL CONTINUE TO be available and unchanged

3.5 WHEN the backend `PresenceService` emits `presence:update` and `presence:init` events THEN the event format and delivery mechanism SHALL remain unchanged (this is a frontend-only fix)

---

## Bug Condition (Formal)

```pascal
FUNCTION isBugCondition(X)
  INPUT: X of type PresenceWiringState
  OUTPUT: boolean
  
  // The bug triggers when presence events are received but the data
  // is not accessible to the ConversationList component
  RETURN X.presenceEventsReceived = true
    AND X.presenceMapExposedToConsumers = false
END FUNCTION
```

```pascal
// Property: Fix Checking — Online users visible in ConversationList
FOR ALL X WHERE isBugCondition(X) DO
  result ← renderConversationList'(X)
  FOR ALL participant IN result.participants DO
    IF participant.userId IN X.onlineUserIds THEN
      ASSERT participant.presenceDotVisible = true
    ELSE
      ASSERT participant.presenceDotVisible = false
    END IF
  END FOR
END FOR
```

```pascal
// Property: Preservation Checking — Non-presence SSE handling unchanged
FOR ALL event WHERE event.type NOT IN ['presence:update', 'presence:init'] DO
  ASSERT handleEvent(event) = handleEvent'(event)
END FOR
```
