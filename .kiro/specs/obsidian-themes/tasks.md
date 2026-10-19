# Obsidian Themes (Stufe 1) — Tasks

Umsetzung in Phasen; jede Phase einzeln committbar und grün (tsc, lint, Tests). Branch: `obsidian-themes`
(vor dem ersten Commit `git branch --show-current` prüfen).

## Phase 0 — Spec
- [x] 0.1 Requirements, Design, Tasks committen

## Phase 1 — Zuordnung klären (nur Analyse + Test, kein Verhalten)
- [x] 1.4 Umbenennung `--text-muted` → `--text-subtle` in `index.css`, `App.css` und allen Komponenten als
      eigener Commit (nur Umbenennung, Test/Lint/tsc grün), danach Screenshot-Vergleich hell/dunkel
- [x] 1.1 Nutzung aller Slatebase-Tokens in `App.css`/Komponenten auflisten; Zuordnungstabelle im Design
      finalisieren (insb. `--bg-elevated`, `--text-*`-Stufen)
- [x] 1.2 Namenskollisionen (`--text-muted`, `--radius-xl`, `--status-bar-font-size`, `--canvas-color-*`,
      `--graph-node-unresolved`) einzeln auf gleiche Semantik prüfen; Abweichungen dokumentieren.
      Ergebnis (Computed Style im Browser, 2026-10-17): `obsidian-compat.css` gewinnt die Reihenfolge.
      Hell: `--text-muted` = `--text-secondary` = #475569 (gewollt war #64748b); Dunkel: beide #94a3b8
      (gewollt #7a8592) → die Stufen „sekundär" und „gedämpft" sind heute gleich. Ebenso überschrieben:
      `--graph-node-unresolved` (hell #64748b statt #94a3b8, dunkel #7a8088), `--canvas-color-1`
      (#dc2626 statt #fb464c/#e93147). Identisch: `--radius-xl` (12px), `--status-bar-font-size` (12px).
      Folge für 3.x/Umbenennung: Slatebases `--text-muted` in `index.css` ist faktisch toter Wert; die
      273 Verwendungsstellen sehen Obsidians Wert. Umbenennen in `--text-subtle` (o. ä.) stellt die
      beabsichtigte Stufe wieder her und **ändert das Aussehen** (heller) — bewusst entscheiden.
- [x] 1.3 Fehlende Variablen gegen die offizielle Referenz abgleichen (110 fehlend, davon ca. 60 echte; siehe Design §2)

## Phase 2 — Variablen-Lücken und Typografie
- [x] 2.1 Dokumentierte, rein abgeleitete Variablen als Aliase auf `body` in `obsidian-compat.css`
      (`--color-accent-hsl`, `--text-highlight-bg-rgb`, `--nav-parent-*`, `--bases-table-*`, `--dropdown-*`)
      + Test `obsidian-compat.derived.test.ts`. Bewusst nicht ergänzt: `--bases-cards-*`, `--component-title-*`,
      `--outline-heading-*` u. a. ohne belastbaren Standardwert (ein erfundener Wert hilft keinem Theme;
      Themes setzen sie selbst). Aliase stehen auf `body`, weil Themes dort überschreiben.
- [~] 2.2 verschoben nach 3.4: Die Obsidian-Standardwerte (`--h3-size` 1.37em usw.) weichen von Slatebases
      Editor-Werten ab (`.cm-lp-h3` 1.35em, h5/h6 1em/0.9em). Eine direkte Bindung im Basis-CSS würde das
      Aussehen ohne Theme ändern (verletzt R1.3). Die Bindung erfolgt deshalb nur unter dem Theme-Marker.

## Phase 3 — Token-Brücke
- [x] 3.1 `plugins/appearance/theme-bridge.css`: Brücke auf `body` hinter `:root[data-obsidian-theme]`,
      eingebunden in `main.tsx`. **Keine Literale nötig:** Compat-Variablen stehen auf `:root`, die Brücke auf
      `body`; dort ist die Obsidian-Variable der von `:root` geerbte, bereits aufgelöste Wert, es entsteht
      kein Zyklus. Nicht gebrückt: `--text-inverse` (Kontrast), semantische Farben.
- [x] 3.2 Test `theme-bridge.test.ts`: Zuordnung, Gate auf den Marker, keine Deklaration auf `:root`,
      Compat-Defaults (hell) = Slatebase-Werte, Überschriften-Variablen vorhanden
- [x] 3.3 Live-Check (Computed Style, Chromium): Mini-Theme + Marker ändert `--bg-base`, `--text-primary`,
      `--accent`, Schrift und Body-Hintergrund; Marker entfernen stellt alles wieder her
- [x] 3.4 Typografie unter dem Marker: `.cm-lp-h1…h6`, Bold/Italic, Editor-Schrift, Zeilenhöhe,
      `--file-line-width` (Breite 700px statt 800px, nur mit Theme)

## Phase 4 — Backend-Theme-Service (Vault-Dateien)
- [x] 4.1 Zugriff geklärt: `vault-authorization-middleware.ts` erzwingt Default-Deny für alle
      `/vaults/:vaultId/*`-Routen (GET = read, alles andere = write). Die Theme-Routen brauchen keine
      Ausnahme und keine eigene Prüfung: Import, Löschen und Auswählen verlangen Schreibzugriff.
      Git-Sync war bereits geklärt (Themes und `appearance.json` werden synchronisiert)
- [x] 4.2 `themes/types.ts`, `errors.ts`, `validation.ts` (ID, 2-MB-Limit, Manifest), Barrel
- [x] 4.3 `ThemeService`: list/load/save/delete unter `.obsidian/themes/`, `validateFilePath()`, atomare Writes
      mit Retries, Symlinks werden nie gefolgt (+ Tests: Traversal, Limits, Ordner ohne `theme.css`, Symlink)
- [x] 4.4 `appearance.json`: `getActiveThemeId`/`setActiveThemeId` unter Mutex + `writeJsonFileAtomic`;
      Tests: fremde Felder bleiben, ungültiges JSON wird nie überschrieben (409), Auswahl auf fehlendes Theme
- [x] 4.5 `externalHosts`-Erkennung (`@import`/`url()`, linear, Test mit Pathologie-Eingaben)
- [x] 4.6 `api/themeRoutes.ts` + Tests, manuelle DI in `src/index.ts` unter `/api/v1/vaults/:vaultId/themes`;
      Löschen des aktiven Themes setzt `cssTheme` zurück
- [x] 4.7 Schreibende Routen veröffentlichen `vault:change` (`.obsidian/appearance.json`,
      `.obsidian/themes/<id>/theme.css`) an alle Nutzer mit Zugriff außer dem Auslöser + Test

## Phase 5 — Frontend-Injection
- [x] 5.1 `plugins/appearance/theme-injector.ts` + Tests (ein Tag, Reihenfolge vor Snippets, Marker, 2-MB-Limit)
- [x] 5.2 API-Client: `listThemes`, `getActiveTheme`, `loadTheme`, `saveTheme`, `deleteTheme`, `setActiveTheme`
      (IDs URL-kodiert). Ein eigener `themeStore.ts` entfällt vorerst; die Aktionen für die UI (Import,
      Auswählen, Löschen) entstehen mit der Settings-UI in Phase 6
- [x] 5.3 `ThemeLifecycle.tsx` (in `App.tsx` neben `SnippetLifecycle`) + Tests: Anwenden beim Öffnen,
      Vault-Wechsel, Ladefehler behält das Theme, `THEME_NOT_FOUND` → Standard, veraltete Antworten werden verworfen
- [x] 5.4 `ThemeLifecycle` reagiert auf `vault:change` für `.obsidian/appearance.json` und `.obsidian/themes/**`
      (über `onRealtimeVaultChange`); andere Pfade/Vaults werden ignoriert (Test). Der Dateibaum lädt bei
      jedem `vault:change` neu, der Server liefert Dot-Pfade nicht aus; die RealtimeProvider-Meldung
      („X hat .obsidian/appearance.json geändert") bleibt als Hinweis an andere Nutzer bestehen

## Phase 6 — Settings-UI
- [x] 6.1 `ThemeManager.tsx`, `ThemesSection.tsx`, Registry-Eintrag `themes` (Kategorie Vault), Label in
      `settingsLabels.ts`. Abweichung von R5.1: Die Settings-Oberfläche nutzt durchgehend feste deutsche
      Texte (`SECTION_LABELS`, `CssSnippetsSection`), nicht `de.ts`/`en.ts`; die neue Sektion folgt diesem Muster
- [x] 6.2 Import (Datei-Auswahl, Drag & Drop; Name aus `manifest.json` oder Dateiname, Rückfrage vor
      Überschreiben), Auswahl per Radio mit lokalem Sofort-Effekt (das `vault:change`-Event schließt den
      Auslöser aus), Löschen mit Bestätigung, Hinweis zu `externalHosts`. Helfer in `themeImport.ts`
- [x] 6.3 Tests: `themeImport.test.ts`, `ThemeManager.test.tsx`, `ThemeManager.a11y.test.tsx` (axe fand ein
      verschachteltes interaktives Element, behoben). Dialoge nutzen `ConfirmModal` (bringt den Fokus-Trap mit).
      Settings-Suite: 13 Dateien, 150 Tests grün

## Phase 7 — Abnahme und Doku
- [x] 7.1 Manuelle Abnahme (isolierte Instanz, frischer Datenordner, Welcome-Vault mit `.obsidian/themes/Things`
      und `Minimal`, Chromium): Die Themes-Sektion listet beide Themes aus den Vault-Dateien; Auswahl schreibt
      `{"cssTheme": "Things"}` nach `.obsidian/appearance.json` und wirkt sofort. Die Abnahme deckte zwei Lücken auf,
      beide behoben (`theme-bridge.css` + Tests):
      1. Things setzt nur die Basis-Skala (`--color-base-*`) und `--color-accent`; Obsidian leitet daraus
         `--background-primary`, `--text-normal` usw. ab. Unsere Compat-Datei hat dafür feste Werte, und ihre
         `--color-base-*` sind eine andere (für Plugins abgestimmte) Skala. Jetzt gilt unter einem Theme Obsidians
         dokumentierte Basis-Skala (hell/dunkel, aus der offiziellen Referenz) mit der Ableitung der semantischen
         Variablen, alles in `:where()` (Spezifität 0), damit jede Theme-Regel gewinnt. Das Akzent-Default bleibt bei
         Slatebase, solange das Theme keinen eigenen setzt.
      2. Slatebase-eigene Panel-Tokens (`--sidebar-bg`, `--right-panel-bg`, `--status-bar-bg` …) und die Editorfläche
         (`--bg-elevated`) folgten dem Theme nicht. Jetzt gebrückt; der Editor nutzt unter einem Theme den primären
         Hintergrund wie in Obsidian.
      Ergebnis nach den Korrekturen: Things (hell + dunkel) färbt Seitenleisten, Hauptfläche, Statusleiste, Akzent,
      Text und Überschriften um; Minimal wird wie erwartet teilweise umgesetzt (Schrift, Überschriften, Farben; Layout
      bleibt Slatebases). Offen/bewusst: Buttons (`--interactive-normal/-hover`), Tab-Leiste und semantische Farben
      bleiben bei Slatebase.
- [x] 7.2 Doku: Welcome-Vault-Seite `Features/Themes` (DE + EN) mit Verlinkung in Übersicht/Einstellungen,
      README (Feature-Zeile + Themes-API), `VAULT-ROUTE-AUTHORIZATION.md` (Nachtrag), `structure.md`,
      `AGENTS.md` (Abschnitt „Themes"). Grenzen (Struktur-Selektoren, Style Settings) stehen auf der Themes-Seite
- [x] 7.4 Code-Review (`/code-review`): neun Punkte, alle behoben (Tests ergänzt):
      (1) Löschen prüft die Existenz per `themeExists` (Stat) statt `loadTheme`, ein Theme über dem Limit bleibt
      löschbar; (2) die UI rollt die Auswahl nur zurück, wenn das Speichern scheitert, nicht wenn nur das lokale
      Anwenden scheitert; (3) `deleteTheme` löscht erst den Ordner, setzt dann die Auswahl zurück, beides unter dem
      Mutex, und fasst eine ungültige `appearance.json` nie an; (4) `ThemeLifecycle` entfernt das Theme nur bei
      Vault-Wechsel, nicht bei geändertem `apiClient`; (5) IDs wie „Active" werden beim Import umbenannt
      (`Active-theme`); (6) Namensvergleich ohne Groß-/Kleinschreibung (Überschreiben statt Kollision, Backend und
      UI), reservierte Windows-Namen (`CON`, `NUL`, `COM1`, …) sind ungültig; (7) Manifest und CSS werden
      zusammen gestaged und direkt nacheinander umbenannt, ein Fehler hinterlässt das alte Theme intakt;
      (8) `listThemes` liest parallel und cached die Hosts nach Pfad + mtime + Größe; (9) das Löschen meldet
      `appearance.json` nur noch, wenn das gelöschte Theme aktiv war.
      Bewusst nicht behoben: Theme-CSS gilt ungescoped für alle Nutzer des Vaults (wie Snippets, bei Themes ist
      Schreibzugriff nötig). Eine CSP-Einschränkung für `url()`/`@import` ist ein eigenes Thema.
- [ ] 7.3 `test:coverage` und `lint` in beiden Paketen; Coverage-Schwellen ggf. anheben, nie senken

## Entscheidungen
- Themes liegen im Vault unter `.obsidian/themes/`, die Auswahl in `.obsidian/appearance.json` (`cssTheme`)
  und gilt vault-weit (Vorgabe von Andreas, 2026-10-17; ersetzt den früheren Entwurf mit
  `data/themes/` und `vaultSettingsStore`).

- Schreibrechte für Themes: Schreibzugriff auf den Vault; Lesen mit Lesezugriff (Wirkung auf alle Nutzer).
- Live-Aktualisierung: bestehendes `vault:change`-Event mit Dot-Pfaden, kein neuer Event-Typ.
- Git-Sync: Themes und `appearance.json` werden synchronisiert (geprüft in `sync-engine.ts`).

- Namenskollisionen (`--text-muted`, `--radius-xl`, `--status-bar-font-size`, `--canvas-color-*`,
  `--graph-node-unresolved`): hat eine Variable in Slatebase eine andere Bedeutung als in Obsidian, wird der
  **Slatebase-Token umbenannt**; die Obsidian-Variable behält ihre Obsidian-Bedeutung und bleibt anbindbar.
  Bei gleicher Bedeutung (z. B. `--radius-xl: 12px`) bleibt der Name. Entschieden 2026-10-17.
  Vorbefund aus Phase 1: Die Compat-Datei definiert `--text-muted` (#475569 hell) bereits mit
  Obsidian-Bedeutung (= unser `--text-secondary`), Slatebases `index.css` meint dagegen #64748b. Welche
  Definition in der UI heute gewinnt, hängt von der CSS-Reihenfolge ab und wird in 1.2/3.3 im Browser
  (Computed Style) geprüft, bevor umbenannt wird.

- `--text-muted` (entschieden 2026-10-17): Slatebases Token wird in `--text-subtle` umbenannt (alle ca. 273
  Verwendungsstellen, reine Umbenennung, vorab in einem eigenen Commit). `--text-muted` gehört danach allein
  Obsidian (Compat-Datei). Das macht die beabsichtigte Abstufung wieder sichtbar: gedämpfter Text wird
  ohne Theme etwas heller als heute (#64748b hell / #7a8592 dunkel statt #475569 / #94a3b8). Das ist die
  **einzige gewollte visuelle Änderung ohne Theme**, Ausnahme von R1.3; in der PR mit Screenshots belegen.
  Brücke: `--text-secondary` ← `--text-muted`, `--text-subtle` ← `--text-faint`.

## Offene Entscheidungen
- Stufe 2 (Klassen-Aliase) als eigene Spec `obsidian-themes-structure`, sobald Stufe 1 gemessen wurde.
