# Implementation Plan: Akzent-unabhängige Suche

## Overview

Zuerst die Fold-Funktion mit Tests, dann Stelle für Stelle anbinden. Jede Phase einzeln grün (lint, build, betroffene Tests) und separat committed; danach Doku.

## Tasks

- [x] 1. Fold-Funktion
  - [x] 1.1 `utils/searchFold.ts` mit `foldForSearch`, `foldQuery` und Offset_Map
  - [x] 1.2 Tests (neue Datei `searchFold.test.ts`): Sonderbuchstaben-Tabelle, Umlaute, `ß→ss`, Offsets, ASCII-Schnellpfad, Surrogatpaare
  - _Requirements: 1.1–1.4_

- [x] 2. Plugin-API
  - [x] 2.1 `prepareFuzzySearch`/`prepareSimpleSearch` auf Fold umstellen, Matches auf Originaltext abbilden
  - [x] 2.2 `fuzzyMatchText`/FuzzySuggestModal auf Fold umgestellt (`fallbackPrepareSearch` ist ein reiner Stub ohne Match-Logik, unverändert)
  - [x] 2.3 Tests in neuer Datei; bestehende `install-globals.test.ts` unverändert lassen und mitlaufen lassen
  - _Requirements: 2.1–2.3_

- [x] 3. Quick Switcher, Link-Vorschläge, Befehlspalette
  - [x] 3.1 `utils/fuzzyMatch.ts` intern falten (Signatur unverändert)
  - [x] 3.2 `editor/suggest/link-complete.ts` auf Fold umstellen
  - [x] 3.3 Befehlspalette prüfen und anbinden
  - [x] 3.4 Tests je Stelle (neue Dateien), inkl. Highlighting-Offsets
  - _Requirements: 3.1–3.3, 3.6_

- [ ] 4. Filter in Seitenpanels und Bases
  - [x] 4.1 Filter gesucht: Backlinks, Outline, Bookmarks und Tags haben kein Textfilter-Feld; angebunden wurden stattdessen `MoveTargetDialog` und `TemplateSelector`
  - [x] 4.2 Bases-Schnellsuche (`base-row-search.ts`, seit Master #354) akzent-unabhängig
  - [x] 4.3 Tests (`MoveTargetDialog.accents.test.tsx`)
  - _Requirements: 3.4–3.5_

- [ ] 5. Abgrenzung und Doku
  - [x] 5.1 Backend-Suche (`search-service.ts`, `scoped-match.ts`) faltet jetzt ebenfalls (Fold-Funktion nach `shared-contracts` verschoben); Suchen & Ersetzen bleibt bewusst exakt
  - [x] 5.2 Doku in `product.md` und `structure.md`
  - [x] 5.3 Verbraucher-Tests laufen lassen (nur betroffene Ordner, `--testTimeout=60000`)
  - _Requirements: 4.1–4.2_
