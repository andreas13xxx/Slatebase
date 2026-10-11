# Implementation Plan: Split Panes

## Overview

Split Panes ersetzen die flache Tab-Reihe durch einen verschachtelbaren Pane-Baum, in dem jeder Pane den vorhandenen `TabState` wiederverwendet. **Phase 0 (Design-Spike) ist verbindlich** und läuft vor jeder produktiven Zustandsänderung. Danach: Datenmodell/Reducer (Phase 1), Rendering + Fokus + Resize (Phase 2), Splits + Tab-Drag (Phase 3), Persistenz + Migration (Phase 4), Plugin-Workspace-Kompatibilität (Phase 5), Befehle + Keybindings (Phase 6), Dokumentation (Phase 7).

Dies ist die größte einzelne Architekturänderung am Layout-System — die bestehende Tab-Logik (`tabReducer`) wird WIEDERVERWENDET, nicht neu geschrieben; das hält die Regressionsfläche beherrschbar.

## Tasks

- [ ] 0. Design-Spike (verbindliche Vorarbeit, Wegwerf-Prototyp)
  - [x] 0.1 Zustandsform entscheiden: Pane-gebundener `TabProvider` vs. globaler Baum-Reducer mit Selektoren (Re-Render-Kosten gegen bestehende `useTabContext()`-Aufrufmenge) — ENTSCHIEDEN: Pane-gebundener `TabProvider` (Design-Befunde #1)
  - [x] 0.2 Aktiver-Tab-Ableitung prototypisch an EINEN Wert hängen und gegen Breadcrumb/Context-Panel/Status-Bar/Navigationsverlauf/Auto-Reveal gegenprüfen — BESTÄTIGT: heute ein Pfad über `tabState.activeTabId` (Design-Befund #3)
  - [x] 0.3 Canvas/Graph/Plugin-File-View (TextFileView) in einem schmalen Split testen (Fullscreen-Annahmen, Resize-Observer) — container-relativ, Prüfpunkt in Phase 2 (Design-Befund #4)
  - [x] 0.4 Plugin-Sidebar-Views gegen „geraten nicht in den Editor-Pane-Baum" absichern — Sidebar-Views bleiben eigene Layout-Schicht (Design-Befund #4/Requirement 7.5)
  - [x] 0.5 Modifikator für „in Split öffnen" gegen bestehende Shortcuts/Browser-Reservierungen festlegen — Ctrl/Cmd+Alt+Klick (Design-Befund #2)
  - [x] 0.6 Erkenntnisse ins Design-Dokument zurückschreiben (offene Fragen 1–5 schließen), DANN Phase 1 beginnen — Abschnitt „Phase-0-Befunde" im Design
  - _Requirements: Risiko & verbindliche Vorarbeit_

- [x] 1. Pane-Baum: Datenmodell + Reducer
  - [x] 1.1 `frontend/src/state/paneTreeState.ts` — `PaneNode`/`SplitNode`/`PaneTree`-Typen, Start = ein `PaneNode`
  - [x] 1.2 Reducer-Aktionen: `SPLIT_PANE`, `CLOSE_PANE`, `FOCUS_PANE`, `RESIZE_SPLIT`, `PANE_TAB_ACTION` (delegiert an den vorhandenen `tabReducer` je Pane); `MOVE_TAB_TO_PANE`/`COLLAPSE_EMPTY_PANE` folgen in Phase 3 (Kollaps ist bereits in `PANE_TAB_ACTION`/`CLOSE_PANE` eingebaut)
  - [x] 1.3 Kollaps-Logik: letzter Tab → Pane weg + Split kollabiert; letzter Pane bleibt leer
  - [x] 1.4 Größen als Verhältnisse (Summe 1), Mindestgröße (`MIN_PANE_RATIO`), Normalisierung
  - [x] 1.5 `frontend/src/state/paneTreeContext.ts` — `PaneTreeProvider` + `usePaneTree` + abgeleiteter aktiver Tab
  - [x] 1.6 `frontend/src/state/paneTreeState.test.ts` — splitten, kollabieren, Fokus, Tab-Delegation, zweistufige Verschachtelung, Größen-Normalisierung, Purity (14 Tests)
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [x] 2. Rendering, Fokus, Resize
  - [x] 2.1 `frontend/src/components/panes/PaneTreeView.tsx` — rekursives Baum-Rendering
  - [x] 2.2 `frontend/src/components/panes/PaneContainer.tsx` — ein Pane (eigene `TabBar`+`TabContent`), Fokus/Klick → Active_Pane, Active-Markierung (als `PaneLeaf` in PaneTreeView + App.tsx `renderPane`)
  - [x] 2.3 `frontend/src/components/panes/PaneSplitHandle.tsx` — Resize-Griff (`useResize`, `role="separator"`, aria-value*, Pfeiltasten)
  - [x] 2.4 `frontend/src/components/panes/panes.css` — Verhältnis-Layout, Active-Markierung (Design Tokens), kein `overflow:hidden` über absolut positionierten Kindern
  - [ ] 2.5 Fokus-Wechsel-Befehle (Pane links/rechts/oben/unten) — zurückgestellt (optionale Keyboard-Navigation; Fokus per Klick funktioniert)
  - [x] 2.6 `App.tsx` — Editor-Bereich auf `<PaneTreeView>` umgestellt; aktiver-Tab-Pfad über die `useTabContext()`-Brücke an den aktiven Pane gehängt (PluginProvider-Platzierung beachtet)
  - [x] 2.7 Tests: Split-Rendering, Klick-Fokus, Resize per Tastatur
  - _Requirements: 1.4, 3.1, 3.2, 3.3, 3.4, 4.1, 4.2, 4.3, 4.4_

- [x] 3. Splits erzeugen/schließen + Tab-Drag zwischen Panes
  - [x] 3.1 `TabBar.tsx` pane-lokal; Tab-Drag auf fremde Tab-Reihe → `MOVE_TAB_TO_PANE` (via `paneId`+`onMoveTabToPane`-Props, `TAB_DRAG_MIME`-Payload)
  - [x] 3.2 Kanten-Drop-Zonen an Pane-Rändern → `SPLIT_PANE_WITH_TAB` + Tab in neuen Pane (PaneTreeView `PaneLeaf`-Edge-Zonen, `generatePaneId`)
  - [x] 3.3 Interne-Drag-Erkennung über `dataTransfer.types` ohne `'Files'` beibehalten (Tab-Drag trägt nur `application/x-slatebase-tab`, kein `'Files'` → DropZone-Overlay bleibt dunkel, verifiziert gegen `useDropZone.ts`)
  - [ ] 3.4 „in Split öffnen" aus Link/Explorer/Suche/Switcher mit dem in 0.5 gewählten Modifikator (Ctrl/Cmd+Alt+Klick) — zurückgestellt (eigene fokussierte Erweiterung; Split per Befehl + Tab-Drag deckt den Kern)
  - [x] 3.5 Pane schließen / Tab-Gruppe schließen / andere schließen (Kollaps über `PANE_TAB_ACTION`/`CLOSE_PANE`; `close-tab-group`/`close-others-tab-group` laufen über die bestehenden Tab-Befehle gegen den aktiven Pane)
  - [x] 3.6 Tests: Tab-Drag zwischen Panes (`MOVE_TAB_TO_PANE`), Kanten-Drop erzeugt Split (`SPLIT_PANE_WITH_TAB` + Edge-Drop-UI-Test), letzter-Tab-Kollaps, COPY- vs. MOVE-Modus, TabBar-Drag-Test
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 5.1, 5.2, 5.3, 5.4_

  Teil von Phase 6 vorgezogen (gehört logisch zu „Splits erzeugen"):
  - [x] 6.1 `core-commands-app.ts` — `workspace:split-vertical`/`split-horizontal` auf echte Pane-Ops (`onSplitPane` → `SPLIT_PANE_WITH_TAB copy:true`, in `CommandPaletteContainer` verdrahtet). Fokus-Wechsel-Befehle offen (siehe 2.5)
  - [x] 6.2 `core-command-i18n.ts` — DE/EN-Labels „Rechts teilen"/„Unten teilen" (bereits vorhanden)
  - [ ] 6.3 `keybindingsStore.ts` — Defaults für Split: bewusst KEINE (Obsidian liefert Split ohne Default-Hotkey; vermeidet Browser-Kollisionen). Über Command Palette erreichbar.

- [x] 4. Persistenz + Migration
  - [x] 4.1 `workspaceStore.ts` — `PersistedPaneTree` serialisieren (Struktur, Größen, Tabs/aktiv pro Pane, `activePaneId`), optionales `paneTree`-Feld (content-frei), `updatePaneTree`-Updater; Serialisierung in `paneTreeState.ts` (`serializePaneTree`/`rehydratePaneTree`)
  - [x] 4.2 Migration alter flacher `tabs`-Blob → Einzel-Pane (`migrateFlatTabsToPaneTree`); ungültiger Baum → Fallback-Einzel-Pane (`parsePersistedPaneTree` lenient, Split mit nur einem überlebenden Kind kollabiert, kaputtes `paneTree` invalidiert nie den restlichen Workspace-State)
  - [x] 4.3 `useWorkspaceRestore.ts` — Baum vor erstem Render via `getInitialPaneTree()` → `PaneTreeProvider initialTree` (modul-level, synchron); Inhalt jedes Tabs pro Pane via `PANE_TAB_ACTION` nachgeladen, `cancelled`-Guard pro Restore
  - [x] 4.4 Cross-Tab-`storage`-Event-Übernahme unverändert (nur ohne eigenen pendenten Debounce-Write; `paneTree` fährt im geteilten Workspace-Blob mit)
  - [x] 4.5 Tests: Round-Trip, Migration, Fallback, lenient-Parse (13 in `paneTreeState.test.ts`); `workspaceStore.test.ts` (Persist-Durchlauf, Lenient-Fallback, Legacy-Blob)
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

- [x] 5. Plugin-Workspace-Kompatibilität
  - [x] 5.1 `workspace-shim.ts` — `createLeafBySplit`/`splitActiveLeaf`/`getLeaf('split')` erzeugen echte Panes über die neue `pane-split-bridge.ts` (fordert einen Split des aktiven Panes an → neuer Pane wird aktiv → das danach via `setViewState` geöffnete View landet dort über die `useTabContext`-Brücke). Obsidian-Richtung (benennt den Trenner) → unsere `SplitDirection` (benennt das Layout) via `obsidianToPaneDirection`. Fallback auf einfachen Tab, wenn kein Pane-Host gemountet ist (`requestPaneSplit` → false) — unverändertes Vor-Phase-5-Verhalten in Tests/headless
  - [x] 5.2 `iterateAllLeaves`/`getLeavesOfType`/`getMostRecentLeaf`/`activeLeaf` decken bereits alle Panes ab: Leaves sind nicht pane-gebunden (die `ViewRegistry` trackt sie global, der Pane-Baum hält Tabs), also partitioniert nichts sie pro Pane — keine Änderung nötig
  - [x] 5.3 `view-registry.ts` — `getRoot()` meldet weiterhin korrekt `rootSplit` (Main) vs. `left/rightSplit` (Sidebar); Sidebar-Views bleiben eine getrennte Layout-Schicht (Design-Befund #4), unabhängig vom Editor-Pane-Baum
  - [x] 5.4 `compatibility-analyzer.ts` — `createLeafBySplit`/`splitActiveLeaf` bleiben `supported`, Kommentar aktualisiert: echte Splits statt „degradiert zum Tab"; Popout/Layout-Objektmodell bleiben Stubs
  - [x] 5.5 Wiring-Test `pane-split-bridge.test.ts`: Bridge-Kontrakt (subscribe/dispatch/unsubscribe), Shim `createLeafBySplit`/`splitActiveLeaf`/`getLeaf('split')` → `requestPaneSplit` mit korrektem Richtungs-Mapping, Plain-Tab-Fallback ohne Host; zwei bestehende Shim-Tests auf die neue Fallback-Meldung aktualisiert
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [ ] 6. Befehle + Keybindings
  - [ ] 6.1 `core-commands-app.ts` — `workspace:split-right`/`split-down`/`close-tab-group`/`close-others-tab-group` auf echte Pane-Ops; Fokus-Wechsel-Befehle
  - [ ] 6.2 `core-command-i18n.ts` — DE/EN-Labels
  - [ ] 6.3 `keybindingsStore.ts` — Defaults für Split + Pane-Fokus (Browser-Reservierungen meiden)
  - _Requirements: 2.1, 2.4, 3.3_

- [x] 7. Dokumentation & Steering
  - [x] 7.1 Welcome-Vault DE: `Features/Geteilte Ansichten.md` (Standard-Guide-Struktur)
  - [x] 7.2 Welcome-Vault EN: `Features/Split Panes.md`
  - [x] 7.3 In `Features/Übersicht.md` (DE) + `Features/Overview.md` (EN) verlinkt; `_meta.md` (DE+EN) 1.7.0 → 1.8.0
  - [x] 7.4 `structure.md` (Pane-Baum-Architektur: paneTreeState/-Context/-TabContext, panes/, pane-split-bridge, workspace-shim/analyzer/useWorkspaceRestore/workspaceStore-Notizen), `product.md` (Feature-Zeile), `implementation-plan.md` (Prio 5 auf „Spec vorhanden, Phasen 0–5 umgesetzt")
  - _Requirements: 8.1, 8.2, 8.3_

## Verifikation vor Abschluss

- Frontend `npm run build` + `npm run test:coverage` grün, `npx eslint . --quiet` 0 Errors
- Bestehende `tabState.test.ts`/`workspaceStore`/`App.test.tsx` bleiben grün (Tab-Logik unverändert)
- Manuell: aktiven Pane horizontal + vertikal teilen → L-Layout; Grenze ziehen; Tab in anderen Pane ziehen; Tab auf Kante → neuer Split; letzten Tab schließen → Pane kollabiert; Reload → Layout wiederhergestellt; Vault wechseln → eigenes Layout; ein Split-erzeugendes Plugin erhält einen echten Pane
