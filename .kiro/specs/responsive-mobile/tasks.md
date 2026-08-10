# Responsive/Mobile — Tasks

## Phase 1: Breakpoint-Grundlagen

- [ ] Task 1: `useMediaQuery`/`useBreakpoint`-Hook implementieren (`frontend/src/hooks/useMediaQuery.ts`)
- [ ] Task 2: Breakpoint-Konstanten (768px/1024px) in CSS als Referenz-Kommentar in `App.css` dokumentieren, um JS/CSS-Drift zu vermeiden
- [ ] Task 3: Device-Test-Matrix festlegen (375px/768px/1024px/1440px) für spätere Prüfungen

## Phase 2: App-Shell Mobile-Layout

- [ ] Task 4: `useBreakpoint()` in `AppContent` (`App.tsx`) konsumieren
- [ ] Task 5: Sidebar als Overlay/Drawer unter 768px (`app-sidebar--overlay`-Klasse, `transform`-Transition)
- [ ] Task 6: Right-Panel analog als Overlay unter 768px
- [ ] Task 7: Backdrop-Element bei offenem Overlay, schließt bei Klick/Tap außerhalb
- [ ] Task 8: `useResize`-Drag-Handles bei Mobile-Breakpoint deaktivieren/ausblenden
- [ ] Task 9: Tablet-Breakpoint (768–1024px): reduzierte Default-Breiten per CSS, Right-Panel-Default-Verhalten festlegen

## Phase 3: Canvas Touch-Interaktion

- [ ] Task 10: `CanvasView.tsx` Pan/Zoom von Mouse- auf Pointer-Events migrieren (`setPointerCapture`)
- [ ] Task 11: Pinch-to-Zoom implementieren (Zwei-Pointer-Abstandstracking, gleiche `MIN_ZOOM`/`MAX_ZOOM`-Clamps wie Wheel-Zoom)
- [ ] Task 12: Ein-Finger-Touch-Pan (unterschieden von Maus-Pan über `pointerType`)
- [ ] Task 13: `useNodeDrag.ts` auf Pointer-Events migrieren
- [ ] Task 14: `useNodeResize.ts` auf Pointer-Events migrieren
- [ ] Task 15: Regressionstest bestehender Maus-Interaktion (Mitteltaste-Pan, Wheel-Zoom, Rechtsklick-Kontextmenü, Node-Drag/Resize mit Maus)

## Phase 4: Touch-freundliche Resize-Handles

- [ ] Task 16: `useResize.ts` auf Pointer-Events erweitern (Maus bleibt funktional)
- [ ] Task 17: Vergrößerte Touch-Trefferfläche für Resize-Handles per CSS (≥44px effektiv, visuelle Breite unverändert)

## Phase 5: Editor Mobile-Kompatibilität

- [ ] Task 18: `useVisualViewport`-Hook implementieren (`frontend/src/editor/live-preview/`)
- [ ] Task 19: Editor-Container passt sich bei virtueller Tastatur an (Cursor bleibt sichtbar)
- [ ] Task 20: Touch-Zielgrößen für interaktive Editor-Elemente (Checkbox-Toggles etc.) prüfen/anpassen

## Phase 6: Optionales PWA-Manifest

- [ ] Task 21: `manifest.json` erstellen (Name, Theme-Color, `display: standalone`)
- [ ] Task 22: PNG-Icon-Exports (192×192, 512×512) aus vorhandenem `icons.svg` erzeugen
- [ ] Task 23: `<link rel="manifest">` in `frontend/index.html` ergänzen, Installierbarkeit in Chrome DevTools verifizieren

## Phase 7: Cross-Device-Testing & Report

- [ ] Task 24: Manuelle Prüfung der Kernflows (Datei öffnen/bearbeiten, Sidebar-Navigation, Canvas pannen/zoomen, Settings) auf 375px/768px/1024px/1440px
- [ ] Task 25: Bekannte Einschränkungen dokumentieren (z. B. in `.kiro/specs/responsive-mobile/` oder README-Abschnitt)
