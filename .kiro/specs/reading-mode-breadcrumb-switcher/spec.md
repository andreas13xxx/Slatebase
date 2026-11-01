# Lesemodus + 3-Modi-Umschalter in der Breadcrumb

## Kontext

Der Editor-Tab kennt heute zwei Modi (`TabMode = 'edit' | 'view'`), die aber **beide
editierbare CM6-Ansichten** sind: `edit` = Source, `view` = Live Preview
(`livePreviewMode={true}`). Der echte, nicht-editierbare Reading View (`ViewMode.tsx`,
volle remark-Pipeline) wird nur als Embed-Renderer und im Hover-Preview genutzt — **nicht**
als Tab-Modus. Der Umschalter ist ein Pencil/Eye-Button pro Tab im `TabBar`.

## Ziel

1. **Dritter Modus „Lesemodus"** (`reading`): rendert `ViewMode` read-only als Tab-Inhalt —
   maximale Synergie, keine zweite Renderimplementierung.
2. **Umschalter aus dem Tab-Button heraus** in die **Breadcrumb**, rechts am Ende (nach dem
   Dateinamen), jetzt mit **drei Segmenten**: Source · Live Preview · Lesemodus.

## Requirements

### R1 — Drei Modi
- `TabMode` wird zu `'source' | 'live-preview' | 'reading'`.
  - `source` → `EditMode` mit `livePreviewMode={false}`
  - `live-preview` → `EditMode` mit `livePreviewMode={true}`
  - `reading` → **neu**: `ViewMode` (read-only, gerendert)
- Alte persistierte Werte (`'edit'`/`'view'`) werden beim Laden migriert:
  `'edit' → 'source'`, `'view' → 'live-preview'` (bisheriges Verhalten bleibt für
  bestehende Tabs erhalten — `view` war Live Preview, nicht Reading).

### R2 — Initialer Modus
- Beim ersten Öffnen einer Notiz: `defaultViewMode` aus `app.json`
  (`'source'` → `source`, sonst → **`reading`**; echtes Obsidian-Verhalten: „view" = reading).
  **Abweichung zum Ist:** vorher landete man bei Nicht-`source` in Live Preview; künftig im
  Lesemodus. Bewusst, in tasks.md notiert.
- Reload / Nicht-Notiz-Tabs (Graph, Plugin-Views, Binär): kein Lesemodus erzwingen — bleiben
  wie bisher (`live-preview` als unschädlicher Default für die wenigen Codepfade, die den
  Modus eines Nicht-Notiz-Tabs lesen).

### R3 — Lesemodus-Rendering (Synergie)
- `reading` rendert `<ViewMode>` mit denselben Props wie der Embed-Pfad:
  `content` (= `editBuffer ?? content`, damit ungespeicherte Änderungen sichtbar sind),
  `vaultId`, `directoryTree` (des aktiven Vaults), `onInternalLinkClick` (öffnet Tab, wie
  im Editor-Link-Klick), `sourcePath = filePath` (für `this` in eingebetteten Bases).
- Keine eigene Scroll-/State-Verwaltung nötig; `ViewMode` ist bereits in sich geschlossen.
- Read-only-Vaults: unverändert, da `ViewMode` ohnehin nie schreibt.

### R4 — Umschalter in der Breadcrumb
- Neue Komponente `BreadcrumbModeSwitcher` (3 Segment-Buttons, aktiver Modus hervorgehoben,
  `role="radiogroup"` + `role="radio"`/`aria-checked`, Tooltips).
- Gerendert **in `Breadcrumb.tsx`, rechts am Ende**, nach dem Dateinamen.
- Erscheint nur für Notiz-Tabs (nicht Binär/Graph/Canvas/Plugin-View). Für solche Tabs
  bekommt die Breadcrumb keinen Umschalter (bzw. die Props sind dann `undefined`).
- Props der Breadcrumb werden um `mode?: TabMode` und `onModeChange?: (m: TabMode) => void`
  erweitert. Fehlen beide → kein Umschalter (rückwärtskompatibel, auch für Tests).

### R5 — Umschalter aus dem Tab entfernen
- Der `tab-bar-mode-btn`-Button im `TabBar` entfällt (inkl. zugehörigem Handler/CSS).
- Tab zeigt nur noch Icon · Name · Pin/Close.

### R6 — Gerichtetes Setzen statt Toggle
- Neue Action `SET_MODE { tabId, mode }` ersetzt die binäre Semantik von `TOGGLE_MODE` für
  den Umschalter. `TOGGLE_MODE` bleibt bestehen (Rückwärtskompatibilität der Commands),
  bekommt aber definierte 3-Wege-Semantik: **Reading ↔ zuletzt-genutzter-Edit-Modus**
  (Obsidians „Toggle reading view").
- Commands:
  - `markdown:toggle-preview` („Toggle reading view") → Reading ↔ Edit (via TOGGLE_MODE).
  - `editor:toggle-source` („Toggle Live Preview/Source mode") → **Source ↔ Live Preview**
    (neue Action `SET_MODE`, wechselt nur zwischen den beiden Edit-Modi; aus Reading heraus
    springt es in den zuletzt genutzten Edit-Modus bzw. live-preview).
  - `exportActiveFileToPdf` setzt gezielt `reading` (statt blind zu togglen).

### R7 — Persistenz
- `workspaceStore` persistiert den neuen Modus; `parsePersistedWorkspace` migriert `edit`/`view`
  und akzeptiert die drei neuen Werte.
- `obsidianLayout.ts` / `pane-layout.ts`: Mode-Mapping prüfen (Obsidian-Layout kennt
  `state.mode: 'source' | 'preview'`), damit Workspaces-Export nicht bricht.

### R8 — i18n
- Neue Keys `tabs.modeSource` / `tabs.modeLivePreview` / `tabs.modeReading` (Button-Tooltips
  + aria-labels) in `de.ts` **und** `en.ts`.

## Design

### Dateien
| Datei | Änderung |
|---|---|
| `state/tabState.ts` | `TabMode` = 3 Werte; `SET_MODE`-Action; `TOGGLE_MODE` 3-Wege; Default-Mode-Logik; `lastEditMode`-Tracking am TabEntry für Reading↔Edit |
| `state/tabActions.ts` | ggf. Helper für zyklisches/gerichtetes Setzen (nur falls gebraucht) |
| `components/TabContent.tsx` | dritter Branch: `mode === 'reading'` → `<ViewMode>`; die beiden Edit-Branches auf `source`/`live-preview` umstellen |
| `components/Breadcrumb.tsx` | `BreadcrumbModeSwitcher` (neue Unterkomponente in derselben Datei oder eigene), rechts am Ende; neue Props |
| `components/Breadcrumb.css` *(oder App.css)* | Styles für den Switcher (Design Tokens) |
| `components/TabBar.tsx` | `tab-bar-mode-btn` entfernen |
| `App.tsx` | Breadcrumb bekommt `mode`/`onModeChange` für den aktiven Tab |
| `components/panes/PaneHeader.tsx` | dito für den Split-Pane-Fall (Pane-eigener aktiver Tab) |
| `state/workspaceStore.ts` | Mode-Migration in `parsePersistedWorkspace` |
| `state/obsidianLayout.ts`, `plugins/compat/pane-layout.ts` | Mode-Mapping an 3 Werte anpassen |
| `plugins/compat/core-commands-app.ts` | `editor:toggle-source` → SET_MODE Source↔LivePreview; PDF-Export → reading |
| `i18n/de.ts`, `i18n/en.ts` | neue Keys |
| Tests | `tabState.test.ts`, `Breadcrumb.test.tsx`, `TabContent`-nahe Tests, `core-commands-app.test.ts`, `vaultAppConfigStore.test.ts`, workspaceStore-Migrationstest |

### `TabEntry`-Erweiterung
- `mode: TabMode` (3 Werte).
- `lastEditMode?: 'source' | 'live-preview'` — merkt sich den Edit-Modus, in den
  `markdown:toggle-preview` aus dem Lesemodus zurückkehrt. Default `live-preview`.

### CSS
- Switcher-Segmente nutzen bestehende Breadcrumb-/Token-Variablen (`--bg-*`, `--text-*`,
  `--accent*`, `--border-*`), aktiver Zustand mit Akzent. Keine festen Farben.
- Keine neue absolute Positionierung über `overflow: hidden`-Containern.

## Phasen (Review → Commit je Phase, Push+PR am Ende)

- **Phase 1 — State:** `TabMode`, `SET_MODE`, `TOGGLE_MODE`-3-Wege, Default-Mode, `lastEditMode`,
  `tabState.test.ts`. Keine UI.
- **Phase 2 — Rendering:** `TabContent.tsx` dritter Branch (ViewMode) + Edit-Branches auf
  source/live-preview.
- **Phase 3 — Umschalter-UI:** `BreadcrumbModeSwitcher`, Einbindung in `Breadcrumb.tsx`,
  `App.tsx` + `PaneHeader.tsx` verdrahten, `tab-bar-mode-btn` aus `TabBar` entfernen, CSS,
  i18n, `Breadcrumb.test.tsx`.
- **Phase 4 — Commands & Persistenz:** `editor:toggle-source`/PDF-Export in
  `core-commands-app.ts`, `workspaceStore`-Migration, `obsidianLayout`/`pane-layout`-Mapping,
  betroffene Tests.
- **Phase 5 — Doku:** `structure.md` (TabMode-Zeile, Breadcrumb, TabContent), `product.md`
  (Editor-Modi), `lessons-learned.md` falls Gotcha.

## Akzeptanzkriterien
- Notiz öffnen → gemäß `defaultViewMode` Lesemodus oder Source.
- Breadcrumb zeigt 3-Segment-Umschalter rechts; Klick wechselt sofort.
- Lesemodus = `ViewMode` (Callouts, Embeds, Footnotes etc. wie im Embed).
- Tab hat keinen Modus-Button mehr.
- `editor:toggle-source` wechselt Source↔LivePreview; `markdown:toggle-preview` Reading↔Edit.
- Alte Workspaces/Tabs laden ohne Fehler (Migration).
- `tsc -b && vite build`, Tests, Lint grün.
