# Chat List Refresh Fix — Bugfix Design

## Overview

Die Konversationsliste im Chat wird nach dem initialen Laden nie aktualisiert. Dadurch sehen Benutzer weder neue Nachrichten anderer Teilnehmer, noch Statusänderungen (z.B. Archivierung), noch korrekte Sortierung nach dem Senden eigener Nachrichten. Der Fix führt zwei Mechanismen ein: (1) einen periodischen Refresh der Konversationsliste alle 30 Sekunden sowie einen Visibility-Change-Trigger, und (2) ein optimistisches lokales Update der Konversationsliste beim Senden einer Nachricht via den `MESSAGE_SENT`-Action-Handler im `chatReducer`.

## Glossary

- **Bug_Condition (C)**: Der Zustand, in dem die ChatPage gemountet und offen ist, Zeit seit dem letzten Refresh vergangen ist, und serverseitige Änderungen (neue Nachrichten, Archivierung) nicht im UI reflektiert werden
- **Property (P)**: Die Konversationsliste soll stets den aktuellen Server-Zustand widerspiegeln — innerhalb des nächsten Refresh-Zyklus für externe Änderungen, sofort für eigene Nachrichten
- **Preservation**: Bestehendes Verhalten (initiales Laden, Konversationsauswahl, Nachrichtenversand, globales Unread-Polling, Leave-Aktion, Cleanup bei Unmount) muss unverändert bleiben
- **`chatReducer`**: Der Pure-Reducer in `frontend/src/state/chatState.ts`, der alle Chat-State-Transitionen verarbeitet
- **`ChatPageContent`**: Die innere Komponente in `frontend/src/components/ChatPage.tsx`, die den `useEffect` für das initiale Laden enthält
- **`loadConversations`**: Action Creator in `frontend/src/state/chatActions.ts`, der `apiClient.listConversations()` aufruft und `CONVERSATIONS_LOADED` dispatcht
- **`ConversationListItem`**: Das Interface für einen Eintrag in der Konversationsliste (enthält `lastMessagePreview`, `lastMessageTimestamp`, `unreadCount`, `archived`)

## Bug Details

### Bug Condition

Der Bug manifestiert sich, wenn die ChatPage gemountet bleibt und serverseitige Änderungen auftreten (neue Nachrichten von anderen Teilnehmern, Archivierung durch Verlassen). Die `ChatPageContent`-Komponente ruft `loadConversations` nur einmal im `useEffect` beim Mount auf und hat keinen Mechanismus für periodische Aktualisierung. Zusätzlich aktualisiert der `MESSAGE_SENT`-Handler im `chatReducer` nur das `messages`-Array, nicht die `conversations`-Liste.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type ChatPageState
  OUTPUT: boolean
  
  RETURN input.chatPageMounted = true
         AND input.timeSinceLastConversationRefresh > 0
         AND (input.serverHasNewMessages = true
              OR input.serverHasStatusChanges = true
              OR input.userSentMessage = true)
         AND input.conversationListReflectsServerState = false
END FUNCTION
```

### Examples

- **Archivierung nicht sichtbar**: User A und User B haben eine 2-Personen-Konversation. User B verlässt die Konversation → Server setzt `archived: true`. User A sieht weiterhin die Konversation als aktiv, kann Nachrichten eingeben (die dann mit 403 CONVERSATION_ARCHIVED fehlschlagen).
- **Neue Nachricht nicht sichtbar**: User B sendet eine Nachricht in einer gemeinsamen Konversation. User A's Konversationsliste zeigt weiterhin die alte `lastMessagePreview` und den alten Zeitstempel. Die Sortierung ändert sich nicht.
- **Eigene Nachricht nicht in Liste reflektiert**: User A sendet eine Nachricht. Die Nachricht erscheint im MessageView, aber die Konversationsliste zeigt weiterhin die alte Preview und den alten Zeitstempel. Die Konversation wird nicht an die erste Position sortiert.
- **Tab-Wechsel ohne Refresh**: User A wechselt zu einem anderen Browser-Tab und kehrt nach 5 Minuten zurück. Die Konversationsliste zeigt den Stand von vor 5 Minuten.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Initiales Laden der Konversationen beim Mount via `loadConversations(dispatch, apiClient)` mit Sortierung nach `lastMessageTimestamp`
- Auswahl einer Konversation lädt Nachrichten via `loadMessages` und setzt `currentConversation`
- Senden einer Nachricht fügt die Message zum `messages`-Array hinzu und persistiert via API
- Globales Unread-Polling in `App.tsx` (30-Sekunden-Intervall) aktualisiert den Badge unabhängig
- Leave-Aktion entfernt die Konversation aus der Liste via `CONVERSATION_LEFT`
- Cleanup bei Unmount (Intervalle/Subscriptions werden aufgeräumt)

**Scope:**
Alle Interaktionen, die NICHT mit der periodischen Aktualisierung oder dem lokalen Update nach Nachrichtenversand zusammenhängen, bleiben unverändert. Dies umfasst:
- Mausklicks auf Konversationen (Auswahl)
- Erstellen neuer Konversationen
- Verlassen von Konversationen
- Globales Unread-Badge-Polling

## Hypothesized Root Cause

Based on the code analysis, the root causes are:

1. **Fehlender periodischer Refresh**: `ChatPageContent` hat nur einen `useEffect` mit `[dispatch, apiClient]` als Dependencies, der `loadConversations` einmal beim Mount aufruft. Es gibt keinen `setInterval` oder Visibility-Change-Listener, der einen erneuten Aufruf triggert.

2. **Fehlende lokale Aktualisierung bei MESSAGE_SENT**: Der `MESSAGE_SENT`-Case im `chatReducer` fügt die Nachricht nur zum `messages`-Array hinzu (`messages: [...state.messages, action.payload]`). Er aktualisiert NICHT das entsprechende `ConversationListItem` in `state.conversations` (kein Update von `lastMessagePreview`, `lastMessageTimestamp`, keine Umsortierung).

3. **Kein Visibility-Change-Handler**: Es gibt keinen `document.addEventListener('visibilitychange', ...)` der bei Tab-Fokus einen sofortigen Refresh auslöst.

4. **Architektonische Lücke**: Das globale Unread-Polling in `App.tsx` existiert bereits mit 30-Sekunden-Intervall, aber ein analoger Mechanismus für die Konversationsliste innerhalb der ChatPage fehlt.

## Correctness Properties

Property 1: Bug Condition - Periodischer Refresh aktualisiert Konversationsliste

_For any_ ChatPage-Zustand, in dem die Seite gemountet ist und mindestens ein Refresh-Intervall (30 Sekunden) vergangen ist, SHALL die `loadConversations`-Funktion erneut aufgerufen werden und die Konversationsliste mit dem aktuellen Server-Zustand aktualisieren (einschließlich `archived`-Status, `lastMessagePreview`, `lastMessageTimestamp` und korrekter Sortierung).

**Validates: Requirements 2.1, 2.2, 2.4**

Property 2: Bug Condition - MESSAGE_SENT aktualisiert Konversationsliste lokal

_For any_ `MESSAGE_SENT`-Action mit einer gültigen Message (enthält `conversationId`, `content`, `timestamp`), SHALL der `chatReducer` das entsprechende `ConversationListItem` in `state.conversations` aktualisieren: `lastMessagePreview` auf den (ggf. gekürzten) Nachrichteninhalt setzen, `lastMessageTimestamp` auf den Zeitstempel der Nachricht setzen, und die Konversation an die erste Position der Liste verschieben.

**Validates: Requirements 2.3**

Property 3: Bug Condition - Visibility-Change triggert sofortigen Refresh

_For any_ Visibility-Change-Event, bei dem die ChatPage gemountet ist und das Dokument von `hidden` zu `visible` wechselt, SHALL ein sofortiger Refresh der Konversationsliste ausgelöst werden.

**Validates: Requirements 2.5**

Property 4: Preservation - Bestehendes Verhalten bei Nicht-Refresh-Aktionen

_For any_ Aktion, die NICHT ein periodischer Refresh, ein Visibility-Change-Refresh oder ein MESSAGE_SENT mit Konversationslisten-Update ist (z.B. CONVERSATIONS_LOADED, MESSAGES_LOADED, CONVERSATION_CREATED, CONVERSATION_LEFT, CHAT_CLEARED, GLOBAL_UNREAD_UPDATED, CONVERSATION_UNREAD_RESET), SHALL der `chatReducer` exakt das gleiche Ergebnis produzieren wie die aktuelle Implementierung.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `frontend/src/state/chatState.ts`

**Function**: `chatReducer` — Case `MESSAGE_SENT`

**Specific Changes**:
1. **Konversationslisten-Update bei MESSAGE_SENT**: Im `MESSAGE_SENT`-Case zusätzlich zur Nachricht im `messages`-Array auch das entsprechende `ConversationListItem` in `state.conversations` aktualisieren:
   - `lastMessagePreview` auf `content` setzen (gekürzt auf 100 Zeichen + Ellipsis falls nötig)
   - `lastMessageTimestamp` auf `timestamp` der Nachricht setzen
   - Die Konversation an Position 0 des Arrays verschieben (Sortierung: neueste zuerst)

---

**File**: `frontend/src/components/ChatPage.tsx`

**Function**: `ChatPageContent` — `useEffect` Hook

**Specific Changes**:
2. **Periodischer Refresh via setInterval**: Einen zweiten `useEffect` hinzufügen, der ein 30-Sekunden-Intervall startet und `loadConversations(dispatch, apiClient)` aufruft. Cleanup via `clearInterval` im Return.

3. **Visibility-Change-Handler**: Im gleichen oder separaten `useEffect` einen `document.addEventListener('visibilitychange', handler)` registrieren, der bei `document.visibilityState === 'visible'` sofort `loadConversations(dispatch, apiClient)` aufruft. Cleanup via `removeEventListener`.

4. **Interval-Pause bei Hidden**: Optional den Intervall-Timer pausieren wenn das Dokument nicht sichtbar ist (Ressourcenschonung), und bei Visibility-Change sowohl sofort refreshen als auch den Timer neu starten.

5. **Cleanup bei Unmount**: Sicherstellen, dass sowohl `clearInterval` als auch `removeEventListener` im Cleanup des `useEffect` aufgerufen werden, um Memory Leaks zu verhindern (Requirement 3.6).

## Testing Strategy

### Validation Approach

Die Testing-Strategie folgt einem zweiphasigen Ansatz: Zuerst Counterexamples auf dem unfixed Code demonstrieren, dann den Fix verifizieren und bestehendes Verhalten bewahren.

### Exploratory Bug Condition Checking

**Goal**: Counterexamples demonstrieren, die den Bug auf dem unfixed Code zeigen. Root-Cause-Analyse bestätigen oder widerlegen.

**Test Plan**: Unit-Tests schreiben, die den `chatReducer` mit `MESSAGE_SENT`-Actions aufrufen und prüfen, ob die Konversationsliste aktualisiert wird. Zusätzlich Tests für `ChatPageContent`, die prüfen ob nach dem Mount ein Intervall gestartet wird.

**Test Cases**:
1. **Reducer: MESSAGE_SENT ohne Konversations-Update**: Dispatch `MESSAGE_SENT` → prüfe dass `conversations[i].lastMessagePreview` NICHT aktualisiert wird (wird auf unfixed Code fehlschlagen im Sinne von: der Test zeigt, dass kein Update stattfindet)
2. **Component: Kein Intervall nach Mount**: Render `ChatPageContent` → warte 31 Sekunden (fake timers) → prüfe dass `loadConversations` NICHT erneut aufgerufen wird (wird auf unfixed Code bestätigt)
3. **Component: Kein Visibility-Change-Handler**: Render `ChatPageContent` → fire `visibilitychange` Event → prüfe dass `loadConversations` NICHT erneut aufgerufen wird (wird auf unfixed Code bestätigt)

**Expected Counterexamples**:
- `MESSAGE_SENT` aktualisiert nur `state.messages`, nicht `state.conversations`
- Kein `setInterval` in `ChatPageContent` vorhanden
- Kein `visibilitychange`-Listener registriert

### Fix Checking

**Goal**: Verifizieren, dass für alle Inputs wo die Bug-Condition gilt, die gefixte Funktion das erwartete Verhalten produziert.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  // Reducer fix check
  IF input.type = 'MESSAGE_SENT' THEN
    state' ← chatReducer_fixed(state, input)
    conv ← findConversation(state'.conversations, input.payload.conversationId)
    ASSERT conv.lastMessagePreview = truncate(input.payload.content, 100)
    ASSERT conv.lastMessageTimestamp = input.payload.timestamp
    ASSERT state'.conversations[0].id = input.payload.conversationId
  END IF
  
  // Periodic refresh check
  IF input.timeSinceMount >= 30s THEN
    ASSERT loadConversations was called again
  END IF
  
  // Visibility change check
  IF input.visibilityChanged AND document.visibilityState = 'visible' THEN
    ASSERT loadConversations was called immediately
  END IF
END FOR
```

### Preservation Checking

**Goal**: Verifizieren, dass für alle Inputs wo die Bug-Condition NICHT gilt, die gefixte Funktion das gleiche Ergebnis wie die originale Funktion produziert.

**Pseudocode:**
```
FOR ALL action WHERE action.type NOT IN ['MESSAGE_SENT'] DO
  ASSERT chatReducer_original(state, action) = chatReducer_fixed(state, action)
END FOR

FOR ALL action WHERE action.type = 'MESSAGE_SENT' DO
  state_orig ← chatReducer_original(state, action)
  state_fixed ← chatReducer_fixed(state, action)
  // Messages array must be identical
  ASSERT state_orig.messages = state_fixed.messages
  // Other fields unchanged
  ASSERT state_orig.isLoading = state_fixed.isLoading
  ASSERT state_orig.error = state_fixed.error
END FOR
```

**Testing Approach**: Property-based testing ist empfohlen für Preservation Checking, weil:
- Es automatisch viele Testfälle über den gesamten Input-Raum generiert
- Es Edge Cases findet, die manuelle Unit-Tests übersehen könnten
- Es starke Garantien bietet, dass Verhalten für alle Nicht-Bug-Inputs unverändert bleibt

**Test Plan**: Verhalten auf dem unfixed Code beobachten für alle Nicht-MESSAGE_SENT-Actions, dann Property-Based-Tests schreiben, die dieses Verhalten nach dem Fix verifizieren.

**Test Cases**:
1. **Reducer Preservation**: Für alle Action-Types außer MESSAGE_SENT: `chatReducer_original(state, action) === chatReducer_fixed(state, action)`
2. **MESSAGE_SENT Messages-Array Preservation**: `chatReducer_fixed(state, MESSAGE_SENT).messages` enthält die neue Nachricht (wie bisher)
3. **Initiales Laden Preservation**: ChatPage Mount ruft weiterhin `loadConversations` einmal sofort auf
4. **Cleanup Preservation**: Bei Unmount werden Intervalle und Listener aufgeräumt (kein Memory Leak)

### Unit Tests

- `chatReducer` mit `MESSAGE_SENT`: Prüfe `lastMessagePreview`, `lastMessageTimestamp`, Sortierung
- `chatReducer` mit `MESSAGE_SENT` für nicht-existierende Konversation: Graceful handling (keine Exception)
- `chatReducer` mit `MESSAGE_SENT` und langem Content: Preview wird auf 100 Zeichen + Ellipsis gekürzt
- `ChatPageContent`: Prüfe dass `setInterval` mit 30s gestartet wird (fake timers)
- `ChatPageContent`: Prüfe dass `visibilitychange`-Listener registriert wird
- `ChatPageContent`: Prüfe Cleanup bei Unmount (clearInterval + removeEventListener)

### Property-Based Tests

- Generiere zufällige `ChatState` + `ChatAction`-Kombinationen und verifiziere, dass für alle Nicht-MESSAGE_SENT-Actions der Reducer identisch zum Original arbeitet
- Generiere zufällige `MESSAGE_SENT`-Payloads und verifiziere, dass die Konversationsliste korrekt aktualisiert wird (Preview-Kürzung, Timestamp, Sortierung)
- Generiere zufällige States mit verschiedenen Konversationsanzahlen und verifiziere, dass MESSAGE_SENT die richtige Konversation findet und an Position 0 verschiebt

### Integration Tests

- Vollständiger Flow: Nachricht senden → Konversationsliste prüfen (Preview, Timestamp, Position)
- Periodischer Refresh: ChatPage offen lassen → Server-Daten ändern → nach 30s prüfen ob Liste aktualisiert
- Visibility-Change: Tab wechseln → zurückkehren → prüfen ob Refresh ausgelöst wird
- Archivierung: Anderer Teilnehmer verlässt → nach Refresh prüfen ob `archived`-Label erscheint und Input deaktiviert ist
