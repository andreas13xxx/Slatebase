# Obsidian Themes (Stufe 1) — Design

## Überblick

```
Settings „Themes"  ──►  themeStore (API)  ──►  /vaults/:id/themes  ──►  <vault>/.obsidian/themes/<id>/…
       │                                                         └──►  <vault>/.obsidian/appearance.json (cssTheme)
       ▼
GET /themes/active ──► ThemeLifecycle ──► ThemeInjector ──► <style data-slatebase-theme>
                                                             │
                                                             └──► <html data-obsidian-theme>  (aktiviert die Token-Brücke)
```

Reihenfolge im Dokument: `index.css`/`App.css` < Compat-CSS < **Theme** < Snippets.

## 1. Token-Brücke

### Problem
Light-Mode: `--background-primary: #f8fafc` (fester Wert). Dark-Mode: `--background-primary:
var(--bg-base)`. Die UI liest `--bg-base`. Eine Brücke `--bg-base: var(--background-primary)` würde im
Dark-Mode einen **Zyklus** bilden (ungültig → `unset`), und auf `:root` deklariert sähe sie keine Werte,
die ein Theme auf `body`/`.theme-dark` setzt (Custom Properties lösen am Element auf, an dem sie
deklariert sind).

### Lösung (Stand Phase 3)
Neue Datei `plugins/appearance/theme-bridge.css`, nur wirksam bei gesetztem Marker `data-obsidian-theme`
am `<html>`; die Slatebase-Tokens werden auf **`body`** von den Obsidian-Variablen abgeleitet:

```css
:root[data-obsidian-theme] body { --bg-base: var(--background-primary); /* … siehe Tabelle … */ }
```

- **Kein Zyklus, keine Literale:** Die Compat-Variablen stehen auf `:root`
  (dunkel z. B. `--background-primary: var(--bg-base)`), die Brücke steht auf `body`. Dort ist
  `--background-primary` der von `:root` geerbte, bereits aufgelöste Wert, solange das Theme ihn nicht
  auf `body` überschreibt. `--bg-base` verweist also nie auf sich selbst. (Der ursprüngliche Entwurf mit
  duplizierten Literalen ist damit überflüssig.)
- Themes setzen ihre Werte auf `body`/`.theme-*`; die Brücke liest sie dort, weil sie ebenfalls auf `body` liegt.
- Ohne Marker ändert sich nichts. Test: jeder Selektor der Datei beginnt mit `:root[data-obsidian-theme]`.
- Hell sind die Compat-Defaults identisch zu Slatebases Werten (Test); dunkel lösen sie über `var()` auf
  dieselben Tokens auf. Kleine Abweichungen nur bei `--bg-overlay`, `--border-strong`, `--text-subtle` (dunkel).
- **Basis-Skala und Ableitung (aus der Abnahme):** Themes wie Things setzen nur `--color-base-*` und
  `--color-accent` und verlassen sich darauf, dass Obsidian `--background-primary`, `--text-normal` usw. daraus
  ableitet. Unter dem Marker gilt deshalb Obsidians dokumentierte Basis-Skala (hell/dunkel) und die Ableitung
  `--background-primary ← base-00`, `-primary-alt ← base-10`, `--background-secondary ← base-20`,
  `--text-normal ← base-100`, `--text-muted ← base-70`, `--text-faint ← base-50`, Rahmen ← base-30/35/40,
  Akzent ← `--color-accent`. Alles in `:where()`: Spezifität 0, ein Theme-Selektor für `body`/`.theme-*` gewinnt immer.
- **Panel-Tokens:** `--sidebar-*`, `--right-panel-*`, `--status-bar-*` folgen `--background-secondary`,
  `--background-modifier-border`, `--text-*`; die Editorfläche (`.cm-editor`) nutzt unter einem Theme
  `--background-primary` statt `--bg-elevated`.
- **Nicht gebrückt:** `--text-inverse` (Slatebase nutzt dunkel dunkle Schrift auf hellem Akzent, Obsidians
  `--text-on-accent` ist weiß) und semantische Farben.
- Typografie (Überschriften, Bold/Italic, Editor-Schrift, Zeilenhöhe, `--file-line-width`) ist ebenfalls
  nur unter dem Marker gebunden, weil Obsidians Standardgrößen von Slatebases abweichen.

### Zuordnung (Entwurf — in Phase 1 gegen die tatsächliche Nutzung in `App.css` verifizieren)

| Slatebase-Token | Obsidian-Variable |
|---|---|
| `--bg-base` | `--background-primary` |
| `--bg-surface` | `--background-secondary` |
| `--bg-elevated` | `--background-primary-alt` / `--background-secondary-alt` (Nutzung prüfen) |
| `--bg-overlay` | `--background-modifier-cover` |
| `--text-primary` | `--text-normal` |
| `--text-secondary` | `--text-muted` |
| `--text-subtle` (bisher `--text-muted`, umbenannt) | `--text-faint` |
| `--text-inverse` | `--text-on-accent` |
| `--border-subtle` / `--border-default` / `--border-strong` | `--background-modifier-border` / `-hover` / `-active-hover` |
| `--accent` / `--accent-hover` / `--accent-text` | `--interactive-accent` / `--interactive-accent-hover` / `--text-accent` |
| `--font-sans` / `--font-mono` | `--font-interface` / `--font-monospace` |

**Namenskollisionen** (gleicher Name in beiden Welten): `--text-muted`, `--radius-xl`,
`--status-bar-font-size`, `--canvas-color-1…6`, `--graph-node-unresolved`. Pro Variable ist die Semantik
zu prüfen; bei abweichender Bedeutung wird die Slatebase-Seite umbenannt (z. B. `--text-muted` ist bei uns
„zweitrangig", bei Obsidian „gedämpft" — die Tabelle oben verschiebt die Stufen bewusst und muss mit
den 265 Verwendungsstellen abgeglichen werden). Das ist der riskanteste Punkt der Spec und bekommt
eine eigene Phase mit Sichtprüfung.

Semantische Farben (Erfolg/Fehler/Warnung, Syntax-Highlighting, Datei-Icons) bleiben in Stufe 1 bei
Slatebase; abgeleitet wird nur, was Themes üblicherweise setzen.

## 2. Variablen-Lücken
**Phase-1-Ergebnis (2026-10-17):** Abgleich gegen die offizielle Referenz
(`obsidianmd/obsidian-developer-docs`, `en/Reference/CSS variables/**`, 689 Variablennamen) ergibt nur
**110 fehlende** Namen. Davon sind rund 50 Obsidian-Publish-/Sync-Variablen (`--page-*`, `--site-*`,
`--logo-*`, `--sidebar-left/right-*`, `--sync-avatar-*`, `--graph-height`, `--footer-display`) und
Platzhalter-Fragmente (`--font-`, `--size`); sie werden **nicht** ergänzt. Echte Lücken:

- `--bases-*` (ca. 35: Cards, Table, Header, Toolbar, Embed, Filter-Menü)
- `--component-title-*`, `--dropdown-*`
- `--nav-item-border-color*`, `--nav-parent-item-color*`, `--nav-parent-item-weight`,
  `--nav-collapse-icon-color-hover`, `--outline-heading-*`
- `--color-accent-hsl`, `--text-highlight-bg-rgb`

**Korrektur zum ersten Abgleich:** `--radius-xs`, `--thin-border`, `--checkbox-icon`, `--normal-weight`,
`--blockquote-size`, `--editor-font-size`, `--gutter-background`, `--table-drag-handle-size` stehen nicht
in der offiziellen Referenz; sie gehören den Themes (Things/Minimal) oder dem Style-Settings-Plugin und
werden nicht ergänzt. Plugin-/theme-eigene Variablen (`--font-text-override`, `--font-todoist-*`, …) ebenfalls nicht.

Zusätzlich Typografie-Anbindung: `editor/` (CM6-Theme) und Leseansicht lesen `--font-text`,
`--h1…h6-*`, `--line-height-normal`, `--file-line-width`. Falls die Editor-CSS dafür feste Werte nutzt,
werden diese auf `var(--x, <bisheriger Wert>)` umgestellt — der Fallback hält Punkt R1.3 ein.

## 3. Backend: `backend/src/themes/`

Orientiert sich an `plugin/plugin-service.ts` (liest `.obsidian/plugins/` direkt aus dem Vault-Speicherpfad).
Interface zuerst, `.js`-Imports, Barrel `index.ts`:

```ts
export interface ThemeManifest { name: string; version?: string; author?: string; authorUrl?: string; minAppVersion?: string }
export interface ThemeMeta { id: string; manifest: ThemeManifest; size: number; updatedAt: string; externalHosts: string[] }
export interface IThemeService {
  listThemes(vaultStoragePath: string): Promise<ThemeMeta[]>;
  loadTheme(vaultStoragePath: string, themeId: string): Promise<{ css: string; meta: ThemeMeta } | null>;
  saveTheme(vaultStoragePath: string, themeId: string, css: string, manifest?: ThemeManifest): Promise<ThemeMeta>;
  deleteTheme(vaultStoragePath: string, themeId: string): Promise<void>;
  getActiveThemeId(vaultStoragePath: string): Promise<string | null>;
  setActiveThemeId(vaultStoragePath: string, themeId: string | null): Promise<void>;
}
```

- Pfade: `.obsidian/themes/<id>/theme.css` und `manifest.json`, jeweils über `validateFilePath()`;
  `themeId` wird zusätzlich gegen `[A-Za-z0-9 _.-]` geprüft (kein `..`, keine Trenner).
- Fehlerklassen `ThemeNotFoundError`, `ThemeTooLargeError`, `InvalidThemeIdError` → HTTP 404/413/400.
- Aktive Auswahl: `.obsidian/appearance.json`, Feld `cssTheme`. Schreiben ist Read-Modify-Write unter einem
  Mutex pro Vault; die übrigen Felder (`theme`, `enabledCssSnippets`, `baseFontSize`, …) werden unverändert
  übernommen. Ist die Datei nicht lesbar (EPERM/EACCES, Locking), wird **nicht** überschrieben: Retry,
  dann Fehler an den Client (kein „Datei weg"-Schluss). Ist sie kein gültiges JSON, bricht das Schreiben ab
  und meldet das, statt sie zu ersetzen.
- `setActiveThemeId` mit einer ID, die nicht existiert → `ThemeNotFoundError`. Eine `cssTheme`, die auf ein
  fehlendes Theme zeigt (z. B. nach Git-Sync), liefert `getActiveThemeId` unverändert zurück; der Client
  fällt dann ohne Fehler auf Standard zurück und lässt die Datei in Ruhe.
- `externalHosts` wird beim Lesen/Speichern per Regex aus `@import`/`url(` extrahiert (nur Hostnamen, kein
  Fetch). Die Regex ist auf ReDoS geprüft (frühere CodeQL-Meldung in `base-eval.ts`): keine verschachtelten
  Quantoren, Eingabe vorher auf 2 MB begrenzt.
- Routen: `GET /` (Liste), `GET /active`, `PUT /active` (`{ themeId: string | null }`), `GET /:themeId`
  (CSS + Meta), `PUT /:themeId` (`{ css, manifest? }`), `DELETE /:themeId` (löscht den Ordner; war es das
  aktive Theme, wird `cssTheme` auf `""` gesetzt). `active` ist als Theme-ID reserviert.
  Verdrahtung manuell in `src/index.ts`. Vault-Pfad über `vaultRegistry.findById(vaultId).storagePath` wie in
  `pluginRoutes.ts`; zusätzlich `accessControl` (wie `snippetRoutes.ts`): GET mit Lesezugriff, PUT/DELETE
  mit Schreibzugriff.
- Nach jeder schreibenden Route: `eventBus.publish({ type: 'vault:change', … })` für den geänderten
  Pfad (`.obsidian/appearance.json` bzw. `.obsidian/themes/<id>/theme.css`), Ziel = Nutzer mit Vault-Zugriff,
  ohne den auslösenden Nutzer (`excludeUserId`).
- Kein Aufräumen beim Vault-Löschen nötig (Dateien liegen im Vault).
- Dot-Verzeichnisse bleiben in Baum, Suche und Statistik versteckt; Themes erscheinen nur im Themes-Abschnitt.

## 4. Frontend

- `plugins/appearance/theme-injector.ts`: `IThemeInjector`-Pendant (`apply(id, css)`, `remove()`); ein Tag,
  wird direkt vor dem ersten Snippet-Tag eingefügt (sonst ans Ende von `<head>`); setzt/entfernt
  `data-obsidian-theme="<id>"` auf `document.documentElement`. Größenlimit 2 MB wie Backend.
- `state/themeStore.ts`: API-Zugriff (list/load/save/delete/active). Die Auswahl hat keine eigene
  Persistenz im Client: die Quelle ist `appearance.json` im Vault, `localStorage` höchstens als Cache des
  zuletzt angewendeten CSS für einen flackerfreien Start (nie als Wahrheit).
- `components/ThemeLifecycle.tsx` neben `SnippetLifecycle`, gleiche Struktur inkl. `cancelled`-Flag und
  Vault-Wechsel-Logik. Lade-Fehler: altes Theme behalten, `console.warn`, kein Zurücksetzen.
- `components/settings/ThemeManager.tsx` + `ThemesSection.tsx`, Eintrag `themes` in `settingsRegistry.ts`
  (`category: 'vault'`, `requiresVault: true`), Labels in `de.ts`/`en.ts`.
  Import-Dialog mit `useFocusTrap`; Hinweisliste für `externalHosts`.
- `body-classes.ts` bleibt unverändert; das Theme liest `theme-light`/`theme-dark` schon heute.

## 5. Risiken

| Risiko | Gegenmaßnahme |
|---|---|
| Namenskollisionen verschieben Stufen (`--text-muted`) | eigene Phase, Sichtprüfung Hell/Dunkel, Abgleich der 265 Nutzungen |
| Marker-Logik driftet von Compat-CSS | Paritäts-Test (siehe 1.) |
| Theme überschreibt Slatebase-Layout über Struktur-Selektoren | Stufe 1 ausdrücklich nur Variablen; Hinweis in UI/Docs |
| Große Themes verlangsamen Start | Injection nur für aktives Theme, ein Tag, 2-MB-Limit |
| Externe Fonts/Bilder | Hinweis beim Import, CSP-Prüfung |
| `appearance.json` geht beim Schreiben verloren/kaputt | Read-Modify-Write unter Mutex, atomar, ungültiges JSON nie überschreiben, Test mit fremden Feldern |
| Auswahl gilt für alle Nutzer des Vaults | Hinweis in der UI; entspricht Obsidian, Hell/Dunkel bleibt individuell |

## 6. Test-Strategie

- Backend: `theme-service.test.ts` (Pfad-Traversal, Limits, atomar, fremde Felder in `appearance.json`
  bleiben erhalten, ungültiges JSON, fehlendes aktives Theme), `themeRoutes.test.ts`
  (Mock-Store, Fehler → Status), Regex-Test für `externalHosts` inkl. Pathologie-Eingaben.
- Frontend: `theme-injector.test.ts`, `ThemeLifecycle.test.tsx` (Vault-Wechsel, Fehlerfall, Löschen),
  `themeStore.test.ts`, `ThemeManager.test.tsx` + `*.a11y.test.tsx`, Paritäts-Test Token-Brücke.
- Manuell: Things (Hell/Dunkel) vollständig sichtbar umgefärbt (Sidebar, Explorer, Tabs, Modals, Editor-
  Schrift); Minimal lädt ohne Fehler und färbt mindestens Chrome und Schrift um; Deaktivieren stellt das
  Original her; Screenshots vorher/nachher in der PR.

## Akzeptanz

1. Things als Theme importieren und aktivieren → Hintergründe, Text, Akzent, Schriften der gesamten UI
   ändern sich in Hell und Dunkel.
2. Deaktivieren → Erscheinungsbild exakt wie vor der Aktivierung; ohne Theme pixelgleich zum Stand vor dieser Spec.
3. Vault-Wechsel tauscht das Theme. Ein Obsidian-Vault mit `.obsidian/themes/` und `appearance.json` zeigt
   seine Themes und das dort aktive Theme ohne Import.
4. `npm run test:coverage`, `lint` und `tsc` in beiden Paketen grün; Coverage-Schwellen nicht gesenkt.
