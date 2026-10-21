# Workspaces (benannte Layouts) — Requirements

Obsidian-Feature-Parität: das aktuelle Pane-/Panel-Layout als benannten Workspace speichern und
zwischen mehreren umschalten. Entspricht dem zurückgestellten Rest von Track G
(`implementation-plan.md`). Teil des Branches `feature/obsidian-feature-gaps`.

## Ausgangslage (im Code verifiziert)

- Es wird bereits genau EIN Layout gehalten: `state/workspaceStore.ts` (`WorkspaceState` mit
  `tabs: PersistedTab[]` + optionalem `paneTree: PersistedPaneTree`), localStorage-basiert,
  per-Vault-Tab-Memory, cross-tab-Sync über das `storage`-Event.
- Der Pane-Baum ist content-frei serialisierbar: `serializePaneTree`/`rehydratePaneTree`/
  `parsePersistedPaneTree` in `state/paneTreeState.ts` existieren (Split-Panes Phase 4).
- Was fehlt: eine **Sammlung** benannter Snapshots + ein Umschalt-UI/-Command.

## Requirements

### R1 — Workspace speichern
- Als Benutzer möchte ich das aktuelle Layout (offene Tabs, Pane-Baum, Panel-Zustände) unter
  einem Namen speichern.
- Command `workspace:save-layout` (+ Palette) und ein UI-Einstieg.
- Ein gleichnamiger Workspace wird überschrieben (nach Rückfrage/Bestätigung).

### R2 — Workspace laden/umschalten
- Als Benutzer möchte ich zu einem gespeicherten Workspace wechseln; das stellt Tabs + Pane-Baum
  + Panel-Layout wieder her.
- Command `workspace:load-layout` öffnet eine Auswahl (Quick-Switcher-artige Liste).

### R3 — Workspaces verwalten
- Umbenennen und Löschen gespeicherter Workspaces (UI + Commands optional).

### R4 — Persistenz & Scope
- Workspaces sind persönliche Lese-/Arbeitspräferenzen, kein Vault-Inhalt → gespeichert
  **per User und Vault**, server-backed über `vaultSettingsStore` (wie Graph-/Panel-Layouts).
  NICHT in `.slatebase/` (kein Vault-Content), NICHT nur localStorage.
- Ein Workspace ist ein benannter, content-freier Snapshot derselben Form, die
  `workspaceStore` heute hält (Tabs ohne Inhalt + `paneTree` + Panel-Layout-Referenzen).

### R5 — Robustheit
- Ein Workspace, der eine inzwischen gelöschte Datei referenziert, lädt die übrigen Tabs trotzdem
  (einzelne nicht-auflösbare Tabs werden übersprungen, wie bei der Tab-Wiederherstellung).
- Lenientes Parsen (ein kaputter Eintrag invalidiert nicht die ganze Workspace-Liste) —
  gleiche Haltung wie `parsePersistedPaneTree`.

## Nicht in Scope
- Globale (vault-übergreifende) Workspaces — bewusst per Vault, wie der Rest der Layout-Prefs.
- Automatisches Workspace-Wechseln bei Vault-Wechsel.
