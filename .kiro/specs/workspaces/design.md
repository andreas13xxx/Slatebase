# Workspaces (benannte Layouts) — Design

## Datenmodell

Ein Workspace ist ein content-freier Snapshot derselben Form, die `workspaceStore.WorkspaceState`
heute hält — plus ein Name:

```ts
interface NamedWorkspace {
  name: string
  savedAt: string          // ISO
  tabs: PersistedTab[]     // ohne Inhalt, wie heute
  paneTree?: PersistedPaneTree
  // Panel-Layout-Referenzen (sidebar/context) — siehe unten
}
```

Die Snapshots leben **nicht** in `workspaceStore` (localStorage, das „aktuelle" Layout), sondern
server-backed **per User und Vault** über `vaultSettingsStore` — neues Feld
`workspaces: NamedWorkspace[]` im per-(user,vault)-Blob. Begründung: persönliche Arbeitspräferenz,
muss geräteübergreifend reisen, ist kein Vault-Content (also nicht `.slatebase/`). Gleiche
Server-gewinnt-Semantik + SSE-`preferences:change`-Echo wie die übrigen `vaultSettings`.

Panel-Layouts (sidebar/context) werden heute von `side-panel/utils/persistence.ts` ebenfalls in
`vaultSettingsStore` gehalten. Ein Workspace nimmt eine **Kopie** dieser Layout-Blobs mit auf,
damit das Umschalten auch die Panel-Anordnung wiederherstellt.

## Capture (R1)

`captureCurrentWorkspace(): NamedWorkspace` liest:
- die aktuellen Tabs (content-frei) — dieselbe Serialisierung wie `workspaceStore.flush`.
- `serializePaneTree(paneTree)` aus dem aktiven `PaneTreeProvider`.
- die aktuellen sidebar/context-Panel-Layouts aus `vaultSettingsStore`.

Speichern = Eintrag in `vaultSettings.workspaces` upserten (Name als Schlüssel; Überschreiben
nach `ConfirmModal`-Bestätigung bei Namenskollision).

## Restore (R2)

`applyWorkspace(ws: NamedWorkspace)`:
- Pane-Baum über `rehydratePaneTree` + `PaneTreeProvider`s `initialTree`-Pfad bzw. ein
  `REPLACE_PANE_TREE`-Dispatch wiederherstellen; Tab-Inhalte post-mount per `PANE_TAB_ACTION`
  nachladen (gleiches Muster wie `useWorkspaceRestore.ts`, inkl. `cancelled`-Guard).
- Panel-Layouts zurückschreiben (`savePanelLayout('sidebar'|'context', …)`).
- Nicht-auflösbare Tabs überspringen (R5) — wie die bestehende Tab-Wiederherstellung.

**Wiederverwendung:** Der Restore-Pfad ist fast identisch zu `useWorkspaceRestore.ts`. Die
gemeinsame Logik (Pane-Baum setzen + Tabs nachladen) wird dorthin extrahiert, damit Workspace-
Laden und Session-Restore nicht auseinanderdriften.

## Commands & UI

- `workspace:save-layout`, `workspace:load-layout`, optional `workspace:rename-layout`/
  `delete-layout` — registriert in `core-commands-app.ts` (brauchen React-State: Tabs, Panes,
  vaultSettings), verdrahtet über `CommandPaletteContainer` (wie die anderen `workspace:*`).
- Lade-UI: ein kleines Auswahl-Modal, strukturell wie `QuickSwitcher` (Overlay, `useFocusTrap`,
  Arrow/Enter/Escape, `.command-palette-*`-Klassen) — keine neue Modal-Chrome erfinden.
- i18n-Keys in de.ts + en.ts.

## Nicht offensichtliche Fallstricke
- `PaneTreeProvider` seedet `initialTree` nur beim ersten Render. Für ein Laufzeit-Umschalten
  braucht der Reducer eine `REPLACE_PANE_TREE`-Aktion (neu), die den ganzen Baum ersetzt —
  `FOCUS_PANE`/`SPLIT_PANE` reichen nicht.
- Beim Umschalten offene, ungespeicherte Editor-Puffer erst flushen (`flushPendingSave`-Analogie),
  sonst geht die Bearbeitung des gerade offenen Tabs verloren (siehe lessons-learned Debounce-Flush).

## Tests
- Capture/Restore Round-Trip (Pane-Baum + Tabs + Panel-Layout).
- Nicht-auflösbarer Tab wird übersprungen, Rest lädt.
- Lenientes Parsen: ein kaputter Workspace-Eintrag fällt weg, Liste bleibt gültig.
- Reducer-Test für `REPLACE_PANE_TREE`.
