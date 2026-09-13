# Plugin-Compat Coupling Inventory

Inventory of how `frontend/src/plugins/compat/` — the Obsidian plugin-compatibility
layer — is coupled into the rest of the frontend. This is a research document (AP14c):
**nothing here is implemented.** It exists so a future decoupling effort has a real map
to work from instead of starting with a guess.

Verified against `origin/master` @ `8e61aee`-equivalent tree (`plugins/compat/` is
byte-identical between that commit and the current tip, `df9f4ab9`, confirmed via `git
diff --stat`). Line numbers and counts below are current as of that tree — re-verify
before trusting them if the layer has changed since.

## Numbers

- **29,543 LOC** in `plugins/compat/` (`.ts`/`.tsx`, excluding `*.test.ts`) — confirmed via
  `wc -l`, matches the brief exactly.
- **26 files** outside the directory import from it (static `from '...compat...'` and
  dynamic `import('...compat...')`, cross-checked against a broad grep for the substring
  `compat` to catch anything the import-statement pattern alone would miss) — matches the
  brief exactly. All 26 are listed below with their exact import lines.
- A file can import things in more than one category, so these aren't mutually exclusive:
  - **20 files** import at least one thing in category **(a)** — genuine plugin-integration
    surface (bridging core UI events/state into the shape the plugin API expects, or
    rendering plugin-contributed UI).
  - **1 file** (`CommandPaletteContainer.tsx`) imports something in category **(b)** —
    Slatebase's own functionality that lives in `plugins/compat/` only because it happens
    to populate a registry plugins also use.
  - **10 files** import at least one thing that's really category **(c)** — a shared
    primitive (logging, icon resolution, platform detection) that ended up in
    `plugins/compat/` by accident of where it was first needed, not because it's
    plugin-specific.

---

## 1. Kopplungsinventar

Legend: **(a)** real plugin-integration surface · **(b)** Slatebase-owned code housed in
compat · **(c)** shared primitive that isn't plugin-specific at all.

| File | Imports from `plugins/compat/` | Cat. | Why |
|---|---|---|---|
| `App.tsx` | `PluginProvider` (`plugin-context`) | (a) | Mounts the whole plugin subsystem. Unconditional, wraps the entire vault view (see Finding 1 below) — the mount point itself is legitimate plugin infra, but *where* it's mounted is the AP8 problem. |
| `components/CommandPalette.tsx` | `Command` type (`command-registry`) | (c) | The `Command` shape (id, name, callback, hotkeys) is populated by *both* real plugins and Slatebase's own core commands (see next row) — it's a shared data contract, not plugin-only. |
| `components/CommandPaletteContainer.tsx` | `usePluginContext`, `Command` type, `registerCoreAppCommands`/`CoreAppCommandHandlers`/`NavigablePage` (`core-commands-app`) | (a) + **(b)** | `usePluginContext` (a, reaching the shared registry). `registerCoreAppCommands` is **the clearest (b) case**: `core-commands-app.ts` (861 LOC) registers Slatebase's *own* navigation/app commands — nothing about it is Obsidian-plugin-related except that it writes into the same `command-registry` plugins also write into. |
| `components/FileExplorer.tsx` | `buildTFileFromPath`/`buildTFolderFromPath` (`plugin-event-bridge`), `TFile`/`TFolder` types, `buildPluginMenuItems` (`plugin-menu-bridge`) | (a) | Converts Slatebase's native file/folder representation into Obsidian's `TFile`/`TFolder` shape so plugin event handlers and context-menu contributions can consume file-explorer interactions. This *is* the compat layer's job. |
| `components/GraphView.tsx` | `buildTFileFromPath`, `buildPluginMenuItems` | (a) | Same bridge, so a plugin can react to a graph-node click or add a context-menu item on one. |
| `components/HoverPreview.tsx` | `detectPlatform`/`readPlatformEnvironment` (`platform-detection`), `onHoverPreview`/`HoverPreviewRequest` (`hover-link-bus`) | (c) + (a) | `platform-detection` (c) — desktop/mobile/Electron detection is a general app concern, not plugin-specific; it lives in compat only because it also backs Obsidian's `Platform` global. `hover-link-bus` (a) — Slatebase's *own* native hover-preview feature listens here because a hover can originate from plugin-rendered content (e.g. a Dataview-rendered internal link), so the bus has to be a shared crossing point. |
| `components/PluginManagementPage.tsx` | `CompatibilityAnalyzer`, `ApiCallClassification`, `PluginContext`, dynamic `declarative-settings-renderer` | (a) | This page's entire purpose is managing plugins. Unambiguous. |
| `components/PluginRibbonIcon.tsx` | `resolveIconMarkupSync` (`lucide-icons`) | (c) | Generic icon-name → SVG-markup resolution. Used identically by Slatebase's own UI elsewhere (see `TabBar.tsx`, `PanelTabBar.tsx` below) for icons with nothing to do with plugins. |
| `components/PluginViewPanel.tsx` | `PluginContext` | (a) | Renders plugin-contributed view panels. Unambiguous. |
| `components/RealtimeProvider.tsx` | `warnOnce` (`log`) | (c) | SSE/realtime connection management. `log.ts`'s dedup-warning helper is a generic logging utility (see AGENTS.md: "Console output goes through `plugins/compat/log.ts`" — that note itself documents this file has become the de facto app-wide logger, not a plugin-specific one). |
| `components/SearchPanel.tsx` | `buildTFileFromPath`, `buildPluginMenuItems` | (a) | Same bridge as FileExplorer/GraphView, for search results. |
| `components/SidebarToolbar.tsx` | `usePluginContext` | (a)* | Reads `ribbonIcons` to merge plugin-contributed ribbon icons into the sidebar toolbar. *Flagged with an asterisk: the merge itself — built-in Slatebase buttons and plugin ribbon icons converted into one shared entry shape and rendered by the same code — is a deeper design coupling than a single import shows (see Finding 2). |
| `components/StatusBar.tsx` | `getStatusBarItems`, `onStatusBarItemsChange`, `StatusBarItemEntry` type (`status-bar-registry`) | (a) | Confirmed by reading the file: Slatebase's own built-in items (clock, word count, etc.) are rendered independently and never touch this registry — only the plugin-contributed items go through it. Clean (a), unlike SidebarToolbar. |
| `components/TabBar.tsx` | `resolveIconMarkupSync` (`lucide-icons`) | (c) | Same generic icon utility as PluginRibbonIcon, here resolving *tab* icons — most of which are Slatebase's own file-type icons, not plugin icons. |
| `components/TabContent.tsx` | `PluginContext`, `findFileViewMatch`/`getActiveFileView`/`setActiveFileView`/`removeActiveFileView` (`file-view-registry`) | (a) | Determines whether a plugin registered a custom view for a file type (e.g. a canvas/whiteboard plugin claiming `.excalidraw`). Core plugin-API surface. |
| `components/ViewMode.tsx` | `requestHoverPreview`/`dismissHoverPreview` (`hover-link-bus`), `warnOnce` (`log`), `findEmbedCreatorForTarget`/`getLinktextExtension`/`mountRegisteredEmbed` (`embed-registry`), `buildTFileFromPath`, `buildPluginMenuItems`, dynamic `code-block-processor-registry` | (a) ×4, (c) ×1 | The reading view's plugin-extensibility points: custom embed renderers and code-block processors a plugin can register (Mermaid-style block handlers, custom embeds). `warnOnce` is (c) as elsewhere. |
| `components/context-panel/LinksView.tsx` | `buildTFileFromPath`, `buildPluginMenuItems` | (a) | Same bridge, for the context panel's backlinks/forward-links list. |
| `components/file-explorer/TreeNode.tsx` | `registerFileExplorerRow`/`unregisterFileExplorerRow` (`file-explorer-dom-registry`) | (a) | Exposes file-explorer DOM rows to plugins that decorate them (icons, badges) — a specific, named Obsidian extensibility point. |
| `components/side-panel/PanelTabBar.tsx` | `resolveIconMarkupSync` (`lucide-icons`) | (c) | Same generic icon utility again. |
| `components/side-panel/SidePanel.tsx` | `PluginContext`, `SidebarViewInfo` type | (a) | Renders plugin-contributed sidebar views. |
| `components/tab-context-menu.ts` | `buildTFileFromPath`, `buildPluginMenuItems` | (a) | Same bridge, for the tab context menu. |
| `editor/CodeMirrorEditor.tsx` | `warnOnce` (`log`), `EditorShim` (`editor-shim`), `buildTFileFromPath`, `buildPluginMenuItems` | (c), (a) ×3 | `EditorShim` wraps the CM6 editor state so it looks like Obsidian's `Editor` API to plugins — textbook (a). |
| `editor/editor-context-menu.ts` | `buildPluginMenuItems` | (a) | Same bridge, for the editor's own context menu. |
| `editor/live-preview/widget-decorations.ts` | `hasCodeBlockProcessor`/`getCodeBlockHandler`/`MarkdownRenderChild` type (`code-block-processor-registry`), `errorOnce` (`log`), `findEmbedCreatorForTarget`/`getLinktextExtension`/`mountRegisteredEmbed` (`embed-registry`) | (a) ×2, (c) ×1 | Live Preview's equivalent of ViewMode's plugin-extensibility points (a plugin's code-block processor or embed creator has to run in both reading view and Live Preview). |
| `state/useEventSource.ts` | `warnOnce` (`log`) | (c) | SSE client-side connection logic; the logging helper again, unrelated to plugins. |
| `utils/pluginIcon.ts` | `subscribeToIconResolution` (`lucide-icons`) | (a) | Unlike TabBar/PanelTabBar's use of the *same* `lucide-icons` module, this file's whole purpose (per its own doc comment) is resolving icon names *plugins* pass through `addRibbonIcon`/`ItemView.getIcon()`/`addIcon()` — genuinely plugin-flavored, just filed under `utils/` instead of near compat. |

---

## 2. Findings

**Finding 1 — the mount point, not the import, is AP8's actual blocker.**
`App.tsx` wraps `PluginProvider` around the entire vault view unconditionally (line 953 in
the current tree). Even if every individual import above were perfectly clean, code
splitting the *rest* of the compat layer behind the plugin feature toggle doesn't help
bundle size if `PluginProvider` itself — and everything it transitively needs to render a
vault, including `core-commands.ts`/`core-commands-app.ts` below — has to be in the
initial bundle regardless of the toggle.

**Finding 2 — `core-commands.ts` / `core-commands-app.ts` / `core-command-i18n.ts` are the
big, unambiguous (b) case; nothing else at this size qualifies.**

| File | LOC | What it actually is |
|---|---|---|
| `core-commands-app.ts` | 861 | Slatebase's own app-level commands (navigation, view switching, etc.) needing React state — wired in by `CommandPaletteContainer` |
| `core-commands.ts` | 482 | Slatebase's own editor-only commands |
| `core-command-i18n.ts` | 318 | German/English labels for the two files above |
| **Total** | **1,661** | Zero Obsidian-plugin content. All three exist only to populate `command-registry.ts` (310 LOC, itself a legitimate shared primitive — plugins register real `Command` objects into the exact same registry). |

I looked for other files of similar shape (a whole file that's 100% Slatebase's own
feature code, not just an import into a shared registry) and didn't find one at this
scale. The closest secondary pattern is:

**Finding 3 — a "shared logging/platform/icon utility" cluster (category (c)), not
Slatebase-specific but also not plugin-specific, that ended up in compat/ by accident of
where it was first needed.**

| Module | LOC | Used by (outside compat) |
|---|---|---|
| `log.ts` | 84 | `RealtimeProvider.tsx`, `useEventSource.ts`, `CodeMirrorEditor.tsx`, `ViewMode.tsx`, `widget-decorations.ts` — none of these are plugin code |
| `platform-detection.ts` | 128 | `HoverPreview.tsx` |
| `lucide-icons.ts` | 485 | `PluginRibbonIcon.tsx`, `TabBar.tsx`, `PanelTabBar.tsx`, `pluginIcon.ts` — split roughly evenly between plugin- and non-plugin icon rendering |

AGENTS.md already documents `log.ts` as *the* app-wide console-output convention
("`debug*` = intended trade-off, `warn*` = real gap, `*Once` for render/event paths") —
it isn't hedging as plugin-specific, it's already been adopted as general infrastructure.
That's 697 LOC of genuinely reusable utility code whose only "plugin" characteristic is
its file path.

**Finding 4 — `SidebarToolbar.tsx` shows a deeper coupling pattern than a clean import
list can capture.** It doesn't just *read* plugin ribbon icons — it converts them into
the same shape as Slatebase's own built-in toolbar buttons and renders both through one
code path (its own comment: "Built-in buttons and plugin ribbon icons are merged into one
entry list and rendered by the same code"). `StatusBar.tsx`, by contrast, keeps its
built-in items and plugin items on entirely separate paths that only merge visually. If a
cut is drawn between core and compat, `SidebarToolbar.tsx`'s merge is the kind of code
that would need an actual interface (not just "stop importing from compat") to keep both
working.

---

## 3. Schnittvorschlag (where the boundary should run)

The honest boundary isn't "core never imports from compat" — `command-registry.ts`,
`hover-link-bus.ts`, `plugin-menu-bridge.ts`, `plugin-event-bridge.ts`, and the various
`*-registry.ts` files are legitimately the **plugin API surface**: the deliberate,
documented set of crossing points where core UI feeds events in and reads plugin
contributions out. Core code depending on that surface is the *point* of having it. The
boundary problem is specifically:

1. **Category (b) code shouldn't live on the far side of the boundary at all.**
   `core-commands.ts`/`core-commands-app.ts`/`core-command-i18n.ts` should move to a
   `frontend/src/commands/` (or similar) module that *depends on* `command-registry.ts`
   the same way a real plugin's registration call would — i.e., import the registry, not
   the other way around. This changes nothing about behavior, only which side of the line
   the code sits on.

2. **Category (c) code shouldn't live inside `plugins/compat/` either**, but moving it is
   lower priority than (b) — it's not misattributed as "plugin code" in the same
   confusing way, it's just misfiled. `log.ts` → something like `frontend/src/logging/`;
   `platform-detection.ts` → `frontend/src/platform/`; the icon-resolution half of
   `lucide-icons.ts` that has nothing to do with plugin `addIcon()` registration could stay
   put, since splitting one file along a usage line is its own small project.

3. **The registries/bridges themselves (`command-registry.ts`, `plugin-menu-bridge.ts`,
   `plugin-event-bridge.ts`, `hover-link-bus.ts`, `file-view-registry.ts`,
   `embed-registry.ts`, `code-block-processor-registry.ts`, `status-bar-registry.ts`,
   `file-explorer-dom-registry.ts`, `ribbon-icon-registry.ts`, `setting-tab-registry.ts`,
   `PluginContext`/`usePluginContext`) are the real intermediate layer the brief asks
   about — they already exist, they just currently live inside the same directory and
   package boundary as 29,543 LOC of plugin emulation, so nothing marks them as "the 14
   files' worth of stuff you're allowed to depend on" versus everything else. Moving them
   to their own directory (e.g. `frontend/src/plugin-api/`) — still exporting the exact
   same functions, still implemented in terms of the same Obsidian-shaped types — would
   make the dependency direction visible in the file tree even before any bundle-size
   work happens: `components/`, `editor/`, `commands/` → `plugin-api/` ← `plugins/compat/`.

---

## 4. Kleinste sinnvolle erste Scheibe

**Move `core-commands.ts`, `core-commands-app.ts`, and `core-command-i18n.ts` out of
`plugins/compat/` into a new `frontend/src/commands/` directory. Nothing else.**

- Update the 3 files' own imports (they'd now import `command-registry.ts` and any
  `Command`/type surface from `../plugins/compat/command-registry.js` instead of being
  siblings of it).
- Update the one external importer, `CommandPaletteContainer.tsx`, to the new path.
- Move `core-commands.test.ts` and `core-commands-app.test.ts` alongside.
  `core-command-i18n.ts` has no dedicated test file of its own — its labels are exercised
  indirectly through those two.
- No behavior change, no new abstraction, no interface to design — pure file move plus
  import-path updates.

Effort estimate: **half a day**, mostly re-running the full test suite and manually
re-checking the command palette (all core commands still listed, still invokable, i18n
labels still correct) and Live Preview / editor context menu (nothing there references
these files, but the plugin loader's dynamic-import graph is worth a sanity check since
`core-commands.ts` sits in the same directory it's dynamically imported alongside plugin
code today).

---

## 5. Ehrliche Gegenrechnung

**What this slice does *not* buy you:** no bundle-size reduction. Core commands are
needed on every vault view regardless of whether the plugin-compat feature toggle is on,
so moving them doesn't remove anything from the bundle a user with plugins disabled
downloads.

**What it does buy you:**
- **It's the specific thing blocking AP8.** The brief states plainly that this coupling is
  why AP8's code-splitting had to carve the compat layer out entirely rather than gating
  it behind the feature toggle it's already conditioned on. Moving 1,661 LOC of
  unconditionally-needed core code out from among the 29,543 LOC that *are* conditional is
  the precondition for that split to ever apply — without it, `PluginProvider` and
  everything reachable from `App.tsx`'s unconditional mount (Finding 1) has to ship
  either way.
- **Independent versioning becomes meaningful for the first time.** Right now a change to
  Slatebase's own command palette and a change to Obsidian API emulation are the same
  package for versioning/changelog purposes. Separating them doesn't add tooling, but it
  removes a standing reason not to add it later.
- **Testability**: `core-commands-app.ts`'s 861 lines currently sit in a test suite
  (`core-commands-app.test.ts`) that has to import through the compat module graph to
  test navigation commands. Moving it out means testing "does the Edit menu command work"
  no longer has an implicit dependency on the plugin-compat layer compiling at all.

**What this slice deliberately does not attempt, and why that's the right call for now:**
Finding 1 (the unconditional `PluginProvider` mount) and Finding 3 (the `log.ts`/
`platform-detection.ts`/`lucide-icons.ts` cluster) are both real, but neither is "smallest
first slice" material. Finding 1 requires deciding what a vault view looks like with
plugins genuinely absent from the render tree, not just present-but-disabled — that's a
product decision, not a refactor, and belongs to whoever picks up AP8's continuation.
Finding 3 requires splitting `lucide-icons.ts` along a usage line without a git-blame's
distance of context on which Lucide aliases exist *because* a specific plugin's icon name
needed one; rushing that risks silently breaking a plugin's ribbon icon in a way `git
diff` won't show. Both are real follow-up candidates, not this AP's scope, and are
recorded here so they aren't rediscovered from scratch.

**If the answer here had been "not worth it": it would have been worth saying so** — but
it isn't the answer. The core-commands extraction is small, safe, behavior-neutral, and
directly unblocks a previously-abandoned optimization (AP8). That's a rare enough
combination in a 29,543-LOC subsystem that it's worth doing even though the honest
accounting above says it saves zero bytes on its own.
