# Implementation Plan: Bases

## Overview

Bases bringen eine deklarative Tabellenansicht über die vorhandene Metadaten-Schicht. `.base`-Dateien sind normale Vault-Dateien; die Query-Engine liest aus dem `link-index`, die Formelauswertung ist ein eigener kleiner Interpreter (kein `eval`), die Tabellenzellen nutzen die Properties-Editor-Controls. Phasen 1–3 liefern das Lesen/Rendern, Phase 4 das Editing, Phase 5 die Integration, Phase 6 das Feature-Toggle, Phase 7 die Welcome-Vault-Dokumentation.

**Vorarbeit vor Phase 1:** Eine echte Obsidian-`.base`-Datei als Round-Trip-Fixture beschaffen und die Feldbenennung festnageln (Design: „Offene Design-Fragen" #1).

## Tasks

- [x] 1. `.base`-Format: Typen, Parser, Serializer
  - [x] 1.1 `frontend/src/bases/types.ts` — `BaseDocument`, `BaseFilter` (UND/ODER-Baum), `BaseFormula`, `BaseView`, `BaseColumn`, `BaseRow`
  - [x] 1.2 `frontend/src/bases/parser.ts` — `parseBase(yaml)`, manuelle Validierung + Passthrough unbekannter Felder (Canvas-Parser-Muster, kein Zod)
  - [x] 1.3 `frontend/src/bases/serializer.ts` — `serializeBase(doc)`, Round-Trip-kompatibel
  - [x] 1.4 `frontend/src/bases/parser.test.ts` — Round-Trip gegen echte Obsidian-`.base`-Fixture, Fehlerfälle, Passthrough
  - [x] 1.5 `frontend/src/bases/index.ts` — Barrel-Export
  - _Requirements: 1.1, 1.2, 1.3_

- [x] 2. Query-Engine (Backend + Frontend-Anbindung)
  - [x] 2.1 `backend/src/link-index/link-index-service.ts` — `queryForBase(spec)` auf vorhandenen `queryByProperties`/`getFilesByProperty`-Primitiven, falls diese UND/ODER-Verschachtelung, Pfad-/Datei-Metadaten-Filter und Mehrspalten-Sort nicht abdecken
  - [x] 2.2 `backend/src/api/basesRoutes.ts` — `POST /vaults/:vaultId/bases/query`, Zod-validiert, `checkReadAccess`, feature-gated `bases`
  - [x] 2.3 `backend/src/api/basesRoutes.test.ts` — Filterkombinationen, Sortierung, 403/400/leer
  - [x] 2.4 `frontend/src/bases/query-engine.ts` — `runBaseQuery(doc, apiClient, vaultId)` → `BaseRow[]`, `vault:change`-Live-Refresh über `realtimeVaultBridge`
  - [x] 2.5 `frontend/src/api/index.ts` + `IApiClient` — Query-Endpunkt ergänzen
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 5.4_

- [x] 3. Formel-Interpreter (kein eval)
  - [x] 3.1 `frontend/src/bases/formula/tokenizer.ts`
  - [x] 3.2 `frontend/src/bases/formula/parser.ts` — Pratt-Parser → AST
  - [x] 3.3 `frontend/src/bases/formula/evaluator.ts` — Baum-Interpreter, Fehler-/Leerwert statt Crash
  - [x] 3.4 `frontend/src/bases/formula/functions.ts` — `if`, `concat`, `now`/`today`, Datumsdifferenz, `length`
  - [x] 3.5 `frontend/src/bases/formula/*.test.ts` — inkl. fehlende Property, Division durch Null, Syntaxfehler
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 4. Editierbare Tabellen-View
  - [x] 4.1 `frontend/src/components/bases/BasesTableView.tsx` — Zeilen/Spalten, Link-Spalte, Sortier-Header
  - [x] 4.2 `frontend/src/components/bases/BaseCell.tsx` — Formel read-only, Property editierbar über Properties-Editor-Controls
  - [x] 4.3 Zell-Edit schreibt via `applyFrontmatterChange` + `IVaultService.saveFile`; `useCommitOnUnmount`-Semantik
  - [x] 4.4 Fehlerpfad: Schreibfehler sichtbar, vorigen Zellwert wiederherstellen
  - [x] 4.5 Sortierung in die `.base`-Datei zurückschreiben
  - [x] 4.6 `frontend/src/components/bases/BasesView.css` (Design Tokens) + Tests
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

- [x] 5. View-Container, Rohquelle, Tab-/Datei-Integration
  - [x] 5.1 `frontend/src/components/bases/BasesView.tsx` — Laden/Parsen/Query/Fehlerzustand, Umschalter Tabelle ↔ Rohquelle
  - [x] 5.2 `frontend/src/components/bases/BasesSourceView.tsx` — Roh-YAML-Editor mit Apply (Canvas-Source-View-Muster)
  - [x] 5.3 `frontend/src/components/TabContent.tsx` — `.base` vor Markdown/Binary auf `BasesView` routen (`mode !== 'edit'`-Falle)
  - [x] 5.4 `frontend/src/utils/fileIcons.tsx` — `.base`-Icon
  - [x] 5.5 Befehl „Neue Base erstellen"/„Create new base" in `core-commands-app.ts` + Labels in `core-command-i18n.ts`
  - _Requirements: 1.4, 1.5, 5.1, 5.2, 5.3_

- [x] 6. Feature-Toggle
  - [x] 6.1 `backend/src/index.ts` — `featureRegistry.register('bases', …)` (kalt, default aus), Routen-Guard
  - [x] 6.2 Frontend-Feature-Set um `bases` ergänzen; Erstell-Befehl + View-Routing gaten
  - _Requirements: 6.1, 6.2_

- [x] 7. Welcome-Vault-Dokumentation (DE + EN)
  - [x] 7.1 `backend/assets/templates/welcome-vault/Features/Bases.md` (DE) — Standard-Guide-Struktur
  - [x] 7.2 `backend/assets/templates/welcome-vault-en/Features/Bases.md` (EN)
  - [x] 7.3 Beispiel-`.base` + Beispielnotizen (DE/EN), die eine nicht-leere Tabelle ergeben
  - [x] 7.4 Bases in `Features/Übersicht.md` (DE) und `Features/Overview.md` (EN) verlinken
  - [x] 7.5 `_meta.md` (DE+EN) Version + `updated` anheben
  - _Requirements: 6.3, 6.4, 6.5_

- [x] 8. Dokumentation & Steering
  - [x] 8.1 `structure.md` (bases-Modul, basesRoutes), `product.md` (Feature-Zeile), `implementation-plan.md` (Prio 6 auf „Spec vorhanden" umstellen) aktualisieren
  - [x] 8.2 `PLUGIN-COMPAT.md`: Vermerk, dass die Bases-No-Ops im Compat-Layer bewusst bestehen bleiben, bis die Plugin-Freigabe (Out of Scope v1) kommt
  - _Requirements: —_

## Verifikation vor Abschluss

- Backend `npx tsc --noEmit` + `npm run test:coverage` grün
- Frontend `npm run build` + `npm run test:coverage` grün, `npx eslint . --quiet` 0 Errors
- Manuell: Beispiel-Base im Welcome-Vault öffnen → nicht-leere Tabelle, eine Property-Zelle editieren → Wert landet in der Zielnotiz, Sortierung per Spalten-Klick, Rohquellen-Modus
