# Aktivitätszeitleiste — Ausbau (Enhancements) — Tasks

Reihenfolge gemäß Design: **2 → 3 → 1 → 4** (Datenschicht zuerst, Ansicht danach).
Nach jeder Teiländerung die Vor-Push-Checks (`quality.md`) grün halten.

## Teil 2 — git-sync als Einzel-Ereignis

- [ ] 2.1 `ActivityEventType` in `backend/src/activity/types.ts` um `'sync.completed'` erweitern;
  optionale Felder `pulledFiles`/`pushedFiles`/`remoteName` am `ActivityEvent`/`ActivityEventInput`
  ergänzen (JSDoc: nur für `sync.completed` gesetzt). (R3.1, R6.3)
- [ ] 2.2 `GitSyncEngine` (`backend/src/git-sync/sync-engine.ts`) um eine optionale
  `recordActivity`-Abhängigkeit erweitern (gleiche Form wie MCP/trashRoutes, fire-and-forget).
- [ ] 2.3 Im `success`-Pfad von `runOneUnlocked` **ein** `sync.completed` aufzeichnen, nur wenn
  `pulledFiles > 0` (reiner Push mit `pulledFiles = 0` schreibt nichts; `pushedFiles` nur
  informativ am Event); conflict/error schreiben nichts. Actor „Git-Sync".
  Keine per-Datei-Iteration. (R3.1–R3.4, L3)
- [ ] 2.3a **`sync.completed`-Eintrag in `activity-event-meta.ts`** (Icon + Lane + Label-Key)
  ergänzen — sonst crasht `ACTIVITY_EVENT_META[evt.type].lane` beim ersten Sync-Event (Record-
  Zugriff auf fehlenden Key). Lane-Vorschlag: neue Lane `sync` (eigener Filter-Chip). Diese Task
  gehört in Teil 2, nicht erst Teil 3. (L5)
- [ ] 2.4 Komposition in `backend/src/index.ts`: `recordActivity` an die `GitSyncEngine` nur bei
  `activityEnabled` durchreichen (git-sync-Toggle an + activity-timeline-Toggle aus ⇒ nichts
  aufzeichnen, L8); Username/Actor konsistent mit `GIT_SYNC_ACTOR`.
- [ ] 2.5 Bestätigen, dass `MANAGED_GITIGNORE_LINES` unverändert bleibt (Activity-Log nicht
  gesynct). (R3.5)
- [ ] 2.6 Tests: success mit `pulledFiles > 0` → genau 1 Ereignis; reiner Push
  (`pulledFiles = 0, pushedFiles > 0`) → 0 (L3); No-op-Poll → 0; conflict/error → 0;
  `sync.completed` läuft nicht durch das Edit-Coalescing.

## Teil 3 — Activity_Origin

- [ ] 3.1 `ActivityOrigin`-Typ + optionales `origin`-Feld am `ActivityEvent`/`ActivityEventInput`;
  fehlendes `origin` wird beim Lesen als `web` interpretiert. (R4.1, R6.3)
- [ ] 3.2 `origin` an jedem Eintrittspunkt setzen: REST (`backend/src/api/index.ts`) `web`,
  MCP (`backend/src/mcp/tool-handlers.ts`) `mcp`, git-sync `git-sync`. Trash-Restore `web` —
  dabei das Feld durch die **separate, eng typisierte** `note.restored`-Signatur in
  `trashRoutes.ts` (`{ type: 'note.restored'; path; user }`) reichen (leicht zu übersehen, L2). (R4.2)
- [ ] 3.3 **Mail-Import-Nachrüstung (verifiziert, kein offener Prüfpunkt):** `MailNoteWriter`
  (`backend/src/mail-import/note-writer.ts`) schreibt heute direkt per `fs.writeFile` und ruft
  WEDER `record` NOCH `linkIndexHook` auf. Beide Hooks nachrüsten (gleiche optionale-Hook-Form wie
  MCP/trashRoutes, in `index.ts` verdrahtet): `note.created` mit `origin='mail-import'` (Activity
  nur bei `activityEnabled`) UND `linkIndexHook` (immer). KEIN zweiter Aufzeichnungspfad. Der
  Link-Index-Teil behebt einen eigenständigen, schon heute bestehenden Bug (importierte Mails
  fehlen im Graph). Prüfen, ob der Writer besser über `IVaultService.saveFile` schreibt statt am
  Service vorbei. (R4.4, L1)
- [ ] 3.4 Frontend: Herkunfts-Badge in `ActivityTimelineView` nur bei `origin ≠ web`; Icon/Label
  zentral in `activity-event-meta.ts`. (R4.3)
- [ ] 3.5 i18n-Keys `activity.origin.{mcp,gitSync,mailImport}` in `de.ts` + `en.ts`.
- [ ] 3.6 Tests: origin je Eintrittspunkt korrekt (inkl. mail-import `note.created` + linkIndexHook,
  inkl. trashRoutes `note.restored`); fehlendes origin ⇒ web; **Lesen einer vor dem Feature
  geschriebenen `.jsonl`-Zeile ohne `origin` ⇒ web, ohne Fehler** (L7); Badge erscheint nur ≠ web.

## Teil 1 — Statistik-Panel + Range_Switcher (Frontend)

- [ ] 1.1 Reine Hilfe `frontend/src/components/activity/activity-stats.ts`:
  `countByType(events)` (über die range-geladenen Events) + `buildHeatmap(events, weeks)` (über
  die Heatmap-Fenster-Events); beide pur, Event-Liste als Argument; Unit-Tests (analog
  `time-buckets.test.ts`).
- [ ] 1.1a Lade-Aktion `loadActivityHeatmap` in `activityActions.ts`: eigener Fetch der
  bestehenden Leseroute mit festem „letzte N Wochen"-Fenster, **unabhängig vom Range_Switcher**,
  mit `AbortController`/`cancelled`-Guard (Vault-Wechsel-Race). KEINE neue Backend-Route. (L4)
- [ ] 1.2 `ActivityStatPanel.tsx` + `.css`: By-type-Balken (Zähler, aus range-Events),
  Activity_Heatmap (aus dem eigenen Heatmap-Fetch), Range_Switcher-Chips. Nur Design-Tokens,
  Dark-Mode-fest, `role`/`aria-label` korrekt. Heatmap-Fetch bei Mount + Vault-Wechsel. (R1.2–R1.4, L4)
- [ ] 1.3 `ActivityTimelineView.tsx`: `full` → zweispaltiges Grid (Liste links, Stat-Panel rechts);
  `compact` unverändert einspaltig. (R1.1)
- [ ] 1.4 Range_Switcher: Auswahl setzt `from`/`to` in `loadActivity`/`refreshRecentActivity` und
  die By-type-Zählung; die Heatmap bleibt **unberührt** (eigener Fetch, Punkt 1.1a). Liste +
  By-type laden/berechnen konsistent für denselben Zeitraum. (R2.1, R2.2, L4)
- [ ] 1.5 Range-Auswahl pro Nutzer+Vault über `vaultSettingsStore` persistieren. (R2.3)
- [ ] 1.6 i18n `activity.range.*`, `activity.stats.*` in `de.ts` + `en.ts`.
- [ ] 1.7 `vitest-axe`-Test für `ActivityStatPanel`; Test Range-Wechsel → Liste/By-type laden neu,
  **Heatmap-Fetch wird NICHT erneut ausgelöst** (L4).

## Teil 4 — Folder_Filter

- [ ] 4.1 `ActivityQuery.pathPrefix?` + Präfix-Prüfung in `ActivityStore.query`s `matches()`;
  **Ausnahme: `path === '/'`-Ereignisse (sync.completed) nie durch den Präfix wegfiltern** (L6). (R5.2, R5.3-neu)
- [ ] 4.2 `backend/src/api/activityRoutes.ts`: `pathPrefix` als Zod-validierter Query-Parameter.
- [ ] 4.3 Frontend: Folder_Filter-Dropdown aus `directoryTree` (nur `full`-Variante), Default
  „Alle Ordner"; Auswahl fließt als `pathPrefix` in die Ladeaktion. (R5.1, R5.4)
- [ ] 4.4 Tests: Backend `pathPrefix`-Filter inkl. **`path='/'`-Ausnahme sichtbar** (L6);
  Frontend Auswahl schränkt Query ein.

## Abschluss

- [ ] 5.1 Vor-Push-Checks grün (Backend `tsc --noEmit` + `test:coverage`, Frontend `build` +
  `test:coverage` + `eslint --quiet`). Coverage-Schwellen als Baseline halten, nie senken.
- [ ] 5.2 Steering nachziehen: `product.md` (Activity-Timeline-Zeile um Stat-Panel/Origin/
  Folder/Sync-Event), `structure.md` (neue Frontend-Dateien), ggf. `lessons-learned.md`
  (git-sync-Einzel-Event-Entscheidung).

## Zurückgestellt (nicht in dieser Spec, bewusst notiert)

- Vault-spezifische/synchronisierte Speicherung des Activity-Logs inkl. Merge-Verfahren für
  konkurrierende append-only Ströme — spätere, separate Entscheidung (siehe requirements.md,
  „Spätere Erwägung").
- Konflikt-/Error-Sync-Ereignisse als eigener Typ.
- Lambda/erweiterte Statistik-Aggregation serverseitig.
