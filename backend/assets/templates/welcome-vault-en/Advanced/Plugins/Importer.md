---
tags: [advanced, plugins]
---

# Importer Plugin

Importer (`obsidian-importer`) is Obsidian's own migration tool — it converts notes from other apps and export formats into Obsidian-flavored Markdown, including embedded attachments and internal links, instead of leaving you to convert everything by hand.

> [!warning] Node-dependent formats limited
> Importer references several Node.js built-ins with no browser equivalent (`child_process`, `crypto`, `fs`, `original-fs`, `os`, `stream`, `zlib`). Slatebase's sandbox stubs these safely — a warning instead of a crash — so the plugin still installs and activates, but import sources that depend on those modules for real work (notably **Apple Notes**, which needs live access to the local Notes app database on macOS) don't function in a browser. Formats that work from a picked file or folder are generally unaffected.

---

## Prerequisites

- Feature toggle `obsidian-plugin-compat` enabled
- Importer plugin installed and activated
- Plugin ZIP from GitHub: `obsidian-importer`

---

## Installation

1. Go to **Plugin Management** → **"Available Plugins"** tab and search for "Importer"
2. Click **Install**, then switch on the **activation toggle**

Not listed, or need a specific fork/version? Download the ZIP from GitHub instead and use **"Installed Plugins" → Upload Plugin**.

---

## Supported Sources

Run an import via the Command Palette (`Ctrl+P` → "Importer: Open importer"), pick a source format, then select the export file or folder to convert:

| Source | Typical export | Notes |
|--------|-----------------|-------|
| Markdown (other flavors) | Folder of `.md` files | Roam, Notion Markdown export, and similar dialects |
| Notion | Exported ZIP | Pages become linked notes, databases become tables |
| Evernote | `.enex` file | One export file per notebook |
| Google Keep | Google Takeout ZIP | Notes and labels |
| Bear | `.bear2bk` file | Bear's native export format |
| HTML | Folder of `.html` files | Generic HTML-to-Markdown conversion |
| Apple Notes | — | Reads the local Notes app database directly; **macOS desktop only, not available in Slatebase** |

---

## What an Import Does

- Converts the source format's formatting to Markdown
- Rewrites internal links between imported notes as wikilinks
- Copies embedded images and files into the vault as attachments
- Places imported notes into a folder you choose before starting

---

## Limitations in Slatebase

| Feature | Status |
|---------|--------|
| Plugin loads and activates | Works |
| Import dialog and source selection | Works |
| File/folder-based sources (Markdown, Notion, Evernote, Keep, Bear, HTML) | Works |
| Apple Notes | Not supported — needs a live macOS Notes app, not just a file |

---

> [!tip] One-time tool
> Unlike most other plugin guides, there's no ongoing feature to practice here — Importer is meant to be installed, run once per migration, and deactivated again. Keep it installed if you expect to migrate more notes later.

> [!todo] Exercise
> 1. Install and activate the Importer plugin
> 2. Export a small set of notes from an app you use (or use an existing Evernote `.enex` / Markdown folder)
> 3. Run "Importer: Open importer" and select the matching source format
> 4. Choose a target folder and start the import
> 5. Check that internal links and attachments came through correctly

---

## Related Features

- [[Features/Vault Management]] — Slatebase's built-in drag-and-drop file import/export
- [[Features/Wikilinks]] — How imported internal links resolve
- [[Advanced/Obsidian Plugins]] — Plugin basics
