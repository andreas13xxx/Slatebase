# Requirements Document

## Introduction

Die Aktivitätszeitleiste ist eine chronologische Ansicht dessen, was in einem Vault geschieht: welche Notizen wann angelegt, bearbeitet, gelöscht, verschoben oder wiederhergestellt wurden, gruppiert nach Zeit (Heute, Gestern, letzte Woche …) und filterbar nach Ereignistyp. Das Mockup zeigt eine zweispaltige Vollansicht mit einer vertikalen Zeitachse, Typ-Icons, Zeitstempeln, Filter-Chips und einer Typ-Legende.

Die zentrale Erkenntnis aus der Codebase-Analyse prägt dieses Feature: **Slatebase zeichnet heute keine Dateiaktivität auf.** Das Audit-Log (`backend/src/audit/`) erfasst nur Auth-/Admin-/Freigabe-Ereignisse, nicht pro-Datei-Operationen; die Dateiversionen (`backend/src/version/`) sind Momentaufnahmen ohne durchsuchbaren Ereignisstrom. Dieses Feature führt deshalb eine neue, schlanke **Aktivitäts-Ereignis-Schicht** ein — append-only JSONL pro Vault unter `.slatebase/activity/`, modelliert auf dem Audit-Logger — gespeist aus demselben Mutations-Punkt, an dem heute schon das SSE-`vault:change`-Event und der `linkIndexHook` feuern. Der MCP-Schreibpfad wird als zweiter Eintrittspunkt mitbedacht (Lektion aus `lessons-learned.md`: eine Schreiboperation mit zwei Eintrittspunkten braucht dieselbe Nebenwirkungsliste an beiden Stellen).

Die Ansicht ist sowohl als **Datei-Tab** (Vollansicht wie im Mockup) als auch in den **Seitenleisten** (kompakte, einspaltige Variante) anzeigbar — gelöst über das etablierte Muster einer eingebauten Panel-View (`activity` in `BuiltinPanelViewId`) plus Sentinel-Tab (`__view::activity`), eine Komponente mit `variant`-Prop.

Das Mockup zeigt außerdem „Task completed/killed"- und „Captured · Raindrop/MacWhisper"-Spuren. Diese entstehen in Obsidian aus Community-Plugins (Tasks, Raindrop, MacWhisper), nicht aus dem Slatebase-Kern. Die Datenschicht ist erweiterbar entworfen (ein Plugin kann Ereignisse beitragen), aber die native erste Version beschränkt sich auf das, was Slatebase tatsächlich produziert (Notiz angelegt/bearbeitet/gelöscht/verschoben/wiederhergestellt, Canvas, Snippets, Bases). Die Filter-Chips „Tasks"/„Captures" erscheinen nur, wenn solche Ereignisse real vorhanden sind.

## Glossary

- **Activity_Event**: Ein einzelnes aufgezeichnetes Vorkommnis im Vault — Typ (`note.created`/`note.edited`/`note.deleted`/`note.moved`/`note.restored`/`canvas.*`/`base.*`/`snippet.*`), Zeitstempel (ISO 8601), betroffener Pfad, auslösender Benutzer, optionale Zusatzdaten (alter Pfad bei Move). Append-only persistiert.
- **Activity_Store**: Die Backend-Komponente, die Activity_Events pro Vault append-only als JSONL schreibt und zeit-/typgefiltert zurückliest. Modelliert auf dem Audit-Logger, eigenes Verzeichnis `.slatebase/activity/`.
- **Activity_Source_Hook**: Der Punkt im Vault-Schreibpfad, an dem ein Activity_Event erzeugt wird — derselbe Ort, an dem heute `vault:change` und der `linkIndexHook` feuern, inklusive des MCP-Tool-Schreibpfads.
- **Activity_Timeline_View**: Die Frontend-Komponente, die Activity_Events chronologisch gruppiert rendert. Dient per `variant`-Prop sowohl dem Vollbild-Tab (zweispaltig) als auch der Seitenleiste (kompakt, einspaltig).
- **Event_Type_Filter**: Die Filter-Chips, die die angezeigten Ereignistypen einschränken (Alle / Notizen / Canvas / Bases / …); plugin-beigetragene Typen erscheinen nur, wenn Ereignisse dafür existieren.
- **Time_Bucket**: Eine Gruppierungsspanne in der Zeitachse (Heute, Gestern, Diese Woche, Älter), nach der die Ereignisse zusammengefasst dargestellt werden.

## Requirements

### Requirement 1: Aktivitäts-Ereignis-Schicht (Aufzeichnung)

**User Story:** Als Nutzer möchte ich, dass Slatebase festhält, was in meinem Vault passiert, damit eine Zeitleiste überhaupt etwas anzeigen kann.

#### Acceptance Criteria

1. THE Activity_Store SHALL Vault-Mutationen als Activity_Events append-only als JSONL pro Vault unter `.slatebase/activity/` persistieren, mit täglicher Rotation (`YYYY-MM-DD.jsonl`), modelliert auf dem Audit-Logger.
2. THE Activity_Source_Hook SHALL ein Activity_Event an demselben Punkt erzeugen, an dem heute `vault:change` und der `linkIndexHook` feuern — für Anlegen, Bearbeiten, Löschen, Verschieben/Umbenennen und Wiederherstellen (Trash-Restore) von Dateien.
3. THE Activity_Source_Hook SHALL auch den MCP-Tool-Schreibpfad (`write_file`/`delete_file`/`move_file`/`rename_file`) abdecken, mit denselben Bedingungen wie der REST-Pfad, damit ein MCP-Client keine blinden Flecken in der Zeitleiste hinterlässt.
4. THE Activity_Event SHALL mindestens Typ, ISO-8601-Zeitstempel, betroffenen Pfad und auslösenden Benutzer tragen; bei Verschieben/Umbenennen zusätzlich den alten Pfad.
5. THE Activity_Store SHALL ausschließlich sichtbare Vault-Inhalte aufzeichnen (dot-/underscore-Sichtbarkeitsregeln des Vaults), konsistent mit Suche, Graph und Link-Index — die Zeitleiste zeigt nie `.slatebase/`-interne Schreibvorgänge.
6. WHEN das Schreiben eines Activity_Events fehlschlägt, THE Activity_Store SHALL den auslösenden Vault-Schreibvorgang NICHT scheitern lassen (die Aufzeichnung ist eine Nebenwirkung, keine Vorbedingung) und den Fehler lokal protokollieren.

### Requirement 2: Auto-Save-Entprellung

**User Story:** Als Nutzer möchte ich, dass eine Tipp-Sitzung als ein Eintrag erscheint und nicht als fünfzig, damit die Zeitleiste lesbar bleibt.

#### Acceptance Criteria

1. WHEN mehrere `note.edited`-Vorgänge für dieselbe Datei in kurzer Folge auftreten (Editor-Auto-Save, 1,5-s-Debounce), THE Activity_Store SHALL sie zu einem einzigen Activity_Event zusammenfassen (Coalescing), statt pro Speichervorgang einen Eintrag zu erzeugen.
2. THE Activity_Store SHALL dafür ein nachlaufendes 60-Sekunden-Fenster verwenden: das erste `note.edited` einer Datei stempelt das Ereignis (`timestamp`), jedes weitere `note.edited` derselben Datei innerhalb von 60 Sekunden aktualisiert nur dessen `lastModified`, ohne ein neues Ereignis anzulegen.
3. WHEN das 60-Sekunden-Fenster ohne weiteren Edit abläuft, THE Activity_Store SHALL das nächste `note.edited` derselben Datei als neues Ereignis behandeln.
4. THE Coalescing SHALL nur `note.edited` betreffen — Anlegen, Löschen, Verschieben und Wiederherstellen SHALL immer als eigenständige Ereignisse erscheinen.

### Requirement 3: Zeitleisten-Ansicht (Tab und Seitenleiste)

**User Story:** Als Nutzer möchte ich die Aktivität meines Vaults als chronologische Zeitleiste sehen, sowohl als vollwertigen Tab als auch kompakt in der Seitenleiste, damit ich sie dort öffne, wo es gerade passt.

#### Acceptance Criteria

1. THE Activity_Timeline_View SHALL Activity_Events absteigend chronologisch rendern, gruppiert in Time_Buckets (Heute, Gestern, Diese Woche, Älter), mit Typ-Icon, Pfad/Titel und relativem Zeitstempel pro Eintrag.
2. THE Activity_Timeline_View SHALL per `variant`-Prop zwei Darstellungen anbieten: eine Vollansicht (zweispaltig, vertikale Zeitachse wie im Mockup) für den Tab und eine kompakte, einspaltige Variante für die Seitenleiste.
3. THE Tab_System SHALL die Vollansicht über einen Sentinel-Tab (`__view::activity`) öffnen; THE Side_Panel SHALL die kompakte Variante über eine eingebaute Panel-View (`activity` in `BuiltinPanelViewId`) in beiden Seitenleisten anbieten.
4. WHEN der Nutzer einen Zeitleisten-Eintrag anklickt, THE Activity_Timeline_View SHALL die zugehörige Notiz/Datei in einem Tab öffnen (bzw. bei gelöschten Dateien einen klar erkennbaren, nicht-navigierbaren Zustand zeigen).
5. THE Activity_Timeline_View SHALL eine Typ-Legende und Event_Type_Filter-Chips anbieten; THE Event_Type_Filter SHALL nur Typen anbieten, für die tatsächlich Ereignisse vorliegen (keine leeren Spuren).
6. WHEN ein neues `vault:change`-Event eintrifft (vorhandene `realtimeVaultBridge`), THE Activity_Timeline_View SHALL den jüngsten Zeitabschnitt aktualisieren, ohne dass der Nutzer die Ansicht neu öffnen muss.
7. THE Activity_Timeline_View SHALL leere Zustände (noch keine Aktivität) und Ladezustände barrierefrei darstellen (`role="status"`/`aria-live` beim Laden, `role="alert"` bei Fehler).

### Requirement 4: Lesen, Filtern, Paginieren (API)

**User Story:** Als Nutzer mit vielen tausend Ereignissen möchte ich, dass die Zeitleiste schnell lädt und nicht alles auf einmal zieht, damit die Ansicht flüssig bleibt.

#### Acceptance Criteria

1. THE Activity_API SHALL eine Route `GET /vaults/:vaultId/activity` bereitstellen, die Activity_Events absteigend nach Zeit, seitenweise (Cursor/Offset + Limit) zurückgibt, Zod-validiert, mit `checkReadAccess`.
2. THE Activity_API SHALL serverseitiges Filtern nach Ereignistyp und Zeitfenster unterstützen, damit die kompakte Seitenleistenvariante gezielt wenige Einträge laden kann.
3. THE Activity_API SHALL ausschließlich Ereignisse des angefragten Vaults liefern und keine vault-fremden Pfade/Benutzernamen durchsickern lassen.
4. WHEN die Anfrage ungültig ist (unbekannter Typfilter, ungültiger Cursor), THE Activity_API SHALL mit einem `{ code, message, timestamp }`-Fehler (400) antworten.

### Requirement 5: Aufbewahrung und Aufräumen

**User Story:** Als Administrator möchte ich, dass die Zeitleiste nicht unbegrenzt wächst, damit der Vault-Speicher beschränkt bleibt.

#### Acceptance Criteria

1. THE Activity_Store SHALL eine konfigurierbare Aufbewahrungsdauer pro Vault haben, Standard 90 Tage.
2. THE Cleanup_Job SHALL abgelaufene Activity-JSONL-Dateien im Rahmen des bestehenden periodischen Cleanup-Jobs (`backend/src/cleanup/`) löschen — kein neuer Scheduler.
3. THE Cleanup SHALL pro Datei fehlertolerant sein (ein nicht löschbares Tagesfile stoppt nicht die übrigen).

### Requirement 6: Sichtbarkeit und Zugriffskontrolle

**User Story:** Als Vault-Teilnehmer möchte ich die Aktivität des Vaults sehen, den ich teile, aber keine Vaults, auf die ich keinen Zugriff habe.

#### Acceptance Criteria

1. THE Activity_Store SHALL Ereignisse pro Vault führen (nicht pro Benutzer); jeder Benutzer mit Lesezugriff auf den Vault sieht dieselbe Zeitleiste.
2. THE Activity_API SHALL Zugriff ausschließlich über die vorhandene Vault-Zugriffskontrolle gewähren (`checkReadAccess` / `getUsersWithAccess`), konsistent damit, wie `vault:change` adressiert wird.
3. THE Activity_Event SHALL den auslösenden Benutzernamen enthalten; dieser SHALL nur an Benutzer mit Lesezugriff auf denselben Vault ausgeliefert werden.

### Requirement 7: Feature-Toggle und Welcome-Vault-Dokumentation

**User Story:** Als Administrator möchte ich die Zeitleiste ein-/ausschalten können, und als neuer Nutzer möchte ich im Tutorial-Vault erfahren, was sie leistet.

#### Acceptance Criteria

1. THE Feature_Registry SHALL ein Feature-Toggle `activity-timeline` registrieren (kalt, default aus, admin-schaltbar), analog zu `bases`/`git-sync`/`mail-import`.
2. WHEN das Toggle aus ist, THE Activity_Source_Hook SHALL keine Ereignisse aufzeichnen und THE Activity_Timeline_View SHALL weder als Tab noch als Panel-View verfügbar sein.
3. THE Welcome_Vault (DE und EN) SHALL eine Feature-Anleitung „Aktivitätszeitleiste" (DE) / „Activity Timeline" (EN) in der Standard-Guide-Struktur enthalten (Kurzbeschreibung, Schritt-für-Schritt, Beispiel, Tipps, Übung, verwandte Features).
4. THE Welcome_Vault Features-Übersicht (DE: `Features/Übersicht.md`, EN: `Features/Overview.md`) SHALL den neuen Guide in „Weitere Features" / „More Features" verlinken.
5. THE Welcome_Vault `_meta.md` (DE und EN) SHALL in Version und `updated`-Datum angehoben werden, wenn der Guide hinzugefügt wird.

## Out of Scope (erste Version)

- **Task- und Capture-Spuren** aus dem Mockup („Task completed/killed", „Captured · Raindrop/MacWhisper") — diese entstehen aus Community-Plugins, nicht aus dem Slatebase-Kern. Die Datenschicht ist erweiterbar (ein Plugin kann Ereignisse beitragen); eine Freigabe-API dafür ist eine spätere Ausbaustufe.
- **Pro-Benutzer-Zeitleiste / „nur meine Aktivität"** — v1 ist pro Vault; eine persönliche Filterung ist später denkbar.
- **Volltext-/erweiterte Suche in der Zeitleiste** — v1 bietet Typ- und Zeitfilter, keine Freitextsuche.
- **Diff-Vorschau pro Edit-Ereignis** — die Zeitleiste verlinkt in die bestehende Dateiversionen-Ansicht, baut aber keine eigene Diff-Oberfläche.
- **Serverseitige Zeitleisten-Auswertung über MCP** — der MCP-Schreibpfad speist Ereignisse ein, aber es gibt v1 kein MCP-Tool zum Abfragen der Zeitleiste.
