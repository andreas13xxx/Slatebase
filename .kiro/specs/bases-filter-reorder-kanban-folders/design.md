# Design Document: Bases Filter-Umsortierung und Kanban-Ordner

## Overview

Drei unabhängige Erweiterungen der Bases-UI. Die Filter-Logik ist funktional aufgebaut (`RootUpdate = (root) => root`), daher werden Umsortieren und Verschieben als reine Funktionen auf dem Filterbaum umgesetzt und getrennt getestet.

## Design-Entscheidungen

1. **Reine Baum-Funktionen** in einer neuen Datei `components/bases/base-filter-tree.ts`:
   - `moveNode(root, fromPath, toIndex)` — innerhalb einer Gruppe
   - `extractNode(root, path)` / `appendNode(root, node)` — für Ebenenwechsel
   `path` ist eine Indexliste vom Wurzelknoten aus. Der Filter_Editor reicht sie über `RootUpdate` an `onChange` weiter.
2. **Drag-and-drop mit Zeiger-Ereignissen statt nativem HTML5-Drag** für den Griff, damit kein Konflikt mit der Touch-Long-Press-Logik entsteht (`useLongPress` unterdrückt natives Drag nur auf `draggable`-Elementen). Zusätzlich Menüeinträge „Nach oben/unten“ als zugängliche Alternative.
3. **Ebenenwechsel** nutzt die vorhandenen Setter `setDocFilter` und `setViewFilter` (`BasesView.tsx` / `base-edit.ts`) in einer einzigen `onChange`-Transaktion, damit nur eine Schreiboperation entsteht und Undo/Realtime konsistent bleiben.
4. **Kanban nach `file.folder`:** `BasesKanbanView` bekommt keine neue Logik; der Aufrufer (der `onMoveCard` liefert) unterscheidet `groupByProperty === 'file.folder'` und ruft statt des Eigenschaften-Schreibens die Vault-Verschiebung (gleicher Pfad wie das Verschieben im Datei-Explorer, inkl. Link-Aktualisierung). Neue Notiz in Spalte: `base-add-item.ts` erhält den Zielordner. Wo genau `onMoveCard` implementiert ist, wird in Task 3.1 per grep bestätigt.
5. **Limit-Hinweis:** Gesamtanzahl vor und nach Anwendung von `limit` in der Ergebnisberechnung mitführen (kleiner Rückgabewert, kein zweiter Durchlauf).

## Risiken

- Verschieben nach `file.folder` ändert Pfade; das Ergebnis der Ansicht ändert sich dadurch (Karte bleibt in der Spalte, aber unter neuem Pfad). Realtime-Updates und Tab-Pfade dürfen nicht veralten.
- Filterbaum-Pfade müssen nach dem Verschieben neu berechnet werden, nicht gecacht.
- Zugänglichkeit: Griffe müssen axe-konform sein (keine verschachtelten interaktiven Elemente); axe-Tests brauchen ca. 30 s Timeout auf dem Host.

## Teststrategie

- Unit-Tests der Baum-Funktionen (Randfälle: erste/letzte Position, verschachtelte Gruppen, leere Gruppe, `not`).
- Komponententests für Filter_Editor (Menü „Nach oben/unten“, Ebenenwechsel, disabled).
- Kanban-Test: Verschieben nach `file.folder` ruft Vault-Move statt Property-Write; Fehlerpfad lässt Karte stehen.
- Neue Testdateien mit eindeutigen Namen; bestehende `BasesKanbanView.test.tsx` und `BasesToolbar.test.tsx` mitlaufen lassen.
- Vor dem Push: `npm run lint`, `npm run build`, Verbraucher-Tests in `components/bases` und `plugins/compat` (z. B. `bases-query-controller.test.ts`).
