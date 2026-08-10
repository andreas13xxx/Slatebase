# Accessibility Audit — Tasks

## Phase 1: Tooling & CI

- [x] Task 1: `vitest-axe` (oder Fallback `axe-core` direkt) als Dev-Dependency ergänzen
- [x] Task 2: `eslint-plugin-jsx-a11y` in `frontend/eslint.config.js` aktivieren (recommended-Preset, laute Regeln vorerst `warn`)
- [x] Task 3: axe-Unit-Tests für `ConfirmModal`, `CommandPalette`, `SettingsPanel`, `FileExplorer`, `TabBar`, `ContextMenu` ergänzen
- [x] Task 4: Verifizieren dass axe-Tests als Teil von `npm run test:coverage` in CI laufen (kein separater Workflow nötig)

## Phase 2: Focus-Management

- [x] Task 5: `useFocusTrap`-Hook implementieren (`frontend/src/hooks/useFocusTrap.ts`) — Tab-Zirkulation, Escape-Callback, Fokus-Rückgabe
- [x] Task 6: `ConfirmModal.tsx` auf `useFocusTrap` umstellen (Referenzimplementierung)
- [x] Task 7: `CommandPalette.tsx` auf `useFocusTrap` umstellen
- [x] Task 8: `SettingsPanel.tsx` auf `useFocusTrap` umstellen
- [x] Task 9: `PluginDetailPanel.tsx`, `NewConversation.tsx`, `TemplateSelector.tsx` auf `useFocusTrap` umstellen

## Phase 3: Skip-Navigation & Landmarks

- [x] Task 10: Skip-Link in `App.tsx` + `App.css` ergänzen, springt zu `#main-content`
- [x] Task 11: Toolbar-Landmark-Bewertung durchführen, ggf. `<header>` oder konsistentes Pattern ergänzen

## Phase 4: Tastaturbedienbarkeit

- [x] Task 12: `StatusBar.tsx` — fehlende `role`/`tabIndex`/Keydown-Handler für interaktive Items ergänzen
- [x] Task 13: `TabContent.tsx` — ARIA/Tastatur-Lücken schließen
- [x] Task 14: `TrashView.tsx` — ARIA/Tastatur-Lücken schließen
- [x] Task 15: `SidebarSplitContainer.tsx`/`SidebarPanelTabBar.tsx` — `role="separator"` + Pfeiltasten-Resize (Wiederverwendung von `useResize`-Callback)
- [x] Task 16: `CanvasMinimap.tsx` — `aria-hidden` oder Tastaturzugriff, je nach Audit-Ergebnis

## Phase 5: Farbkontrast

- [x] Task 17: Alle Text-/Hintergrund-Token-Paare in `index.css` (Light + Dark) gegen WCAG-AA prüfen
- [x] Task 18: Gefundene Kontrast-Verstöße gezielt beheben (nur betroffene Tokens anpassen)

## Phase 6: Canvas/Graph-Alternative

- [x] Task 19: `GraphView.tsx` — dynamisches `aria-label` mit Knoten-/Kanten-Anzahl auf SVG-Root
- [x] Task 20: `CanvasView.tsx` — Tab-Fokus-Reihenfolge zwischen Nodes + Enter/Space zum Öffnen
- [x] Task 21: `CanvasView.tsx` — Pfeiltasten-Viewport-Verschiebung als Tastatur-Alternative zu Maus-Pan

## Phase 7: Zoom, Manueller Test & Report

- [x] Task 22: 200%-Zoom-Check für Editor, Sidebar, Settings-Panel; kritische Brüche fixen
- [x] Task 23: Manueller NVDA-Testdurchlauf über Login, Datei öffnen/bearbeiten, Sidebar-Navigation, Settings
- [x] Task 24: `ACCESSIBILITY-AUDIT.md` mit allen Findings (Schweregrad, Komponente, Status) finalisieren
