# Aktivitätszeitleiste — Ausbau (Enhancements) — Design

## Überblick

Der Ausbau fällt in vier weitgehend unabhängige Teile, die auf der bestehenden Architektur
aufsetzen (`backend/src/activity/`, `frontend/src/components/activity/`, `frontend/src/state/activityState.ts`):

1. **Statistik-Panel + Range_Switcher** — rein Frontend, kein Datenmodell-Umbau.
2. **git-sync als Einzel-Ereignis** — neuer Ereignistyp `sync.completed` + Verdrahtung des
   Sync-Engines mit dem `ActivityStore`.
3. **Activity_Origin** — neues optionales Feld am Ereignis, an jedem Eintrittspunkt gesetzt.
4. **Folder_Filter** — Pfad-Präfix-Filter in Store, Leseroute und Ansicht.

Leitentscheidung (vom Nutzer bestätigt): Ein git-sync ist **ein** Ereignis, nicht N Datei-Edits.
Das Activity-Log bleibt per-Instanz (nicht gesynct); eine Vault-spezifische Umstellung ist später
zu erwägen (siehe Requirements, „Spätere Erwägung").

## Teil 1 — Statistik-Panel + Range_Switcher (Frontend)

### Datenfluss

Keine neue Backend-**Aggregations**-Route. Das `Activity_Stat_Panel` rechnet die „By type"-Zählung
ausschließlich über die bereits in `activityState.events` geladenen, range-gefilterten Ereignisse
— dasselbe Prinzip wie die vorhandene `groupIntoTimeBuckets`-Gruppierung. Die Activity_Heatmap
hingegen hat ein **eigenes, vom Range unabhängiges Fenster** und wird über einen **separaten
zweiten Fetch** derselben Leseroute (`loadActivityHeatmap` mit eigenem `from`/`to` = letzte N
Wochen) gespeist (L4) — keine neue Route, nur ein zweiter Aufruf der bestehenden.

- Der `Range_Switcher` setzt `from`/`to` im `ActivityQuery` der Ladeaktion
  (`loadActivity`/`refreshRecentActivity` in `frontend/src/state/activityActions.ts`). Für „Jahr"
  wird ein weiter zurückreichendes Fenster geladen; die bestehende cursor-Pagination
  („Mehr laden") bleibt für das Nachladen innerhalb des Fensters erhalten.
- **„By type"**: `Map<ActivityEventType, number>` per Reduktion über die geladenen (range-
  gefilterten) `events`, gerendert als Balkenzeilen mit Zähler (Icons/Labels aus dem vorhandenen
  `ACTIVITY_EVENT_META`).
- **Activity_Heatmap**: pro Kalendertag die Ereignisanzahl, als Gitter Wochen × Wochentage; Farbe
  skaliert über Design-Tokens (keine festen Hex-Werte, Dark-Mode-fest). Die Heatmap lädt ihre
  eigenen Events über ein festes „letzte N Wochen"-Fenster (`loadActivityHeatmap`), getrennt vom
  Range_Switcher, damit sie bei Range=„Tag" nicht leer ist. Eine neue reine Hilfe
  `activity-stats.ts` (`countByType(events)`, `buildHeatmap(events, weeks)`) mit Unit-Tests,
  analog zu `time-buckets.ts`; beide Funktionen bleiben pur und bekommen ihre jeweilige
  Event-Liste als Argument (die Range-Liste für `countByType`, die Heatmap-Fenster-Liste für
  `buildHeatmap`).

### Komponenten

- `ActivityTimelineView.tsx`: In der `full`-Variante ein zweispaltiges CSS-Grid; links die
  bestehende Bucket-Liste, rechts ein neues `<ActivityStatPanel>`. `compact` bleibt unverändert
  einspaltig (kein Stat-Panel, kein Range_Switcher, kein Folder_Filter).
- `ActivityStatPanel.tsx` + `ActivityStatPanel.css`: By-type-Balken + Heatmap + Range_Switcher-Chips.
  Das Panel löst beim Mount und bei Vault-Wechsel einen eigenen Heatmap-Fetch
  (`loadActivityHeatmap`, festes „letzte N Wochen"-Fenster) aus — getrennt vom Range_Switcher,
  mit `AbortController`/`cancelled`-Guard gegen Vault-Wechsel-Races (wie bei anderen
  Lade-Effekten). Die By-type-Zählung dagegen kommt ohne eigenen Fetch aus den range-geladenen
  `events`.
- Persistenz des Range über `vaultSettingsStore` (per Nutzer *und* Vault), analog zu
  Graph-/Panel-Layouts — kein Vault-Inhalt, nur Ansichtspräferenz.

### i18n

Neue Keys unter `activity.*` in `de.ts` **und** `en.ts` (Struktur identisch halten):
`activity.range.{day,week,month,year}`, `activity.stats.byType`, `activity.stats.last10Weeks`,
`activity.folderFilter.all`, `activity.origin.{mcp,gitSync,mailImport}`.

## Teil 2 — git-sync als Einzel-Ereignis (`sync.completed`)

### Ereignistyp

`ActivityEventType` in `backend/src/activity/types.ts` um `'sync.completed'` erweitern. Der Store
behandelt den Typ beim Lesen ohnehin als opaken String (round-trip-fest), aber das Schreiben
braucht den Typ in der Union.

Zusatzfelder am `ActivityEvent` (alle optional, nur für `sync.completed` gesetzt):

```ts
/** Only for 'sync.completed': files pulled in by the merge. */
pulledFiles?: number
/** Only for 'sync.completed': files committed+pushed. */
pushedFiles?: number
/** Only for 'sync.completed': the remote's user-facing name. */
remoteName?: string
```

`path` ist für `sync.completed` der Vault-Root (`/`), da ein Sync eine beliebige Dateimenge
berührt — dieselbe Konvention, die `publishVaultChange` im Sync-Engine schon nutzt.

**Pflicht-Eintrag in `activity-event-meta.ts` (L5):** `ACTIVITY_EVENT_META` ist ein
`Record<ActivityEventType, …>`; die Anzeige liest `ACTIVITY_EVENT_META[evt.type].lane`/`.icon`.
Ein neuer Typ `sync.completed` ohne Eintrag führt zu `undefined.lane` und crasht die Ansicht.
Daher MUSS `sync.completed` dort einen Eintrag (Icon + Lane + Label-Key) bekommen. Vorschlag:
eine neue Lane `sync` (eigener Filter-Chip) mit einem Sync-/Refresh-Icon; alternativ in eine
bestehende Lane einsortieren. Diese Ergänzung gehört in Teil 2 (nicht erst Teil 3), weil der
Typ sonst beim ersten geschriebenen Sync-Event die Zeitleiste bricht.

### Verdrahtung

- `GitSyncEngine` bekommt eine optionale `recordActivity`-Abhängigkeit (gleiche Form wie bei den
  MCP-Tool-Handlers und `trashRoutes`): fire-and-forget, nie Teil des Sync-Erfolgs.
- Aufruf-Punkt: der `success`-Pfad in `runOneUnlocked`, **nur** wenn `pulledFiles > 0` (ein
  No-op-Poll **oder ein reiner Push ohne Pull** erzeugt kein Ereignis — L3). `pushedFiles` wird
  nur informativ am Event mitgeführt, triggert es aber nicht: ein reiner Push bildet bereits
  getrackte lokale `note.edited`/`note.created` ab und ist kein von remote kommender Vorgang.
  Konflikt/Error-Pfade schreiben nichts (R3.3). Direkt neben dem bestehenden
  `publishVaultChange(vaultId)`.
- Komposition in `backend/src/index.ts`: `recordActivity` nur gesetzt, wenn `activityEnabled`
  (wie beim MCP-Pfad). Actor „Git-Sync", `origin='git-sync'`.
- **Bewusst keine** Iteration über die gemergten Dateien → kein per-Datei-Event (R3.2). Die
  einzelnen Dateiänderungen stehen nicht in der Zeitleiste; nur der Sync-Vorgang selbst.

### Coalescing

`sync.completed` ist KEIN `note.edited` und läuft daher nicht durch das 60-s-Coalescing-Fenster —
jeder Lauf, der etwas bewegt hat, ist genau ein eigener Eintrag (`appendNew`).

### `.gitignore` unverändert

Keine Änderung an `MANAGED_GITIGNORE_LINES`. `.slatebase/activity/*.jsonl` bleibt ausgeschlossen —
das Log verlässt das Repo nicht (R3.5).

## Teil 3 — Activity_Origin

### Datenmodell

```ts
export type ActivityOrigin = 'web' | 'mcp' | 'git-sync' | 'mail-import'
// am ActivityEvent / ActivityEventInput:
origin?: ActivityOrigin   // fehlt → als 'web' interpretiert (rückwärtskompatibel)
```

Nicht persistiertes `origin` ⇒ `web`. Keine Migration bestehender JSONL-Dateien nötig.

### Eintrittspunkte (dieselbe Nebenwirkung an jeder Stelle — Lektion aus `lessons-learned.md`)

| Pfad | Datei | origin |
|---|---|---|
| REST-Write | `backend/src/api/index.ts` (`VaultController` → `activityService.record`) | `web` |
| MCP-Write | `backend/src/mcp/tool-handlers.ts` → `recordActivity` | `mcp` |
| Trash-Restore | `backend/src/api/trashRoutes.ts` | `web` |
| git-sync | `backend/src/git-sync/sync-engine.ts` (neu) | `git-sync` |
| Mail-Import | `backend/src/mail-import/note-writer.ts` (`MailNoteWriter`, Hook neu nachgerüstet) | `mail-import` |

**Mail-Import-Nachrüstung (R4.4, L1) — verifizierter Befund, kein offener Prüfpunkt mehr:**
`backend/src/mail-import/note-writer.ts` (`MailNoteWriter`) schreibt die importierte Notiz
**direkt per `fs.writeFile`** und ruft **weder** `activityService.record` **noch** den
`linkIndexHook` auf — nur `vault:change` wird publiziert. Folge heute: importierte Mails
erscheinen weder in der Zeitleiste noch im Link-Index/Graph. Umsetzung:
- Den Mail-Import-Schreibpfad auf dieselbe Nebenwirkungs-Form bringen wie ein REST-Write:
  `record` (als `note.created`, `origin='mail-import'`, Actor „Mail-Import") **und**
  `linkIndexHook` am Punkt, an dem die Datei geschrieben wird. Beide Abhängigkeiten werden —
  wie bei den MCP-Tool-Handlers und `trashRoutes` — als optionale Hooks in den `MailNoteWriter`
  (bzw. `MailImportEngine`) injiziert und in `backend/src/index.ts` verdrahtet (Activity nur bei
  `activityEnabled`; Link-Index immer).
- **Kein** zweiter, mail-import-spezifischer Aufzeichnungspfad — gleiche Hooks, nicht parallele.
- Der **Link-Index-Teil ist ein eigenständiger, schon heute bestehender Bug** (importierte Mails
  fehlen im Graph) und wird mit derselben Änderung behoben, unabhängig vom Stat-Panel-Ausbau.
  Prüfen, ob `MailNoteWriter` perspektivisch besser direkt über `IVaultService.saveFile` schreibt
  (das trägt die Hooks ohnehin), statt am Service vorbei per `fs.writeFile` — das wäre die
  insellösungsfreie Variante (siehe `lessons-learned.md`).

### Anzeige

`ActivityTimelineView` zeigt ein kleines Herkunfts-Badge in der Zeile, wenn `origin` existiert und
≠ `web`. Label/Icon zentral in `activity-event-meta.ts` ergänzen (eine Wahrheit für Icon + Label,
wie heute für die Ereignistypen), damit Zeile, Legende und Filter nicht driften.

## Teil 4 — Folder_Filter

### Backend

- `ActivityQuery` um `pathPrefix?: string` erweitern.
- `ActivityStore.query`: der bestehende `matches()`-Filter bekommt eine Präfix-Prüfung
  (`evt.path` beginnt mit `pathPrefix`). Day-File-Vorauswahl bleibt wie sie ist; der Präfix wirkt
  pro Zeile. (Serverseitig gefiltert, damit nicht ganze Tage client-seitig verworfen werden —
  R5.2.) **Ausnahme (L6):** Vault-weite Ereignisse mit `path === '/'` (insbesondere
  `sync.completed`) werden vom Präfix-Filter **nicht** verworfen — ein Sync betrifft den ganzen
  Vault und bleibt bei jedem Ordner-Filter sichtbar. Die Präfix-Prüfung gilt nur für echte
  Datei-/Ordner-Pfade.
- `backend/src/api/activityRoutes.ts`: `pathPrefix` als optionaler Query-Parameter, Zod-validiert
  (Länge begrenzt, keine Pfad-Traversal-Zeichen nötig, da reiner Präfix-Vergleich auf bereits
  normalisierten vault-relativen Pfaden).

### Frontend

- Ordnerliste aus dem bereits geladenen `directoryTree` des aktiven Vaults ableiten (kein neuer
  Endpoint); „Alle Ordner" als Default.
- Auswahl fließt als `pathPrefix` in `loadActivity`; nur in der `full`-Variante gerendert (R5.3).

## Reihenfolge & Abhängigkeiten

Teil 1 (Frontend-only) und Teil 2 (git-sync-Event) sind unabhängig und können zuerst/parallel
laufen. Teil 3 (origin) baut auf dem `sync.completed`-Event aus Teil 2 auf (git-sync ist der
offensichtlichste Nicht-`web`-Origin). Teil 4 (Folder) ist unabhängig. Empfohlene Reihenfolge:
**2 → 3 → 1 → 4**, weil 2+3 die Datenschicht erweitern und 1+4 reine Ansichts-/Query-Arbeit sind,
die auf der erweiterten Datenschicht aufsetzt.

## Tests

- **Backend**: `sync.completed`-Aufzeichnung — success mit `pulledFiles > 0` → genau 1 Ereignis;
  success mit `pulledFiles = 0, pushedFiles > 0` (reiner Push) → **0** Ereignisse (L3);
  No-op-Poll → 0; conflict/error → 0. `origin`-Durchreichung je Eintrittspunkt **inkl. der
  eng typisierten `trashRoutes`-`note.restored`-Signatur** (L2). **Mail-Import nach Nachrüstung:
  ein Import löst genau ein `note.created` mit `origin='mail-import'` UND einen
  `linkIndexHook`-Aufruf aus** (L1). `pathPrefix`-Filter in `query` inkl. **`path='/'`-Ausnahme:
  ein `sync.completed` bleibt bei aktivem Ordner-Filter sichtbar** (L6). Lesen eines
  JSONL-Eintrags **ohne `origin` → `web`** ohne Fehler (L7). Round-Trip eines unbekannten
  Typs/Felds. Mock-Factory-Muster, keine Mocking-Lib.
- **Frontend**: `activity-stats.ts` (`countByType`, `buildHeatmap`) als reine Unit-Tests;
  Range_Switcher-Wechsel löst Neuladen der Liste aus **und berührt den Heatmap-Fetch nicht**
  (eigenes Fenster, L4); Herkunfts-Badge erscheint nur bei ≠ `web`; Folder_Filter schränkt die
  Query ein. `vitest-axe` für `ActivityStatPanel` (neue Kern-Komponente).

## Nicht-Ziele (bewusst außen vor)

- Keine neue Backend-Aggregationsroute für Statistik (client-seitig aus geladenen Events).
- Keine per-Datei-Events aus git-sync.
- Keine Konflikt-/Error-Sync-Ereignisse (nur erfolgreiche, wirksame Läufe).
- Keine Vault-spezifische/synchronisierte Speicherung des Logs — spätere, separate Entscheidung.
- Keine „Tasks"-Spur (vom Nutzer explizit ausgeschlossen; kein Slatebase-Konzept).
