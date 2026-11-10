# Implementation Plan: Obsidian 1.15 API-Kompatibilität

## Overview

Jede Phase ist einzeln grün (lint, build, betroffene Tests) und wird separat committed. Nach jeder Phase die Doku aktualisieren.

## Tasks

- [x] 1. FileManager: Löschen meldet Misserfolg
  - [x] 1.1 `trashFile` → `Promise<boolean>`, Fehler abfangen und warnen
  - [x] 1.2 `promptForDeletion` ergänzen, Proxy-Whitelist erweitern
  - [x] 1.3 Aufrufer von `trashFile` per grep prüfen und anpassen
  - [x] 1.4 Tests (neue Datei, z. B. `file-manager-shim.trash.test.ts`): Erfolg, Fehler → false, Abbruch → false
  - _Requirements: 1.1–1.4_

- [x] 2. Mermaid-Alias und `loadPixi`
  - [x] 2.1 `loadMermaid` setzt `window.mermaid` und `window.pele`; Fehlerfall ohne Setzen
  - [x] 2.2 `loadPixi` als Stub mit `warnNoOp`, in `registerUnsupportedLoaders` registrieren
  - [x] 2.3 Tests: Methoden vorhanden (`initialize`, `render`, `parse`, `mermaidAPI.getConfig/setConfig`), Alias identisch, `loadPixi` → null
  - _Requirements: 2.1–2.4, 3.1–3.2_

- [x] 3. Settings-`id`, Math-Klasse, CSS-Variable
  - [x] 3.1 `id` im Declarative_Settings_Renderer → `data-setting-id`
  - [x] 3.2 `--font-preferred-size` in `App.css`
  - [x] 3.3 Prüfen, wie `$$`-Blöcke in Live Preview gerendert werden; `HyperMD-math` pro Zeile ergänzen oder Abweichung in `design.md` notieren
  - [x] 3.4 Tests
  - _Requirements: 5.1–5.3, 6.1–6.2_

- [ ] 4. Schließende Formatierungs-Tokens
  - [ ] 4.1 Echtes Obsidian-Verhalten verifizieren (Changelog 1.15.0, ggf. Obsidian-Typings/Plugin-Quellen), Ergebnis in `design.md` festhalten
  - [ ] 4.2 Je nach Ergebnis: Umsetzung (Parser-Wrapper) oder Analyzer-Eintrag „partial“ plus Doku
  - [ ] 4.3 Tests in `token-class-node-prop`-nahem, neu benanntem Testfile
  - _Requirements: 4.1–4.4_

- [ ] 5. API-Version und Doku
  - [ ] 5.1 `OBSIDIAN_API_VERSION` → `1.15.1`, `requireApiVersion`-Tests anpassen
  - [ ] 5.2 Doku: Compat-Inventar und Non-Goals ergänzen
  - [ ] 5.3 Verbraucher-Tests (`plugins/compat/*`, mit `--testTimeout=60000`) laufen lassen
  - _Requirements: 7.1–7.2_
