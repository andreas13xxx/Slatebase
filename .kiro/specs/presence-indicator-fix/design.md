# Presence Indicator Fix — Bugfix Design

## Overview

Die Presence-Indikatoren im Chat werden nie angezeigt, weil die `presenceMap` im `RealtimeProvider` als lokaler State gefangen ist und nie an die `ConversationList` durchgereicht wird. Der Fix exponiert die Online-User-IDs über einen Module-Level-Bridge (analog zu `realtimeChatBridge.ts` und `realtimeVaultBridge.ts`) und verdrahtet sie in `ChatPage` mit dem bestehenden `onlineUserIds`-Prop der `ConversationList`.

## Glossary

- **presenceMap**: Eine `Map<string, { username: string; status: string }>` die im `RealtimeInner`-Komponent als lokaler `useState` existiert und `presence:init`/`presence:update`-Events verarbeitet
- **onlineUserIds**: Das optionale `Set<string>`-Prop der `ConversationList`-Komponente, das bestimmt welche Teilnehmer einen grünen Dot erhalten
- **Module-Level Bridge**: Das Slatebase-Pattern für Cross-Provider-Kommunikation: Ein `Set<Callback>` auf Modul-Ebene mit `onX()`/`offX()`/`dispatchX()`-Funktionen (siehe `realtimeChatBridge.ts`, `realtimeVaultBridge.ts`)
- **PresenceService**: Die Backend-Komponente (`backend/src/realtime/presence-service.ts`) die Online-Status basierend auf SSE-Verbindungen trackt
- **RealtimeInner**: Die innere Komponente in `RealtimeProvider.tsx` die SSE-Events routet

## Bug Details

### Bug Condition

Der Bug manifestiert sich immer wenn die Chat-Seite geöffnet ist und mindestens ein anderer Benutzer online ist. Die `presenceMap` in `RealtimeInner` wird korrekt über SSE-Events befüllt, aber der Wert wird mit `[, setPresenceMap]` destrukturiert — nur der Setter wird verwendet, der aktuelle Wert wird explizit verworfen.

Selbst wenn der Wert gelesen würde: `RealtimeInner` rendert `null` und hat keine Möglichkeit, den State an `ChatPage` weiterzureichen, da sie sich in unterschiedlichen Teilen des Komponentenbaums befinden (RealtimeProvider wraps alles, ChatPage ist tief verschachtelt).

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type PresenceWiringState
  OUTPUT: boolean
  
  RETURN input.sseConnected = true
         AND input.presenceEventsReceived = true
         AND input.presenceMapAccessibleToConversationList = false
END FUNCTION
```

### Examples

- **User online, kein Dot**: User A öffnet Chat. User B ist online (SSE sendet `presence:init` mit B). `presenceMap` enthält B → `{username: 'B', status: 'online'}`. Aber `ConversationList` wird ohne `onlineUserIds` gerendert → kein grüner Dot neben B's Name.
- **User geht online, kein visuelles Feedback**: User B verbindet sich. Server sendet `presence:update {userId: B, status: 'online'}`. `RealtimeInner` aktualisiert lokale Map. Kein Re-Render in `ConversationList` da kein Prop-Change.
- **User geht offline, keine Änderung**: User B disconnected. Grace Period läuft ab. Server sendet `presence:update {userId: B, status: 'offline'}`. Kein sichtbarer Effekt, da Dot nie angezeigt wurde.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- SSE Event-Routing für `chat:message`, `chat:unread`, `vault:change`, `sync:conflict`, `notification:toast`, `server:shutdown`, `server:feature-disabled`
- `RealtimeState` (connectionStatus, lastEventId, reconnectAttempts) und zugehöriger Reducer
- `ConversationList` Rendering-Logik (Dot-Stil, Positionierung, CSS-Token)
- Backend PresenceService und SSE Event-Format
- `onPresenceUpdate` und `onPresenceInit` Callbacks in `RealtimeEventHandlers`

**Scope:**
Nur die Verdrahtung zwischen Presence-Event-Handling im `RealtimeProvider` und dem `onlineUserIds`-Prop in `ConversationList` wird geändert. Kein Backend-Change nötig.

## Hypothesized Root Cause

1. **Presence-Map nicht exponiert**: `RealtimeInner` speichert die Map als lokalen State mit `const [, setPresenceMap] = useState(...)`. Der Wert wird nie gelesen oder weitergegeben.

2. **Kein Bridge-Mechanismus für Presence**: Für Chat und Vault existieren Module-Level-Bridges (`realtimeChatBridge.ts`, `realtimeVaultBridge.ts`), aber für Presence gibt es keinen analogen Mechanismus.

3. **ChatPage übergibt kein Prop**: `<ConversationList />` wird ohne `onlineUserIds` gerendert — auch wenn die Daten irgendwo verfügbar wären, fehlt die letzte Meile.

## Correctness Properties

Property 1: Presence-Daten erreichbar für Chat-Komponenten

_For any_ SSE-Verbindung die `presence:init` oder `presence:update` Events empfängt, SHALL die Online-User-IDs über einen definierten Mechanismus (Bridge oder Context) für die `ChatPage`-Komponente zugänglich sein.

**Validates: Requirements 2.1, 2.2, 2.3**

Property 2: ConversationList erhält aktuelle Online-User-IDs

_For any_ Render-Zyklus der `ChatPage`, SHALL die `ConversationList` ein `onlineUserIds`-Prop erhalten, das die aktuellen Online-User-IDs als `Set<string>` enthält (aus der Presence-Bridge/Context).

**Validates: Requirements 2.4**

Property 3: Preservation — Nicht-Presence-Event-Handling unverändert

_For any_ SSE-Event das NICHT `presence:init` oder `presence:update` ist, SHALL die Event-Verarbeitung identisch zur aktuellen Implementierung sein.

**Validates: Requirements 3.1, 3.2**

## Fix Implementation

### Ansatz: Module-Level Presence Bridge

Gewählt wird das bestehende Bridge-Pattern (analog `realtimeChatBridge.ts`) statt Context-Erweiterung, weil:
- Konsistent mit bestehender Architektur (Lessons Learned: "Module-Level Bridge: `Set<Callback>` für Cross-Provider-Events")
- Kein zusätzlicher Provider nötig
- Re-Renders nur in Subscribern (ChatPage), nicht im gesamten Provider-Baum

### Changes Required

**File 1**: `frontend/src/state/realtimePresenceBridge.ts` (NEU)

Module-Level Bridge für Presence-Daten:
- `onPresenceChange(callback: (onlineUserIds: Set<string>) => void): () => void` — Subscriber registrieren, gibt Unsubscribe-Funktion zurück
- `dispatchPresenceChange(onlineUserIds: Set<string>): void` — Aufgerufen von `RealtimeInner` bei Presence-Änderungen
- `getOnlineUserIds(): Set<string>` — Synchroner Zugriff auf aktuellen Stand (für initiales Render)

---

**File 2**: `frontend/src/components/RealtimeProvider.tsx`

Änderung in `RealtimeInner`:
- Import von `dispatchPresenceChange` aus der neuen Bridge
- Die bestehende `setPresenceMap` Logik beibehalten, aber nach jedem Update zusätzlich `dispatchPresenceChange(new Set(map.keys()))` aufrufen
- Dadurch werden Bridge-Subscriber (ChatPage) über Änderungen informiert

---

**File 3**: `frontend/src/components/ChatPage.tsx`

Änderung in `ChatPageContent`:
- Import von `onPresenceChange`, `getOnlineUserIds` aus der Bridge
- Neuer `useState<Set<string>>` initialisiert mit `getOnlineUserIds()`
- `useEffect` der `onPresenceChange` subscribed und bei Änderung den lokalen State aktualisiert
- Cleanup: Unsubscribe im useEffect-Return
- `<ConversationList onlineUserIds={onlineUserIds} />` statt `<ConversationList />`

---

**Kein Backend-Change nötig.** Das Backend sendet die Events bereits korrekt.

## Testing Strategy

### Unit Tests

1. **realtimePresenceBridge.ts**: 
   - `dispatchPresenceChange` benachrichtigt alle registrierten Callbacks
   - `getOnlineUserIds()` gibt den letzten dispatched Stand zurück
   - `onPresenceChange` gibt funktionierende Unsubscribe-Funktion zurück
   - Mehrere Subscriber erhalten alle Updates

2. **RealtimeProvider (Presence-Dispatch)**:
   - `presence:init` Event → `dispatchPresenceChange` wird mit korrektem Set aufgerufen
   - `presence:update` (online) → User ID wird zum Set hinzugefügt und dispatched
   - `presence:update` (offline) → User ID wird aus dem Set entfernt und dispatched

3. **ChatPage (Integration)**:
   - `ConversationList` erhält `onlineUserIds` Prop
   - Presence-Bridge-Update → Re-Render mit aktualisiertem Set
   - Cleanup bei Unmount (Unsubscribe)

### Preservation Tests

- Alle bestehenden `RealtimeProvider`-Callbacks (`onChatMessage`, `onChatUnread`, `onVaultChange`) funktionieren unverändert
- `ConversationList` mit explicit `onlineUserIds`-Prop rendert grüne Dots wie bisher implementiert (bestehende Rendering-Logik wird nicht geändert)
