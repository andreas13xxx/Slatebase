# Accessibility Audit — Tasks

## Phase 1: Tooling & CI

- [ ] Task 1: `vitest-axe` (oder Fallback `axe-core` direkt) als Dev-Dependency ergänzen
- [ ] Task 2: `eslint-plugin-jsx-a11y` in `frontend/eslint.config.js` aktivieren (recommended-Preset, laute Regeln vorerst `warn`)
- [ ] Task 3: axe-Unit-Tests für `ConfirmModal`, `CommandPalette`, `SettingsPanel`, `FileExplorer`, `TabBar`, `ContextMenu` ergänzen
- [ ] Task 4: Verifizieren dass axe-Tests als Teil von `npm run test:coverage` in CI laufen (kein separater Workflow nötig)

## Phase 2: Focus-Management

- [ ] Task 5: `useFocusTrap`-Hook implementieren (`frontend/src/hooks/useFocusTrap.ts`) — Tab-Zirkulation, Escape-Callback, Fokus-Rückgabe
- [ ] Task 6: `ConfirmModal.tsx` auf `useFocusTrap` umstellen (Referenzimplementierung)
- [ ] Task 7: `CommandPalette.tsx` auf `useFocusTrap` umstellen
- [ ] Task 8: `SettingsPanel.tsx` auf `useFocusTrap` umstellen
- [ ] Task 9: `PluginDetailPanel.tsx`, `NewConversation.tsx`, `TemplateSelector.tsx` auf `useFocusTrap` umstellen

## Phase 3: Skip-Navigation & Landmarks

- [ ] Task 10: Skip-Link in `App.tsx` + `App.css` ergänzen, springt zu `#main-content`
- [ ] Task 11: Toolbar-Landmark-Bewertung durchführen, ggf. `<header>` oder konsistentes Pattern ergänzen

## Phase 4: Tastaturbedienbarkeit

- [ ] Task 12: `StatusBar.tsx` — fehlende `role`/`tabIndex`/Keydown-Handler für interaktive Items ergänzen
- [ ] Task 13: `TabContent.tsx` — ARIA/Tastatur-Lücken schließen
- [ ] Task 14: `TrashView.tsx` — ARIA/Tastatur-Lücken schließen
- [ ] Task 15: `SidebarSplitContainer.tsx`/`SidebarPanelTabBar.tsx` — `role="separator"` + Pfeiltasten-Resize (Wiederverwendung von `useResize`-Callback)
- [ ] Task 16: `CanvasMinimap.tsx` — `aria-hidden` oder Tastaturzugriff, je nach Audit-Ergebnis

## Phase 5: Farbkontrast

- [ ] Task 17: Alle Text-/Hintergrund-Token-Paare in `index.css` (Light + Dark) gegen WCAG-AA prüfen
- [ ] Task 18: Gefundene Kontrast-Verstöße gezielt beheben (nur betroffene Tokens anpassen)

## Phase 6: Canvas/Graph-Alternative

- [ ] Task 19: `GraphView.tsx` — dynamisches `aria-label` mit Knoten-/Kanten-Anzahl auf SVG-Root
- [ ] Task 20: `CanvasView.tsx` — Tab-Fokus-Reihenfolge zwischen Nodes + Enter/Space zum Öffnen
- [ ] Task 21: `CanvasView.tsx` — Pfeiltasten-Viewport-Verschiebung als Tastatur-Alternative zu Maus-Pan

## Phase 7: Zoom, Manueller Test & Report

- [ ] Task 22: 200%-Zoom-Check für Editor, Sidebar, Settings-Panel; kritische Brüche fixen
- [ ] Task 23: Manueller NVDA-Testdurchlauf über Login, Datei öffnen/bearbeiten, Sidebar-Navigation, Settings
- [ ] Task 24: `ACCESSIBILITY-AUDIT.md` mit allen Findings (Schweregrad, Komponente, Status) finalisieren
