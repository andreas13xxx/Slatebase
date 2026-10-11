# Requirements Document

## Introduction

Split Panes bringen Obsidians grundlegendste Layout-Fähigkeit (Desktop 1.0) nach Slatebase: zwei oder mehr Editoren/Views **nebeneinander** statt nur eine einzige Tab-Reihe. Heute hat Slatebase genau eine Tab-Gruppe — jeder „in Split öffnen"-Befehl degradiert zu einem gewöhnlichen Tab (`frontend/src/plugins/compat/core-commands-app.ts` markiert `workspace:split-*` ausdrücklich als nicht unterstützt). Das ist das letzte wirklich spürbare Loch gegenüber Desktop-Obsidian aus der Prä-1.5-Ära: Quelle neben Übersetzung, Notiz neben Recherche, Canvas neben Markdown.

Dies ist der **größte einzelne Architektur-Eingriff am Layout-System** (Roadmap Prio 5 / Track G, `.kiro/specs/implementation-plan.md`, Scope ~60–90h). Der Umbau ersetzt die flache „eine Tab-Reihe"-Annahme durch einen verschachtelbaren **Pane-Baum**. Betroffen sind der Tab-State (`tabState.ts`), die Workspace-Persistenz (`workspaceStore.ts`), das App-Layout (`App.tsx`/`TabBar.tsx`/`TabContent.tsx`) und die Plugin-Workspace-Shim-Schicht (`plugins/compat/shims/workspace-shim.ts`, `view-registry.ts`). Wegen dieses Risikos ist eine **Phase 0 (Design-Spike)** verbindlich, bevor Code außerhalb der neuen Pane-Baum-Datenstruktur entsteht.

Benannte, gespeicherte Workspace-Layouts + ein Workspace-Switcher sind Teil von Track G, aber **bewusst Out of Scope dieser ersten Version** — sie setzen den Pane-Baum voraus und werden als eigene Ausbaustufe geführt. Diese Spec liefert den Pane-Baum, Splits, Tab-Drag-zwischen-Panes und die Persistenz; nicht die benannten Layouts.

Mobile/Responsive (Prio 5 empfiehlt Responsive als Vorarbeit) ist nicht Voraussetzung, aber die Pane-Baum-Datenstruktur und das CSS müssen so entworfen sein, dass ein späteres responsives Zusammenfalten (schmaler Viewport → ein Pane sichtbar) ohne Umbau möglich ist.

## Glossary

- **Pane** (Obsidian: „Leaf"/„Tab Group"): Ein rechteckiger Layout-Bereich, der genau eine Tab-Reihe mit einem aktiven Inhalt (Editor, Reading View, Canvas, Graph, Plugin-View) zeigt. Das heutige Slatebase hat genau einen Pane.
- **Pane_Tree**: Der verschachtelbare Baum, der das Editor-Layout beschreibt. Blätter sind Panes; innere Knoten sind Splits.
- **Split**: Ein innerer Knoten des Pane_Tree mit einer Richtung (horizontal = nebeneinander / vertikal = übereinander) und zwei oder mehr Kindern (Panes oder weitere Splits), jeweils mit einer Größe.
- **Active_Pane**: Der Pane, der den Fokus hat — Ziel für „öffne hier", Tastatur-Navigation und den globalen „aktiver Tab"-Zustand, von dem Breadcrumb, Context-Panel und Status-Bar abgeleitet werden.
- **Tab**: Ein geöffneter Inhalt innerhalb eines Panes (unverändertes Konzept, nur jetzt pane-gebunden statt global).
- **Workspace_Layout**: Die serialisierbare Momentaufnahme des gesamten Pane_Tree inklusive der Tabs und des aktiven Zustands jedes Panes — das, was persistiert und beim Neuladen wiederhergestellt wird.
- **Leaf (Plugin-Begriff)**: Obsidians `WorkspaceLeaf` aus der Plugin-Compat-Schicht. Ein Pane entspricht einem Leaf; `createLeafBySplit`/`splitActiveLeaf` müssen künftig echte Splits erzeugen.

## Requirements

### Requirement 1: Pane-Baum als Layout-Datenstruktur

**User Story:** Als Nutzer möchte ich mein Editor-Layout aus mehreren nebeneinander- und übereinanderliegenden Bereichen aufbauen können, damit ich mehrere Notizen gleichzeitig sehe.

#### Acceptance Criteria

1. THE Layout_State SHALL das Editor-Layout als Pane_Tree modellieren: Blätter sind Panes (je eine Tab-Reihe), innere Knoten sind Splits mit Richtung (`horizontal`/`vertical`), Kinderliste und Kindgrößen.
2. THE Layout_State SHALL mindestens zweistufige Verschachtelung unterstützen (ein Split, dessen Kind selbst ein Split ist), damit L-förmige Layouts (ein breiter Pane links, zwei gestapelte rechts) möglich sind.
3. THE Layout_State SHALL mit genau einem Pane und keinem Split starten — das Verhalten eines frischen Vaults ist identisch zum heutigen Einzel-Tab-Reihen-Layout.
4. THE Layout_State SHALL genau einen Active_Pane führen; der globale „aktiver Tab"-Zustand (von dem Breadcrumb, Context-Panel, Status-Bar, Navigationsverlauf abgeleitet werden) SHALL der aktive Tab des Active_Pane sein.
5. WHEN der letzte Tab eines Panes geschlossen wird, THE Layout_State SHALL diesen Pane entfernen und seinen Split kollabieren (das Geschwister rückt an die Stelle des Splits), es sei denn, es ist der letzte verbleibende Pane — dann bleibt er leer bestehen (wie heute ein leerer Workspace).

### Requirement 2: Splits erzeugen und schließen

**User Story:** Als Nutzer möchte ich den aktiven Bereich teilen und einen Bereich wieder schließen, damit ich mein Layout flexibel steuere.

#### Acceptance Criteria

1. THE Command_Palette SHALL Befehle „Horizontal teilen" und „Vertikal teilen" anbieten (die vorhandenen `workspace:split-right`/`workspace:split-down`-IDs, die heute No-Op/Tab-Fallback sind), die den Active_Pane teilen und den neuen Pane mit dem aktuellen Inhalt (oder leer) öffnen.
2. WHEN ein Split-Befehl ausgeführt wird, THE Layout_State SHALL einen neuen Pane als Geschwister des Active_Pane in der gewählten Richtung einfügen, den Fokus auf den neuen Pane setzen und den verfügbaren Platz anfänglich gleichmäßig aufteilen.
3. THE Pane_UI SHALL pro Pane einen Weg bieten, den Pane zu schließen (alle seine Tabs schließen → Pane entfernen, Split kollabiert gemäß Requirement 1.5).
4. THE Command_Palette SHALL einen Befehl „Diese Tab-Gruppe schließen" / „Andere Tab-Gruppen schließen" anbieten, der den Active_Pane bzw. alle anderen Panes schließt.
5. WHEN ein Link, eine Datei aus dem Explorer, ein Suchtreffer oder ein Quick-Switcher-Ergebnis mit dem Split-Modifikator geöffnet wird, THE Open_Logic SHALL den Inhalt in einem neuen Split neben dem Active_Pane öffnen (Obsidian-Modifikator; der konkrete Modifikator wird in Phase 0 festgelegt).

### Requirement 3: Pane-Fokus und Navigation

**User Story:** Als Nutzer möchte ich zwischen Bereichen wechseln und erkennen, welcher aktiv ist, damit meine Aktionen im richtigen Bereich landen.

#### Acceptance Criteria

1. WHEN ein Pane oder einer seiner Tabs/Inhalte angeklickt oder fokussiert wird, THE Layout_State SHALL diesen Pane zum Active_Pane machen.
2. THE Pane_UI SHALL den Active_Pane visuell kennzeichnen (dezent, Design-Token-basiert), damit erkennbar ist, wohin „öffne hier" und Tastatureingaben gehen.
3. THE Keyboard_Layer SHALL Befehle zum Fokuswechsel in die vier Richtungen (Pane links/rechts/oben/unten) bereitstellen, konfigurierbar über den vorhandenen Keybindings-Store.
4. THE Context_Panel, THE Status_Bar und THE Breadcrumb SHALL immer den Inhalt des Active_Pane widerspiegeln und beim Pane-Wechsel umschalten, ohne dass der Nutzer die Datei neu öffnet.

### Requirement 4: Resize zwischen Panes

**User Story:** Als Nutzer möchte ich die Grenze zwischen zwei Bereichen ziehen, damit ich die Platzaufteilung bestimme.

#### Acceptance Criteria

1. THE Split_UI SHALL zwischen zwei Geschwister-Panes/Splits einen Resize-Griff rendern, der die relative Größe der beiden Seiten per Maus/Touch anpasst (bestehender `useResize`-Hook als Grundlage).
2. THE Split_UI SHALL eine sinnvolle Mindestgröße pro Pane erzwingen, sodass ein Pane nicht auf null gezogen werden kann.
3. THE Resize_Handle SHALL tastaturbedienbar sein: `role="separator"`, `tabIndex={0}`, `aria-valuenow/min/max`, `aria-orientation` und Pfeiltasten-Anpassung (WCAG, gleiche Regel wie die vorhandenen Panel-Resizer).
4. WHEN das Browserfenster seine Größe ändert, THE Split_UI SHALL die relativen Pane-Größen beibehalten (Verhältnisse, keine festen Pixel), damit das Layout nicht springt.

### Requirement 5: Tabs zwischen Panes verschieben

**User Story:** Als Nutzer möchte ich einen Tab per Drag & Drop in einen anderen Bereich ziehen, damit ich meine geöffneten Notizen frei anordne.

#### Acceptance Criteria

1. THE Tab_Bar SHALL erlauben, einen Tab per Drag auf eine andere Pane-Tab-Reihe zu ziehen; der Tab wechselt dann in diesen Pane (verlässt den Quell-Pane).
2. THE Tab_Bar SHALL erlauben, einen Tab auf eine Pane-Kante (links/rechts/oben/unten) zu ziehen, um dort einen neuen Split mit diesem Tab zu erzeugen (Drop-Zonen-Erkennung an den Pane-Rändern).
3. WHEN ein Drag den letzten Tab aus einem Pane entfernt, THE Layout_State SHALL den geleerten Pane gemäß Requirement 1.5 entfernen.
4. THE Tab_Bar SHALL internes Tab-Dragging von externem Datei-Drop unterscheiden (bestehende `dataTransfer.types`-Regel: interne Drags tragen keine `'Files'`), damit die DropZone-Overlays nicht fälschlich aufleuchten.

### Requirement 6: Persistenz und Wiederherstellung des Layouts

**User Story:** Als Nutzer möchte ich mein Split-Layout nach einem Reload und beim Vault-Wechsel wiederfinden, damit meine Arbeitsumgebung erhalten bleibt.

#### Acceptance Criteria

1. THE Workspace_Store SHALL den gesamten Pane_Tree (Struktur, Größen, Tabs pro Pane, aktiver Tab pro Pane, Active_Pane) serialisieren und über denselben debounced-localStorage-Mechanismus persistieren wie der heutige Tab-/Panel-State.
2. WHEN die App neu lädt, THE Workspace_Restore SHALL den Pane_Tree vor dem ersten React-Render wiederherstellen (gleiche „vor dem ersten Render"-Regel wie `initializeWorkspace()` heute), inklusive erneutem Laden des Inhalts jedes Tabs über den vorhandenen Lesepfad.
3. THE Workspace_Store SHALL das Layout pro Vault führen (Vault-Wechsel stellt das Layout des Zielvaults wieder her), konsistent mit der heutigen Per-Vault-Tab-Erinnerung.
4. WHEN persistierter Layout-State ungültig oder aus einem älteren (flachen) Schema ist, THE Workspace_Restore SHALL defensiv auf ein Einzel-Pane-Layout zurückfallen, statt den Baum zu invalidieren (lenient, wie `PersistedTab.pinned` heute).
5. THE Cross_Tab_Sync SHALL das vorhandene `storage`-Event-Muster beibehalten (ein anderer Browser-Tab darf das Layout übernehmen, außer dieser Tab hat einen eigenen pendenten Debounce-Write).

### Requirement 7: Plugin-Workspace-Kompatibilität

**User Story:** Als Nutzer möchte ich, dass Obsidian-Plugins, die Splits erzeugen, echte Splits bekommen, damit ihre Multi-Pane-Features funktionieren.

#### Acceptance Criteria

1. THE Workspace_Shim SHALL `createLeafBySplit()` / `splitActiveLeaf()` so implementieren, dass sie einen echten neuen Pane im Pane_Tree erzeugen (nicht länger einen Tab), sodass betroffene Plugins von „partial" auf „full" gehoben werden.
2. THE Workspace_Shim SHALL `getLeaf('split')` und `getLeaf('tab')` unterscheiden: `'split'` erzeugt einen neuen Pane, `'tab'` einen Tab im Active_Pane; der Rückgabewert bleibt ein funktionsfähiger `WorkspaceLeaf`.
3. THE Workspace_Shim SHALL `iterateAllLeaves`/`getLeavesOfType`/`getMostRecentLeaf`/`activeLeaf` über alle Panes des Pane_Tree korrekt bedienen (nicht nur über den einen heutigen Pane).
4. THE Compatibility_Analyzer SHALL die zuvor als „partial" wegen fehlender Splits markierten Methoden auf „supported" setzen, sobald echte Splits existieren.
5. THE View_Registry SHALL Plugin-Views (Sidebar-/Tab-Views) weiterhin korrekt mounten; Plugin-Sidebar-Views sind von den Editor-Panes getrennt und bleiben unverändert (dies ist eine der in Phase 0 zu prüfenden Regressionsflächen).

### Requirement 8: Dokumentation

**User Story:** Als neuer Nutzer möchte ich im Tutorial-Vault erfahren, wie Split Panes funktionieren.

#### Acceptance Criteria

1. THE Welcome_Vault (DE und EN) SHALL eine Feature-Anleitung „Geteilte Ansichten" (DE) / „Split Panes" (EN) in der etablierten Guide-Struktur enthalten (Kurzbeschreibung, Schritt-für-Schritt, Beispiel, Tipps, Übung, verwandte Features).
2. THE Welcome_Vault Features-Übersicht (`Features/Übersicht.md` DE, `Features/Overview.md` EN) SHALL die neue Anleitung verlinken, und `_meta.md` (DE+EN) SHALL Version + `updated`-Datum anheben.
3. THE Steering_Docs (`structure.md`, `product.md`) SHALL die Pane-Baum-Architektur und das neue Feature beschreiben; `implementation-plan.md` SHALL Prio 5 von „Keine Spec" auf „Spec vorhanden" umstellen.

## Out of Scope (erste Version)

- **Benannte, gespeicherte Workspace-Layouts + Workspace-Switcher** — eigene Ausbaustufe, setzt den Pane-Baum dieser Spec voraus.
- **Pop-out-Fenster / native OS-Fensterverwaltung** — durch die Browser-App-Architektur ausgeschlossen (siehe `implementation-plan.md`); Splits decken den Multi-View-Bedarf innerhalb eines Browser-Fensters ab.
- **Linked Panes / „Stacked Tabs"** (verlinkter Scroll/Modus zwischen zwei Panes) — nachgelagerte Ausbaustufe.
- **Responsives Zusammenfalten auf schmalen Viewports** — die Datenstruktur und das CSS müssen es ermöglichen, aber das aktive Mobile-Verhalten gehört zu Prio 5 „Responsive/Mobile".
- **Sidebar-Panels in den Editor-Pane-Baum einhängen** — die beiden Side-Panels bleiben ihre eigene, getrennte Layout-Schicht.

## Risiko & verbindliche Vorarbeit

Dies ist die größte einzelne Architekturänderung im Backlog. Vor dem Design-Dokument-Abschluss ist ein **Design-Spike (Phase 0)** gegen die bekannten Regressionsflächen Pflicht:

- Tab-State-/Workspace-Persistenz (flaches → Baum-Schema, Migration/Lenient-Fallback)
- Plugin-Sidebar-Views (dürfen nicht in den Editor-Pane-Baum geraten)
- Canvas-/Graph-Fullscreen und Plugin-File-Views (TextFileView) in einem Pane
- Der globale „aktiver Tab"-Ableitungspfad (Breadcrumb, Context-Panel, Status-Bar, Navigationsverlauf), der heute von genau einem Tab ausgeht
