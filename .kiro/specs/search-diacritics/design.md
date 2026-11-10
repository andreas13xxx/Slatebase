# Design Document: Akzent-unabhängige Suche

## Overview

Eine zentrale Normalisierungsfunktion, die von allen bestehenden Fuzzy-/Substring-Suchstellen genutzt wird. Heute existieren mindestens fünf getrennte Implementierungen:

| Stelle | Datei |
|---|---|
| Plugin-API | `plugins/compat/obsidian-api-extensions.ts` (`prepareFuzzySearch`, `prepareSimpleSearch`) |
| Fallbacks | `plugins/compat/fallback-shims.ts` (`fallbackPrepareSearch`) |
| FuzzySuggestModal | `plugins/compat/install-globals.ts` (`fuzzyMatchText`) |
| Quick Switcher | `utils/fuzzyMatch.ts` (Score, kleiner = besser) |
| Link-Vorschläge | `editor/suggest/link-complete.ts` (Substring per `toLowerCase`) |

## Design-Entscheidungen

1. **Neue Datei `utils/searchFold.ts`** (Name bewusst abweichend von bestehenden Dateien) mit:
   ```ts
   export interface FoldedText { text: string; map: number[] | null }
   export function foldForSearch(input: string): FoldedText
   export function foldQuery(input: string): string
   ```
   `map` ist `null`, wenn die Länge unverändert ist (Normalfall: ASCII oder 1:1-Faltung). Sonst gilt `map[i]` = Index im Originaltext für Position `i` im gefalteten Text.
2. **Faltung zeichenweise.** Pro Original-Codepoint: NFD-Zerlegung, kombinierende Zeichen verwerfen, Sonderbuchstaben per Tabelle ersetzen, Kleinschreibung. So bleibt die Offset_Map einfach (jedes gefaltete Zeichen zeigt auf seinen Ursprungs-Codepoint).
3. **ASCII-Schnellpfad:** Wenn `/^[\x00-\x7f]*$/` zutrifft, wird nur `toLowerCase()` angewandt (`map = null`).
4. **Treffer-Rückrechnung:** Ein Match `[a, b)` im gefalteten Text wird zu `[map[a], map[b-1] + 1)`; benachbarte Bereiche werden zusammengeführt.
5. **`fuzzyMatch(query, text)` behält die Signatur** (Score). Intern wird gefaltet. Nur `QuickSwitcher` und Tests rufen sie auf; Highlighting dort nutzt die Offsets nicht, ist also nicht betroffen.
6. **Keine Locale-Abhängigkeit** (`localeCompare` o. Ä.), damit Ergebnisse auf Server, Browser und im Test gleich sind.

## Risiken

- Längenverändernde Faltung (`ß→ss`, `æ→ae`, `œ→oe`, `þ→th`) bricht naive Index-Annahmen in vorhandenem Highlighting-Code (`renderMatches`). Tests mit „Straße“ decken das ab.
- `toLowerCase()` selbst kann Länge ändern (`İ`); durch zeichenweise Faltung abgefangen.

## Teststrategie

- Unit-Tests für `foldForSearch`: Tabelle der Sonderbuchstaben, Umlaute, Offset_Map, leere Strings, Surrogatpaare.
- Je Suchstelle ein Test mit „café/cafe“, „Äpfel/apfel“, „Straße/strasse“, „Łódź/lodz“ sowie Highlighting-Offsets.
- Neue Testdateien mit eindeutigen Namen; bestehende Tests nicht überschreiben.
- Verbraucher-Tests der geänderten Funktionen mitlaufen lassen (`plugins/compat`, `QuickSwitcher`, Link-Complete).
