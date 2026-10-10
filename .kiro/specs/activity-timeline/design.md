# Design Document: Aktivitätszeitleiste

## Overview

Die Aktivitätszeitleiste zeigt chronologisch, was in einem Vault geschieht. Weil Slatebase heute keinen pro-Datei-Ereignisstrom hat (das Audit-Log ist auf Auth/Admin/Freigabe beschränkt, Dateiversionen sind Momentaufnahmen), führt dieses Feature eine neue, schlanke **Aktivitäts-Ereignis-Schicht** ein und eine Ansicht darüber, die als Tab und in beiden Seitenleisten erscheint.

Architektur-Leitplanken:

- **Keine zweite Mutations-Pipeline.** Ereignisse entstehen genau dort, wo heute `vault:change` und der `linkIndexHook` feuern — ein zusätzlicher Hook neben den bestehenden, kein neuer Scan-Pfad. Zwei Eintrittspunkte (REST **und** MCP) bekommen dieselbe Nebenwirkung, bewusst, weil ein einziger vergessener Eintrittspunkt lautlos Lücken erzeugt (Lektion aus `lessons-learned.md`).
- **Append-only, auf dem Audit-Logger modelliert.** Der Activity_Store schreibt JSONL mit täglicher Rotation, wie `backend/src/audit/`, aber in ein eigenes Verzeichnis pro Vault (`.slatebase/activity/`) statt in das zentrale `data/audit/`, weil Sichtbarkeit und Aufbewahrung vault-gebunden sind.
- **Aufzeichnung ist Nebenwirkung, nie Vorbedingung.** Ein fehlgeschlagener Activity-Write darf den auslösenden Vault-Schreibvorgang nicht scheitern lassen — er wird lokal protokolliert und verworfen.
- **Eine Komponente, zwei Varianten.** `ActivityTimelineView` dient per `variant`-Prop sowohl dem Vollbild-Tab (Sentinel `__view::activity`, zweispaltig) als auch der Seitenleiste (eingebaute Panel-View `activity`, kompakt) — dasselbe Muster, mit dem Outline/Links/Tags/Properties bereits auf beiden Seiten laufen.
- **Live aus dem vorhandenen Realtime-Kanal.** Aktualisierung über die bestehende `realtimeVaultBridge` (`vault:change`), kein neuer SSE-Ereignistyp nötig — die Ansicht lädt bei einem `vault:change` den jüngsten Abschnitt nach.

## Resolved Decisions (eingefroren)

Diese vier Entscheidungen waren in der ersten Spec-Fassung offen und sind hier bewusst festgezurrt. Sie prägen das Datenmodell und sind nicht mehr Verhandlungsmasse der Implementierung.

### D1 — Auto-Save-Entprellung: Coalescing per 60-s-Trailing-Window

Der Editor-Auto-Save feuert alle 1,5 s. Ein `note.edited` pro Speichervorgang würde die Zeitleiste mit Dutzenden identischer Einträge für eine einzige Tipp-Sitzung fluten. **Entscheidung:** Rapide `note.edited`-Vorgänge derselben Datei werden zu **einem** Ereignis zusammengefasst, mit einem nachlaufenden 60-Sekunden-Fenster. Das erste Edit stempelt `timestamp`; jedes weitere Edit derselben Datei innerhalb von 60 s aktualisiert nur `lastModified`, ohne ein neues Ereignis anzulegen. Läuft das Fenster ohne weiteres Edit ab, beginnt das nächste Edit ein neues Ereignis. Betrifft **nur** `note.edited` — Create/Delete/Move/Restore erscheinen stets als eigenständige Ereignisse.

### D2 — Aufbewahrung: pro Vault konfigurierbar, Standard 90 Tage, bestehender Cleanup-Job

**Entscheidung:** Die Aufbewahrungsdauer ist pro Vault konfigurierbar, Standardwert 90 Tage. Das Aufräumen übernimmt der vorhandene periodische Cleanup-Job (`backend/src/cleanup/`), der schon Trash purgt und Versionen prunt — **kein neuer Scheduler**. Abgelaufene Tages-JSONL-Dateien werden pro Datei fehlertolerant gelöscht (ein gesperrtes File stoppt die übrigen nicht), gleicher Stil wie das bestehende Trash-/Versions-Pruning.

### D3 — Verschieben/Umbenennen: ein `note.moved`-Ereignis mit altem und neuem Pfad

**Entscheidung:** Ein Verschieben oder Umbenennen erzeugt **ein** `note.moved`-Ereignis, das `oldPath` und `newPath` trägt — nicht ein `note.deleted` + `note.created`-Paar. Das ist konsistent damit, wie die Link-Migration eine Verschiebung bereits als Einheit behandelt (`computeAffectedFilePairs`, `onFileRenamed`), und hält die Zeitleiste lesbar (ein Umbenennen ist eine Handlung, nicht zwei).

### D4 — Sichtbarkeit: pro Vault, nicht pro Benutzer

**Entscheidung:** Ereignisse werden pro Vault geführt, nicht pro Benutzer. Jeder Benutzer mit Lesezugriff auf den Vault sieht dieselbe Zeitleiste, inklusive des auslösenden Benutzernamens pro Ereignis. Das entspricht exakt der Adressierung von `vault:change` über `getUsersWithAccess(vaultId)` (Owner + alle Freigabe-Empfänger) — die Zugriffskontrolle, die der REST-Pfad derselben Ressource schon nutzt. Eine persönliche „nur meine Aktivität"-Filterung ist Out of Scope v1 (siehe `requirements.md`).

## Architecture

### Backend — neue Dateien

| Pfad | Verantwortung |
|------|---------------|
| `backend/src/activity/index.ts` | Barrel-Export des activity-Moduls. |
| `backend/src/activity/types.ts` | `IActivityService`, `ActivityEvent`, `ActivityEventType`, `ActivityQuery`, `ActivityPage`-Interfaces. |
| `backend/src/activity/errors.ts` | `ActivityQueryValidationError` o.ä. (nur falls über Zod-400 hinaus nötig). |
| `backend/src/activity/activity-store.ts` | `ActivityStore` — append-only JSONL pro Vault unter `.slatebase/activity/YYYY-MM-DD.jsonl`, täglich rotiert; `record(event)` (mit D1-Coalescing für `note.edited`), `query(vaultId, {types, from, to, cursor, limit})` → `ActivityPage`, `purgeExpired(vaultId, retentionDays)`. Modelliert auf dem Audit-Logger; atomare/append-sichere Schreibweise. Das 60-s-Coalescing-Fenster hält einen kleinen In-Memory-Zustand pro (vaultId, path) — reine Beschleunigung des „gleiches Ereignis fortschreiben", der Store bleibt auch bei Prozess-Neustart korrekt (ein neues Ereignis nach Neustart ist zulässig). |
| `backend/src/activity/activity-store.test.ts` | Unit-Tests: Coalescing-Fenster (D1), Typ-/Zeitfilter, Pagination, Sichtbarkeits-Scoping, Purge (D2), fehlertolerante Writes (R1.6). |
| `backend/src/api/activityRoutes.ts` | `GET /vaults/:vaultId/activity` — Zod-validiert, `checkReadAccess`, Typ-/Zeitfilter + Cursor/Limit, feature-gated `activity-timeline`. |
| `backend/src/api/activityRoutes.test.ts` | Integrationstests: Pagination, Filter, 403 ohne Zugriff, 400 bei ungültiger Query, Feature-Guard. |

Hinweis: Der Activity_Store ist ein Store mit etwas Verhalten (Coalescing + Purge), aber ohne separate Service-Schicht darüber — er implementiert das `IActivityService`-Interface direkt, wie `PreferencesStore`/`VaultConfigStore` es tun (keine Business-Logik jenseits von Persistenz + Coalescing).

### Backend — geänderte Dateien

| Pfad | Änderung |
|------|----------|
| `backend/src/api/index.ts` (`VaultController`) | Beim bestehenden `linkIndexHook`/`vault:change`-Punkt zusätzlich `activityStore.record(...)` aufrufen — für saveFile (create vs. edit unterscheiden), delete, move/rename (ein `note.moved`, D3). Fehler im Record dürfen den Request nicht scheitern lassen. |
| `backend/src/api/trashRoutes.ts` | Beim Restore ein `note.restored` aufzeichnen. |
| `backend/src/mcp/tool-handlers.ts` | `write_file`/`delete_file`/`move_file`/`rename_file` zusätzlich `activityStore.record(...)` verdrahten — zweiter Eintrittspunkt, dieselbe Nebenwirkungsliste wie REST (Lektion `lessons-learned.md`). |
| `backend/src/cleanup/cleanup-job.ts` | `activityStore.purgeExpired(vaultId, retentionDays)` in den bestehenden periodischen Lauf aufnehmen (D2). |
| `backend/src/vault-config/types.ts` + `validation.ts` + `vault-config-store.ts` | `activityRetentionDays` zur per-Vault-Config ergänzen (Standard 90), für D2. |
| `backend/src/index.ts` | `featureRegistry.register('activity-timeline', …)` (kalt, default aus); `ActivityStore` im Composition Root instanziieren und in `VaultController`, `trashRoutes`, `tool-handlers`, `cleanup-job` verdrahten; `activityRoutes` feature-gated mounten. |

### Frontend — neue Dateien

| Pfad | Verantwortung |
|------|---------------|
| `frontend/src/state/activityState.ts` | Reducer + Typen (Events, Time_Buckets, aktive Typfilter, Pagination/Cursor, Lade-/Fehlerzustand). |
| `frontend/src/state/activityActions.ts` | `loadActivity`, `loadMoreActivity`, `refreshRecentActivity` (nach `vault:change`) — Standalone-Action-Creators `(dispatch, apiClient, vaultId, …)`. |
| `frontend/src/state/activityActions.test.ts` | Unit-Tests der Action-Creators (Pagination, Filter, Live-Refresh-Merge). |
| `frontend/src/components/activity/ActivityTimelineView.tsx` | Hauptkomponente: gruppiert Events in Time_Buckets, rendert pro `variant` voll (Tab) oder kompakt (Seitenleiste), Filter-Chips, Legende, Klick-öffnet-Datei, leer-/Lade-/Fehlerzustand (a11y). |
| `frontend/src/components/activity/ActivityTimelineView.css` | Styles (Design Tokens, Dark Mode, vertikale Zeitachse, reduced-motion). |
| `frontend/src/components/activity/activity-event-meta.ts` | Reine Zuordnung Ereignistyp → Icon (Lucide) + Label-i18n-Key + Legenden-Zugehörigkeit; einzige Wahrheit, von View und Legende geteilt (kein Drift). |
| `frontend/src/components/activity/time-buckets.ts` | Reine Funktion: Event-Liste → gruppierte Time_Buckets (Heute/Gestern/Diese Woche/Älter), testbar ohne Render. |
| `frontend/src/components/activity/*.test.tsx` / `.test.ts` | View-Rendering (beide Varianten), Bucket-Gruppierung, Filter-Chips nur bei vorhandenen Typen, Klick-Navigation, a11y. |

### Frontend — geänderte Dateien

| Pfad | Änderung |
|------|----------|
| `frontend/src/types.ts` | `ActivityEvent`/`ActivityEventType`/`ActivityPage`-Typen für die API. |
| `frontend/src/api/index.ts` (+ `IApiClient`) | `getActivity(vaultId, {types, from, to, cursor, limit})`-Methode. |
| `frontend/src/state/panelState.ts` | `'activity'` in `BuiltinPanelViewId` + `isBuiltinViewId`-Guard aufnehmen. |
| `frontend/src/components/side-panel/SidePanel.tsx` | `'activity'` auf die kompakte `ActivityTimelineView` (variant="compact") routen. |
| `frontend/src/components/TabContent.tsx` | Sentinel-Tab `__view::activity` auf die volle `ActivityTimelineView` (variant="full") routen (vor dem Markdown-/Binary-Branch, analog zu `__graph__`). |
| `frontend/src/App.tsx` | `__view::activity` in die Nicht-Datei-Tab-Behandlung aufnehmen (Breadcrumb/Auto-Reveal überspringen, wie `__graph__` und `__view::*` bereits). |
| `frontend/src/plugins/compat/.../core-commands-app.ts` | Befehl „Aktivitätszeitleiste öffnen" / „Open activity timeline" (öffnet den Sentinel-Tab), feature-gated `activity-timeline`. |
| `frontend/src/plugins/compat/.../core-command-i18n.ts` | DE/EN-Labels für den Befehl. |
| `frontend/src/i18n/de.ts` + `en.ts` | Zeitleisten-Strings (Bucket-Namen, Filter-Chip-Labels, Legende, leer/Fehler). |
| `frontend/src/state/featureState.ts` o.ä. | `activity-timeline` im Frontend-Feature-Set führen (wie `bases`). |

### Welcome-Vault — neue/geänderte Dateien

| Pfad | Änderung |
|------|----------|
| `backend/assets/templates/welcome-vault/Features/Aktivitätszeitleiste.md` | DE-Feature-Guide (Standard-Struktur). |
| `backend/assets/templates/welcome-vault-en/Features/Activity Timeline.md` | EN-Feature-Guide. |
| `.../welcome-vault/Features/Übersicht.md` + `.../welcome-vault-en/Features/Overview.md` | Guide in „Weitere Features"/„More Features" verlinken. |
| `.../welcome-vault/_meta.md` + EN | Version + `updated` anheben. |

## Data Model

### ActivityEvent (JSONL-Zeile)

```jsonc
{
  "id": "a1b2c3d4",                     // kurzer eindeutiger Schlüssel
  "type": "note.edited",                // note.created|edited|deleted|moved|restored, canvas.*, base.*, snippet.*
  "timestamp": "2026-10-10T02:04:11.812Z",  // Erst-Zeitpunkt (bei edited: Beginn des Coalescing-Fensters)
  "lastModified": "2026-10-10T02:04:58.300Z", // nur bei coalesced edited; sonst == timestamp
  "path": "Projekte/Alpha/Notiz.md",    // betroffener Pfad (bei moved: neuer Pfad)
  "oldPath": "Projekte/Notiz.md",       // nur bei note.moved (D3)
  "user": "andreas"                     // auslösender Benutzername (D4)
}
```

- `note.edited` ist das einzige coalesced-fähige Ereignis (D1): `lastModified` wird fortgeschrieben, `timestamp` bleibt der Fensterbeginn.
- `note.moved` trägt beide Pfade (D3), nie ein Delete+Create-Paar.
- Dateien im `.slatebase/`-Baum erzeugen nie ein Ereignis (R1.5) — der Hook filtert dot-/underscore-interne Pfade wie Suche/Graph.

### Zeit-Gruppierung (Frontend)

`time-buckets.ts` ordnet jedes Event genau einem Bucket zu, berechnet gegen die lokale Zeit des Clients: **Heute**, **Gestern**, **Diese Woche** (Rest der laufenden Kalenderwoche vor gestern), **Älter**. Reine Funktion, keine Render-Abhängigkeit — testbar mit fixen Zeitstempeln.

## Record-Fluss (Backend)

1. Ein Vault-Schreibvorgang (saveFile/delete/move/restore, REST **oder** MCP) läuft wie heute und feuert `vault:change` + `linkIndexHook`.
2. Am selben Punkt ruft der Controller/Tool-Handler `activityStore.record(event)` — Typ aus der Operation abgeleitet (saveFile auf neuem Pfad → `note.created`, sonst `note.edited`; move/rename → ein `note.moved` mit `oldPath`+`newPath`).
3. Für `note.edited` prüft der Store das 60-s-Coalescing-Fenster (D1): offenes Fenster für (vaultId, path) → nur `lastModified` fortschreiben; sonst neues Ereignis + Fenster öffnen.
4. Ein Fehler beim Schreiben wird lokal protokolliert und verschluckt — der auslösende Request scheitert nie daran (R1.6).

## Read-/Render-Fluss (Frontend)

1. Beim Öffnen des Tabs/Panels ruft `loadActivity` `GET /vaults/:vaultId/activity` mit aktiven Typfiltern + Limit.
2. Die Antwort (eine Seite, absteigend nach Zeit) wird in `time-buckets.ts` gruppiert und gerendert; `variant` steuert voll vs. kompakt.
3. Scrollt der Nutzer ans Ende, lädt `loadMoreActivity` die nächste Seite per Cursor nach.
4. Ein `vault:change` (vorhandene `realtimeVaultBridge`) triggert `refreshRecentActivity` — lädt nur den jüngsten Abschnitt neu und merged ihn an den Kopf, ohne die geladene Historie zu verwerfen.
5. Klick auf einen Eintrag öffnet die Datei im Tab (gelöschte Datei → nicht-navigierbarer Zustand mit Hinweis).

## Security & Konsistenz

- `GET /vaults/:vaultId/activity` ist Zod-validiert, `checkReadAccess`-geschützt und feature-gated; es liefert nur Ereignisse des angefragten Vaults (R4.3, D4).
- Der auslösende Benutzername geht nur an Leseberechtigte desselben Vaults — gleiche Zielgruppe wie `vault:change` (`getUsersWithAccess`).
- Die Aufzeichnung berührt nur sichtbare Vault-Inhalte; `.slatebase/`-interne Schreibvorgänge erzeugen nie ein Ereignis (R1.5), damit die Zeitleiste keine internen Pfade preisgibt.
- Append-only JSONL mit täglicher Rotation; der Store schreibt append-sicher wie der Audit-Logger und überschreibt nie vorhandene Zeilen.
- Keine Formel-/Codeauswertung, keine neue externe Dependency.

## Testing-Strategie

- Backend: `ActivityStore`-Unit-Tests für D1-Coalescing (Fenster öffnen/fortschreiben/ablaufen), Typ-/Zeitfilter, Pagination, Purge (D2), fehlertolerante Writes (R1.6); `activityRoutes`-Integrationstests (Pagination, Filter, 403/400, Feature-Guard); ein Test, der den MCP-Schreibpfad als zweiten Eintrittspunkt abdeckt (R1.3).
- Frontend: `time-buckets.ts`-Unit-Tests mit fixen Zeitstempeln; `activityActions`-Tests (Pagination-Merge, Live-Refresh); `ActivityTimelineView`-Tests für beide Varianten, Filter-Chips nur bei vorhandenen Typen, Klick-Navigation; `*.a11y.test.tsx` für die Vollansicht (Lade-/Fehler-/Leerzustand).
- Welcome-Vault: Der Guide ist konsistent mit der Standardstruktur und in der Übersicht verlinkt; `_meta.md` angehoben.

## Verbleibende Umsetzungs-Details (keine offenen Design-Fragen mehr)

Alle vier zuvor offenen Design-Fragen sind in „Resolved Decisions" eingefroren. Was noch zur Umsetzung gehört, aber keine Designentscheidung mehr ist:

- Exakte Icon-Zuordnung pro Ereignistyp (Lucide-Namen) — rein kosmetisch, in `activity-event-meta.ts`.
- Seitengröße/Limit der Pagination (Startwert z.B. 50 Vollansicht, 15 Seitenleiste) — Tuning, keine Vertragsänderung.
- Ob `canvas.*`/`base.*`/`snippet.*` schon in v1 aufgezeichnet werden oder zunächst nur `note.*` — empfohlen: `note.*` zuerst verdrahten, die anderen Typen als dieselbe Record-Mechanik ergänzen, sobald `note.*` grün ist.
