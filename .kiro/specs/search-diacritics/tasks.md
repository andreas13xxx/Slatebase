# Implementation Plan: Akzent-unabhängige Suche

## Overview

Zuerst die Fold-Funktion mit Tests, dann Stelle für Stelle anbinden. Jede Phase einzeln grün (lint, build, betroffene Tests) und separat committed; danach Doku.

## Tasks

- [ ] 1. Fold-Funktion
  - [ ] 1.1 `utils/searchFold.ts` mit `foldForSearch`, `foldQuery` und Offset_Map
  - [ ] 1.2 Tests (neue Datei `searchFold.test.ts`): Sonderbuchstaben-Tabelle, Umlaute, `ß→ss`, Offsets, ASCII-Schnellpfad, Surrogatpaare
  - _Requirements: 1.1–1.4_

- [ ] 2. Plugin-API
  - [ ] 2.1 `prepareFuzzySearch`/`prepareSimpleSearch` auf Fold umstellen, Matches auf Originaltext abbilden
  - [ ] 2.2 `fallbackPrepareSearch` und `fuzzyMatchText` angleichen (möglichst gemeinsame Implementierung statt Kopien)
  - [ ] 2.3 Tests in neuer Datei; bestehende `install-globals.test.ts` unverändert lassen und mitlaufen lassen
  - _Requirements: 2.1–2.3_

- [ ] 3. Quick Switcher, Link-Vorschläge, Befehlspalette
  - [ ] 3.1 `utils/fuzzyMatch.ts` intern falten (Signatur unverändert)
  - [ ] 3.2 `editor/suggest/link-complete.ts` auf Fold umstellen
  - [ ] 3.3 Befehlspalette prüfen und anbinden
  - [ ] 3.4 Tests je Stelle (neue Dateien), inkl. Highlighting-Offsets
  - _Requirements: 3.1–3.3, 3.6_

- [ ] 4. Filter in Seitenpanels und Bases
  - [ ] 4.1 Vorhandene Filter in Backlinks, Outline, Bookmarks, Tags suchen und anbinden
  - [ ] 4.2 Bases-Suche anbinden
  - [ ] 4.3 Tests
  - _Requirements: 3.4–3.5_

- [ ] 5. Abgrenzung und Doku
  - [ ] 5.1 Backend-Suche auf Akzent-Verhalten prüfen und Ergebnis als Folgepunkt in der Doku vermerken
  - [ ] 5.2 Doku: Suchverhalten (Umlaute → Grundbuchstabe, kein `ae`-Mapping) beschreiben
  - [ ] 5.3 Verbraucher-Tests laufen lassen (nur betroffene Ordner, `--testTimeout=60000`)
  - _Requirements: 4.1–4.2_
