# Design Document: Bases

## Overview

Bases bringen eine deklarative Datenbank-/Tabellenansicht über die Metadaten eines Vaults. Eine `.base`-Datei (YAML) beschreibt Filter, berechnete Spalten (Formeln) und benannte Views; Slatebase rendert daraus eine editierbare Tabelle, die sich wie ein Datei-Tab öffnet.

Architektur-Leitplanken:

- **Keine zweite Datenpipeline.** Die Query-Engine liest ausschließlich aus der vorhandenen `link-index`-Schicht (`LinkIndexService`: `getFilesByProperty`, `getPropertyKeys`/`getPropertyValues`, `queryByProperties`, Tags, Pfade). Dort liegen Properties, Tags und Pfade bereits normalisiert und werden bei jedem Schreibvorgang über den `linkIndexHook` aktuell gehalten. Eine Base hält damit nie eigenen, veraltenden Zustand.
- **Frontend-only Parser/Engine/View, Backend liefert nur Metadaten.** Das `.base`-Format ist (wie Canvas) ein reines Frontend-Dateiformat; der Backend-Beitrag beschränkt sich auf eine Metadaten-Abfrage-Route und das Feature-Toggle. Schreiben läuft über den bestehenden Vault-Schreibpfad.
- **Kein `eval`.** Die Formelauswertung ist ein eigener kleiner Tokenizer + Pratt-Parser + Baum-Interpreter — passend zur CSP (`script-src 'self' blob:`, kein `unsafe-eval`).
- **Zellen-Editing = Properties-Editor-Mechanik.** Die Tabellenzellen wiederverwenden die typisierten Controls und die `useCommitOnUnmount`-Semantik des Properties-Editors, inklusive des Schreibpfads in die Frontmatter.
- **Round-Trip-sicher.** Parser mit manueller Validierung + Passthrough unbekannter Felder, wie der Canvas-Parser (bewusst kein Zod — siehe `lessons-learned.md`, „Dateiformat-Parser: manuelle Validierung statt Zod"), damit neuere Obsidian-`.base`-Felder einen Lese-/Schreibzyklus überleben.

## Architecture

### Backend — neue Dateien

| Pfad | Verantwortung |
|------|---------------|
| `backend/src/api/basesRoutes.ts` | Metadaten-Query-Route für Bases: `POST /vaults/:vaultId/bases/query` nimmt eine normalisierte Filter-/Sort-/Spalten-Spezifikation entgegen und liefert die Zeilenmenge (Pfad + ausgewählte Property-Werte) aus `LinkIndexService`. Zugriffskontrolle via `checkReadAccess`. Feature-gated auf `bases`. Zod-validiert. |
| `backend/src/api/basesRoutes.test.ts` | Integrationstests der Query-Route (Filter, Sortierung, 403 ohne Zugriff, 400 bei ungültiger Spezifikation, 404/leer). |

Hinweis: Es entsteht KEIN neues `backend/src/bases/`-Modul mit eigenem Store/Service. Eine `.base`-Datei ist eine gewöhnliche Vault-Datei; Lesen/Schreiben läuft über die vorhandenen Datei-Endpunkte. Die einzige neue Backend-Logik ist das Übersetzen einer Base-Query in Aufrufe von `LinkIndexService` — bewusst als dünne Route, nicht als eigene Schicht, weil die Metadaten-Schicht schon existiert (`queryByProperties` deckt den Kern bereits ab und wird nur um Pfad-/Datei-Metadaten-Filter und Mehrspalten-Sort ergänzt).

Mögliche Erweiterung von `backend/src/link-index/link-index-service.ts`: eine `queryForBase(spec)`-Methode, die Property-/Tag-/Pfad-/Datei-Metadaten-Filter mit UND/ODER-Verschachtelung und Mehrspalten-Sort kombiniert — aufgesetzt auf die vorhandenen `queryByProperties`/`getFilesByProperty`-Primitive, nicht als Parallelimplementierung.

### Frontend — neue Dateien

| Pfad | Verantwortung |
|------|---------------|
| `frontend/src/bases/index.ts` | Barrel-Export (Parser, Serializer, Typen, Engine). |
| `frontend/src/bases/types.ts` | `BaseDocument`, `BaseFilter` (UND/ODER-Baum), `BaseFormula`, `BaseView`, `BaseColumn`, `BaseRow`, Parse-Result-Typen. |
| `frontend/src/bases/parser.ts` | `parseBase(yaml)` — manuelle Validierung, Passthrough unbekannter Felder (Canvas-Parser-Muster, kein Zod). |
| `frontend/src/bases/serializer.ts` | `serializeBase(doc)` — Model → YAML, Round-Trip-kompatibel. |
| `frontend/src/bases/parser.test.ts` | Round-Trip-Tests, Fehlerfälle, Passthrough. |
| `frontend/src/bases/query-engine.ts` | `runBaseQuery(doc, apiClient, vaultId)` — ruft die Backend-Query-Route, mappt auf `BaseRow[]`, hält eine `vault:change`-getriggerte Aktualisierung. |
| `frontend/src/bases/formula/tokenizer.ts` | Tokenizer für den Formel-Ausdruck. |
| `frontend/src/bases/formula/parser.ts` | Pratt-Parser → Ausdrucks-AST. |
| `frontend/src/bases/formula/evaluator.ts` | Baum-Interpreter: wertet einen AST gegen eine Zeile aus, kein `eval`. |
| `frontend/src/bases/formula/functions.ts` | Die begrenzte Hilfsfunktions-Menge (`if`, `concat`, `now`/`today`, Datumsdifferenz, `length`). |
| `frontend/src/bases/formula/*.test.ts` | Tokenizer/Parser/Evaluator/Funktions-Tests inkl. Fehler-/Leerwert-Verhalten. |
| `frontend/src/components/bases/BasesView.tsx` | Container: lädt die `.base`-Datei, parst, führt die Query aus, schaltet zwischen Tabelle und Rohquelle, Fehlerzustand. |
| `frontend/src/components/bases/BasesTableView.tsx` | Tabellen-Rendering: Zeilen/Spalten, Sortier-Header, Link-Spalte, Zell-Editing. |
| `frontend/src/components/bases/BaseCell.tsx` | Eine Zelle: Formel-Spalte read-only, Property-Spalte editierbar über die Properties-Editor-Controls. |
| `frontend/src/components/bases/BasesSourceView.tsx` | Roh-YAML-Editor mit Apply (Canvas-Source-View-Muster). |
| `frontend/src/components/bases/BasesView.css` | Styles (Design Tokens). |
| `frontend/src/components/bases/*.test.tsx` | View-/Zell-/Sortier-/Commit-on-unmount-Tests. |

### Frontend — geänderte Dateien

| Pfad | Änderung |
|------|----------|
| `frontend/src/components/TabContent.tsx` | `.base`-Dateien vor dem Markdown-/Binary-Branch auf `BasesView` routen (gleiches Muster wie die TextFileView-Plugin-Views, `mode !== 'edit'`-Falle beachten). |
| `frontend/src/plugins/compat/.../core-commands-app.ts` | Befehl „Neue Base erstellen" / „Create new base" registrieren (gated auf `bases`). |
| `frontend/src/plugins/compat/.../core-command-i18n.ts` | DE/EN-Labels für den neuen Befehl. |
| `frontend/src/utils/fileIcons.tsx` | Icon für `.base`-Dateien. |
| `frontend/src/components/property-controls/*` | Falls nötig geringfügig öffnen, damit die Controls auch außerhalb des Frontmatter-Widgets (in einer Tabellenzelle) verwendbar sind — ohne ihre Commit-Semantik zu ändern. |
| `frontend/src/state/featureState.ts` o.ä. | `bases`-Toggle im Frontend-Feature-Set führen (wie `git-sync`/`mail-import`). |

### Backend — geänderte Dateien

| Pfad | Änderung |
|------|----------|
| `backend/src/index.ts` | `featureRegistry.register('bases', …)` (kalt, default aus); `basesRoutes` mit Feature-Guard mounten; Query-Route an `LinkIndexService` verdrahten. |
| `backend/src/link-index/link-index-service.ts` | Optional `queryForBase(spec)` (siehe oben), falls `queryByProperties` die UND/ODER-/Pfad-/Sort-Anforderungen nicht abdeckt. |

### Welcome-Vault — geänderte/neue Dateien

| Pfad | Änderung |
|------|----------|
| `backend/assets/templates/welcome-vault/Features/Bases.md` | Neuer DE-Feature-Guide (Standard-Struktur). |
| `backend/assets/templates/welcome-vault-en/Features/Bases.md` | Neuer EN-Feature-Guide. |
| `backend/assets/templates/welcome-vault/Features/Beispiel.base` (+ EN-Pendant) | Funktionsfähige Beispiel-Base, die auf vorhandene/mitgelieferte Beispielnotizen filtert. |
| ggf. 2–3 kleine Beispielnotizen mit Frontmatter (DE/EN) | Datengrundlage, auf die die Beispiel-Base filtert (z.B. unter `Practice/`), falls die vorhandenen Notizen nicht genug einheitliche Properties tragen. |
| `backend/assets/templates/welcome-vault/Features/Übersicht.md` + `.../welcome-vault-en/Features/Overview.md` | Bases in „Weitere Features"/„More Features" verlinken. |
| `backend/assets/templates/welcome-vault/_meta.md` + EN | Version + `updated` anheben. |

## Data Model (`.base`-Datei, vereinfacht)

```yaml
# Obsidian-kompatibles .base-Format (Felder gemäß Obsidian 1.10+; unbekannte Felder passthrough)
filters:
  and:
    - { property: "status", op: "neq", value: "done" }
    - or:
        - { property: "priority", op: "eq", value: "high" }
        - { tag: "urgent" }
formulas:
  days_left: "today() - date(deadline)"
properties:
  status: { displayName: "Status" }
  days_left: { displayName: "Tage übrig" }
views:
  - type: table
    name: "Offene Aufgaben"
    order: [file.name, status, priority, days_left]
    sort:
      - { column: "priority", direction: "desc" }
```

Die exakte Feldbenennung wird in Phase 1 gegen eine echte Obsidian-`.base`-Datei verifiziert (Round-Trip-Fixture), bevor der Parser festgezurrt wird — die obige Form ist die Design-Skizze, nicht die eingefrorene Schnittstelle.

## Query-Fluss

1. `BasesView` lädt die `.base`-Datei über den vorhandenen Datei-Lesepfad und parst sie.
2. Aus Filter + Sort + sichtbaren Spalten baut die Engine eine normalisierte Query-Spezifikation und schickt sie an `POST /vaults/:vaultId/bases/query`.
3. Das Backend übersetzt die Spezifikation in `LinkIndexService`-Aufrufe und liefert Zeilen (Pfad + angeforderte Property-Rohwerte).
4. Das Frontend wertet Formel-Spalten pro Zeile lokal aus (`Formula_Evaluator`) und rendert die Tabelle.
5. Ein `vault:change`-Event (über die vorhandene `realtimeVaultBridge`) triggert einen erneuten Query-Lauf (gleiches Live-Refresh-Muster wie das Context-Panel).

## Zell-Editing-Fluss

1. Property-Zelle wird angeklickt → typisiertes Control (Properties-Editor-Control) öffnet mit lokalem Draft.
2. Commit (Enter/Blur/Unmount via `useCommitOnUnmount`) schreibt den Wert über `applyFrontmatterChange` in die Frontmatter der Zielnotiz und speichert via `IVaultService.saveFile`.
3. Der Save löst `vault:change` aus → der Index aktualisiert → die Query läuft erneut → die Zelle zeigt den persistierten Wert.
4. Schlägt der Save fehl, wird der vorige Wert wiederhergestellt und ein Fehler sichtbar gemacht.

## Formelsprache (erste Version)

- **Operanden:** Property-Referenz (`deadline`, `status`), String-/Zahl-/Boolean-Literal.
- **Operatoren:** `== != < <= > >=`, `+ - * /`, String-`+` (Verkettung).
- **Funktionen (begrenzt):** `if(cond, a, b)`, `concat(...)`, `now()`, `today()`, Datumsdifferenz (`today() - date(x)` → Tage), `length(x)`.
- **Auswertung:** Tokenizer → Pratt-Parser → AST → Interpreter. Fehler/fehlende Property/Division durch Null → sichtbarer Fehler-/Leerwert in der Zelle, kein Crash.
- **Bewusst NICHT:** Lambdas, map/filter über Listen, der volle Obsidian-Funktionskatalog. Dokumentierte Grenze.

## Security & Konsistenz

- `.base`-Dateien sind normale Vault-Dateien → Path-Traversal-Schutz, Trash/Versionierung, Dot-/Underscore-Sichtbarkeitsregeln gelten unverändert.
- Query-Route Zod-validiert + `checkReadAccess`, Feature-gated.
- Keine Formel-Auswertung über `eval`/`new Function` (CSP).
- Zell-Edits schreiben ausschließlich über den geprüften Vault-Schreibpfad; kein direkter Dateizugriff.
- Die Engine liest live aus dem Link-Index → kein eigener veraltender Zustand bei Löschen/Verschieben/Umbenennen.

## Testing-Strategie

- Backend: Query-Route-Integrationstests (Filterkombinationen, Sortierung, Zugriffskontrolle, Validierungs-400er); ggf. `queryForBase`-Unit-Tests.
- Frontend: Parser-Round-Trip + Fehlerfälle; Formel-Tokenizer/Parser/Evaluator inkl. Fehlerpfade; `BasesTableView`-Sortierung und Zell-Edit; `useCommitOnUnmount`-Verhalten beim Rebuild.
- Welcome-Vault: Die Beispiel-`.base` muss gegen die mitgelieferten Beispielnotizen eine nicht-leere, sinnvolle Tabelle ergeben (manuelle Verifikation beim Hinzufügen).

## Offene Design-Fragen (vor Phase 1 zu klären)

1. Exakte `.base`-Feldbenennung gegen eine echte Obsidian-Datei verifizieren (Fixture).
2. Soll die Query-Spezifikation serverseitig oder clientseitig gefiltert werden, wenn der Index eine Property nicht als Spalte kennt? (Vorzug: serverseitig über den Index, clientseitiger Fallback nur für Formel-abgeleitete Sortierung.)
3. Umfang der minimalen Beispiel-Notizmenge im Welcome-Vault (vorhandene Notizen wiederverwenden vs. neue anlegen).
