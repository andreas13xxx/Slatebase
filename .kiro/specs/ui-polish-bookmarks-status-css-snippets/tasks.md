# Implementation Plan: UI-Politur — Bookmarks, Statusleiste, CSS-Snippets

## Overview

Implementierung dreier additiver UI-Verbesserungen: manuelle Sortierung/Kontextmenü/Labels für Favoriten, neue eingebaute Statusleisten-Items mit granularer Sichtbarkeit und Diffing-Rendering, sowie ein komplett neues CSS-Snippet-Feature (Frontend-Store, globaler Injector, Settings-UI, Backend-Persistenz). TypeScript durchgehend (Frontend: React/Vite, Backend: Hono/Node.js).

## Tasks

- [x] 1. Favoriten — Datenmodell-Erweiterung
  - [x] 1.1 Erweitere `FavoriteEntry` um `order` und `label`, implementiere Lazy-Migration
    - `frontend/src/state/favoritesStore.ts`: Felder `order: number`, `label?: string` ergänzt (plus `id: string`, siehe Abweichung unten)
    - `loadFavorites()`: fehlende `order`-Werte einmalig nach `addedAt` absteigend zuweisen (idempotent) — `migrateEntries()`
    - `getForVault()`: Sortierung auf `order` aufsteigend umgestellt
    - `add()`: neuen Eintrag mit `order = max(order) + 1` angehängt
    - Neue Funktionen `reorder(vaultId, id, newIndex)` und `setLabel(vaultId, id, label)` (Abweichung: `id` statt `path` als Schlüssel, siehe unten)
    - **Abweichung vom Design:** Ein `id: string`-Feld wurde zusätzlich eingeführt (nicht im ursprünglichen Design). Grund: Sobald mehrere Bookmark-Typen denselben `path` teilen können (Datei- + Überschriften-Bookmark auf derselben Datei) oder `path` leer ist (Suche), ist `path` keine eindeutige Kennung mehr. `reorder`/`setLabel`/neues `removeById` nutzen deshalb `id` statt `path`. `remove(vaultId, path)` bleibt path-basiert, wirkt aber jetzt nur noch auf `type==='file'`-Einträge; `removeByPath`/`updatePath` wirken weiterhin auf alle Typen mit passendem Pfad (Datei-Umbenennung/-Löschung betrifft auch zugehörige Heading-/Block-Bookmarks).
    - _Requirements: 1.1, 1.3, 1.4, 1.5, 3.1, 3.3, 3.4_

  - [x] 1.2 Aktualisiere Backend-Persistenzschema für Favoriten
    - `backend/src/preferences/types.ts`, `validation.ts`: `id`, `order`, `label`, `type`, `heading`, `blockId`, `searchQuery`, `searchCaseSensitive`, `searchRegex` als optionale Felder im Zod-Schema ergänzt (passthrough für Rückwärtskompatibilität); `path` erlaubt jetzt Leerstring (Suche)
    - `frontend/src/api/index.ts`: `FavoriteEntry`/`BookmarkType` entsprechend erweitert
    - _Requirements: 1.1, 3.1_

- [x] 2. Checkpoint - Ensure all tests pass
  - Backend 1228/1228, Frontend (zu diesem Zeitpunkt) grün.

- [x] 3. Favoriten — Drag-and-Drop-Neuordnen
  - [x] 3.1 Implementiere Drag-and-Drop in `FavoritesView.tsx`
    - HTML5-Drag-Events (dragStart/dragOver/drop/dragEnd)
    - Einfüge-Markierung (`favorites-view__item--drop-before`) an Zielposition während Drag
    - Drop außerhalb der Liste (`dragEnd` ohne vorherigen `drop`) ändert den Store nicht; Escape schließt keinen eigenen Fokus-Trap (native HTML5-DnD kennt keinen Escape-Hook) — kein Store-Write ohne `drop`-Event
    - Ruft `favoritesStore.reorder()` bei erfolgreichem Drop
    - _Requirements: 1.2, 1.6, 1.7_

- [x] 4. Favoriten — Kontextmenü und Labels
  - [x] 4.1 Kontextmenü für Favoriten-Einträge
    - **Abweichung vom Design:** Kein separates `BookmarkContextMenu.tsx` — stattdessen wird die bestehende generische `components/ContextMenu.tsx` (Portal, Tastaturnavigation, Escape/Außenklick bereits vorhanden) direkt aus `FavoritesView.tsx` mit pro-Typ zusammengestellten Items verwendet. Funktional deckungsgleich mit Requirement 2, weniger Code-Duplikation.
    - Optionen: "Aus Favoriten entfernen", "Im Datei-Explorer anzeigen" (nicht bei `type==='search'`), "Umbenennen"
    - Öffnen via Rechtsklick und Kontextmenü-Taste/Shift+F10 auf fokussiertem Eintrag
    - Schließen bei Außenklick/Escape ohne Aktion (von `ContextMenu.tsx` geerbt)
    - **Nicht umgesetzt:** "Fehlend"-Zustand (Requirement 2.5) — erfordert Abgleich gegen den DirectoryTree, den `FavoritesView` aktuell nicht erhält. Ausstehend, siehe Notes.
    - _Requirements: 2.1, 2.2, 2.4, 2.6 (2.5 offen)_

  - [x] 4.2 Verdrahte "Im Datei-Explorer anzeigen"
    - Nutzt das bestehende Event `slatebase:reveal-file` (bereits von `FileExplorer.tsx`/`App.tsx` konsumiert) plus `SidebarPanelContext`s `SET_ACTIVE_VIEW`, um die Sektion, die aktuell "favorites" zeigt, auf "explorer" umzuschalten
    - _Requirements: 2.3_

  - [x] 4.3 Implementiere Inline-Umbenennen (Label-Editor)
    - Wiederverwendet die bestehende `InlineInput`-Komponente statt eines neuen Eingabefelds
    - Enter bestätigt, Escape bricht ab; Reset auf Standard-Anzeigetext löscht `label`
    - `FavoritesView.tsx` zeigt `label ?? typspezifischer Default`, Tooltip bleibt Pfad/Suchanfrage
    - **Bekannte Abweichung:** `InlineInput` behandelt eine komplett geleerte Eingabe als Abbruch (nicht als Bestätigung mit leerem Wert) — das "leer lassen löscht Label"-Szenario aus Requirement 3.4 wird dadurch nicht separat abgedeckt (nur "auf Originalnamen zurücksetzen" löscht das Label). Nicht in `FileExplorer.tsx`s eigener Favoriten-Sektion verdrahtet (siehe Notes).
    - _Requirements: 3.2, 3.3, 3.5, 3.6 (3.4 teilweise)_

- [x] 5. Checkpoint - Ensure all tests pass
  - Frontend 2096/2096 (nach Abschluss aller unten stehenden Tasks).

- [x] 5a. Bookmarks — Nicht-Datei-Bookmark-Typen (Überschrift, Block, Suche, alle Tabs)
  - [x] 5a.1 Erweitere `FavoriteEntry` um `BookmarkType` und typspezifische Felder
    - `frontend/src/state/favoritesStore.ts`: `type?: BookmarkType`, `heading?`, `blockId?`, `searchQuery?`, `searchCaseSensitive?`, `searchRegex?`
    - Neue Methoden `addHeadingBookmark()`, `addBlockBookmark()`, `addSearchBookmark()` (gleicher 50er-Cap, gleiche `order`-Vergabe wie `add()`)
    - Fehlendes `type`-Feld bei bestehenden Einträgen wird überall als `'file'` interpretiert (keine Backend-Migration nötig)
    - _Requirements: 11.1, 12.1, 13.1_

  - [x] 5a.2 Implementiere `bookmarkCurrentHeading` und `bookmarkCurrentSearch` Handler
    - `frontend/src/plugins/compat/core-commands-app.ts`: Überschrift vor Cursor via einfachem Zeilen-Rückwärtsscan (`/^#{1,6}\s+(.+?)\s*#*$/`) statt `syntaxTree`-Wrapper ermittelt — robuster/einfacher testbar, ohne Lezer-Markdown-Grammatik-Details zu benötigen
    - `CoreAppCommandHandlers` um `searchQuery`/`searchCaseSensitive`/`searchRegex` erweitert; `CommandPaletteContainer.tsx` speist sie aus `useSearchContext()`
    - Fehlerfall (keine Überschrift/keine Suchanfrage) → `showToast('error', …)`, kein Eintrag
    - Verdrahtung der No-Op-Commands `bookmarks:bookmark-current-heading`/`bookmarks:bookmark-current-search` in `core-commands-app.ts` auf die neuen Handler
    - _Requirements: 11.1, 11.2, 13.1, 13.2_

  - [x] 5a.3 Implementiere `bookmarkCurrentBlock` Handler
    - Prüft letzte Zeile des Absatzes (zusammenhängende nicht-leere Zeilen) unter Cursor auf lokal definierten `BLOCK_MARKER_REGEX` (Duplikat des unexportierten Regex aus `plugins/block-ref/marker-parser.ts`); fehlt er, generiert eine mit vorhandenen `^id`-Markern im Dokument kollisionsfreie ID, fügt `" ^<id>"` per CM6-Transaktion ein, danach Bookmark
    - Kein aktiver Editor-Tab → No-Op ohne Fehleranzeige
    - Verdrahtung `bookmarks:bookmark-current-section` in `core-commands-app.ts`
    - _Requirements: 12.1, 12.2, 12.4_

  - [x] 5a.4 Implementiere `bookmarkAllTabs` Handler
    - Iteriert `TabState.tabs`, filtert auf Datei-Tabs (schließt `__view::*`-Plugin-Tabs und `__graph__` aus), ruft `favoritesStore.add()` je noch nicht favorisiertem Tab bis zum 50er-Cap
    - Alle Tabs bereits favorisiert → Hinweis-Toast, keine neuen Einträge
    - Limit erreicht → Hinweis-Toast mit Anzahl hinzugefügter Tabs, Rest wird ausgelassen
    - Verdrahtung `bookmarks:bookmark-all-tabs` in `core-commands-app.ts`
    - _Requirements: 14.1, 14.2, 14.3, 14.4_

  - [x] 5a.5 Klick-Resolution und Darstellung pro Bookmark-Typ in `FavoritesView.tsx`
    - Klick-Resolution: file/heading/block → `onOpenFile()`, search → `onOpenSearch()` (optionaler Override-Prop) mit funktionierendem Default: ohne Override dispatcht `FavoritesView` selbst `SET_QUERY`/`SET_OPTION` auf `SearchContext`, das bestehende `slatebase:open-search`-Event und `performSearch()` — kein `SidebarPanel.tsx`-Durchreichen nötig
    - Eigene Icons je Typ (Heading/Hash/Search-Icons aus lucide-react)
    - **Nicht umgesetzt:** Scroll-zu-Überschrift/-Block beim Öffnen und "nicht gefunden"-Markierung (Requirements 11.4, 12.5) — erfordert eine programmatische Scroll-Ziel-API des Editors, die aktuell nur für gerenderte Links existiert
    - _Requirements: 11.3, 11.5 (teilweise), 12.3, 13.3, 13.4 (11.4, 12.5 offen)_

- [x] 6. Statusleiste — Neue Hooks für Wortstatistik und Cursor-Position
  - [x] 6.1 Implementiere `useWordStats` Hook
    - **Abweichung vom Design:** Statt der im Design skizzierten Parameter-Signatur `useWordStats(activeFileContent, selection)` pollt der Hook `getActiveEditorView()` (aus `editor/plugin-extensions.ts`) intern alle 300ms — es gibt keinen reaktiven Content-/Selection-Stream, den `StatusBar.tsx` sonst anzapfen könnte, ohne die CM6-Extension-Pipeline zu erweitern. Erfüllt Requirements 4.1–4.6 unverändert.
    - Wortzählung (Whitespace-getrennt, Markdown-Steuerzeichen `#*_\`[]` ignoriert), Zeichenzählung (Rohlänge)
    - Selektions-Wort-/Zeichenzahl, `null` wenn keine Selektion
    - _Requirements: 4.1, 4.2, 4.3, 4.5, 4.6_

  - [x] 6.2 Implementiere `useCursorPosition` Hook
    - Gleiche Polling-Abweichung wie 6.1 (100ms statt reaktivem Stream)
    - Liefert 1-indizierte Zeile/Spalte, zählt betroffene Zeilen bei Mehrzeilen-Selektion
    - Zusätzlich: `goToLine()`-Hilfsfunktion für Task 9.2
    - _Requirements: 5.1, 5.2, 5.3_

- [x] 7. Statusleiste — Granulare Item-Sichtbarkeit
  - [x] 7.1 Implementiere `useStatusBarItemVisibility` Hook
    - `frontend/src/hooks/useStatusBarItemVisibility.ts`, localStorage-Schlüssel `slatebase:statusBarItem:<itemId>`, Default `true`
    - _Requirements: 6.1, 6.5_

  - [x] 7.2 Erweitere `AppearanceSection.tsx` um Item-Toggles
    - Vier neue Checkbox-Zeilen (Uhr, Vault-Name, Wortanzahl, Cursor-Position) unterhalb des bestehenden globalen Toggles
    - _Requirements: 6.1_

- [x] 8. Checkpoint - Ensure all tests pass

- [x] 9. Statusleiste — Neue eingebaute Items und Diffing-Fix
  - [x] 9.1 Rendere neue Items in `StatusBar.tsx`
    - Vault-Name-Item (aus `useAppContext()`), Wortanzahl-Item, Cursor-Position-Item, jeweils gated durch `useStatusBarItemVisibility`
    - _Requirements: 4.1, 4.4, 5.1, 6.2, 6.3, 6.4, 6.6_

  - [x] 9.2 Implementiere "Gehe zu Zeile"-Dialog
    - Popover statt Modal, Klemmen auf 1..letzte Zeile via `goToLine()`
    - _Requirements: 5.4, 5.5_

  - [x] 9.3 Ersetze Remount durch Diffing in `StatusBar.tsx`
    - `syncPluginItems()`: nur entfernte/hinzugefügte Elemente anpassen, kein `container.innerHTML = ''`
    - _Requirements: 7.1, 7.2, 7.3_

- [x] 10. Checkpoint - Ensure all tests pass

- [x] 11. CSS-Snippets — Backend-Grundlagen
  - [x] 11.1 Implementiere `SnippetStore` (Backend)
    - `backend/src/snippets/snippet-store.ts`, Speicherung unter `data/snippets/<vaultId>/<snippetId>.css` + `_registry.json`, atomare Writes
    - _Requirements: 8.4, 9.3, 10.1, 10.2, 10.5_

  - [x] 11.2 Backend-Fehlerklassen und Validierungsschemas
    - `backend/src/snippets/errors.ts`, `validation.ts`, `index.ts`
    - _Requirements: 8.4, 8.7, 10.3, 10.6_

  - [x] 11.3 Snippet-API-Routen
    - `backend/src/api/snippetRoutes.ts`
    - _Requirements: 8.2, 8.4, 8.6, 8.7, 9.3, 10.3, 10.4, 10.6_

- [x] 12. Checkpoint - Ensure all tests pass

- [x] 13. CSS-Snippets — Backend-Integration
  - [x] 13.1 SnippetStore + Routen in Composition Root, Vault-Löschungs-Hook
    - _Requirements: 10.4, 10.5_

- [x] 14. CSS-Snippets — Frontend-Store und Injector
  - [x] 14.1 `IApiClient` um Snippet-Endpunkte erweitert
    - _Requirements: 8.2, 8.4, 9.3_

  - [x] 14.2 `snippetStore.ts` (Frontend)
    - **Abweichung vom Design:** Standalone Action-Creator-Funktionen `(apiClient, vaultId, ...)` statt eines Moduls mit verstecktem `initialize(apiClient)`-Singleton-State (wie `favoritesStore.ts`) — Snippets werden nur von einer Stelle (Settings) verwaltet, ein globaler Singleton hätte keinen Mehrwert geboten. `create()` statt `upload()`/`createEmpty()` (identische Semantik, ein Name).
    - _Requirements: 8.2, 8.3, 8.4, 8.7_

  - [x] 14.3 `SnippetInjector`
    - `frontend/src/plugins/appearance/snippet-injector.ts`, unscoped Injection
    - _Requirements: 9.1, 9.2, 9.6, 9.7_

- [x] 15. Checkpoint - Ensure all tests pass

- [x] 16. CSS-Snippets — Settings-UI
  - [x] 16.1 `SnippetManager` UI-Komponente
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.6, 8.8_

  - [x] 16.2 `SnippetEditorModal`
    - _Requirements: 8.3, 8.5_

  - [x] 16.3 `SnippetManager` in `AppearanceSection.tsx` verdrahtet
    - _Requirements: 8.1_

- [x] 17. CSS-Snippets — Anwendung beim Vault-Öffnen und -Wechsel
  - [x] 17.1 Neue Komponente `SnippetLifecycle.tsx`, in `App.tsx` neben `StatusBar` gemountet (minimal-invasiver Eingriff in eine zu dieser Zeit ebenfalls parallel bearbeitete Datei — nur Import + eine JSX-Zeile)
    - _Requirements: 9.4, 9.5_

- [x] 18. Final Checkpoint - Ensure all tests pass
  - Backend: 69 Testdateien / 1228 Tests grün. Frontend: 137 Testdateien / 2096 Tests grün (14 skipped, bereits vor dieser Session übersprungen). `tsc --noEmit` fehlerfrei in beiden Paketen.

## Notes

- Jede Aufgabe referenziert konkrete Requirements zur Nachverfolgbarkeit
- Checkpoints stellen inkrementelle Validierung sicher
- Bestehende Datenstrukturen werden additiv erweitert, keine Breaking Changes an `IApiClient.saveFavorites`/`getFavorites`
- CSS-Snippets nutzen ausschließlich Dateisystem-Persistenz (kein neues DB-Schema)

### Offene Punkte (Stand nach dieser Implementierungs-Session)

- **Requirement 2.5 ("fehlend"-Zustand)**: `FavoritesView.tsx` erhält aktuell keinen `DirectoryTree`, um zu prüfen, ob eine favorisierte Datei noch existiert. Nachrüstbar durch Übergabe des Trees als Prop von `SidebarPanel.tsx`.
- **Requirement 3.4 (leeres Label löscht)**: `InlineInput` behandelt eine komplett geleerte Eingabe als Abbruch statt als Bestätigung — nur "auf Originalnamen zurücksetzen" löscht das Label zuverlässig, nicht "Feld leeren + Enter".
- **Requirements 11.4/12.5 (Scroll-zu-Anker, "nicht gefunden")**: Setzt eine programmatische Scroll-Ziel-API des Editors voraus, die es aktuell nur für innerhalb des Dokuments gerenderte Links gibt.
- **`FileExplorer.tsx`s eigene Favoriten-Sektion** (Sterne im Dateibaum, separat von der `FavoritesView`-Sidebar-Tab) sortiert weiterhin nicht nach `order` und hat kein Kontextmenü/Label-UI erhalten — bewusst nicht angefasst, da die Datei während dieser Session parallel bearbeitet wurde.
- ~~`onOpenSearch`-Prop von `FavoritesView` ist neu und optional; `SidebarPanel.tsx` reicht ihn noch nicht durch~~ — behoben: `FavoritesView` hat jetzt einen funktionierenden Default (dispatcht direkt auf `SearchContext` + `slatebase:open-search`-Event + `performSearch()`), kein Durchreichen durch `SidebarPanel.tsx` mehr nötig.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["3.1"] },
    { "id": 2, "tasks": ["4.1"] },
    { "id": 3, "tasks": ["4.2", "4.3"] },
    { "id": "3a", "tasks": ["5a.1"] },
    { "id": "3b", "tasks": ["5a.2", "5a.3", "5a.4"] },
    { "id": "3c", "tasks": ["5a.5"] },
    { "id": 4, "tasks": ["6.1", "6.2"] },
    { "id": 5, "tasks": ["7.1"] },
    { "id": 6, "tasks": ["7.2"] },
    { "id": 7, "tasks": ["9.1"] },
    { "id": 8, "tasks": ["9.2", "9.3"] },
    { "id": 9, "tasks": ["11.1"] },
    { "id": 10, "tasks": ["11.2"] },
    { "id": 11, "tasks": ["11.3"] },
    { "id": 12, "tasks": ["13.1"] },
    { "id": 13, "tasks": ["14.1"] },
    { "id": 14, "tasks": ["14.2"] },
    { "id": 15, "tasks": ["14.3"] },
    { "id": 16, "tasks": ["16.1"] },
    { "id": 17, "tasks": ["16.2", "16.3"] },
    { "id": 18, "tasks": ["17.1"] }
  ]
}
```
