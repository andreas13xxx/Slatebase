# Design Document: Split Panes

## Overview

Split Panes ersetzen Slatebases flache „eine Tab-Reihe"-Annahme durch einen verschachtelbaren **Pane-Baum**. Jeder Pane ist eine eigene Tab-Reihe (das heutige `TabState`), mehrere Panes liegen über Splits nebeneinander/übereinander. Genau ein Pane ist aktiv; der globale „aktiver Tab"-Zustand, von dem Breadcrumb, Context-Panel, Status-Bar und Navigationsverlauf abhängen, wird aus dem aktiven Tab des aktiven Panes abgeleitet.

Architektur-Leitplanken:

- **Pane = heutiger `TabState`, nicht neu erfunden.** Ein Pane kapselt das vorhandene `TabEntry[]` + `activeTabId`. Der bestehende `tabReducer` wird pro Pane wiederverwendet, nicht ersetzt — er bekommt nur einen Pane-Kontext darüber. Das hält die enorme bestehende Tab-Logik (Pinning, Close-others, Undo-close, Pfad-Updates bei Rename) unverändert und testbar.
- **Pane-Baum ist reines Layout, kein Dokument.** Wie die Panel-State-Schicht (`panelState.ts`) ist der Baum eine Layout-Struktur, kein aus Dateiinhalt abgeleiteter Zustand. Er wird über denselben debounced-localStorage-Pfad persistiert wie der heutige Tab-/Panel-State.
- **Ein Active_Pane, eine Wahrheit.** Der globale aktive Tab wird NICHT mehr direkt aus einem globalen `activeTabId` gelesen, sondern aus `tree.panes[tree.activePaneId].activeTabId`. Alle heutigen Ableitungen (Breadcrumb, Context-Panel, Status-Bar, Navigationsverlauf) hängen sich an diesen einen abgeleiteten Wert, nicht an je einen eigenen Pfad.
- **Lenient-Migration, kein Hard-Fail.** Alter flacher `tabs`-State wird beim Laden in ein Einzel-Pane-Layout gehoben; ungültiger Baum fällt defensiv auf ein Einzel-Pane zurück (gleiche Haltung wie `PersistedTab.pinned` heute).
- **Plugin-Splits werden echt.** `createLeafBySplit`/`splitActiveLeaf`/`getLeaf('split')` in der Workspace-Shim erzeugen echte Panes im Baum statt Tabs — das hebt betroffene Plugins von „partial" auf „full".

**Phase 0 (Design-Spike) ist verbindlich** und läuft VOR dem Festzurren der Zustandsform. Sie prüft die vier bekannten Regressionsflächen gegen einen Wegwerf-Prototyp, bevor produktiver Code entsteht.

## Architecture

Backend ist **nicht betroffen** — Split Panes sind ein reines Frontend-Layout-Feature. Es gibt keine neue Route, kein neues Backend-Modul. Nur das Welcome-Vault (Assets) und Steering ändern sich dokumentarisch.

### Frontend — neue Dateien

| Pfad | Verantwortung |
|------|---------------|
| `frontend/src/state/paneTreeState.ts` | `PaneTree`-Datenmodell + Reducer: `PaneNode` (Blatt mit eigenem `TabState`) / `SplitNode` (Richtung, Kinder, Größen), `activePaneId`. Aktionen: `SPLIT_PANE`, `CLOSE_PANE`, `FOCUS_PANE`, `MOVE_TAB_TO_PANE`, `RESIZE_SPLIT`, `COLLAPSE_EMPTY_PANE`. Delegiert Tab-Aktionen an den vorhandenen `tabReducer` für den jeweiligen Pane. |
| `frontend/src/state/paneTreeState.test.ts` | Reducer-Unit-Tests: splitten, kollabieren beim letzten Tab, Fokuswechsel, Tab verschieben, zweistufige Verschachtelung, Größen-Normalisierung. |
| `frontend/src/state/paneTreeContext.ts` | `PaneTreeProvider` + `usePaneTree`-Hook; stellt den Baum und einen „aktiver Pane / aktiver Tab"-abgeleiteten Wert bereit (ersetzt das direkte `useTabContext().activeTabId` an den Ableitungsstellen). |
| `frontend/src/components/panes/PaneTreeView.tsx` | Rekursives Rendering des Baums: `SplitNode` → zwei/mehr Kinder mit Resize-Griffen; `PaneNode` → eine `PaneContainer`. |
| `frontend/src/components/panes/PaneContainer.tsx` | Ein Pane: eigene `TabBar` + `TabContent`, Fokus-Handling, Active-Pane-Markierung, Tab-Drop-Zonen an den Kanten. |
| `frontend/src/components/panes/PaneSplitHandle.tsx` | Resize-Griff zwischen zwei Geschwistern (`useResize`, `role="separator"`, Pfeiltasten, aria-value*). |
| `frontend/src/components/panes/panes.css` | Layout-/Resize-/Active-Markierungs-Styles (Design Tokens; Verhältnis-basierte Größen, kein `overflow:hidden` über absolut positionierten Kindern). |
| `frontend/src/components/panes/*.test.tsx` | View-Tests: Split-Rendering, Fokuswechsel per Klick, Tab-Drag zwischen Panes, Resize-Tastatur, Kanten-Drop erzeugt Split. |

### Frontend — geänderte Dateien

| Pfad | Änderung |
|------|----------|
| `frontend/src/state/tabState.ts` | `tabReducer`/`TabState` bleiben, werden aber **pro Pane** instanziiert. Keine Verhaltensänderung an den Tab-Aktionen selbst; nur die Einbettung ändert sich. Ggf. `generateTabId` unverändert (Tab-IDs bleiben `vaultId::filePath`, jetzt pane-lokal eindeutig genug). |
| `frontend/src/state/tabContext.ts` | `TabProvider` wird vom einzelnen globalen Provider zum **Pane-gebundenen** Provider: `PaneContainer` stellt den Tab-Kontext seines Panes bereit. Komponenten innerhalb eines Panes (`TabBar`, `TabContent`, `EditMode`) lesen weiter `useTabContext()` — bekommen aber den Kontext IHRES Panes. |
| `frontend/src/App.tsx` | Statt einer einzelnen `<TabBar>`+`<TabContent>`-Reihe rendert der Editor-Bereich `<PaneTreeView>`. Die Ableitung von Breadcrumb/Context-Panel/Status-Bar/Auto-Reveal hängt sich an `usePaneTree()`s aktiven Tab statt an einen globalen `activeTabId`. (Beachtet die bekannte Falle: `usePluginContext()` ist nur innerhalb des `<PluginProvider>`-Blocks erreichbar — der Active-Tab-Ableitungscode bleibt dort, wo er heute liegt.) |
| `frontend/src/components/TabBar.tsx` | Pane-lokal statt global; Tab-Drag erweitert um „in anderen Pane / auf Pane-Kante ziehen" (neue Drop-Ziele, interne-Drag-Erkennung über `dataTransfer.types` ohne `'Files'` beibehalten). |
| `frontend/src/components/TabContent.tsx` | Unverändert in der Inhaltslogik; rendert jetzt den aktiven Tab SEINES Panes. |
| `frontend/src/state/workspaceStore.ts` | Persistiert statt eines flachen `tabs`-Arrays den serialisierten Pane-Baum (`PersistedPaneTree`). Lenient-Validierung + Migration des alten flachen Schemas → Einzel-Pane. `storage`-Event-Cross-Tab-Sync beibehalten. Per-Vault-Erinnerung erweitert sich vom Tab-Set auf das Pane-Layout. |
| `frontend/src/hooks/useWorkspaceRestore.ts` | Stellt den Pane-Baum vor dem ersten Render wieder her (gleiche „vor erstem Render"-Regel), lädt den Inhalt jedes Tabs jedes Panes über den vorhandenen Lesepfad; `cancelled`-Guard pro Fetch beibehalten. |
| `frontend/src/plugins/compat/shims/workspace-shim.ts` | `createLeafBySplit`/`splitActiveLeaf`/`getLeaf('split'\|'tab')` erzeugen echte Panes im Baum; `iterateAllLeaves`/`getLeavesOfType`/`getMostRecentLeaf`/`activeLeaf` iterieren über alle Panes. Ein `WorkspaceLeaf` bindet sich an einen Pane. |
| `frontend/src/plugins/compat/view-registry.ts` | `WorkspaceLeaf.getRoot()`/Location-Logik berücksichtigt den Pane-Baum; Plugin-**Sidebar**-Views bleiben getrennt von Editor-Panes (Phase-0-Regressionsfläche). |
| `frontend/src/plugins/compat/core-commands-app.ts` | `workspace:split-right`/`split-down`/`close-tab-group`/`close-others-tab-group` von No-Op/Tab-Fallback auf echte Pane-Operationen umstellen; neue Fokus-Wechsel-Befehle registrieren. |
| `frontend/src/plugins/compat/core-command-i18n.ts` | DE/EN-Labels für Split-/Fokus-/Tab-Gruppen-Befehle. |
| `frontend/src/state/keybindingsStore.ts` | Default-Keybindings für Split + Pane-Fokus-Wechsel (gegen Browser-reservierte Kombinationen prüfen, wie `Ctrl+Tab` heute). |
| `frontend/src/plugins/compat/compatibility-analyzer.ts` | Split-abhängige Methoden von „partial" auf „supported" setzen. |

## Datenmodell

```ts
// paneTreeState.ts (Skizze, in Phase 0 gegen die Regressionsflächen verifiziert)

/** Ein Blatt: eine eigenständige Tab-Reihe (wiederverwendeter TabState). */
interface PaneNode {
  kind: 'pane'
  id: string                 // stabile Pane-ID
  tabState: TabState         // exakt der heutige TabState (tabs, activeTabId, closedTabsHistory)
}

/** Ein innerer Knoten: ein Split mit Richtung und gewichteten Kindern. */
interface SplitNode {
  kind: 'split'
  id: string
  direction: 'horizontal' | 'vertical'  // horizontal = nebeneinander
  children: PaneTreeNode[]               // ≥ 2
  sizes: number[]                        // Verhältnisse, Summe = 1 (nicht Pixel → resize-stabil)
}

type PaneTreeNode = PaneNode | SplitNode

interface PaneTree {
  root: PaneTreeNode     // Start: ein einzelner PaneNode
  activePaneId: string   // genau ein aktiver Pane
}
```

Der globale aktive Tab wird abgeleitet: `activeTab = findPane(tree, tree.activePaneId).tabState` → dessen `activeTabId`. Es gibt kein zweites, konkurrierendes „aktiver Tab global"-Feld mehr.

## Zustands-/Ableitungs-Fluss

1. Jede Tab-Aktion (öffnen, schließen, pin, speichern) läuft weiter durch den vorhandenen `tabReducer` — adressiert jetzt den `tabState` eines bestimmten Panes (Default: Active_Pane).
2. Layout-Aktionen (`SPLIT_PANE`, `MOVE_TAB_TO_PANE`, `RESIZE_SPLIT`, `CLOSE_PANE`) laufen durch den neuen `paneTreeReducer`, der bei Bedarf den `tabReducer` für betroffene Panes aufruft.
3. `usePaneTree()` exponiert den abgeleiteten aktiven Tab; Breadcrumb/Context-Panel/Status-Bar/Navigationsverlauf konsumieren diesen einen Wert.
4. Ein Pane-Wechsel ist nur eine Änderung von `activePaneId` → der abgeleitete aktive Tab ändert sich → die Ableitungen schalten um, ohne Datei-Neuladen.

## Split-/Resize-/Drag-Fluss

- **Split:** `SPLIT_PANE(activePaneId, direction)` → ersetzt den Active_Pane durch einen `SplitNode` mit zwei Panes (alt + neu), `sizes: [0.5, 0.5]`, Fokus auf den neuen Pane.
- **Resize:** `PaneSplitHandle` ändert `sizes` des umgebenden `SplitNode` über `useResize` (Verhältnisse, Mindestgröße erzwungen, Pfeiltasten-bedienbar).
- **Tab-Drag in anderen Pane:** Drop auf fremde Tab-Reihe → `MOVE_TAB_TO_PANE(tabId, fromPane, toPane)`; Quell-Pane leert sich ggf. → `COLLAPSE_EMPTY_PANE`.
- **Tab-Drag auf Pane-Kante:** Kanten-Drop-Zone erkannt → `SPLIT_PANE` + `MOVE_TAB_TO_PANE` in den neuen Pane.
- **Kollaps:** Letzter Tab eines Panes zu → Pane entfernt, `SplitNode` kollabiert (Geschwister rückt hoch); letzter Pane bleibt leer.

## Persistenz & Migration

- `workspaceStore` serialisiert `PersistedPaneTree` (Struktur + Größen + pro Pane die geöffneten Dateipfade/aktiver Pfad + Pin-Flags + `activePaneId`), nicht den geladenen Inhalt.
- **Migration:** Ein persistierter alter flacher `tabs`-Blob → ein einzelner `PaneNode` mit diesen Tabs. Ein unlesbarer/ungültiger Baum → frisches Einzel-Pane (lenient, nie Invalidierung des ganzen Blobs).
- `useWorkspaceRestore` baut den Baum vor dem ersten Render auf und lädt jeden Tab-Inhalt nach, mit `cancelled`-Guard pro Fetch (Vault-Wechsel-Race).
- Cross-Tab-`storage`-Event-Übernahme nur ohne eigenen pendenten Debounce-Write (bestehende Regel).

## Plugin-Kompatibilität

- `createLeafBySplit(direction)` / `splitActiveLeaf(direction)` → `SPLIT_PANE`, Rückgabe eines `WorkspaceLeaf`, das an den neuen Pane gebunden ist.
- `getLeaf('split')` → neuer Pane; `getLeaf('tab')` → Tab im Active_Pane; `getLeaf(false)` → Reuse des Active_Pane (Obsidian-Semantik, in Phase 0 gegen echte Plugins verifiziert).
- `iterateAllLeaves`/`getLeavesOfType`/`getMostRecentLeaf` laufen über alle Panes; `activeLeaf` = Leaf des Active_Pane.
- Plugin-**Sidebar**-Views bleiben in ihrer eigenen Layout-Schicht (nicht im Editor-Pane-Baum) — ausdrückliche Regressionsfläche.

## Security & Konsistenz

- Reines Frontend-Layout; keine neuen Datenpfade, keine neue Route, kein Dateizugriff → keine neue Angriffsfläche.
- Resize-Griffe WCAG-konform (`role="separator"`, aria-value*, Pfeiltasten) wie die vorhandenen Panel-Resizer.
- Persistenz lenient und migrierbar → ein kaputter Layout-Blob sperrt den Nutzer nie aus.

## Testing-Strategie

- `paneTreeReducer`: splitten, kollabieren (letzter Tab, letzter Pane), Fokus, Tab verschieben, zweistufige Verschachtelung, Größen-Normalisierung bei Fensteränderung.
- Migration: alter flacher `tabs`-Blob → Einzel-Pane; ungültiger Baum → Fallback.
- View: Split-Rendering, Klick-Fokus, Tab-Drag zwischen Panes und auf Kanten, Resize per Tastatur.
- Plugin-Shim: `createLeafBySplit` erzeugt echten Pane; `iterateAllLeaves` deckt alle Panes ab (Wiring-Test wie `tab-view-bridge-wiring.test.ts`).
- Regression: bestehende `tabState.test.ts`-/`workspaceStore`-/`App.test.tsx`-Suiten bleiben grün (die Tab-Logik selbst ist unverändert).

## Phase-0-Befunde (Design-Spike, abgeschlossen)

Geprüft gegen den echten Code (`App.tsx`, `state/tabContext.ts`, `state/workspaceStore.ts`, `state/tabState.ts`, `plugins/compat/shims/workspace-shim.ts`). Die fünf offenen Fragen sind damit entschieden:

1. **Zustandsform — ENTSCHIEDEN: Pane-gebundener `TabProvider`.** Jeder `PaneContainer` stellt den `TabProvider` seines Panes bereit; `TabBar`/`TabContent`/`EditMode` lesen weiter `useTabContext()` und bekommen den Kontext IHRES Panes — keine dieser Komponenten muss geändert werden. Der neue `paneTreeReducer` verwaltet nur die Baumstruktur + `activePaneId` und delegiert jede Tab-Aktion an den unveränderten `tabReducer` des Zielpanes. Grund gegen den globalen Selektor-Reducer: er zwänge jede der vielen `useTabContext()`-Aufrufstellen auf einen neuen Selektor-Pfad um und würde bei jeder Tab-Aktion den ganzen Baum re-rendern.
2. **Modifikator „in Split öffnen" — ENTSCHIEDEN: Ctrl/Cmd+Alt+Klick** (Obsidian-Konvention), konfigurierbar über `keybindingsStore`. `Ctrl/Cmd+Klick` ist bereits „in neuem Tab öffnen"; `Ctrl/Cmd+Alt` ist in Slatebase heute frei und kollidiert nicht mit einer Browser-Reservierung. Erst in Phase 3 relevant, hier nur festgelegt.
3. **Aktiver-Tab-Ableitung — BESTÄTIGT: heute EIN Pfad.** `App.tsx` liest den aktiven Tab ausschließlich über `useTabContext().tabState.activeTabId`; `useWorkspaceRestore` und der Vault-Wechsel-Cache (`vaultTabsCacheRef`) hängen am selben `tabState`. Es gibt KEINE verstreuten Zweitpfade. Der Umbau ersetzt diese eine Quelle durch `usePaneTree()` → `activePane.tabState.activeTabId`; Breadcrumb/Context-Panel/Status-Bar/Nav-Verlauf/Auto-Reveal folgen automatisch, weil sie alle an diesem einen abgeleiteten Wert hängen. Risiko damit lokalisiert und beherrschbar.
4. **Canvas/Graph/Plugin-File-View im Pane — BEFUND: funktioniert, mit Vorsicht in Phase 2.** Diese Views rendern heute in `TabContent` und sind nicht fenster- sondern container-relativ dimensioniert. Im Pane müssen sie denselben Container-Query-/`ResizeObserver`-Kontext bekommen; die `panes.css` setzt deshalb `min-width:0`/`min-height:0` auf jeden Pane-Container und vermeidet `overflow:hidden` über absolut positionierten Kindern (bekannte Settings-UI-Falle, siehe `lessons-learned.md`). Keine Blockade, aber ein Prüfpunkt beim Phase-2-View-Rendering.
5. **Responsives Zusammenfalten — ENTSCHIEDEN: Verhältnis-Größen + reiner Baum, kein Pixel.** `SplitNode.sizes` sind Verhältnisse (Summe 1), nie Pixel; ein späterer schmaler Viewport kann so per CSS/Selektor genau einen Pane sichtbar machen und den Rest ausblenden, ohne den Baum umzubauen. Die Persistenz (`version`-Feld in `workspaceStore`, heute `1`) bekommt in Phase 4 `version: 2` mit Migration des flachen `tabs`-Arrays → Einzel-`PaneNode`.

**Fazit:** Kein Blocker gefunden. Der risikoärmste Weg ist bestätigt — den vorhandenen `tabReducer` pro Pane wiederverwenden statt neu schreiben, und die eine aktive-Tab-Quelle umbiegen statt verteilte Pfade zu jagen. Phase 1 (Datenmodell + Reducer) kann beginnen.
