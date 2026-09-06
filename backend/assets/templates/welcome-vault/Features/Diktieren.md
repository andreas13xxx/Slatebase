---
tags: [features]
---

# Diktieren (Spracherkennung)

Diktieren wandelt gesprochene Sprache in Text um und fügt ihn direkt an der Cursorposition im Editor ein. Die Spracherkennung läuft mit **Whisper auf dem eigenen Server** — die Aufnahme verlässt den Server nie, es gibt keine externen Dienste und keine Nutzungsgebühren.

> [!warning] Rechenintensiv — nicht überall verfügbar
> Whisper braucht spürbar Rechenleistung. Auf einem Server ohne GPU ist die Umwandlung merklich langsam. Das Feature ist deshalb **standardmäßig ausgeschaltet** und erscheint nur, wenn ein Administrator es aktiviert **und** ein Whisper-Backend konfiguriert hat. Siehst du den Befehl nicht, ist die Funktion in deiner Installation (noch) nicht eingerichtet.

---

## Voraussetzungen

- Feature-Toggle `voice-transcription` aktiviert (siehe [[Admin/Feature-Toggles]]; standardmäßig **aus**)
- Ein Whisper-Backend ist serverseitig konfiguriert (`SLATEBASE_TRANSCRIPTION_BACKEND_URL`) — sonst bleibt die Funktion trotz aktiviertem Schalter ohne Wirkung
- Ein Vault mit Schreibrecht ist ausgewählt, eine Notiz ist im Bearbeiten-Modus geöffnet
- Mikrofonzugriff im Browser und eine sichere Verbindung (HTTPS) — ohne HTTPS gibt der Browser das Mikrofon nicht frei

---

## Diktieren starten und stoppen

1. Öffne eine Notiz im Bearbeiten-Modus und setze den Cursor an die gewünschte Stelle
2. Öffne die [[Features/Command Palette|Befehlspalette]] (`Ctrl+P`) und wähle **Diktat starten/stoppen**
3. Erlaube den Mikrofonzugriff, wenn der Browser danach fragt
4. Sprich deinen Text
5. Löse denselben Befehl erneut aus (oder klicke **Stopp & Umwandeln** im Aufnahme-Panel)
6. Der erkannte Text wird an der Cursorposition eingefügt

Während der Umwandlung erscheint ein Hinweis, dass es je nach Serverauslastung einen Moment dauern kann. Das ist normal — besonders ohne GPU.

---

## Sprache wählen

Im Aufnahme-Panel lässt sich die Sprache umstellen:

| Option | Verhalten |
|--------|-----------|
| Automatisch erkennen | Whisper bestimmt die Sprache selbst (Standard) |
| Deutsch | Erkennung auf Deutsch |
| Englisch | Erkennung auf Englisch |

Die Auswahl wird pro Nutzer **und** pro Vault gemerkt — ein deutschsprachiger und ein englischsprachiger Vault behalten also jeweils ihre eigene Einstellung.

---

## Aufnahme als Anhang speichern

Aktivierst du im Aufnahme-Panel **Audio speichern**, wird die Originalaufnahme zusätzlich als Audiodatei im Anhänge-Verzeichnis des Vaults abgelegt (siehe [[Features/Vorlagen und Daily Notes]] zur Konfiguration des Anhänge-Ordners) und als abspielbarer [[Features/Embeds|Embed]] (`![[…]]`) in die Notiz eingefügt. So bleibt die Sprachaufnahme neben dem Text erhalten und lässt sich später erneut anhören.

Schlägt das Speichern des Anhangs fehl, geht der umgewandelte Text trotzdem nicht verloren — er wird auf jeden Fall eingefügt.

---

## Datenschutz

Die Aufnahme wird ausschließlich an das vom Betreiber konfigurierte Whisper-Backend geschickt und dort umgewandelt. Sie wird serverseitig **nicht** dauerhaft gespeichert — die einzige Ausnahme ist der bewusst gewählte Vault-Anhang (siehe oben).

---

> [!todo] Übung
> Diktiere einen kurzen Absatz in eine neue Notiz. Stelle die Sprache einmal auf „Automatisch erkennen" und einmal fest auf Deutsch, und vergleiche das Ergebnis. Aktiviere danach „Audio speichern" und prüfe, ob der Audio-Embed in der Notiz abspielbar ist.

---

## Verwandte Features

- [[Features/Command Palette]] — Der Befehl „Diktat starten/stoppen" wird hierüber ausgelöst
- [[Features/Embeds]] — Wie die gespeicherte Audioaufnahme als Embed abgespielt wird
- [[Grundlagen/Editor und Viewer]] — Enthält die eingebaute Rechtschreibprüfung des Editors
- [[Admin/Feature-Toggles]] — Feature serverweit aktivieren/deaktivieren
