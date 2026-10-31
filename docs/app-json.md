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
| `showUnsupportedFiles` | boolean | `false` | yes (name) | gespeichert |
| `promptDelete` | boolean | `true` | yes (name) | gespeichert |
| `userIgnoreFilters` | list of strings | `[]` | yes (name) | gespeichert |
| `spellcheck` | boolean | `true` | no | wirkt |
| `livePreview` | boolean | `true` | no | wirkt |
| `newFileLocation` | `root` `current` `folder` | `root` | no | Plugin-API |
| `useMarkdownLinks` | boolean | `false` | no | Plugin-API |
| `newLinkFormat` | `shortest` `relative` `absolute` | `shortest` | no | Plugin-API |
| `newFileFolderPath`, `defaultViewMode` (`source` `preview`), `strictLineBreaks`, `showFrontmatter`, `propertiesInDocument` (`visible` `hidden` `source`), `foldHeading`, `foldIndent`, `autoConvertHtml`, `trashOption` (`system` `local` `none`), `spellcheckLanguages`, `tabSize` (1–16, default 4), `useTab`, `autoPairBrackets`, `autoPairMarkdown`, `smartIndentList`, `showIndentGuide`, `showInlineTitle`, `rightToLeft` | see `app-config.ts` | Obsidian-like | no | gespeichert |
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
`title`; a search's case/regex switches are kept as two extra fields. Groups, folders, URLs, graphs,
unknown types and unknown fields are kept where they are when Slatebase writes. **Entries inside
groups are kept but not shown, and groups cannot be created in Slatebase yet.** A rename in Obsidian
counts as remove + add for the sync merge. The limit is 5000 (was 50). The bookmarks used to be per
user on the server; that list is only read now: the first time a vault whose file has no bookmarks is
opened on a device, its entries are written into the file.

## Not done yet

`hotkeys.json` and `workspaces.json` as shared vault files, groups in the bookmarks UI, the functions
behind the stored `app.json` keys, and settings pages for the new `app.json` keys. See
`.kiro/specs/obsidian-app-json-compat/tasks.md`. `core-plugins.json` is left to its own spec.
