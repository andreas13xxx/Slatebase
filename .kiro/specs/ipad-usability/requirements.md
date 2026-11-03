# iPad-Bedienbarkeit — Requirements

Ziel: Slatebase ist auf dem iPad (Safari und als Home-Screen-App, mit Finger, Pencil und Magic Keyboard) vollständig bedienbar.

- R1 Resize per Touch: Pane-Trenner, Sidebar-/Panel-Breite und Panel-Split lassen sich mit dem Finger ziehen (Pointer-Events statt Maus-Events). Maus und Tastatur bleiben unverändert.
- R2 Touch-Ziele: Bei `pointer: coarse` haben Tabs, Explorer-Zeilen, Toolbar-Buttons, Panel-Tabs und Breadcrumb-Segmente eine Trefferfläche von mindestens 44 px.
- R3 Hover-UI: Bei `hover: none` sind Steuerelemente, die sonst erst beim Überfahren erscheinen, dauerhaft sichtbar.
- R4 Drag-Alternative: Alles, was bisher nur per HTML5-Drag möglich ist, hat einen Menüweg:
  - Explorer: „Verschieben nach…“ für Dateien **und** Ordner öffnet einen Ordner-Wähler (ersetzt `window.prompt`).
  - Tab: „Nach links/rechts verschieben“ und, bei geteilten Panes, „In anderes Pane verschieben“.
  - Favoriten: „Nach oben/unten“.
- R5 Hardware-Tastatur: Auch wenn iPadOS `navigator.platform` als `iPad` meldet, gilt Cmd als Mod-Taste.
- R6 Viewport: `viewport-fit=cover` plus `safe-area-inset-*` für Header, Sidebars und untere Leisten.
- R7 Installierbar: Web-App-Manifest und `apple-mobile-web-app-*`-Meta-Tags für den Home-Screen-Start im Vollbild.
- R8 Mausverhalten bleibt überall unverändert.

## Bewusst ausgespart
- Bildschirmtastatur-Handling (`visualViewport`) — eigener Punkt.
- Pencil-Sonderverhalten in Canvas/Graph.
