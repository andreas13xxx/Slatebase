# Eingebautes Obsidian-Theme — Aufgaben

Jede Phase: umsetzen → Lint, `tsc`, betroffene Tests → Review des Diffs → Commit.

## Phase 1 — Mechanismus
- [x] 1.1 Backend: `BUILTIN_OBSIDIAN_THEME_ID` + `isBuiltinThemeId` (`themes/validation.ts`), Export über `themes/index.ts`
- [x] 1.2 Backend: `setActiveThemeSchema` und `ThemeService.setActiveThemeId` akzeptieren die ID ohne Existenz-Check; Doku in `types.ts`
- [x] 1.3 Backend-Tests: Schema, Service (Auswahl setzen/lesen, Löschen eines Vault-Themes lässt Built-in unberührt), Route
- [x] 1.4 Frontend: `plugins/appearance/builtin-themes.ts`
- [x] 1.5 Frontend: `ThemeInjector.applyBuiltin`, `obsidian.css` (Gate, noch leer) und Import in `main.tsx`
- [x] 1.6 Frontend: `ThemeLifecycle` und `ThemeManager` (Eintrag, Auswahl, kein Löschen)
- [x] 1.7 Frontend-Tests: Injector, Lifecycle, Manager, CSS-Gating

## Phase 2 — Farben und Variablen
- [x] 2.1 Akzent und Ableitungen, Hell und Dunkel
- [x] 2.2 Flächen, Text, Rahmen, Interaktiv, erweiterte Farben, Hover/Auswahl über `--mono-100`
- [x] 2.3 Systemschrift, Größen, Radien, Abstände, Icons, Schatten, `corner-shape`-Variablen (angewendet wird `corner-shape` erst in Phase 4, per `@supports`)
- [x] 2.4 Slatebase-Tokens ohne Bridge-Zuordnung (Status-, Tag-, Such-, Graph-, Toast-Farben, Radien, Schatten) auf Obsidian-Werte mappen; Callout-Tokens folgen in 3.3
- [x] 2.5 Test: Variablenwerte der Datei (Hell/Dunkel) gegen die Referenzwerte

## Phase 3 — Inhalt
- [ ] 3.1 Überschriften im Live Preview und in der Leseansicht (Größe, Gewicht, Zeilenhöhe, Buchstabenabstand)
- [ ] 3.2 Textbreite, Ränder, Absatz-/Überschriftenabstand, fetter Text
- [ ] 3.3 Callouts, Blockquote, Inline-Code, Codeblock, Tabelle, Tags, Links, Listen, Aufgaben, Hervorhebung
- [ ] 3.4 Tests: CSS-Gating, keine Obsidian-Marker-Klassen in App-CSS

## Phase 4 — Chrome
- [ ] 4.1 Tab-Leiste und Pane-Kopf
- [ ] 4.2 Seitenleiste, Ribbon, Dateibaum, Vault-Wechsler
- [ ] 4.3 Statusleiste
- [ ] 4.4 Befehlspalette, Modals, Menüs, Tooltips; Slatebases `--radius-xl` (jetzt 24px wie in Obsidian) bei Nutzern wie `.user-menu-dropdown`, `.login-card`, `.settings-panel` prüfen
- [ ] 4.5 Einstellungen (Navigation, Karten, Toggles, Buttons, Inputs)
- [ ] 4.6 Doku (README, Benutzerhandbuch), Abgleich mit den Referenz-Screenshots
