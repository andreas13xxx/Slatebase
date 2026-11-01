# `.obsidian/` configuration files: what Slatebase reads, writes and does with them

Obsidian does not document these files. This page records what is known, what is assumed and what
Slatebase does with each file. The key tables in code (`shared-contracts/src/app-config.ts`,
`appearance-config.ts`, one table per file, shared by backend and frontend) are the source of truth
for types, allowed values and defaults.

**How to read the tables.** *Verified* means the key name and default were seen in a real Obsidian
file. Obsidian writes only values that differ from its default, so a key present in a file proves
the opposite default. Everything else is an assumption. A real file that contradicts the tables
(unknown key, wrong type, value outside an enum) is reported once per server run in the server
console (`[obsidian-config] vault=… file=… path=…`) and once per session in the browser console; the
file is never rewritten for that and the default applies.

**Rules for every file.** The file lives in the vault, so a value is the same for everyone who opens
the vault, and changing it needs write access. Keys Slatebase does not know are kept when it writes.
A file that is not a JSON object is never overwritten (the API answers 409). Changes made by
Obsidian or a sync reach open sessions through `vault:change`.

## app.json

API: `GET/PATCH /api/v1/vaults/:vaultId/app-config`. Store: `state/vaultAppConfigStore`.

Status: **wirkt** (has an effect in Slatebase), **Plugin-API** (read by plugins through
`vault.getConfig()` and by the link code, no setting of its own), **gespeichert** (accepted and kept,
no function yet), **durchgereicht** (kept for Obsidian and plugins, no function possible).

| Key | Type / values | Default | Verified | Status |
|---|---|---|---|---|
| `attachmentFolderPath` | string (`./` next to the note, `/` vault root, `./name` sub folder, `name` fixed folder) | `./` | yes | wirkt |
| `alwaysUpdateLinks` | boolean | `false` | yes | wirkt: a rename or move rewrites links in other notes only if on |
| `readableLineLength` | boolean | `true` | yes | wirkt |
| `showLineNumber` | boolean | `false` | yes | wirkt |
| `showUnsupportedFiles` | boolean | `false` | yes (name) | wirkt: nur ein **explizites** `false` blendet Dateien mit unbekannter Endung aus dem Datei-Explorer aus (Ordner bleiben). Ein fehlender Schlüssel zeigt weiter alles — Slatebase hat immer alles gezeigt und übernimmt Obsidians Ausblenden-per-Default bewusst nicht. Frontend-Filter, keine Serveränderung |
| `promptDelete` | boolean | `true` | yes (name) | wirkt: off deletes without asking (the item still goes to the trash) |
| `userIgnoreFilters` | list of strings | `[]` | yes (name) | gespeichert |
| `spellcheck` | boolean | `true` | no | wirkt |
| `livePreview` | boolean | `true` | no | wirkt |
| `newFileLocation` | `root` `current` `folder` | `root` | no | wirkt: the folder a new note is created in (the vault root, the open note's folder, or `newFileFolderPath`; a missing folder falls back to the root); also Plugin-API |
| `useMarkdownLinks` | boolean | `false` | no | Plugin-API |
| `newLinkFormat` | `shortest` `relative` `absolute` | `shortest` | no | Plugin-API |
| `newFileFolderPath` | string (folder in the vault) | empty | no | wirkt (with `newFileLocation: folder`) |
| `defaultViewMode` | `source` `preview` | `source` (Obsidian's) | no | wirkt: a note opened for the first time opens in the editor only if the file says `source`; otherwise in the reading view. **Deviation:** an absent key (Obsidian's `source`) reads here, because Slatebase always opened notes reading; plugins asking `getConfig` still get `source` |
| `strictLineBreaks` | boolean | `false` | no | wirkt: on, a single newline stays a space in the reading view (off = line break, as in Obsidian) |
| `foldHeading`, `foldIndent` | boolean | `true` | no | wirkt: off stops headings / lists being foldable (fold markers and commands for new folds); sections already folded stay folded until unfolded |
| `tabSize` (1–16) | number | 4 | no | wirkt: tab width of the editor |
| `useTab` | boolean | `true` | no | wirkt: Tab indents with a tab character; off, with `tabSize` spaces |
| `autoPairBrackets` | boolean | `true` | no | wirkt: closes `( [ { ' "` while typing |
| `autoPairMarkdown` | boolean | `true` | no | wirkt, narrower than Obsidian: with text selected, `*`, `_` and `` ` `` wrap the selection; nothing is paired without a selection, so a list marker stays one star |
| `rightToLeft` | boolean | `false` | no | wirkt: text direction of the editor and the reading view |
| `propertiesInDocument` (`visible` `hidden` `source`) | enum | `visible` | no | wirkt: how the frontmatter of a note shows in the editor (Live Preview), the reading view and the hover preview: as the properties block, not at all (the YAML stays in the file), or as raw YAML. Settings → Editor and files, the editor context menu ("Eigenschaften anzeigen", visible ↔ hidden) and the command "Editor: Eigenschaften im Dokument ein-/ausblenden". The Properties view in the side panel and the commands that add properties are not affected; `hidden` also hides what they add until the setting is switched back. In `hidden`, typing or deleting cannot reach the block (an edit that starts inside it is dropped, so typing at the very start of a note does nothing; click into the text first); a reload from disk or a command can still change it. In `source`, the YAML lines get no heading, list or link styling. Source mode always shows the YAML. |
| `smartIndentList` | boolean | `true` | no | wirkt, Slatebase's reading (the key is not documented by Obsidian): on, Enter in a list or quote continues it with a new marker; off, Enter keeps only the indentation |
| `showIndentGuide` | boolean | `true` | no | wirkt: thin vertical lines at every indentation level of a line's leading whitespace (one per tab, or per `tabSize` spaces). Now on by default, as in Obsidian; vaults that did not have it see the lines after this update |
| `spellcheckLanguages` | string[] | `[]` | no | wirkt: language codes such as `en-US` or `de`; the part before the region picks the dictionary. Slatebase ships German and English and runs one dictionary at a time, so the first code with a dictionary is used, for everyone who opens the vault; other codes are kept in the file. Without one the personal language of the editor context menu applies. Switching the language in the menu then writes the file (needs write access). Settings → Editor and files has a select for it |
| `showInlineTitle` | boolean | `true` | no | wirkt: an, der Dateiname steht als Überschrift über der Notiz (Editor und Leseansicht); reine Anzeige, nicht Teil des Inhalts |
| `autoConvertHtml` | boolean | `false` | no | wirkt: an, wird beim Einfügen das `text/html` der Zwischenablage in Markdown umgewandelt statt roh eingefügt (eigener schlanker HTML→Markdown-Konverter, kein `turndown`) |
| `showFrontmatter` (legacy), `trashOption` (`system` `local` `none`; Slatebase always uses its own trash), `userIgnoreFilters` | see `app-config.ts` | Obsidian-like | no | gespeichert |
| `mobilePullAction` (verified), `vimMode`, `nativeMenus` | string / boolean | – | partly | durchgereicht |

**Defaults.** `alwaysUpdateLinks` used to default to `true` in Slatebase. The first start of this
version writes `alwaysUpdateLinks: true` once into each existing vault that has no `app.json`, or
has a `.slatebase/` folder, so those vaults keep behaving as before. A vault whose `app.json` was
written by Obsidian is left alone: there a missing key means Obsidian's behaviour. Vaults created
later follow Obsidian's default. The marker is under the data directory
(`migrations/app-config-defaults.done`), not in the vault.

**Plugin API.** `vault.getConfig(key)` reads any key of the file; `updateInternalLinks` is an old name
of `alwaysUpdateLinks`. `vault.setConfig(key, value)` writes keys of the table (validated), and
ignores other keys and refused writes with a console warning. `vault.on('config-changed', cb)` fires
when the file changes, whoever changed it.

## appearance.json

API: `GET/PATCH /api/v1/vaults/:vaultId/appearance-config`. Store: `state/vaultAppearanceStore`.
UI: Settings → Themes → "Darstellung des Vaults". The keys `cssTheme` and `enabledCssSnippets` belong
to the theme and snippet services (same file, same lock) and are not part of this API.

| Key | Type / values | Default | Effect |
|---|---|---|---|
| `theme` | `system` `moonstone` (light) `obsidian` (dark) | `system` | The vault's default scheme. A user who chose light or dark in the profile keeps it; only users on "System" follow the vault. |
| `accentColor` | `#rrggbb` or empty | empty | `--accent-h`, `--accent-s`, `--accent-l` on `body` |
| `baseFontSize` | number 10–30 | 16 | `--font-text-size` (only if not 16) |
| `interfaceFontFamily`, `textFontFamily`, `monospaceFontFamily` | font list | empty | `--font-interface-override`, `--font-text-override`, `--font-monospace-override` |
| `translucency`, `showViewHeader` | boolean | `false` | durchgereicht |

Font lists may contain letters, digits, spaces and `, ' " . _ -`, so a value cannot leave its CSS
declaration. Key names and values are assumptions (not verified against a real file).

## daily-notes.json

The `format` key is a Moment pattern and names the daily note; a `/` puts it into sub folders
(`YYYY/MM/YYYY-MM-DD`). Set it in Settings → Vault → "Tagesnotiz-Datumsformat" (with a preview).
Without a format: `YYYY-MM-DD`. A pattern is refused when it gives different days the same name
(`YYYY-MM`, `MM-DD`, week patterns without a weekday) or a name that is not a safe relative path; one
written by hand is replaced by the default with a console warning. Existing notes are not renamed.
Previous/next day find the date of the open note through the pattern. `folder` and `template` work
as before.

## types.json

Property types live in `.obsidian/types.json` (`{ "types": { "<name>": "<type>" } }`). Seen in real
files: `multitext` (Slatebase: list, also written for `aliases`), `tags`, `number`; `text`,
`checkbox`, `date`, `datetime` are assumed. Names Slatebase does not know stay in the file, are left
out of the registry and are reported. The allowed values and date format hint of an entry have no
place in Obsidian's file and stay in `.slatebase/property-types.json`. The first start moves the old
entries over once, per vault, until every vault is done; Obsidian's value wins for a key both have.
The entry limit is 5000 (a guard, not a product limit).

## Plugin size limits

Obsidian has no documented limit. Largest `main.js` measured on release assets (2026-10-31):
Copilot 5.2 MB, Excalidraw 5.1 MB, LiveSync 4.6 MB. Limits (`PLUGIN_LIMITS` in shared-contracts):
ZIP 50 MB, extracted 100 MB, one file 25 MB, store asset 25 MB, store total 50 MB, plugin settings
10 MB. An upload over the ZIP limit is refused from its declared length before it is read.

## Git sync

The managed `.gitignore` block syncs every file on this page and `workspaces.json`; it excludes
`workspace.json` and `workspace-mobile.json` (open tabs, per user). When a merge stops on a conflict
in `app`, `appearance`, `daily-notes`, `bookmarks`, `hotkeys`, `graph`, `types` or `workspaces.json`,
the sync merges the three versions by key: different keys are combined, a one-sided delete stays, a
key both sides changed goes to the newer commit (logged as a warning). The newer commit also sets the
order, so both devices write identical bytes. Bookmarks are matched by identity; a rename counts as
remove + add. Commit times come from the devices' clocks. Notes and any other file stay conflicted as
before.

## graph.json

API: `GET/PATCH /api/v1/vaults/:vaultId/graph-config`. Store: `state/vaultGraphStore`. The forces of
the graph view and the tag switch are the vault's; colours, property nodes and the local graph's hops
have no Obsidian counterpart and stay a personal preference.

| Key | Range | Obsidian default | Used for |
|---|---|---|---|
| `repelStrength` | 0–100 | 10 | repulsion of the simulation |
| `linkStrength` | 0–4 | 1 | link attraction |
| `linkDistance` | 0–2000 | 250 | preferred link length |
| `centerStrength` | 0–6 | 0.5187… | centre gravity |
| `showTags` | boolean | `false` | show tag nodes |

The ranges are wide enough for every position of Slatebase's sliders; they are not Obsidian's own.
Slatebase's simulation uses other scales, so the four forces are converted relative to their defaults
(Obsidian's defaults map to Slatebase's defaults, linear from there): an approximation. Everything else
Obsidian writes (`search`, `showAttachments`, `hideUnresolved`, `showOrphans`, `showArrow`, `scale`,
the multipliers, `colorGroups`, `collapse-*`, `close`) is kept and written back unchanged. Without write
access a change holds for the session only, with a hint. The per-user layout of older versions is not
migrated; a vault starts from Obsidian's defaults.

## bookmarks.json

API: `GET/PATCH /api/v1/vaults/:vaultId/bookmarks-config`; the list is replaced as a whole. Files,
headings (`subpath: "#Heading"`), blocks (`"#^id"`) and searches map to Obsidian's items; the label is
`title`; a search's case/regex switches are kept as two extra fields. Groups (`type: "group"`, `title`,
`items`) nest and are shown as folding folders in the Favorites view: create one with the button at the top
(or "Neue Untergruppe" in a group's menu), rename and delete from the context menu (a group with content asks
first and takes the content along), and move entries in by dragging (the lower part of a group's row drops
inside, the upper part before it) or with "Verschieben nach …" / "Aus Gruppe herausnehmen" in the entry's menu.
The folded state is not stored, groups start unfolded. Folders, URLs, graphs, unknown types and unknown fields
(also inside groups) are kept where they are when Slatebase writes. An entry's id depends on its group, so the
same file in two groups is two bookmarks; if a group is renamed elsewhere while its content changes here, the
content can end up at the top level. Deleting a group asks first when it holds anything, also items Slatebase
does not show (folders, URLs); they are deleted with it. A rename in Obsidian counts as remove + add for the sync merge. The limit is 5000 (was 50). The bookmarks used to be per
user on the server; that list is only read now: the first time a vault whose file has no bookmarks is
opened on a device, its entries are written into the file. **Privacy:** that file is readable by everyone who
opens the vault and is synced to the git remote, so the first user's old bookmarks (paths, saved search queries)
become visible to them; the same holds for old workspaces (file paths of open tabs). The take-over is automatic and
has no prompt. It counts as done only when the file took the entries (a read-only user is asked again at the next
open). Before a write, the file is read again and bookmarks added meanwhile (Obsidian, a sync, another user) are kept.

## hotkeys.json

API: `GET/PATCH /api/v1/vaults/:vaultId/hotkeys-config`. Store: `state/keybindingsStore`. UI: Settings →
Tastaturkürzel (search, record, add a second shortcut, remove one, reset, conflicts).

```json
{ "editor:toggle-bold": [ { "modifiers": ["Mod"], "key": "B" } ],
  "app:open-settings": [] }
```

Command ID → list of `{ modifiers, key }`. A command the file does not name has its default; an empty
list unbinds it. Modifiers are `Mod` (Ctrl, Cmd on macOS), `Ctrl`, `Meta`, `Shift`, `Alt`; letters are upper
case, the space bar is `" "`. Seen in real files: `Mod`, `Shift`, `Alt`, `Ctrl`, letters, `Tab`, arrows; `Meta`
and other special keys are assumed.

**Command IDs.** Where Obsidian has the command, Slatebase uses its ID (`OBSIDIAN_COMMAND_ALIASES` in
shared-contracts: `command-palette:open`, `app:open-settings`, `switcher:open`, `global-search:open`,
`app:go-back`/`app:go-forward`, `workspace:next-tab`/`previous-tab`, `markdown:toggle-preview`, `daily-notes`,
`graph:open`, …). Other Slatebase commands keep `slatebase:…`; plugin commands use their own ID, so they can
be bound through the file. The aliases are from docs and the command palette, not all verified in a real vault.

**Behaviour.**
- A default shortcut gives way when the file binds the same keys to another command.
- Several shortcuts per command are kept; writing a command replaces its list with the readable entries, so an
  entry Slatebase could not read (reported in the console) is dropped when that command is changed.
- Changes are written after half a second; a failed write is kept and tried again after 30 s.
- Reset all resets Slatebase's own commands only; other commands' entries stay.
- The old per-user bindings are written into the file once per vault and device, for commands the file does
  not name (the file wins). Without write access that is tried again the next time the vault is opened.
- The default shortcuts are Slatebase's (Ctrl+Shift+]/[ for tabs, Alt+Left/Right for history), not Obsidian's
  everywhere; the Obsidian default applies only if the file says so.

## workspaces.json

API: `GET/PATCH /api/v1/vaults/:vaultId/workspaces-config`. Store: `state/workspacesStore`. UI: the palette commands
"Arbeitsbereich speichern/laden" (Obsidian: `workspaces:save`, `workspaces:load`).

```json
{ "workspaces": { "Writing": { "main": { "type": "split", "direction": "vertical", "children": [ ... ] },
                               "active": "<leaf id>", "lastOpenFiles": ["Note.md"],
                               "slatebase": { "savedAt": "...", "paneTree": { ... } } } },
  "active": "Writing" }
```

The saved layouts are the vault's, the same for everyone who opens it and for Obsidian's Workspaces plugin; saving,
renaming and deleting need write access, loading needs read access. The file's `workspace.json` (open tabs of one
user) is not written and is not synced.

- **Format.** `workspaces` maps a name to a layout, `active` names the layout last *saved*. Loading a layout is local
  and does not change `active`, so nobody is made to switch. Seen in real files: `workspaces`, `active`. **Assumed**
  (not seen inside a workspaces.json): the layout fields, which are workspace.json's `main`, `active`, `lastOpenFiles`
  with nodes `split` (`direction`, `children`), `tabs` (`currentTab`, `children`) and `leaf` (`pinned`,
  `state: { type, state: { file, mode } }`).
- **Translation.** Slatebase writes the pane tree as Obsidian's `main` tree: side-by-side panes are `direction:
  "vertical"` (Slatebase `horizontal`), files become typed leaves (`markdown`, `canvas`, `bases`, `pdf`, `image`,
  `audio`, `video`; the editing mode is `source`, the reading view `preview`), the graph tab is a `graph` leaf, pins are
  kept. Tabs of another vault, plugin views and web viewers have no place in this vault's file and are left out of
  `main`.
- **Exact snapshot.** Beside `main` Slatebase writes a `slatebase` block with the pane tree and the sidebar/context
  panel layouts, so loading a layout Slatebase saved loses nothing. A layout without that block (saved by Obsidian) is
  read from `main`; leaves Slatebase cannot show (side panels, views of plugins it lacks) are skipped, reported once in the
  browser console, and stay in the file because only the named layout is ever replaced.
- **Names** may not be empty, contain control characters, be longer than 200 characters or be `__proto__`,
  `constructor`, `prototype`. A layout may be 1 MB, a vault keeps up to 500 (guards, not product limits). A name that
  differs only in case is the same workspace.
- **Migration.** The per-user lists of older versions are moved into the file once per vault and device, when the
  vault is opened with write access; a name both have goes to the later saved layout, the other gets a number
  (`Name (2)`). Then the old list is emptied. Without write access it is tried again the next time.

## Not done yet

The functions behind the `app.json` keys
marked *gespeichert* above (they are kept and offered to plugins; Settings → Editor and files has the ones that work). See
`.kiro/specs/obsidian-app-json-compat/tasks.md`. `core-plugins.json` is left to its own spec.
