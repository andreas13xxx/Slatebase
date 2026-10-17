# Obsidian Themes (Stufe 1) — Tasks

Umsetzung in Phasen; jede Phase einzeln committbar und grün (tsc, lint, Tests). Branch: `obsidian-themes`
(vor dem ersten Commit `git branch --show-current` prüfen).

## Phase 0 — Spec
- [ ] 0.1 Requirements, Design, Tasks committen

## Phase 1 — Zuordnung klären (nur Analyse + Test, kein Verhalten)
- [ ] 1.4 Umbenennung `--text-muted` → `--text-subtle` in `index.css`, `App.css` und allen Komponenten als
      eigener Commit (nur Umbenennung, Test/Lint/tsc grün), danach Screenshot-Vergleich hell/dunkel
- [ ] 1.1 Nutzung aller Slatebase-Tokens in `App.css`/Komponenten auflisten; Zuordnungstabelle im Design
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
- [ ] 2.1 Dokumentierte fehlende Variablen in `obsidian-compat.css` ergänzen (+ Test: Liste vorhanden)
- [ ] 2.2 Editor/Leseansicht: `--font-text`, `--h1…h6-*`, `--line-height-normal`, `--file-line-width`,
      `--bold-*`, `--italic-*` mit `var(--x, <alter Wert>)` anbinden (kein sichtbarer Unterschied ohne Theme)

## Phase 3 — Token-Brücke
- [ ] 3.1 `plugins/appearance/theme-bridge.css` (Literale + Brücke, nur mit `[data-obsidian-theme]`)
- [ ] 3.2 Paritäts-Test: Literale = aufgelöste Compat-Werte (Hell/Dunkel); Snapshot der `index.css`-Tokens
- [ ] 3.3 Sichtprüfung der Kollisionsvariablen in Hell/Dunkel mit einem Test-Theme

## Phase 4 — Backend-Theme-Service (Vault-Dateien)
- [ ] 4.1 Passende `IVaultAccessControl`-Methode für den Schreibzugriff bestimmen (Vorbild:
      Datei-Schreibrouten/`snippetRoutes.ts`). Git-Sync ist geklärt: Themes und `appearance.json` werden
      synchronisiert, kein Eingriff nötig
- [ ] 4.2 `themes/types.ts`, `errors.ts`, `validation.ts` (ID, 2-MB-Limit, Manifest), Barrel
- [ ] 4.3 `ThemeService`: list/load/save/delete unter `.obsidian/themes/`, `validateFilePath()`, atomare
      Writes mit Retries + Tests (Traversal, Limits, Ordner ohne `theme.css`)
- [ ] 4.4 `appearance.json`: `getActiveThemeId`/`setActiveThemeId` mit Mutex + `json-file-store`; Tests:
      fremde Felder bleiben, ungültiges JSON wird nie überschrieben, EPERM-Retry, Auswahl auf fehlendes Theme
- [ ] 4.5 `externalHosts`-Erkennung + Tests (inkl. Pathologie-/ReDoS-Eingaben)
- [ ] 4.6 `themeRoutes.ts` + Tests (Lesen/Schreiben je nach Zugriff, 403 ohne Schreibrecht), manuelle DI in
      `src/index.ts`; Löschen des aktiven Themes setzt `cssTheme` zurück
- [ ] 4.7 Schreibende Routen veröffentlichen `vault:change` (ohne auslösenden Nutzer) + Test

## Phase 5 — Frontend-Injection
- [ ] 5.1 `theme-injector.ts` + Tests (Reihenfolge vor Snippets, Marker, Entfernen)
- [ ] 5.2 `themeStore.ts` + API-Client-Methoden (`IApiClient` erweitern, Mocks nachziehen)
- [ ] 5.3 `ThemeLifecycle.tsx` + Tests (Vault-Wechsel, Ladefehler behält Theme, 404 → Standard)
- [ ] 5.4 `ThemeLifecycle` reagiert auf `vault:change` für `.obsidian/appearance.json` und
      `.obsidian/themes/**` (R4.5); Test, dass Dot-Pfade den Dateibaum nicht verändern

## Phase 6 — Settings-UI
- [ ] 6.1 `ThemeManager.tsx`, `ThemesSection.tsx`, Registry-Eintrag, `de.ts`/`en.ts`
- [ ] 6.2 Import (Datei-Auswahl, Drag & Drop), Löschen mit Bestätigung, Hinweis zu `externalHosts`
- [ ] 6.3 `*.test.tsx` und `*.a11y.test.tsx`, `useFocusTrap` in Dialogen

## Phase 7 — Abnahme und Doku
- [ ] 7.1 Manuelle Abnahme mit Things und Minimal (Hell/Dunkel), Screenshots vorher/nachher
- [ ] 7.2 README/Docs, Welcome-Vault-Hinweis, bekannte Grenzen dokumentieren
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
