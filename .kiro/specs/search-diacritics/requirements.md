# Requirements Document

## Introduction

Obsidian 1.15 ignoriert Akzente in Link-Vorschlägen, Quick Switcher, Befehlspalette und Bases-Suche („cafe“ findet „café“). `prepareFuzzySearch` und `prepareSimpleSearch` tun dasselbe für lateinische und griechische Buchstaben. Obsidian 1.15.1 faltet zusätzlich Buchstaben wie `ø ł đ ð ħ ı ß æ œ þ` auf ASCII („lodz“ findet „Łódź“, „strasse“ findet „Straße“) und wendet das auf Filter in Backlinks, Outline und Bookmarks an.

Slatebase vergleicht heute nur per `toLowerCase()`. Für deutsche Nutzer ist „Apfel“ ↔ „Äpfel“ der Hauptfall.

## Glossary

- **Fold**: Normalisierung eines Textes für den Vergleich (Kleinschreibung, Akzente entfernt, Sonderbuchstaben ersetzt).
- **Offset_Map**: Zuordnung von Positionen im gefalteten Text zu Positionen im Originaltext.

## Requirements

### Requirement 1: Gemeinsame Fold-Funktion

#### Acceptance Criteria

1. THE System SHALL eine zentrale Funktion `foldForSearch(text)` in `frontend/src/utils/` bereitstellen, die Text in Kleinbuchstaben wandelt, kombinierende Akzentzeichen entfernt (NFD, `\p{M}`) und folgende Zeichen ersetzt: `ø→o`, `ł→l`, `đ→d`, `ð→d`, `ħ→h`, `ı→i`, `ß→ss`, `æ→ae`, `œ→oe`, `þ→th`.
2. THE Funktion SHALL zusätzlich eine Offset_Map liefern, damit Treffer-Positionen auf den Originaltext zurückgerechnet werden können (wichtig bei längenverändernden Ersetzungen wie `ß→ss`).
3. THE Funktion SHALL auf großen Listen (10 000 Dateien) ohne spürbare Verzögerung arbeiten; ein ASCII-Schnellpfad SHALL den Fold überspringen.
4. THE Umlaute `ä ö ü` SHALL zu `a o u` gefaltet werden (wie Obsidian), NICHT zu `ae oe ue`.

### Requirement 2: Plugin-API

#### Acceptance Criteria

1. THE `prepareFuzzySearch` und `prepareSimpleSearch` in `obsidian-api-extensions.ts` und die Fallbacks in `fallback-shims.ts` SHALL akzent-unabhängig matchen.
2. THE zurückgegebenen `matches`-Bereiche SHALL sich auf den Originaltext beziehen.
3. THE `fuzzyMatchText` in `install-globals.ts` (Basis von `FuzzySuggestModal`) SHALL dieselbe Fold-Logik nutzen.

### Requirement 3: Slatebase-eigene Suchstellen

#### Acceptance Criteria

1. THE Quick Switcher (`QuickSwitcher.tsx` via `utils/fuzzyMatch.ts`) SHALL akzent-unabhängig matchen.
2. THE Link-Vorschläge (`editor/suggest/link-complete.ts`) SHALL akzent-unabhängig matchen.
3. THE Befehlspalette SHALL akzent-unabhängig matchen.
4. THE Filter in Backlinks, Outline und Bookmarks SHALL akzent-unabhängig matchen (soweit solche Filter existieren).
5. THE Bases-Suche SHALL akzent-unabhängig matchen.
6. THE Hervorhebung von Treffern SHALL die ursprünglichen Zeichen markieren.

### Requirement 4: Abgrenzung

#### Acceptance Criteria

1. THE Backend-Volltextsuche (Klartext, `file:` und die Text-Operatoren wie `line:`/`section:`) SHALL bei nicht-case-sensitiver Suche Akzente ignorieren; Treffer-Bereiche beziehen sich auf den Originaltext. Suchen & Ersetzen bleibt exakt (nur case-insensitiv), damit nichts unbeabsichtigt ersetzt wird.
2. THE Ranking-Verbesserungen und die „Relevanz“-Sortierung aus 1.15.1 SHALL nicht Teil dieses Specs sein.
