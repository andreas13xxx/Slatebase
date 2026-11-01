# Key bindings and commands

The bindings of a vault live in `.obsidian/hotkeys.json` (format, command IDs and write behaviour:
[app-json.md](app-json.md#hotkeysjson)). This page records which commands exist and what runs a key press.

## Where commands come from

| Source | Commands | ID | Runs from a key |
|---|---|---|---|
| Slatebase's own | about 25 with a definition in `DEFAULT_KEYBINDINGS` (palette, search, tabs, history, settings, daily note, …) | `slatebase:…`, or Obsidian's ID where it has the command (`OBSIDIAN_COMMAND_ALIASES`) | own handlers, default shortcut or the file's |
| Obsidian's core commands | about 180 in `plugins/compat/core-commands.ts` (`editor:*`) and `core-commands-app.ts` (`workspace:*`, `app:*`, `file-explorer:*`, `daily-notes`, `graph:*`, `canvas:*`, `bases:*`, `bookmarks:*`, `backlink:*`, `outline:*`, …) | Obsidian's own | `useRegistryHotkeys`, only if the file binds them |
| Community plugins | whatever the plugin registers (`addCommand`) | `<plugin>:<command>` | `useRegistryHotkeys`, from the file or the plugin's declared `hotkeys` |

All of them appear in Settings → Tastaturkürzel (the registry ones under "Weitere Befehle"), can be searched,
bound, unbound and reset, and are written to the vault's `hotkeys.json` under their ID.

## How a key press finds its command

1. The editor (CodeMirror keymap) and Slatebase's own handlers go first. A key one of them took
   (`preventDefault`) is not offered to the registry.
2. `useRegistryHotkeys` looks through the registry for a command whose shortcut matches. The vault file wins; a
   command the file does not name uses the `hotkeys` its plugin declared; a command the file unbinds (`[]`) uses none.
3. A key without Ctrl, Alt or Cmd never counts, except function keys, so typing is not swallowed; a held key does not repeat the command. In `<input>`,
   `<textarea>` and `<select>` nothing runs; the note editor counts as an editor.
4. Commands that Slatebase handles itself (the alias targets such as `app:open-settings`, `switcher:open`) are
   skipped here, so one key press never runs a command twice.

## Differences from Obsidian

- **Defaults.** Slatebase ships its own default shortcuts for its native commands only (for example Alt+Left/Right
  for history and Ctrl+Shift+]/[ for tabs, since Ctrl+Tab belongs to the browser); they may differ from Obsidian's
  and were not compared with a real install. For the other core commands `core-default-hotkeys.ts` holds the
  defaults that two sources agree on (KeyCombiner's Obsidian collection and the key names in Obsidian's Hotkeys
  settings; not checked against a running Obsidian): `editor:toggle-bold` Ctrl+B, `editor:toggle-italics` Ctrl+I
  (the editor's "select parent syntax" on that key is gone), `editor:insert-link` Ctrl+K, `editor:open-search` Ctrl+F,
  `editor:open-search-replace` Ctrl+H, `editor:follow-link` Alt+Enter, `editor:open-link-in-new-leaf` Ctrl+Alt+Enter,
  `workspace:close` Ctrl+W (a browser keeps this key), and for Slatebase's own commands Ctrl+G (graph) and Ctrl+N (new
  file, which a browser keeps too). Not set: `editor:delete-paragraph` (Obsidian: Ctrl+D; here Ctrl+D selects the
  next occurrence) and the help command (F1; ID not known). Obsidian has further defaults that are not in this list; those
  commands start unbound and are bound through the settings or the file. The bindings Obsidian writes into `hotkeys.json`
  are honoured and win over these defaults.
- **Defaults give way.** If the file gives another command the keys of a Slatebase default, the default is dropped.
- **Editor commands** bound through the file run only while an editor is open (`editorCallback`).
- Commands bound through the file replace the editor's own key only if the editor does not handle that key first.

## Not supported

These Obsidian commands are registered, so plugins can call them and the palette finds them, but running one only
explains why it does nothing:

| Command | Why |
|---|---|
| `workspace:new-tab` | Slatebase has no empty tab; tabs open with a file |
| `workspace:new-window`, `workspace:close-window`, `workspace:move-to-new-window`, `workspace:open-in-new-window`, `window:toggle-always-on-top` | runs in a browser tab, no windows of its own |
| `workspace:toggle-stacked-tabs` | tabs are side by side, not stacked |
| `workspace:copy-url` | no `obsidian://` URL scheme |
| `app:open-help` | no in-app help |
| `app:toggle-default-new-pane-mode` | no new-tab defaults |
| `graph:animate` | no time-lapse of the graph |
| `open-with-default-app:open`, `open-with-default-app:show` | no desktop shell |
| `download-attachments` | remote attachments are not downloaded into the vault |

## Not checked

The list of core commands was written from Obsidian's command palette and plugin code, not generated from a real
Obsidian install, so a command Obsidian has and this list does not is possible. A new one is a one-line spec in
`core-commands-app.ts` / `core-commands.ts`; once registered it shows up in the settings and in `hotkeys.json`
without further work.
