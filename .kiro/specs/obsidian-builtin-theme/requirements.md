# Eingebautes Obsidian-Theme — Anforderungen

## Ausgangslage

Slatebase kennt heute zwei Zustände: den Standard „Slatebase" (kein Theme aktiv, Tokens aus `frontend/src/index.css`) und
ein Vault-Theme aus `<vault>/.obsidian/themes/<id>/`. Es gibt kein mitgeliefertes Theme.

Dieses Vorhaben ergänzt ein **zweites fest eingebautes Theme „Obsidian (Standard)"**, das die Optik von Obsidians
Standard-Theme (Referenz: Obsidian 1.14.5, Hell und Dunkel) nachbaut. Es wird wie „Slatebase" mitgeliefert, nicht im Vault
installiert, und ist nicht löschbar.

Referenz: gemessene CSS-Variablen von `body` (Hell und Dunkel, ca. 700 Variablen) und Screenshots der Oberfläche, aufgenommen
am 2026-10-25 in Obsidian 1.14.5 (Electron 43). Die Doku (docs.obsidian.md → CSS variables) nennt nur Farben und Schriftgrößen
mit Werten; alles andere stammt aus der Messung.

## Entscheidungen (mit dem Auftraggeber geklärt)

- Umfang: **alles**, also Farben, Schrift, Inhalt (Editor/Leseansicht) und Chrome (Tabs, Pane-Kopf, Seitenleiste, Statusleiste, Dialoge).
- Hell/Dunkel folgt dem bestehenden Schalter (`data-theme` → `theme-light`/`theme-dark` auf `body`); das Theme bringt keinen eigenen.
- Die Auswahl gilt **pro Vault** (wie Vault-Themes), gespeichert in `.obsidian/appearance.json`.
- Schrift: **Systemstack wie Obsidian** (`ui-sans-serif, -apple-system, …`), nicht Inter.

## Anforderungen

**1 Auswahl und Speicherung**

1.1 In den Einstellungen unter „Theme dieses Vaults" erscheint hinter „Slatebase (Standard)" ein nicht löschbarer Eintrag „Obsidian (Standard)".
1.2 Die Auswahl wird als `cssTheme: "builtin:obsidian"` in `.obsidian/appearance.json` gespeichert; weitere Felder der Datei bleiben unverändert.
1.3 Die ID `builtin:obsidian` ist reserviert: Echte Theme-IDs können keinen Doppelpunkt enthalten (`isValidThemeId`), eine Kollision ist ausgeschlossen.
1.4 Beim Laden eines Vaults wird das eingebaute Theme ohne Server-Anfrage nach CSS angewendet (das CSS ist Teil des Frontend-Bundles).
1.5 Ein Wechsel auf ein Vault-Theme, auf „Slatebase" oder zurück entfernt die Wirkung des eingebauten Themes vollständig.
1.6 Andere Clients des Vaults folgen der Auswahl über das bestehende `vault:change`-Ereignis.

**2 Bestehendes Verhalten bleibt unberührt**

2.1 Ohne aktives Theme sieht Slatebase exakt aus wie vorher. Nichts im eingebauten CSS greift ohne `data-obsidian-theme="builtin:obsidian"`.
2.2 Obsidian-Variablen werden nie in Basis-CSS gebunden (AGENTS.md → Themes).
2.3 Vault-Themes und Snippets behalten ihre Reihenfolge: Basis < Theme < Snippets.
2.4 Die Marker-Klassen-Regel gilt weiter: Kein App-CSS selektiert `mod-cm6`, `is-live-preview`, `HyperMD-*` usw. (`CodeMirrorEditor.obsidianClasses.test.tsx`).

**3 Farben und Variablen (Phase 2)**

3.1 Im Hellmodus und im Dunkelmodus entsprechen alle gemessenen Farbvariablen (`--color-base-*`, Akzent, erweiterte Farben, semantische Flächen, Text, Rahmen) den Obsidian-Werten.
3.2 Der Akzent ist `hsl(258, 88%, 66%)`; die Ableitungen `--color-accent-1/-2` und ihre Verteilung auf Buttons, Links, Tags und Icons folgen der Messung (Hell und Dunkel unterscheiden sich).
3.3 Hover-, Auswahl- und Overlay-Flächen werden wie in Obsidian über `--mono-100` gemischt, sodass ein Regelsatz beide Modi bedient.
3.4 Radien (`--radius-s/m/l/xl` = 4/8/12/24px), Abstände (`--size-*`), Schriftgrößen, Icon-Größen und Schatten entsprechen der Messung.
3.5 Die Schrift ist der Systemstack aus `--font-default`; Monospace aus `--font-monospace-default`.
3.6 `corner-shape: superellipse(1.33)` wird nur dort gesetzt, wo der Browser es unterstützt (`@supports`); sonst gelten normale Radien.

**4 Inhalt (Phase 3)**

4.1 Überschriften H1–H6 nutzen Größe, Gewicht, Zeilenhöhe und Buchstabenabstand aus der Messung, im Editor (Live Preview) und in der Leseansicht.
4.2 Textbreite 700px, Ränder 32px, Absatzabstand 1rem, Überschriftenabstand 2.5rem, fetter Text 600.
4.3 Callouts, Blockquotes, Inline-Code, Codeblöcke, Tabellen, Tags, Links (intern, extern, unaufgelöst), Listen, Aufgaben und Hervorhebungen folgen den gemessenen Variablen.

**5 Chrome (Phase 4)**

5.1 Tab-Leiste: abgerundete Tabs, aktiver Tab `10px 10px 0 0`, Leiste auf Sidebar-Fläche, Maße aus `--tab-*`.
5.2 Pane-Kopf: Navigationspfeile, Titel (13px, gedämpft) und Aktionen in einer 40px hohen Kopfzeile ohne Trennlinie.
5.3 Seitenleiste und Ribbon: Fläche `--background-secondary`, Einträge mit 8px Radius, 13px, Auswahl als `--nav-item-background-active`.
5.4 Statusleiste: schwebend unten rechts, `border-radius: 8px 0 0 0`, Rand nur oben und links, 12px.
5.5 Dialoge und Einstellungen: Modal-Radius 24px, Befehlspalette 700px breit, Einstellungskarten mit 12px Radius und 1px-Trennern, Buttons/Inputs 8px, Suchfelder 100px.
5.6 Chrome-Regeln verwenden ausschließlich Slatebase-Klassen (nie Obsidian-Marker-Klassen) und sind auf `data-obsidian-theme="builtin:obsidian"` begrenzt.

**6 Qualität**

6.1 Tests: Backend (ID akzeptiert, kein Existenz-Check, Löschen eines Vault-Themes lässt die Auswahl unberührt), Injector, Lifecycle, Manager, CSS-Gating (Datei enthält keine ungegateten Regeln).
6.2 Lint, `tsc` und die betroffenen Tests sind grün; die Coverage-Schwellen werden nicht gesenkt.
6.3 Nutzerhandbuch/README nennen das neue Theme (Specs und Doku auf Deutsch).

## Nicht Teil dieses Vorhabens

- Ein eigener Hell/Dunkel-Schalter des Themes.
- Obsidians Workspace-Klassen (`workspace-tab-header` …); Vorgabe aus `obsidian-themes-structure`: keine Wirkung, nicht angleichen.
- Exakte Pixelgleichheit von Schriftdarstellung zwischen Betriebssystemen; der Systemstack rendert pro Plattform unterschiedlich, auch in Obsidian.
- Die Obsidian-Publish-Variablen und mobile Layout-Variablen (`--mobile-*`, `--navbar-*`).
