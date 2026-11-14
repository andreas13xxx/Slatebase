# Responsive/Mobile — Tasks

## Phase 1: Breakpoint-Grundlagen

- [x] Task 1: `useMediaQuery`/`useBreakpoint`-Hook implementieren (`frontend/src/hooks/useMediaQuery.ts`)
- [x] Task 2: Breakpoint-Konstanten (768px/1024px) in CSS als Referenz-Kommentar in `App.css` dokumentieren, um JS/CSS-Drift zu vermeiden
- [x] Task 3: Device-Test-Matrix festlegen (375px/768px/1024px/1440px) für spätere Prüfungen

### Umsetzung Phase 1 (2026-11-14)

- Task 1: `frontend/src/hooks/useMediaQuery.ts` (`BREAKPOINTS`, `BREAKPOINT_QUERIES`, `useMediaQuery`, `useBreakpoint`) per `useSyncExternalStore`; ohne
  `matchMedia` (jsdom) immer `false`/`desktop`. 11 Tests.
- Task 2: Referenzkommentar mit den Zahlen am Anfang von `frontend/src/App.css`. Es gibt noch keine Breakpoint-Regeln im Projekt außer vereinzelten
  Media-Queries; neue Regeln verwenden genau diese Literale.
- Task 3: Test-Matrix unten.
- Bekannt: Der Hook ist noch von nichts konsumiert (Task 4); die Phase ändert kein sichtbares Verhalten.

#### Device-Test-Matrix (Task 3)

| Breite | Bereich | Repräsentant | Prüfen (R8.1) |
|-------:|---------|--------------|----------------|
| 375 px | mobile | iPhone SE/Mini (DevTools-Emulation, Touch) | Datei öffnen/bearbeiten, Sidebar als Drawer, Canvas pannen/zoomen, Settings öffnen |
| 768 px | tablet | iPad hochkant | dasselbe; Right-Panel-Standardverhalten, Split-Panes |
| 1024 px | tablet (Obergrenze) | iPad quer | Übergang zum Desktop-Layout, kein Drawer |
| 1440 px | desktop | Laptop | Regressionsprüfung: Layout unverändert |

Randwerte beim Prüfen: 767/768 und 1024/1025 px (Hook-Test deckt die Logik, die Matrix das Aussehen). Pro Breite einmal Hell- und Dunkelmodus.

## Phase 2: App-Shell Mobile-Layout

Umgesetzt: `isMobileLayout` in `AppContent`; beide Panels sind unter 768px immer gerendert, aber per `transform` + `visibility` außerhalb (`--overlay`/`--open`), feste Breite `min(85vw, 320px)`, Backdrop (`app-drawer-backdrop`) schließt beide, Resize-Handles entfallen, die Drawer haben einen eigenen, nie gespeicherten Zustand (`mobileDrawer`), starten geschlossen und schließen beim Öffnen einer Notiz; die gespeicherte Desktop-Sichtbarkeit bleibt unberührt, geschlossene Drawer sind `inert`. Tablet: unverändert (eine `max-width`-Klammer kollidierte mit dem Resize-Handle und der gespeicherten Breite und wurde nach dem Review entfernt), Right-Panel bleibt in der Spalte. Nicht im echten Browser geprüft (Task 24).

- [x] Task 4: `useBreakpoint()` in `AppContent` (`App.tsx`) konsumieren
- [x] Task 5: Sidebar als Overlay/Drawer unter 768px (`app-sidebar--overlay`-Klasse, `transform`-Transition)
- [x] Task 6: Right-Panel analog als Overlay unter 768px
- [x] Task 7: Backdrop-Element bei offenem Overlay, schließt bei Klick/Tap außerhalb
- [x] Task 8: `useResize`-Drag-Handles bei Mobile-Breakpoint deaktivieren/ausblenden
- [x] Task 9: Tablet-Breakpoint (768–1024px): reduzierte Default-Breiten per CSS, Right-Panel-Default-Verhalten festlegen

## Phase 3: Canvas Touch-Interaktion

Umgesetzt: Pan, Pinch (reine Geometrie in `touch-gestures.ts`, gleiche Zoom-Grenzen wie das Mausrad, zwei Finger schwenken auch), Knoten-Drag, Resize und Kanten-Anker laufen über Pointer-Events (`touch-action: none` auf Canvas, Knoten, Handles; Textfelder scrollen weiter). Die Maus (Mitteltaste/Leertaste-Pan, Mausrad, Rechtsklick) bleibt, durch Tests belegt. Nicht auf einem echten Gerät geprüft (Task 24).

- [x] Task 10: `CanvasView.tsx` Pan/Zoom von Mouse- auf Pointer-Events migrieren (`setPointerCapture`)
- [x] Task 11: Pinch-to-Zoom implementieren (Zwei-Pointer-Abstandstracking, gleiche `MIN_ZOOM`/`MAX_ZOOM`-Clamps wie Wheel-Zoom)
- [x] Task 12: Ein-Finger-Touch-Pan (unterschieden von Maus-Pan über `pointerType`)
- [x] Task 13: `useNodeDrag.ts` auf Pointer-Events migrieren
- [x] Task 14: `useNodeResize.ts` auf Pointer-Events migrieren
- [x] Task 15: Regressionstest bestehender Maus-Interaktion (Mitteltaste-Pan, Wheel-Zoom, Rechtsklick-Kontextmenü, Node-Drag/Resize mit Maus)

## Phase 4: Touch-freundliche Resize-Handles

Task 16 war durch die iPad-Arbeit schon erledigt (`useResize`, `PaneSplitHandle` laufen über Pointer-Events). Task 17: Trefferfläche aller drei Handle-Arten jetzt 44px (4px sichtbar plus 20px je Seite).

- [x] Task 16: `useResize.ts` auf Pointer-Events erweitern (Maus bleibt funktional)
- [x] Task 17: Vergrößerte Touch-Trefferfläche für Resize-Handles per CSS (≥44px effektiv, visuelle Breite unverändert)

## Phase 5: Editor Mobile-Kompatibilität

Task 18/19 bestehen als `hooks/useKeyboardViewport.ts` (Visual-Viewport, `--keyboard-inset`, Caret wird sichtbar gehalten; in `App.tsx` eingebunden) und wurden nicht neu gebaut. Der Pfad in der Aufgabe (`editor/live-preview/useVisualViewport`) gilt damit nicht mehr. Task 20: Checkbox-Toggles im Editor sind auf Touch-Geräten 24px (WCAG-2.2-Minimum, nicht 44px). Nicht auf einem echten Gerät geprüft.

- [x] Task 18: `useVisualViewport`-Hook implementieren (`frontend/src/editor/live-preview/`)
- [x] Task 19: Editor-Container passt sich bei virtueller Tastatur an (Cursor bleibt sichtbar)
- [x] Task 20: Touch-Zielgrößen für interaktive Editor-Elemente (Checkbox-Toggles etc.) prüfen/anpassen

## Phase 6: Optionales PWA-Manifest

- [ ] Task 21: `manifest.json` erstellen (Name, Theme-Color, `display: standalone`)
- [ ] Task 22: PNG-Icon-Exports (192×192, 512×512) aus vorhandenem `icons.svg` erzeugen
- [ ] Task 23: `<link rel="manifest">` in `frontend/index.html` ergänzen, Installierbarkeit in Chrome DevTools verifizieren

## Phase 7: Cross-Device-Testing & Report

- [ ] Task 24: Manuelle Prüfung der Kernflows (Datei öffnen/bearbeiten, Sidebar-Navigation, Canvas pannen/zoomen, Settings) auf 375px/768px/1024px/1440px
- [ ] Task 25: Bekannte Einschränkungen dokumentieren (z. B. in `.kiro/specs/responsive-mobile/` oder README-Abschnitt)
