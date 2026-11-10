# Implementation Plan: Bases Filter-Umsortierung und Kanban-Ordner

## Overview

Jede Phase einzeln grün (lint, build, betroffene Tests) und separat committed; nach jeder Phase die Doku aktualisieren.

## Tasks

- [x] 1. Filterbaum-Funktionen
  - [x] 1.1 `components/bases/base-filter-tree.ts`: `moveNode`, `extractNode`, `appendNode`
  - [x] 1.2 Tests (neue Datei): Randfälle, Verschachtelung, `not`, keine Verluste/Duplikate
  - _Requirements: 1.1, 1.5, 2.2, 2.3_

- [x] 2. Filter-Editor: Umsortieren und Ebenenwechsel
  - [x] 2.1 Griff, Ziehen am Griff (HTML5-DnD), Einfügemarkierung, Animation (reduced-motion beachten)
  - [x] 2.2 Menüeinträge „Nach oben/unten“ und „Zu allen Ansichten / Zu dieser Ansicht verschieben“
  - [x] 2.3 Anbindung an `setDocFilter`/`setViewFilter` in einer Transaktion; `disabled` respektieren
  - [x] 2.4 Komponenten- und axe-Tests (Timeout ~30 s)
  - [x] 2.5 Doku
  - _Requirements: 1.1–1.5, 2.1–2.3_

- [ ] 3. Kanban nach Ordner
  - [ ] 3.1 Per grep klären, wo `onMoveCard` implementiert wird; Pfad für `file.folder` verzweigen
  - [ ] 3.2 Vault-Verschiebung inkl. Link-Aktualisierung und Fehlerbehandlung (Karte bleibt, Meldung)
  - [ ] 3.3 Neue Notiz in Spalte im Ordner der Spalte anlegen (`base-add-item.ts`)
  - [ ] 3.4 Spaltenname für Wurzelordner
  - [ ] 3.5 Tests (neue Datei neben `BasesKanbanView.test.tsx`)
  - [ ] 3.6 Doku
  - _Requirements: 3.1–3.5_

- [ ] 4. Limit-Hinweis und Standardname
  - [ ] 4.1 Gesamtanzahl vs. Limit in der Ergebnisberechnung mitführen, Hinweis in Toolbar/Suche
  - [ ] 4.2 Standardname der ersten Ansicht prüfen und ggf. auf „View“ setzen
  - [ ] 4.3 Tests und Doku
  - _Requirements: 4.1–4.2, 5.1_

- [ ] 5. Abschluss
  - [ ] 5.1 `npm run lint` und `npm run build`
  - [ ] 5.2 Verbraucher-Tests (`components/bases`, `plugins/compat`, mit `--testTimeout=60000`)
  - [ ] 5.3 Push, PR, CI-Schleife (max. 3 Iterationen), danach Review
