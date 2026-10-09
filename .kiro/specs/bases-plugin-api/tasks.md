# Implementation Plan: Bases Plugin API (v2)

## Overview

Löst die inerten Bases-Plugin-API-No-Ops durch echte Implementierungen ab, sodass fremde Plugins eigene Bases-Views rendern. Baut auf der abgeschlossenen Bases-v1-Spec auf (Query-Route, Query-Engine, Formel-Interpreter werden wiederverwendet). Reihenfolge: zuerst Registry + Value-Fabrik + QueryController (die Brücke zur Datenschicht), dann das Mounten im Container, dann Compat-Report/Versionsaudit.

**Vorarbeit:** Signatur von `registerBasesView` + `registration`-Objekt gegen eine echte Obsidian-Version verifizieren (Design: „Offene Design-Fragen" #1).

## Tasks

- [ ] 1. Bases-View-Registry
  - [ ] 1.1 `frontend/src/plugins/compat/bases-view-registry.ts` — `registerBasesView(id, registration, pluginId)`, `getBasesViewRegistration(type)`, `clearForPlugin(pluginId)`, `resetForVault()` (Modul-Level-Muster wie `view-registry.ts`/`embed-registry.ts`)
  - [ ] 1.2 `Plugin.registerBasesView()` von `warnNoOp` auf echte Registrierung umstellen (Rückgabe weiterhin `void`), Plugin-ID aus dem Ausführungskontext
  - [ ] 1.3 Tests: Registrieren, Auflösen nach `type`, `clearForPlugin`/`resetForVault`
  - _Requirements: 1.1, 1.4_

- [ ] 2. Value-Typhierarchie funktional machen
  - [ ] 2.1 `install-globals.ts` — `Value`-Hierarchie mit echten `toString`/`isTruthy`/`equals`/`looseEquals`/`renderTo` je Typ (Platzhalter ersetzen, Prototypenkette erhalten)
  - [ ] 2.2 `frontend/src/plugins/compat/bases-value-factory.ts` — Rohwert (string-Liste) + optionaler deklarierter Typ → passendes `Value_Object` (nutzt `inferCellType` aus `base-cell-type.ts`)
  - [ ] 2.3 `renderTo()` typgerecht: `LinkValue` klickbarer interner Link, `DateValue` formatiert, `HTMLValue` sanitisiert (kein ungeprüftes `innerHTML`)
  - [ ] 2.4 Tests je Typ (`toString`/`isTruthy`/`equals`/`renderTo`), inkl. Sanitizing-Pfad
  - _Requirements: 3.1, 3.2, 3.3, 5.3_

- [ ] 3. QueryController mit echten Daten
  - [ ] 3.1 `frontend/src/plugins/compat/bases-query-controller.ts` — ruft `runBaseQuery` (Bases-v1), baut `BasesEntry[]` mit `Value_Object`-Spalten
  - [ ] 3.2 Formel-Spalten über `frontend/src/bases/formula/` auswerten → `Value_Object`
  - [ ] 3.3 `vault:change` (über `realtimeVaultBridge`) → erneute Query + `onDataUpdated()`
  - [ ] 3.4 `QueryController`/`BasesView`/`BasesViewConfig`/`BasesEntry`/`RenderContext` in `install-globals.ts` von Platzhaltern auf funktionsfähige Basisklassen heben (Lifecycle real)
  - [ ] 3.5 Tests: dieselben Zeilen wie die Tabelle, Live-Refresh löst `onDataUpdated()` aus
  - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [ ] 4. Plugin-View im Bases-Container mounten
  - [ ] 4.1 `frontend/src/components/bases/BasesView.tsx` — bei passendem View-`type` die Plugin-Factory aufrufen, Plugin_Bases_View in gescopten (`data-plugin-id`), ErrorBoundary-umhüllten Container mounten, `QueryController` anhängen
  - [ ] 4.2 Lifecycle treiben (`load`→`onload`→`onDataUpdated`→`unload`); Plugin-Deaktivierung/Vault-Wechsel unloadet sauber
  - [ ] 4.3 Fehler-Isolation: werfende Factory/Render → Rückfall auf eingebaute Tabelle/Rohquelle + sichtbare Meldung, kein Tab-Crash
  - [ ] 4.4 View-Switcher-UI: Auswahl zwischen eingebauter Tabelle und registrierten Plugin-View-Typen (Design-Frage #2)
  - [ ] 4.5 Tests: Mounten/Unmounten, Fehlerpfad, Rückfall auf Tabelle bei unbekanntem Typ
  - _Requirements: 1.2, 1.3, 1.5, 5.1, 5.2_

- [ ] 5. Kompatibilitäts-Report, Versionsaudit, Doku
  - [ ] 5.1 `compatibility-analyzer.ts` — Bases-Referenzen nicht mehr pauschal `partial`; nur noch tatsächlich fehlende Teile markieren; Tests nachziehen
  - [ ] 5.2 `OBSIDIAN_API_VERSION` nur anheben, wenn die APIs real sind (Projektregel)
  - [ ] 5.3 `PLUGIN-COMPAT.md` — den „bewusst No-Op"-Vermerk durch den tatsächlichen Stand ersetzen
  - [ ] 5.4 `bases-stub-types.test.ts` — von „never throws / no-op" auf echtes Verhalten umstellen (die alten Tests pinnen den jetzt überholten No-Op-Kontrakt)
  - [ ] 5.5 Steering: `implementation-plan.md`/`product.md` Bases-Zeile um „Plugin-View-Freigabe" ergänzen
  - _Requirements: 4.1, 4.2, 4.3_

## Verifikation vor Abschluss

- Frontend `npm run build` + `npm run test:coverage` grün, `npx eslint . --quiet` 0 Errors
- Manuell/Fixture: ein Test-Plugin registriert eine triviale Bases-View (z.B. „gib die Zeilenanzahl aus") → `.base` mit diesem View-`type` rendert die Plugin-View mit echten Daten; `vault:change` aktualisiert sie; Plugin deaktivieren entfernt sie sauber; eine absichtlich werfende Factory fällt auf die Tabelle zurück
