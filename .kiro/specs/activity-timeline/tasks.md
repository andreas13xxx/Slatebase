# Implementation Plan: Aktivitätszeitleiste

## Overview

Die Zeitleiste braucht zuerst eine Aufzeichnungsschicht (es gibt heute keine), dann eine Lese-API, dann die Ansicht in Tab und Seitenleiste. Phase 1 baut den Activity_Store mit dem eingefrorenen 60-s-Coalescing (D1). Phase 2 verdrahtet die Aufzeichnung an allen Mutations-Punkten inklusive MCP (zweiter Eintrittspunkt). Phase 3 liefert die Lese-API, Phase 4 die Ansicht (beide Varianten), Phase 5 Aufbewahrung/Cleanup (D2), Phase 6 Feature-Toggle, Phase 7 Welcome-Vault-Doku, Phase 8 Steering/Docs.

Die vier eingefrorenen Entscheidungen (siehe `design.md`, „Resolved Decisions"): **D1** 60-s-Coalescing für `note.edited`; **D2** Aufbewahrung 90 Tage default, bestehender Cleanup-Job; **D3** ein `note.moved` mit alt+neu; **D4** Sichtbarkeit pro Vault.

## Tasks

- [x] 1. Aktivitäts-Ereignis-Schicht (Store)
  - [x] 1.1 `backend/src/activity/types.ts` — `IActivityService`, `ActivityEvent`, `ActivityEventType`, `ActivityQuery`, `ActivityPage`
  - [x] 1.2 `backend/src/activity/activity-store.ts` — append-only JSONL pro Vault unter `.slatebase/activity/YYYY-MM-DD.jsonl` (täglich rotiert), `record(event)` mit 60-s-Coalescing für `note.edited` (D1), `query(...)` → `ActivityPage`, `purgeExpired(vaultId, retentionDays)`; append-sicher wie der Audit-Logger; fehlertolerant (R1.6)
  - [x] 1.3 `backend/src/activity/index.ts` — Barrel-Export
  - [x] 1.4 `backend/src/activity/activity-store.test.ts` — Coalescing-Fenster (öffnen/fortschreiben/ablaufen), Typ-/Zeitfilter, Pagination, Purge, `.slatebase/`-Pfade werden nie aufgezeichnet (R1.5), Write-Fehler verschluckt
  - _Requirements: 1.1, 1.4, 1.5, 1.6, 2.1, 2.2, 2.3, 2.4_

- [x] 2. Aufzeichnung verdrahten (REST + MCP, D3)
  - [x] 2.1 `backend/src/api/index.ts` (`VaultController`) — am bestehenden `linkIndexHook`/`vault:change`-Punkt `activityStore.record(...)` für create/edit/delete/move aufrufen; create vs. edit unterscheiden; move/rename → **ein** `note.moved` mit `oldPath`+`newPath` (D3); Record-Fehler darf Request nicht scheitern lassen
  - [x] 2.2 `backend/src/api/trashRoutes.ts` — beim Restore `note.restored` aufzeichnen
  - [x] 2.3 `backend/src/mcp/tool-handlers.ts` — `write_file`/`delete_file`/`move_file`/`rename_file` dieselbe Record-Nebenwirkung wie REST (zweiter Eintrittspunkt, R1.3)
  - [x] 2.4 Tests: ein Backend-Test, der den MCP-Schreibpfad als Ereignisquelle abdeckt; Move erzeugt genau ein `note.moved`
  - _Requirements: 1.2, 1.3, 2.4_

- [x] 3. Lese-API (Pagination, Filter)
  - [x] 3.1 `backend/src/api/activityRoutes.ts` — `GET /vaults/:vaultId/activity`, Zod-validiert, `checkReadAccess`, Typ-/Zeitfilter + Cursor/Limit, feature-gated `activity-timeline`
  - [x] 3.2 `backend/src/api/activityRoutes.test.ts` — Pagination, Filter, 403 ohne Zugriff, 400 bei ungültiger Query, Feature-Guard, kein vault-fremdes Durchsickern (R4.3)
  - [x] 3.3 `frontend/src/api/index.ts` + `IApiClient` — `getActivity(vaultId, {types, from, to, cursor, limit})`
  - [x] 3.4 `frontend/src/types.ts` — `ActivityEvent`/`ActivityEventType`/`ActivityPage`
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 6.2, 6.3_

- [x] 4. Zeitleisten-Ansicht (Tab + Seitenleiste)
  - [x] 4.1 `frontend/src/components/activity/time-buckets.ts` — reine Gruppierung in Heute/Gestern/Diese Woche/Älter (+ Unit-Test)
  - [x] 4.2 `frontend/src/components/activity/activity-event-meta.ts` — Typ → Icon + Label-i18n-Key + Legenden-Zugehörigkeit (einzige Wahrheit)
  - [x] 4.3 `frontend/src/state/activityState.ts` + `activityActions.ts` (+ `activityActions.test.ts`) — Reducer, `loadActivity`/`loadMoreActivity`/`refreshRecentActivity`
  - [x] 4.4 `frontend/src/components/activity/ActivityTimelineView.tsx` — `variant` voll (Tab, zweispaltig) vs. kompakt (Seitenleiste), Buckets, Filter-Chips (nur vorhandene Typen), Legende, Klick-öffnet-Datei, Lade-/Fehler-/Leerzustand mit a11y-Rollen
  - [x] 4.5 `frontend/src/components/activity/ActivityTimelineView.css` — Design Tokens, Dark Mode, vertikale Zeitachse, reduced-motion
  - [x] 4.6 `frontend/src/state/panelState.ts` — `'activity'` in `BuiltinPanelViewId` + Guard; `SidePanel.tsx` auf compact-Variante routen
  - [x] 4.7 `frontend/src/components/TabContent.tsx` + `App.tsx` — Sentinel `__view::activity` auf full-Variante routen; als Nicht-Datei-Tab behandeln (Breadcrumb/Auto-Reveal überspringen)
  - [x] 4.8 `core-commands-app.ts` + `core-command-i18n.ts` — Befehl „Aktivitätszeitleiste öffnen"/„Open activity timeline" (feature-gated)
  - [x] 4.9 `frontend/src/i18n/de.ts` + `en.ts` — alle Strings; `*.test.tsx` + `*.a11y.test.tsx`
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

- [x] 5. Aufbewahrung & Cleanup (D2)
  - [x] 5.1 `backend/src/vault-config/types.ts` + `validation.ts` + `vault-config-store.ts` — `activityRetentionDays` (Standard 90)
  - [x] 5.2 `backend/src/cleanup/cleanup-job.ts` — `activityStore.purgeExpired(vaultId, retentionDays)` in den bestehenden Lauf aufnehmen, pro Datei fehlertolerant
  - [x] 5.3 Tests: Purge löscht nur abgelaufene Tagesfiles, überspringt gesperrte
  - _Requirements: 5.1, 5.2, 5.3_

- [x] 6. Feature-Toggle
  - [x] 6.1 `backend/src/index.ts` — `featureRegistry.register('activity-timeline', …)` (kalt, default aus); `ActivityStore` im Composition Root instanziieren und in `VaultController`/`trashRoutes`/`tool-handlers`/`cleanup-job` verdrahten; `activityRoutes` feature-gated mounten
  - [x] 6.2 Frontend-Feature-Set um `activity-timeline` ergänzen; Tab-/Panel-Routing + Öffnen-Befehl gaten; bei ausgeschaltetem Toggle keine Aufzeichnung (R7.2)
  - _Requirements: 7.1, 7.2_

- [x] 7. Welcome-Vault-Dokumentation (DE + EN)
  - [x] 7.1 `backend/assets/templates/welcome-vault/Features/Aktivitätszeitleiste.md` (DE) — Standard-Guide-Struktur
  - [x] 7.2 `backend/assets/templates/welcome-vault-en/Features/Activity Timeline.md` (EN)
  - [x] 7.3 Guide in `Features/Übersicht.md` (DE) + `Features/Overview.md` (EN) verlinken
  - [x] 7.4 `_meta.md` (DE+EN) Version + `updated` anheben
  - _Requirements: 7.3, 7.4, 7.5_

- [x] 8. Dokumentation & Steering
  - [x] 8.1 `structure.md` (activity-Modul, activityRoutes, Panel-/Sentinel-Routing), `product.md` (Feature-Zeile), `implementation-plan.md` (Status) aktualisieren
  - [x] 8.2 `tech.md` falls eine Dependency hinzukäme (erwartet: keine) — sonst nur die Entscheidung „kein neuer Scheduler, bestehender Cleanup-Job" festhalten
  - _Requirements: —_

## Verifikation vor Abschluss

- Backend `npx tsc --noEmit` + `npm run test:coverage` grün (Suiten seriell, nicht parallel — geteiltes `shared-contracts/node_modules`)
- Frontend `npm run build` + `npm run test:coverage` grün, `npx eslint . --quiet` 0 Errors
- Manuell: eine Notiz anlegen/bearbeiten/verschieben/löschen → je ein korrektes Ereignis in der Zeitleiste (Edit coalesced, Move als ein Eintrag); Ansicht als Tab UND in beiden Seitenleisten; Filter-Chip blendet einen Typ aus; Klick öffnet die Datei; Toggle aus → keine Aufzeichnung, keine View
