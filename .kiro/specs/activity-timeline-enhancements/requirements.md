# Aktivitätszeitleiste — Ausbau (Enhancements) — Requirements

## Kontext

Die Aktivitätszeitleiste ist auf `master` ausgeliefert (Spec `.kiro/specs/activity-timeline/`):
ein per-Vault append-only JSONL-Ereignislog unter `.slatebase/activity/YYYY-MM-DD.jsonl`,
gespeist aus dem Vault-Schreibpfad (REST **und** MCP), 60-Sekunden-Coalescing für
`note.edited`, cursor-paginierte Leseroute, Zeit-Buckets und Lane-Filter-Chips, als Datei-Tab
(`__view::activity`) und als kompakte Seitenleisten-View. Feature-Toggle `activity-timeline`
(cold, default off).

Diese Spec motzt die Ansicht an ein zweispaltiges, statistik-reicheres Layout heran (Vorbild:
vom Nutzer geliefertes Mockup) und schließt eine konkrete inhaltliche Lücke: **git-sync- und
Mail-Import-Vorgänge sind heute in der Zeitleiste nicht sichtbar.** Dabei gilt die vom Nutzer
festgelegte Leitlinie — ein Sync wird als **ein** zusammengefasstes Ereignis getrackt, nicht als
N einzelne Datei-Edits.

## Analyse-Ausgangslage (verifiziert gegen die Codebase, 2026-10-17)

- **MCP-Schreibzugriffe werden getrackt.** `backend/src/mcp/tool-handlers.ts` ruft bei
  `write_file`/`delete_file`/`move_file`/`rename_file` `recordActivity` auf; verdrahtet in
  `backend/src/index.ts` mit demselben `ActivityStore` wie der REST-Pfad. Lese-Tools
  (`read_file`/`search_vault`) werden bewusst nicht getrackt.
- **Das Activity-Log verlässt nie das git-Repo.** `backend/src/git-sync/sync-engine.ts` schreibt
  eine verwaltete `.gitignore` mit `.slatebase/*` (nur `config.json` + `property-types.json`
  ausgenommen). `.slatebase/activity/*.jsonl` fällt darunter → wird nie committet, gepusht oder
  gemergt. Ein „remote Activity-Liste mit lokaler mergen"-Problem existiert damit **nicht**; das
  Log ist per-Instanz-Daten, genau wie Trash/Versions/Link-Index-Cache.
- **git-sync erzeugt heute kein Activity-Event.** Ein `git pull`, das Dateien reinbringt, feuert
  nur ein `vault:change`-Event (Actor „Git-Sync", Pfad `/`), ruft aber `recordActivity` nicht
  auf. Es gibt also **kein** Doppel-Tracking, sondern eine Lücke in beide Richtungen: der Sync
  als Vorgang fehlt ebenso wie die per-Sync geänderten Dateien.
- **Mail-Import erzeugt heute GAR KEIN Activity-Event — und auch keinen Link-Index-Eintrag.**
  Verifiziert: `backend/src/mail-import/note-writer.ts` (`MailNoteWriter`) schreibt die Notiz
  **direkt per `fs.writeFile`** und ruft weder `activityService.record` noch den `linkIndexHook`
  auf — es publiziert nur `vault:change`. Importierte Mails tauchen damit **weder in der
  Zeitleiste noch im Link-Index/Graph** auf. Das ist derselbe „zweiter Schreibpfad umgeht die
  Nebenwirkungsliste"-Fall wie historisch bei MCP (siehe `lessons-learned.md`). Der
  Link-Index-Teil ist ein **eigenständiger, schon heute bestehender Bug**, unabhängig vom
  Timeline-Ausbau; die Spec rüstet deshalb beide Hooks (`record` **und** `linkIndexHook`) am
  Mail-Import-Pfad nach (Requirement 4.4), statt nur ein `origin`-Label zu setzen.

## Glossar

- **Activity_Stat_Panel**: Die rechte Spalte der Vollansicht — „By type"-Balken mit Zählern,
  eine Heatmap der letzten N Wochen und ein Zeitraum-Umschalter (Tag/Woche/Monat/Jahr). Rein
  aus den geladenen Activity_Events ableitbar, keine neue Backend-Route nötig.
- **Activity_Heatmap**: Kalender-Dichte-Gitter (Wochen × Wochentage) der Ereignisanzahl pro Tag,
  wie das „Last 10 weeks"-Panel im Mockup. Die Heatmap hat ein **eigenes, vom Range_Switcher
  unabhängiges Zeitfenster** (immer die letzten N Wochen) und wird deshalb über einen **separaten
  zweiten Ladevorgang** gespeist, nicht aus den range-gefilterten Listen-Events (siehe L4,
  Requirement 1).
- **Range_Switcher**: Zeitraum-Umschalter (Tag/Woche/Monat/Jahr), der den geladenen und
  statistisch ausgewerteten Zeitraum bestimmt.
- **Activity_Origin**: Herkunft eines Activity_Events — woher der Schreibvorgang kam
  (`web`, `mcp`, `git-sync`, `mail-import`, später `plugin`). Dient dazu, KI-/Sync-/Import-
  getriebene Ereignisse sichtbar von direkten Nutzer-Edits zu unterscheiden (Vorbild
  „Captured · Raindrop/MacWhisper" im Mockup).
- **Sync_Event**: Ein einzelnes zusammengefasstes Ereignis für einen git-sync-Lauf
  (`sync.completed`) — ein Eintrag pro Lauf mit Anzahl geholter/gepushter Dateien und
  Remote-Bezug, NICHT ein Ereignis pro betroffener Datei.
- **Folder_Filter**: Ein Dropdown, das die Zeitleiste auf Ereignisse unterhalb eines gewählten
  Vault-Ordners einschränkt (Vorbild „All folders" im Mockup).

## Requirements

### Requirement 1: Zweispaltige Vollansicht mit Statistik-Panel

**User Story:** Als Nutzer möchte ich die Aktivität meines Vaults nicht nur als Liste, sondern mit
einer Statistik-Übersicht sehen, damit ich auf einen Blick erkenne, wie viel und was in meinem
Vault passiert ist.

#### Acceptance Criteria

1. THE Activity_Timeline_View SHALL in der `full`-Variante ein zweispaltiges Layout rendern: links
   die bestehende Zeitachse, rechts das Activity_Stat_Panel. Die `compact`-Variante
   (Seitenleiste) bleibt einspaltig und ohne Stat_Panel.
2. THE Activity_Stat_Panel SHALL eine „By type"-Aufstellung mit Zähler pro Ereignistyp über den
   aktuell geladenen/gefilterten Zeitraum darstellen.
3. THE Activity_Stat_Panel SHALL eine Activity_Heatmap der Ereignisdichte pro Tag über die
   letzten N Wochen darstellen. Die Heatmap SHALL ihr Zeitfenster **unabhängig vom
   Range_Switcher** halten (immer die letzten N Wochen) und dafür einen **eigenen, zweiten
   Ladevorgang** nutzen — nicht die range-gefilterten Listen-Events (sonst wäre die Heatmap bei
   Range=„Tag" leer; L4).
4. THE „By type"-Aufstellung SHALL ausschließlich aus den bereits für die Liste geladenen,
   range-gefilterten Activity_Events gerechnet werden (keine eigene Backend-Aggregationsroute).
   Die Heatmap ist davon ausgenommen (eigenes Fenster, Punkt 3): sie lädt ihre Zählung über
   dieselbe Leseroute mit eigenem `from`/`to`, führt aber **keine** neue Aggregations-/
   Count-Route ein.

### Requirement 2: Zeitraum-Umschalter (Range_Switcher)

**User Story:** Als Nutzer möchte ich zwischen Tag/Woche/Monat/Jahr umschalten, damit ich die
Aktivität in der für mich passenden Zeitauflösung sehe.

#### Acceptance Criteria

1. THE Range_Switcher SHALL die Auswahl Tag / Woche / Monat / Jahr anbieten; die Auswahl bestimmt
   das Zeitfenster (`from`/`to`) der geladenen Activity_Events und die Auswertung im
   Activity_Stat_Panel.
2. WHEN der Range_Switcher geändert wird, THE Activity_Timeline_View SHALL die Liste und das
   Activity_Stat_Panel konsistent für denselben Zeitraum neu laden/berechnen.
3. THE Range_Switcher SHALL seine Auswahl pro Nutzer und Vault über `vaultSettingsStore` merken
   (persönliche Ansichtspräferenz, kein Vault-Inhalt), konsistent mit anderen per-Vault-UI-Zuständen.

### Requirement 3: git-sync als Einzel-Ereignis

**User Story:** Als Nutzer möchte ich in der Zeitleiste sehen, dass ein git-sync gelaufen ist,
aber nicht jede einzelne bei diesem Sync geänderte Datei als separaten Edit — die eigentliche
Änderung steht ohnehin schon drin.

#### Acceptance Criteria

1. WHEN ein git-sync-Lauf (`GitSyncEngine.runOne`) mit Ergebnis `success` abschließt und dabei
   **Dateien von remote geholt hat** (`pulledFiles > 0`), THE Activity_Source_Hook SHALL **genau
   ein** Sync_Event (`sync.completed`) aufzeichnen — mit Anzahl geholter (`pulledFiles`) und,
   informativ, gepushter (`pushedFiles`) Dateien sowie Remote-Bezug. Ein Lauf, der NUR lokal
   committet/gepusht hat (`pulledFiles = 0, pushedFiles > 0`), SHALL **kein** `sync.completed`
   erzeugen: die gepushten Änderungen sind bereits nutzer-ausgelöste `note.edited`/`note.created`
   in der Zeitleiste, ein reiner Push ist für den Nutzer kein neuer, von remote kommender Vorgang
   (L3).
2. THE Activity_Source_Hook SHALL für die einzelnen beim Pull/Merge geänderten Dateien KEINE
   per-Datei-Activity_Events erzeugen (kein Flooding; die reingezogenen Dateiänderungen sind nicht
   nutzer-ausgelöste Edits und werden bewusst nicht einzeln getrackt).
3. WHEN ein git-sync-Lauf mit Ergebnis `conflict` oder `error` endet, THE Activity_Source_Hook
   SHALL hierfür KEIN `sync.completed`-Ereignis schreiben (nur erfolgreiche, inhaltlich
   wirksame Läufe erscheinen); ob Konflikte als eigener Ereignistyp sichtbar werden, bleibt
   bewusst offen und ist nicht Teil dieser Spec.
4. THE Sync_Event SHALL den Actor „Git-Sync" tragen (konsistent mit dem bestehenden
   `GIT_SYNC_ACTOR` des Sync-Engines) und keinen einzelnen Dateipfad erzwingen.
5. THE `.slatebase/activity/*.jsonl`-Dateien SHALL vom git-sync weiterhin ausgeschlossen bleiben
   (verwaltete `.gitignore` unverändert) — das Activity-Log ist per-Instanz-Daten und wird nie
   committet, gepusht oder gemergt.
6. WHERE das Feature-Toggle `git-sync` aktiv ist, aber `activity-timeline` **aus** ist, THE
   Activity_Source_Hook SHALL KEIN `sync.completed` schreiben (das git-sync- und das
   activity-timeline-Toggle sind unabhängig; das Sync-Event wird nur verdrahtet, wenn
   `activity-timeline` an ist — L8).

### Requirement 4: Herkunft (Activity_Origin) sichtbar machen

**User Story:** Als Nutzer möchte ich erkennen, ob ein Ereignis von mir im Browser, von einem
MCP-/KI-Client, von git-sync oder vom Mail-Import kam, damit ich maschinelle von eigenen
Änderungen unterscheiden kann.

#### Acceptance Criteria

1. THE Activity_Event SHALL ein optionales `origin`-Feld tragen
   (`web` | `mcp` | `git-sync` | `mail-import`; erweiterbar um `plugin`), gesetzt am jeweiligen
   Eintrittspunkt. Ein fehlendes `origin` SHALL als `web` interpretiert werden (rückwärtskompatibel
   zu bereits persistierten Ereignissen ohne das Feld).
2. THE Activity_Source_Hook SHALL `origin` am Eintrittspunkt korrekt setzen: REST-Writes `web`,
   MCP-Writes `mcp`, Sync_Events `git-sync`, Mail-Import-Writes `mail-import`. Das `origin`-Feld
   SHALL dabei auch durch die **separate, bewusst eng typisierte** Trash-Restore-Signatur in
   `backend/src/api/trashRoutes.ts` (`{ type: 'note.restored'; path; user }`) gereicht werden —
   diese zweite Aufzeichnungs-Signatur ist leicht zu übersehen (L2); Trash-Restore erhält
   `origin='web'`.
3. THE Activity_Timeline_View SHALL die Herkunft in der Zeile sichtbar machen (Badge/Label), wenn
   sie nicht `web` ist (ein direkter Browser-Edit braucht kein Herkunfts-Label).
4. THE Umsetzung SHALL den Mail-Import-Schreibpfad (`MailNoteWriter`) so nachrüsten, dass eine
   importierte Mail **sowohl** ein `note.created`-Activity_Event mit `origin='mail-import'` **als
   auch** einen `linkIndexHook`-Aufruf auslöst — denn heute ruft `MailNoteWriter` keines von
   beidem auf (es schreibt direkt per `fs.writeFile`), sodass importierte Mails weder in der
   Zeitleiste noch im Link-Index/Graph erscheinen (L1). Es SHALL dabei die bestehende
   Nebenwirkungs-Form wiederverwendet werden (dieselben `record`/`linkIndexHook`-Punkte wie der
   REST-Write), KEIN zweiter, mail-import-spezifischer Aufzeichnungspfad. Der Link-Index-Teil ist
   ein eigenständiger, schon heute bestehender Bug und SHALL unabhängig vom Stat-Panel-Ausbau
   korrekt werden.
5. WHEN ein bereits persistierter JSONL-Eintrag ohne `origin`-Feld gelesen wird (vor diesem Feature
   geschrieben), THE Store SHALL ihn als `origin='web'` interpretieren und darf NICHT scheitern
   (reale `.jsonl`-Dateien existieren bereits; es findet keine Datei-Migration statt — L7).

### Requirement 5: Ordner-Filter (Folder_Filter)

**User Story:** Als Nutzer möchte ich die Zeitleiste auf einen Ordner einschränken, damit ich die
Aktivität eines Projektbereichs isoliert betrachten kann.

#### Acceptance Criteria

1. THE Folder_Filter SHALL als Dropdown in der `full`-Variante die Vault-Ordner anbieten („Alle
   Ordner" als Default) und die angezeigten Activity_Events auf solche unterhalb des gewählten
   Pfad-Präfixes einschränken.
2. THE Leseroute SHALL einen optionalen Pfad-Präfix-Filter unterstützen (serverseitig vorfiltern,
   um nicht ganze Tage lesen und client-seitig verwerfen zu müssen), Zod-validiert wie die übrigen
   Query-Parameter.
3. WHEN ein Folder_Filter aktiv ist, THE Filter SHALL Vault-weite Ereignisse mit Pfad `/`
   (insbesondere `sync.completed`) **nicht** herausfiltern — ein Sync betrifft den ganzen Vault
   und bleibt bei jedem Ordner-Filter sichtbar; die Präfix-Prüfung gilt nur für echte
   Datei-/Ordner-Pfade (L6).
4. THE Folder_Filter SHALL in der `compact`-Seitenleisten-Variante NICHT erscheinen (Platzgründe,
   konsistent mit dem Mockup).

### Requirement 6: Keine Regression bestehenden Verhaltens

#### Acceptance Criteria

1. THE Ausbau SHALL das bestehende Coalescing (60-s-Fenster für `note.edited`), die
   Sichtbarkeitsregeln (`.slatebase/`-Dot-Pfade nie aufzeichnen), die Fire-and-forget-Semantik
   (eine fehlgeschlagene Aufzeichnung scheitert nie den Vault-Write) und die cursor-basierte
   Pagination unverändert erhalten.
2. THE Ausbau SHALL hinter demselben Feature-Toggle `activity-timeline` (cold) bleiben; ist das
   Feature aus, erscheint weder Stat_Panel noch Sync-/Origin-Tracking.
3. THE neuen Ereignis-/Feld-Erweiterungen (`sync.completed`, `origin`) SHALL round-trip-fest sein:
   ein Store, der ein unbekanntes Feld/einen unbekannten Typ liest, behält ihn (der Typ wird beim
   Lesen als opaker String behandelt, wie heute dokumentiert).

## Spätere Erwägung (nicht Teil dieser Spec)

**Umstellung der Aktivitätsliste auf Vault-spezifische (synchronisierbare) Speicherung.**
Heute ist das Activity-Log bewusst per-Instanz (nicht gesynct, siehe Requirement 3.5). Zu einem
späteren Zeitpunkt ist zu erwägen, ob die Aktivitätsliste pro Vault geführt und mit dem Vault
synchronisiert werden soll, sodass ein über mehrere Geräte/Instanzen geteilter Vault eine
gemeinsame, zusammengeführte Historie hat. Das würde ein Merge-Verfahren für konkurrierende
append-only Logs erfordern (z. B. ID-dedupliziertes Zusammenführen zweier JSONL-Ströme ohne
git-Textkonflikte) und berührt die `.gitignore`-Ausnahmeliste des Sync-Engines. Bewusst
zurückgestellt — zuerst der sichtbare Ausbau oben; die Entscheidung Vault-spezifisch vs.
per-Instanz wird separat getroffen.
