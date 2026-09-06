# Requirements Document

## Introduction

Slatebase soll eine native Diktier-/Spracherkennungsfunktion bekommen: Der Nutzer nimmt im Editor Sprache auf, das Backend transkribiert sie mit einer **self-hosted Whisper-Instanz** und der erkannte Text wird an der Cursorposition in die Notiz eingefügt. Zusätzlich kann die Audioaufnahme als Anhang im Vault gespeichert werden, und die Transkription unterstützt mehrere Sprachen.

Diese native Lösung ersetzt bewusst den Weg über Obsidian-Community-Diktier-Plugins (Whisper-/Speech-to-Text-Plugins). Deren Einordnung und die Begründung für die native Entscheidung sind in `PLUGIN-COMPAT.md` (Abschnitt „Diktier-/Spracherkennungs-Plugins → native Lösung statt Compat-Layer") dokumentiert. Kernmotive: kostenlos (keine externen API-Gebühren), datenschutzkonform (Audio verlässt den eigenen Server nie), browserunabhängig.

Whisper braucht spürbar Rechenleistung. Das Feature ist deshalb **feature-getoggelt (kalt, standardmäßig aus)**, nur nutzbar wenn der Betreiber eine Whisper-Instanz konfiguriert hat, und **vom Admin serverweit abschaltbar**. Doku und Oberfläche weisen ausdrücklich auf die Geschwindigkeits-/Serveranforderung hin. Das Feature ist unabhängig von der `obsidian-plugin-compat`-Schicht.

## Glossary

- **Transcription_Backend**: Die self-hosted Whisper-Instanz (z. B. whisper.cpp / faster-whisper über einen HTTP-Endpoint), die Audio zu Text macht. Vom Betreiber per Konfiguration bereitgestellt.
- **Transcription_Service**: Das serverseitige Slatebase-Modul, das Audio entgegennimmt, an das Transcription_Backend weiterreicht und Text zurückgibt.
- **Dictation_Recorder**: Die Frontend-Komponente, die per `MediaRecorder` Mikrofon-Audio aufnimmt.
- **Transcription_Language**: Die für eine Aufnahme gewählte Sprache (oder Auto-Erkennung).
- **Audio_Attachment**: Die optional im Vault gespeicherte Audiodatei einer Aufnahme.

## Requirements

### Requirement 1: Diktieren in den Editor

**User Story:** Als Nutzer möchte ich im Editor sprechen und den erkannten Text automatisch an der Cursorposition eingefügt bekommen, damit ich Notizen freihändig erfassen kann.

#### Acceptance Criteria

1. THE Dictation_Recorder SHALL im Markdown-Editor über einen Command („Diktat starten/stoppen", Command-Palette + Editor-Kontextmenü) und einen optionalen Toolbar-Eintrag aufrufbar sein
2. WHEN der Nutzer eine Aufnahme startet, THE Dictation_Recorder SHALL Mikrofonzugriff über `navigator.mediaDevices.getUserMedia` anfordern und den laufenden Aufnahmezustand sichtbar anzeigen
3. WHEN der Nutzer die Aufnahme stoppt, THE Dictation_Recorder SHALL das Audio an den Transcription_Service senden und den zurückgegebenen Text an der aktuellen Cursorposition des aktiven Editors einfügen
4. WHEN kein Editor aktiv ist oder die aktive Notiz schreibgeschützt ist, THE Dictation_Recorder SHALL den Start verhindern und einen Hinweis anzeigen
5. WHEN der Mikrofonzugriff verweigert wird oder `getUserMedia` nicht verfügbar ist (z. B. Nicht-HTTPS-Kontext), THE Dictation_Recorder SHALL einen verständlichen Fehlerhinweis anzeigen statt still zu scheitern

### Requirement 2: Mehrsprachige Transkription

**User Story:** Als Nutzer möchte ich die Sprache meiner Aufnahme wählen können, damit die Erkennung für Deutsch, Englisch und weitere Sprachen funktioniert.

#### Acceptance Criteria

1. THE Dictation_Recorder SHALL eine Sprachauswahl anbieten (mindestens Deutsch und Englisch) sowie eine Option „automatisch erkennen"
2. THE Dictation_Recorder SHALL die zuletzt gewählte Transcription_Language pro Nutzer und Vault merken und als Default vorschlagen (über `vaultSettingsStore`, konsistent mit der Editor-Rechtschreibsprache)
3. THE Transcription_Service SHALL die gewählte Sprache an das Transcription_Backend weiterreichen; bei „automatisch erkennen" SHALL er die Sprachwahl dem Backend überlassen
4. THE Transcription_Service SHALL eine konfigurierbare Liste unterstützter Sprachen führen, die sich an den Whisper-Sprachcodes orientiert

### Requirement 3: Audio als Vault-Anhang

**User Story:** Als Nutzer möchte ich die Originalaufnahme optional als Anhang in meinem Vault behalten, damit ich sie später anhören oder neu transkribieren kann.

#### Acceptance Criteria

1. THE Dictation_Recorder SHALL eine (pro Nutzer/Vault merkbare) Option bieten, die Aufnahme zusätzlich als Audio_Attachment im Vault zu speichern
2. WHEN „Audio speichern" aktiv ist, THE System SHALL die Aufnahme über den vorhandenen Upload-Pfad (`vault.createBinary` bzw. `/upload`) in das konfigurierte Attachments-Verzeichnis des Vaults schreiben, mit eindeutigem Dateinamen (Konflikt-Auflösung)
3. WHEN eine Audio_Attachment gespeichert wurde, THE System SHALL optional einen Audio-Embed (`![[datei.ext]]`) an der Einfügestelle ergänzen, sodass die Aufnahme direkt in der Notiz abspielbar ist
4. THE System SHALL für die Aufnahme ein browserseitig unterstütztes Audioformat verwenden (z. B. `audio/webm`/`ogg`), das sowohl vom `<audio>`-Embed als auch vom Transcription_Backend verarbeitet werden kann

### Requirement 4: Serverseitiger Transkriptions-Endpunkt

**User Story:** Als Betreiber möchte ich, dass Audio ausschließlich über meinen eigenen Server transkribiert wird, damit keine Sprachdaten an Dritte gelangen.

#### Acceptance Criteria

1. THE Transcription_Service SHALL einen authentifizierten Endpunkt `POST /api/v1/vaults/:vaultId/transcribe` bereitstellen, der Audio (multipart) plus Sprachparameter entgegennimmt und `{ text, detectedLanguage? }` zurückgibt
2. THE Transcription_Service SHALL Audio ausschließlich an das vom Betreiber konfigurierte Transcription_Backend weiterreichen und niemals an einen externen Dienst
3. THE Transcription_Service SHALL eine maximale Audiogröße und eine Zeitbegrenzung durchsetzen (konfigurierbar), und bei Überschreitung einen klaren Fehler zurückgeben
4. WHEN das Transcription_Backend nicht erreichbar oder nicht konfiguriert ist, THE Transcription_Service SHALL einen aussagekräftigen Fehler (kein 500 mit Stacktrace) zurückgeben
5. THE Transcription_Service SHALL Audiodaten nicht dauerhaft persistieren — nur der Vault-Anhang (Requirement 3) wird gespeichert, sofern der Nutzer das wählt

### Requirement 5: Feature-Toggle, Admin-Abschaltung und Serverkonfiguration

**User Story:** Als Administrator möchte ich die Spracherkennung serverweit an- und abschalten und das Transkriptions-Backend konfigurieren können.

#### Acceptance Criteria

1. THE System SHALL die Spracherkennung hinter einem Feature-Toggle `voice-transcription` bereitstellen, **standardmäßig deaktiviert** (kalt), und über die Admin-Feature-Toggle-UI ein-/abschaltbar
2. THE System SHALL die Adresse/Konfiguration des Transcription_Backends über `SLATEBASE_`-Env-Vars (bzw. Server-Config) bereitstellen; ohne konfiguriertes Backend bleibt das Feature funktional deaktiviert, auch wenn das Toggle an ist
3. WHEN das Feature deaktiviert ist (Toggle aus ODER kein Backend konfiguriert), THE Diktier-UI SHALL nicht aufrufbar sein bzw. einen Hinweis anzeigen, statt Requests einfach mit 403 scheitern zu lassen
4. THE Transcription_Service SHALL jeden Transkriptions-Request über den Feature-Guard (`createFeatureGuard('voice-transcription', ...)`) absichern
5. THE Diktier-Endpunkt SHALL ein eigenes Rate-Limit pro Nutzer haben (session-geschützter, state-verändernder/ressourcenintensiver Endpunkt — Konvention aus `quality.md`)

### Requirement 6: Warnhinweise zu Geschwindigkeit und Serveranforderung

**User Story:** Als Betreiber und als Nutzer möchte ich vorab wissen, dass Spracherkennung rechenintensiv ist und auf schwacher Hardware langsam sein kann.

#### Acceptance Criteria

1. THE Admin-Feature-Toggle-UI SHALL beim Feature `voice-transcription` einen sichtbaren Hinweis anzeigen, dass Whisper spürbar Rechenleistung (idealerweise GPU) benötigt und auf kleinen Servern langsam ist
2. THE Diktier-UI SHALL bei laufender/erster Nutzung einen dezenten Hinweis auf mögliche Verarbeitungszeit anzeigen (z. B. während der Transkription eine „wird verarbeitet"-Anzeige mit `role="status"`)
3. THE Dokumentation (`PLUGIN-COMPAT.md` und README/Steering-Produktbeschreibung) SHALL die Serveranforderung und die Admin-Abschaltbarkeit benennen

### Requirement 7: Zugriffskontrolle und Barrierefreiheit

**User Story:** Als Nutzer möchte ich die Funktion nur in Vaults mit Schreibrecht nutzen und sie per Tastatur bedienen können.

#### Acceptance Criteria

1. THE Transcription_Service SHALL den Diktier-Endpunkt nur mit Vault-Schreibberechtigung erlauben (`checkWriteAccess`)
2. THE Diktier-UI SHALL vollständig per Tastatur bedienbar sein (Command/Shortcut zum Starten/Stoppen), Aufnahme-/Verarbeitungszustände über `aria-live` melden und Fehler über `role="alert"`
3. THE Diktier-UI SHALL neue Dialoge/Popover über `useFocusTrap` führen, sofern welche eingeführt werden (Konvention aus `quality.md`)
