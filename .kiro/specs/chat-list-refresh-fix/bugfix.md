# Bugfix Requirements Document

## Introduction

Die Konversationsliste im Chat wird nur einmal beim Mounten geladen und danach nie aktualisiert. Dadurch sehen Benutzer weder neue Nachrichten anderer Teilnehmer, noch Statusänderungen (z.B. Archivierung durch Verlassen eines anderen Teilnehmers), noch korrekte Sortierung nach dem Senden eigener Nachrichten. Die Konversationsliste zeigt veraltete Daten bis der Benutzer manuell die Seite neu lädt.

Betroffen sind zwei zusammenhängende Symptome:
1. Der `archived`-Status wird nicht angezeigt, wenn ein anderer Teilnehmer die Konversation verlässt
2. Die Konversationsliste wird generell nicht zuverlässig aktualisiert (neue Nachrichten, Zeitstempel, Sortierung)

Die Ursache ist identisch: Es fehlt ein periodischer Refresh der Konversationsliste und ein lokales Update nach dem Senden einer Nachricht.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN another participant leaves a 2-person conversation (causing server-side archival) THEN the system continues to display the conversation as active in the current user's conversation list without the archived label or read-only state

1.2 WHEN another user sends a message in a conversation THEN the system does not update the conversation list item (last message preview, timestamp, ordering remain stale)

1.3 WHEN the current user sends a message THEN the system adds the message to the message view but does NOT update the conversation list item's preview, timestamp, or sort position

1.4 WHEN the ChatPage component is mounted THEN the system loads conversations exactly once and never refreshes them again, regardless of how long the page remains open

1.5 WHEN the user navigates away from the chat page and returns THEN the system remounts ChatProvider and reloads conversations, but while the page is open no refresh occurs

### Expected Behavior (Correct)

2.1 WHEN another participant leaves a 2-person conversation (causing server-side archival) THEN the system SHALL reflect the archived status in the conversation list within the next periodic refresh cycle, showing the archived label and disabling message input when the conversation is opened

2.2 WHEN another user sends a message in a conversation THEN the system SHALL update the conversation list item's last message preview, timestamp, and sort position within the next periodic refresh cycle

2.3 WHEN the current user sends a message THEN the system SHALL immediately update the conversation list item's last message preview and timestamp, and move the conversation to the top of the list (optimistic local update)

2.4 WHEN the ChatPage component is mounted and remains open THEN the system SHALL periodically refresh the conversation list at a reasonable interval (e.g., every 30 seconds) to detect server-side changes

2.5 WHEN the chat page becomes visible again (e.g., browser tab regains focus or page visibility changes) THEN the system SHALL trigger an immediate refresh of the conversation list

### Unchanged Behavior (Regression Prevention)

3.1 WHEN the conversation list is initially loaded on ChatPage mount THEN the system SHALL CONTINUE TO load conversations via `loadConversations(dispatch, apiClient)` and display them sorted by last message timestamp

3.2 WHEN the user selects a conversation from the list THEN the system SHALL CONTINUE TO load messages for that conversation and set it as the current conversation

3.3 WHEN the user sends a message in a non-archived conversation THEN the system SHALL CONTINUE TO add the message to the message view and persist it via the API

3.4 WHEN the global unread count polling in App.tsx fires every 30 seconds THEN the system SHALL CONTINUE TO update the global unread badge independently of the conversation list refresh

3.5 WHEN the user leaves a conversation via the leave button THEN the system SHALL CONTINUE TO remove the conversation from the list via the existing CONVERSATION_LEFT action

3.6 WHEN the ChatPage component unmounts THEN the system SHALL CONTINUE TO clean up any intervals or subscriptions to prevent memory leaks

---

## Bug Condition (Formal)

```pascal
FUNCTION isBugCondition(X)
  INPUT: X of type ChatPageState
  OUTPUT: boolean
  
  // The bug triggers when the ChatPage is mounted and time has passed
  // since the initial load, meaning server-side data may have changed
  // (new messages from others, status changes) but no refresh occurs.
  RETURN X.timeSinceLastRefresh > 0 AND X.serverStateChanged = true
END FUNCTION
```

```pascal
// Property: Fix Checking — Conversation list reflects server-side changes
FOR ALL X WHERE isBugCondition(X) DO
  result ← refreshConversations'(X)
  ASSERT result.conversations = latestServerState(X)
    AND result.sortOrder = byLastMessageTimestamp(result.conversations)
END FOR
```

```pascal
// Property: Fix Checking — MESSAGE_SENT updates conversation list locally
FOR ALL M WHERE M.type = 'MESSAGE_SENT' DO
  state' ← chatReducer'(state, M)
  conv ← findConversation(state'.conversations, M.payload.conversationId)
  ASSERT conv.lastMessagePreview = truncate(M.payload.content)
    AND conv.lastMessageTimestamp = M.payload.timestamp
    AND state'.conversations[0].id = M.payload.conversationId
END FOR
```

```pascal
// Property: Preservation Checking — Non-buggy behavior unchanged
FOR ALL X WHERE NOT isBugCondition(X) DO
  ASSERT F(X) = F'(X)
END FOR
```
