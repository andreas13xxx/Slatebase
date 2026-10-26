# Eingebautes Obsidian-Theme — Design

## 1. Mechanismus

### Speicherung
`cssTheme` in `.obsidian/appearance.json` bekommt den Wert `builtin:obsidian`. Das ist dieselbe Stelle wie bei Vault-Themes,
also gilt die Auswahl für alle Nutzer des Vaults, wandert per Git Sync mit und braucht keine zweite Quelle der Wahrheit.

Abgewogen wurde ein eigenes Feld in `.slatebase/config.json`. Dagegen sprach: zweite Quelle, Git-Sync-Ausnahme nötig,
Vorrangregeln zwischen beiden Feldern. Preis der gewählten Lösung: Obsidian selbst kennt die ID nicht. Ein Obsidian, das denselben
Vault öffnet, findet kein Theme dieses Namens und zeigt sein Standard-Theme; schreibt es `appearance.json` neu, geht die Auswahl
verloren und Slatebase zeigt danach „Slatebase (Standard)". Das ist ein Rückfall auf den Standard, kein Datenverlust.
Der Doppelpunkt der ID kann unter Windows kein Ordnername sein; Obsidian findet also nie einen Ordner dazu und kann den Wert überschreiben. Die Doku (README, Willkommens-Vault) sagt das ausdrücklich.

**Zwei Listen, ein Test:** Backend (`BUILTIN_THEME_IDS`) und Frontend (`BUILTIN_THEMES`) sind getrennte Pakete ohne gemeinsamen Code. `builtin-themes.test.ts` liest die Backend-Quelle und vergleicht beide, damit eine Umbenennung auf nur einer Seite auffällt.

**Abgelehnte Stylesheets:** Ein Vault-Theme über 3 MB lehnt `ThemeInjector.apply` ab. `ThemeLifecycle` und `ThemeManager` entfernen dann den Marker eines vorher aktiven eingebauten Themes (und zeigen im Manager den Fehler), damit die Anzeige nicht eine andere Auswahl behauptet als der Server speichert.

### Backend
- `themes/validation.ts`: `BUILTIN_OBSIDIAN_THEME_ID = 'builtin:obsidian'`, `isBuiltinThemeId()`. `isValidThemeId` bleibt unverändert strikt (kein `:`),
  damit Routen mit `:themeId` die ID nie als Ordnernamen sehen.
- `setActiveThemeSchema` akzeptiert die Built-in-ID zusätzlich zu `themeIdSchema` oder `null`.
- `ThemeService.setActiveThemeId` überspringt den Existenz-Check für die Built-in-ID. `getActiveThemeId` gibt den Wert unverändert zurück.
- `deleteTheme` setzt `cssTheme` nur zurück, wenn es auf das gelöschte Theme zeigt; die Built-in-ID ist nie ein Ordner und bleibt unberührt.

### Frontend
- `plugins/appearance/builtin-themes.ts`: `BUILTIN_THEMES` (Id, Anzeigename), `isBuiltinThemeId()`. Eine Liste, damit ein weiteres eingebautes Theme nur einen Eintrag braucht.
- `ThemeInjector.applyBuiltin(id)`: entfernt ein evtl. vorhandenes Vault-Theme-`<style>`, setzt `data-obsidian-theme="<id>"` und benachrichtigt `notifyCssChange`. Das CSS wird **nicht** injiziert.
  Es ist normales Bundle-CSS (`plugins/appearance/builtin/obsidian.css`, in `main.tsx` importiert wie `theme-bridge.css`), jede Regel gated auf
  `:root[data-obsidian-theme="builtin:obsidian"]`. Vorteil gegenüber `?inline`: kein Text-Import, funktioniert in Vitest, kein zweiter Größenpfad.
- `ThemeLifecycle`: erkennt `activeId` als Built-in und ruft `applyBuiltin` statt `loadTheme`.
- `ThemeManager`: zusätzlicher Radio-Eintrag aus `BUILTIN_THEMES`, ohne Löschen-Knopf; `applyLocally` verzweigt wie der Lifecycle.
- Die Token-Brücke `theme-bridge.css` ist über `[data-obsidian-theme]` (beliebiger Wert) bereits aktiv, sie leitet Slatebase-Tokens aus den Obsidian-Variablen ab.

### Kaskade
- Obsidian-Variablen setzt `obsidian.css` auf `body` (Hell) und `body.theme-dark` (Dunkel) mit Spezifität (0,2,2). Die Compat-Werte stehen auf `:root` und werden damit überschrieben, ohne `!important`.
- Die Bridge liefert weiter die Grau-Skala mit Spezifität 0. Das eingebaute CSS setzt sie nicht erneut, sondern nur, was in der Messung abweicht.
- Slatebase-eigene Regeln der Phasen 3 und 4 stehen in derselben Datei hinter demselben Gate.

## 2. Messung (Referenz Obsidian 1.14.5)

Wichtige Befunde, nach denen `obsidian.css` gebaut wird. Alle Werte stammen aus `getComputedStyle(body)` auf einem frischen Vault mit Standard-Theme.

### Akzent
`--accent-h/s/l` = `258 / 88% / 66%`. `--color-accent = hsl(258, 88%, 66%)`.

| | Hell | Dunkel |
|---|---|---|
| `--color-accent-1` | `hsl(calc(258 - 1), calc(88% * 1.01), calc(66% * 1.075))` | `hsl(calc(258 - 3), calc(88% * 1.02), calc(66% * 1.15))` |
| `--color-accent-2` | `hsl(calc(258 - 3), calc(88% * 1.02), calc(66% * 1.15))` | `hsl(calc(258 - 5), calc(88% * 1.05), calc(66% * 1.29))` |
| `--interactive-accent` | `accent-1` | `--color-accent` |
| `--interactive-accent-hover` | `accent-2` | `accent-1` |
| `--text-accent`, Links, Tags, Icons aktiv | `--color-accent` | `accent-1` |
| `--text-accent-hover`, `--link-color-hover` | `accent-2` | `accent-2` |

### Flächen (Hell / Dunkel)
Editor, Dialoge, Prompt, Tab aktiv: `base-00` (`#fff` / `#1C1C1C`). Seitenleiste, Ribbon, Tab-Leiste, Titelleiste, Statusleiste, Menü (dunkel), Ribbon: `base-20`.
Einstellungskarten: `base-10` (`#fafafa` / `#232323`). Eingabefelder: `#fff` / `base-25`. Menü: hell `base-20`, dunkel `base-20`; Rand `base-35`.
`--interactive-normal/-hover`: `base-30`. Dropdown: `base-30`. Code-Hintergrund: `base-10`.

### Hover und Auswahl
`--background-modifier-hover`, `--nav-item-background-hover/-active`, `--tab-inner-background-hover`, `--hotkey-background`, `--code-bracket-background`:
`color-mix(in oklch, var(--mono-100) 6.7%, transparent)`. Auswahl in der Navigation: 15 % `--color-accent`. Textauswahl: 20 % (Hell) / 33 % (Dunkel).
Einrückungslinien: `--mono-100` 12 % (30 % aktiv).

### Maße
Radien 4/8/12/24. Buttons/Inputs/Menüs/Tabs 8px, Modal 24px, Einstellungskarten 12px, Suchfeld 100px, Tags/Hotkeys `2em`, Callout 4px, Code 4px.
Ribbon 44px, Kopfzeile 40px, Titelleiste 30px, Statusleiste 12px/`8px 0 0 0`, Tab 13px/200px (max 320px), Menü-Padding 6px, Prompt 700px/Input 40px,
Modal 90vw/max 1100px, Dialog 560px, Eingaben 30px hoch/`4px 8px`. `--file-line-width` 700px, `--file-margins` 32px.

### Überschriften
| | Größe | Gewicht | Zeilenhöhe | Buchstabenabstand |
|---|---|---|---|---|
| H1 | 1.618em | 700 | 1.2 | −0.015em |
| H2 | 1.462em | 680 | 1.2 | −0.011em |
| H3 | 1.318em | 660 | 1.3 | −0.008em |
| H4 | 1.188em | 640 | 1.4 | −0.005em |
| H5 | 1.076em | 620 | 1.5 | −0.002em |
| H6 | 1em | 600 | 1.5 | 0 |

### Schrift
`--font-default` = `ui-sans-serif, -apple-system, BlinkMacSystemFont, system-ui, "Segoe UI", "Google Sans Flex", Roboto, "Inter Variable", "Inter", "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", sans-serif`.
`--font-monospace-default` = `ui-monospace, SFMono-Regular, "Cascadia Mono", "Roboto Mono", "DejaVu Sans Mono", "Liberation Mono", Menlo, Monaco, "Consolas", "Source Code Pro", monospace`.
In der Messung stand vor dem Systemstack `'??'` (Nicht-ASCII-Zeichen aus Obsidians Schrift-Overrides); sie werden nicht übernommen.

### `corner-shape`
`superellipse(1.33)` bei Buttons, Inputs, Menüs, Tabs, Tooltips, Notices, Karten, Metadaten. Nur per `@supports (corner-shape: superellipse(1.33))`.

## 3. Phasen

1. **Mechanismus:** Backend-ID, Injector, Lifecycle, Manager, leere `obsidian.css` mit Gate; Tests.
2. **Farben und Variablen:** Alle gemessenen Variablen in Hell und Dunkel; Systemschrift; Radien, Größen, Schatten.
3. **Inhalt:** Überschriften (Editor + Leseansicht), Textbreite, Callout, Blockquote, Code, Tabelle, Tags, Links, Listen.
4. **Chrome:** Tab-Leiste, Pane-Kopf, Seitenleiste, Ribbon, Statusleiste, Befehlspalette, Modals, Einstellungen.

Jede Phase ist für sich grün (Lint, `tsc`, betroffene Tests) und wird einzeln committet, nach einem Review des Diffs.

## 4. Risiken

- Slatebase-DOM weicht an manchen Stellen strukturell ab (z. B. getrennte Tab-Leiste und Editor-Kopfzeile). Phase 4 gleicht Optik und Maße an, baut aber nicht das DOM um.
- Der Systemstack rendert pro Betriebssystem anders. Das ist Obsidians eigenes Verhalten.
- Fehlende Messwerte (nicht geöffnete Menüs, Hover-Zustände, Plugin-Ansichten) werden aus den Variablen abgeleitet; Abweichungen zeigt der Screenshot-Vergleich am Ende von Phase 4.

## 5. Ergebnis und Abweichungen

Abgleich in einer isolierten Instanz (Hell und Dunkel, Notiz mit H1–H6, Callout, Zitat, Code, Tabelle, Einstellungen) gegen die
Referenz-Screenshots aus Obsidian 1.14.5. Farben, Akzent, Überschriften, Tabelle, Callout, Zitat, Statusleiste und Einstellungsdialog stimmen
in Aufbau und Optik überein.

Bewusst oder unvermeidbar abweichend:

- **Schätzwerte (nicht gemessen):** Einzug des Zitats (`--size-4-5`), Innenabstand des Codeblocks (`8px 12px`), Abstand zwischen Callout-Titel und
  Inhalt (`--p-spacing`), Radius der Befehlspalette (`--radius-l`). Ein Messlauf mit offenem Zitat/Codeblock/Palette würde sie festlegen.
- **Struktur:** Die Werkzeugleiste (Ribbon) steht in Slatebase rechts neben dem Dateibaum, in Obsidian links davon. Tab-Leiste und Pane-Kopf bleiben zwei
  Zeilen; die Tab-Leiste ist auch bei einem einzelnen Tab sichtbar.
- **Live Preview:** Überschriften haben keinen Block-Abstand (Zeilen-Dekorationen), dort wirkt nur die Typografie.
- **Schrift:** Der Systemstack ist plattformabhängig (macOS: SF, Linux: z. B. DejaVu Sans), wie in Obsidian. Dadurch ist der App-Name in der
  Seitenleiste schmaler Fensterbreiten gekürzt.
- **`--radius-xl`:** Obsidians Wert (24px) gilt jetzt auch für Slatebase-Elemente, die denselben Namen nutzen (Modals, Einstellungen); Menüs und
  Tooltips bekommen ihre Radien aus den eigenen Variablen.
