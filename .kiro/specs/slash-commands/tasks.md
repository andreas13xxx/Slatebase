# Implementation Plan: Slash Commands

## Overview

Das Slash-Menü ist eine neue Suggest-Quelle in der vorhandenen Plugin-Compat-Autovervollständigung, deren Einträge bestehende `editor:*`/Core-Commands ausführen. Kleines, abgegrenztes Feature (~8–14h): keine neue Popover-/Keymap-Schicht, kein Backend, keine zweite Formatierungslogik. Phasen: Core-Command-Lücken schließen (Phase 0/1), Trigger + Liste (Phase 2), Suggest-Quelle einhängen (Phase 3), Dokumentation (Phase 4).

**Vorarbeit vor Phase 2:** Registry durchgehen und klären, welche geforderten Einträge schon einen `editor:*`-Command haben und welche einen neuen brauchen (Design: offene Frage #1) — fehlende als Core-Command ergänzen, nicht slash-eigen.

## Tasks

- [ ] 1. Core-Command-Lücken schließen (nur wo nötig)
  - [ ] 1.1 `core-commands.ts`/`core-commands-app.ts` durchgehen: welche der geforderten Aktionen (H1–H3, Listen, Aufgabenliste, Zitat, Codeblock, Callout, Tabelle, horizontale Linie, interner Link) existieren bereits als `editor:*`-Command?
  - [ ] 1.2 Fehlende als neuen Core-Command in `editor/formatting.ts` + Registry ergänzen (profitiert auch der Command Palette), mit DE/EN-Label in `core-command-i18n.ts`
  - [ ] 1.3 Prüfen, ob die `editor-suggest-manager.ts`-Registrierung eine nicht-plugin-gebundene (interne) Quelle zulässt oder eine schmale Erweiterung (Pseudo-ID `__slash__`) braucht (Design-Frage #2)
  - _Requirements: 3.1, 3.2, 4.1_

- [ ] 2. Trigger + Befehlsliste
  - [ ] 2.1 `frontend/src/editor/slash/slash-commands.ts` — kuratierte `SlashCommand[]` (ID, Icon, Core-Command-ID oder Direkt-Einfüge-Handler), eine zentrale Datei
  - [ ] 2.2 Direkt-Einfüge-Handler für „Datum einfügen"/„Zeit einfügen" (CM6-Dispatch an Cursorposition, korrekte Undo-History)
  - [ ] 2.3 `frontend/src/editor/slash/slash-trigger.ts` — `/` am Zeilenanfang/nach Leerraum erkennen, Filtertext + Ersetzungsbereich liefern, Code/Wikilink/Math-Regionen meiden (Regionslogik aus `editor/spellcheck/tokenizer.ts` wiederverwenden)
  - [ ] 2.4 `frontend/src/editor/slash/slash-command-i18n.ts` — DE/EN-Labels je ID
  - [ ] 2.5 Tests: Trigger positiv/negativ (`/` im Wort, in `a/b`, Codeblock, Wikilink/Math), Datum/Zeit-Einfügung
  - _Requirements: 1.1, 1.3, 1.5, 2.5, 3.1, 3.3, 3.5_

- [ ] 3. Suggest-Quelle einhängen + Ausführung
  - [ ] 3.1 `frontend/src/editor/slash/slash-suggest-source.ts` — `onTrigger`/`getSuggestions` (Fuzzy-Match via `utils/fuzzyMatch.ts`)/`renderSuggestion` (`.suggestion-item`)/`selectSuggestion`
  - [ ] 3.2 `selectSuggestion`: zuerst Trigger-Text löschen, DANN Aktion — `executeCommandById` für Core-Commands, Direkt-Dispatch für Einfüge-Handler
  - [ ] 3.3 Deaktivierte/fehlende Commands auslassen oder sichtbar deaktivieren (kein stiller No-Op)
  - [ ] 3.4 In `CodeMirrorEditor.tsx` beim Mount registrieren (neben Plugin-Suggests + `==`-Autocomplete), nur Haupteditor
  - [ ] 3.5 Tests: Filterung, „löscht Trigger-Text UND führt aus", Koexistenz (ein Popover bei konkurrierendem Plugin-Trigger), Lifecycle/Stale-Guard geerbt
  - _Requirements: 1.2, 1.4, 2.1, 2.2, 2.3, 2.4, 3.4, 4.1, 4.2, 4.3, 4.4_

- [ ] 4. Dokumentation & Steering
  - [ ] 4.1 Welcome-Vault DE/EN: Slash-Menü dokumentieren (eigener kurzer Guide ODER Abschnitt im Editor-/Command-Palette-Guide)
  - [ ] 4.2 Bei eigenem Guide: in `Features/Übersicht.md` (DE)/`Features/Overview.md` (EN) verlinken, `_meta.md` (DE+EN) Version/`updated` anheben
  - [ ] 4.3 `structure.md` (slash-Modul, neue Dateien), `product.md` (Feature-Zeile)
  - _Requirements: 5.1, 5.2, 5.3_

## Verifikation vor Abschluss

- Frontend `npm run build` + `npm run test:coverage` grün, `npx eslint . --quiet` 0 Errors
- Manuell: `/` am Zeilenanfang öffnet Menü; Weitertippen filtert; `/` im Wort/Pfad/Codeblock löst NICHT aus; Pfeiltasten+Enter wählt; gewählter Befehl ersetzt den `/…`-Text und führt aus (Tabelle landet sauber, nicht hinter `/tabelle`); Datum/Zeit einfügen funktioniert; ein Plugin-EditorSuggest und das Slash-Menü zeigen nie zwei Popover gleichzeitig
