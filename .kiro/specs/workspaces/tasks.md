# Workspaces (benannte Layouts) — Tasks

## Datenmodell & Persistenz
- [x] 1. `NamedWorkspace`-Typ (name, savedAt, paneTree, sidebarPanel?, contextPanel?) in
      `state/workspacesStore.ts`.
- [x] 2. `vaultSettingsStore` + Backend-`vaultSettings`-Schema um `workspaces` erweitert
      (Backend: opakes Objekt-Array, Zod-Cap 50, Store-Filter; Frontend: default + normalize).

## Capture (R1)
- [x] 3. `buildWorkspace()`: Tabs (via `serializePaneTree`) + Panel-Layouts (`loadPanelLayout`).
- [x] 4. `workspaces:save`-Command (core-commands-app, verdrahtet in CommandPaletteContainer);
      Namenskollision → Inline-Überschreib-Bestätigung im `WorkspacesModal`.

## Restore (R2)
- [x] 5. `REPLACE_PANE_TREE`-Aktion im `paneTreeState.ts`-Reducer + Reducer-Test.
- [x] 6. Gemeinsame Restore-Logik `state/paneTreeRestore.ts` (`fetchPaneTreeContent`), von
      `useWorkspaceRestore.ts` UND Workspace-Laden genutzt.
- [x] 7. `applyWorkspaceByName()`: `REPLACE_PANE_TREE` + `fetchPaneTreeContent` + Panel-Layouts;
      nicht-auflösbare Tabs übersprungen (R5). Offene Puffer via EditMode-Unmount-Flush gesichert.
- [x] 8. `workspaces:load`-Command + `WorkspacesModal` (QuickSwitcher-Struktur, `useFocusTrap`).

## Verwaltung (R3)
- [x] 9. Umbenennen/Löschen inline im Lade-Modal.

## Abschluss
- [x] 10. i18n-Keys in de.ts + en.ts (`workspaces.*`).
- [x] 11. Tests: `REPLACE_PANE_TREE`, workspacesStore Round-Trip/overwrite/rename/delete/lenient.
- [x] 12. `tsc --noEmit` (Backend), `tsc -b` (Frontend), betroffene Tests grün, ESLint 0 Errors.
- [x] 13. `product.md` + `obsidian-feature-gaps` aktualisiert; Track-G-Rest erledigt.
