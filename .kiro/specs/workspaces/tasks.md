# Workspaces (benannte Layouts) — Tasks

## Datenmodell & Persistenz
- [ ] 1. `NamedWorkspace`-Typ definieren (name, savedAt, tabs, paneTree?, panel-layout-Kopien).
- [ ] 2. `vaultSettingsStore` + Backend-`vaultSettings`-Schema um `workspaces: NamedWorkspace[]`
      erweitern (Größe/Typ-Validierung wie bei den anderen Layout-Blobs, keine Shape-Prüfung der
      Pane-Baum-Interna — die gehört dem Client). `exactOptionalPropertyTypes` im Backend beachten.

## Capture (R1)
- [ ] 3. `captureCurrentWorkspace()`: Tabs (content-frei) + `serializePaneTree` + Panel-Layouts.
- [ ] 4. `workspace:save-layout`-Command in `core-commands-app.ts`, verdrahtet in
      `CommandPaletteContainer`; Namenskollision → `ConfirmModal` (Überschreiben).

## Restore (R2)
- [ ] 5. `REPLACE_PANE_TREE`-Aktion im `paneTreeState.ts`-Reducer + Reducer-Test.
- [ ] 6. Gemeinsame Restore-Logik aus `useWorkspaceRestore.ts` extrahieren (Pane-Baum setzen +
      Tabs post-mount nachladen mit `cancelled`-Guard); von Session-Restore UND Workspace-Laden
      genutzt.
- [ ] 7. `applyWorkspace()`: Pane-Baum + Tabs + Panel-Layouts wiederherstellen, nicht-auflösbare
      Tabs überspringen (R5). Vorher offene Editor-Puffer flushen.
- [ ] 8. `workspace:load-layout`-Command + Auswahl-Modal (QuickSwitcher-Struktur, `useFocusTrap`).

## Verwaltung (R3)
- [ ] 9. Umbenennen/Löschen im Lade-Modal (Inline-Aktionen) oder via Commands.

## Abschluss
- [ ] 10. i18n-Keys in de.ts + en.ts.
- [ ] 11. Tests: Round-Trip, übersprungener Tab, lenientes Parsen, `REPLACE_PANE_TREE`.
- [ ] 12. `npx tsc --noEmit` (Backend), `npm run build` (Frontend), beide `test:coverage` grün,
      `npx eslint . --quiet` 0 Errors.
- [ ] 13. `product.md` + `implementation-plan.md` (Track-G-Rest erledigt) aktualisieren.
