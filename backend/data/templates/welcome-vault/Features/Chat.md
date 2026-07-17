---
tags: [features]
---

# Chat

Die Chat-Funktion ermöglicht direkte Kommunikation zwischen Slatebase-Nutzern. Du kannst Konversationen erstellen, Nachrichten austauschen und wirst über ungelesene Nachrichten per Badge informiert.

![[Screenshots/chat-ansicht.png]]

*Die Chat-Ansicht mit Konversationen*

---

> [!tip] Feature-Toggle
> Die Chat-Funktion hängt vom Feature-Toggle `chat` ab. Wenn der Administrator dieses Feature deaktiviert hat, ist der Chat nicht verfügbar. Du erkennst das daran, dass der Chat-Eintrag im Nutzermenü fehlt.

---

## Chat öffnen

- **Nutzermenü:** Klick auf den Avatar oben rechts → "Chat"
- **Command Palette:** `Ctrl+P` → "Chat öffnen"
- **Unread-Badge:** Der Badge am Chat-Icon zeigt die Anzahl ungelesener Nachrichten

---

## Konversation erstellen

1. Öffne die Chat-Seite
2. Klicke auf "Neue Konversation"
3. Suche den/die Teilnehmer über das Suchfeld
4. Gib der Konversation optional einen Namen
5. Klicke auf "Erstellen"

### Mehrere Teilnehmer

- Du kannst eine Konversation mit einem oder mehreren Nutzern erstellen (Multi-User)
- Alle Teilnehmer sehen alle Nachrichten
- Neue Teilnehmer können nachträglich nicht hinzugefügt werden — erstelle in dem Fall eine neue Konversation

---

## Nachrichten senden

1. Wähle eine Konversation aus der Liste
2. Tippe deine Nachricht ins Eingabefeld unten
3. Drücke `Enter` zum Senden (oder klicke den Sende-Button)

### Nachrichtenformat

- Nachrichten sind Klartext (kein Markdown-Rendering)
- Maximale Länge: begrenzt (durch Server-Validierung)
- Leere Nachrichten können nicht gesendet werden

---

## Unread-Badge

Ungelesene Nachrichten werden dir durch Badges angezeigt:

- **Konversationsliste:** Jede Konversation mit ungelesenen Nachrichten zeigt einen Zähler
- **Chat-Icon:** Im Nutzermenü/Navigation zeigt ein Badge die Gesamtzahl ungelesener Nachrichten
- **Automatisches Lesen:** Beim Öffnen einer Konversation werden deren Nachrichten als "gelesen" markiert

---

## Konversation archivieren

Du kannst Konversationen archivieren, die du nicht mehr aktiv nutzt:

1. Wähle die Konversation in der Liste
2. Klicke auf das Archiv-Icon
3. Die Konversation verschwindet aus der aktiven Liste

Archivierte Konversationen können bei Bedarf wiederhergestellt werden.

---

## Konversation verlassen

Wenn du eine Konversation dauerhaft verlassen möchtest:

1. Wähle die Konversation
2. Klicke auf "Konversation verlassen"
3. Bestätige die Aktion

### Auswirkungen

- Du erhältst keine weiteren Nachrichten aus dieser Konversation
- Dein Name verschwindet aus der Teilnehmerliste
- Du kannst die Konversation nicht wieder betreten
- Die anderen Teilnehmer werden informiert

---

## Konversationsliste

Die linke Seite der Chat-Seite zeigt alle deine Konversationen:

- **Sortierung:** Neueste Nachricht oben
- **Vorschau:** Letzte Nachricht als Kurztext
- **Teilnehmer:** Namen der anderen Konversationsteilnehmer
- **Zeitstempel:** Zeitpunkt der letzten Nachricht

---

## Echtzeit-Aktualisierung

Neue Nachrichten erscheinen sofort (Server-Sent Events):

- Du musst die Seite nicht neu laden
- Nachrichten anderer Teilnehmer erscheinen live
- Unread-Badges aktualisieren sich in Echtzeit

---

## Praktisches Beispiel

Teste die Chat-Funktion (erfordert mindestens zwei Nutzer auf der Slatebase-Instanz):

1. Öffne den Chat über das Nutzermenü
2. Erstelle eine neue Konversation mit einem anderen Nutzer
3. Sende eine Testnachricht
4. Wechsle in einen anderen Bereich — beobachte den Unread-Badge
5. Kehre zum Chat zurück und prüfe, dass die Nachricht als "gelesen" markiert wird

Wenn du allein auf der Instanz bist, kannst du trotzdem eine Konversation erstellen und eine Nachricht an dich selbst senden, um die Grundfunktion zu testen.

---

> [!tip] Chat für Vault-Koordination
> Nutze den Chat zur Abstimmung bei geteilten Vaults:
> - "Ich bearbeite gerade den Projektplan — bitte nicht gleichzeitig ändern"
> - "Neue Meeting-Notizen sind im Vault — bitte reviewen"
> - Kurze Absprachen, die keine eigene Notiz wert sind

> [!todo] Übung
> 1. Öffne den Chat (Nutzermenü oder `Ctrl+P` → "Chat")
> 2. Erkunde die Konversationsliste
> 3. Erstelle eine Konversation (mit einem anderen Nutzer oder dir selbst)
> 4. Sende eine Nachricht und beobachte die Echtzeit-Anzeige
> 5. Prüfe den Unread-Badge nach dem Verlassen der Chat-Seite

---

## Verwandte Features

- [[Features/Einstellungen]] — Feature-Toggle `chat` (Admin)
- [[Features/Vault-Verwaltung]] — Vaults teilen für Team-Arbeit
- [[Features/Sync]] — Daten synchronisieren (unabhängig vom Chat)
