---
tags: [advanced, plugins]
---

# Style Settings Plugin

Style Settings (`obsidian-style-settings`) shows the settings that a theme or CSS snippet ships with: colors, font sizes, heading styles, and switches for individual display variants. You adjust them in a UI instead of editing the theme's CSS.

> [!info] Partly usable
> The plugin runs in Slatebase with its settings page, search, and import/export. Options that set **variables** (colors, sizes, fonts) take full effect. Options that only toggle a **class** work only where Slatebase has the matching element — for *Minimal* about 11 of 64 (mainly tables and headings). Verified with the real plugin bundle and the *Minimal* theme.

---

## What the Plugin Is For

Many themes include a `/* @settings … */` comment block in their CSS. Without Style Settings it stays invisible. With the plugin it becomes a settings page per theme, for example:

- Pick colors separately for light and dark
- Change the size and color of each heading
- Swap fonts
- Switch display variants on and off (such as table styles)

About every second theme in the catalog offers such settings. The theme list (**Settings → Themes**) then shows a hint, see [[Features/Themes]].

---

## Prerequisites

- Feature toggle `obsidian-plugin-compat` enabled
- Style Settings plugin installed and activated
- An active theme (or snippet) that ships settings
- Plugin ZIP from GitHub: `obsidian-style-settings` (repository [obsidian-community/obsidian-style-settings](https://github.com/obsidian-community/obsidian-style-settings))

---

## Installation

1. Go to **Plugin Management** → **"Available Plugins"** tab and search for "Style Settings"
2. Click **Install**, then switch on the **activation toggle**

Not listed, or need a specific fork/version? Download the ZIP from GitHub instead and use **"Installed Plugins" → Upload Plugin**.

---

## Changing a Theme's Settings

1. Under **Settings → Themes**, activate a theme that offers settings (for example *Minimal* or *Things*)
2. Open the plugin settings of **Style Settings**
3. The plugin reads the active theme and shows one section per theme
4. Expand the section and change a value — the change takes effect immediately across the window

When you switch themes, the plugin updates its sections on its own. With **Slatebase (Default)** there are no sections, because the default look ships no settings.

| Setting type | What it does | In Slatebase |
|--------------|--------------|--------------|
| Color, number, slider, text, select (variables) | Sets a CSS variable | Takes full effect |
| Toggle, select (classes) | Sets a class on `<body>` | Works only where Slatebase has the element |

---

## Search, Export, Import

- **Search field:** filters the settings of all sections — almost essential for themes with several hundred options (for example *Minimal* with 173 variables)
- **Export:** saves your values as JSON, for example as a backup or to share
- **Import:** loads saved values back in
- **Reset:** every setting has its own button to return to the theme's default

---

## Where the Values Are Stored

Like any plugin, Style Settings keeps its values in the plugin's `data.json`, **per vault**. That means the same as for the theme itself: everyone who opens the vault sees the same settings. The plugin has to be installed and activated per vault — and administrator approvals apply as with all plugins.

> [!info] Applies to all users of the vault
> If one person changes a heading size, everyone who has the vault open sees it. Whether the interface is light or dark is still up to each person.

---

## Limitations in Slatebase

| Feature | Status |
|---------|--------|
| Plugin loads and activates | Works |
| Settings page with sections, search, import/export | Works |
| Variables (colors, sizes, fonts) | Works |
| Switching the vault theme updates the sections | Works |
| Class toggles | Partial — only where Slatebase has the element |
| Options for tabs, sidebars, title bar | No effect — Slatebase lacks that Obsidian structure |
| Effect in reading view | Not available — Slatebase has no separate reading view |

---

> [!tip] Try variables first
> If an option does nothing, it most likely only toggles a class. Color, size, and font options are the most reliable.

> [!todo] Exercise
> 1. Install and activate the Style Settings plugin
> 2. Under **Settings → Themes**, choose a theme with settings (for example *Minimal*)
> 3. Open the Style Settings plugin settings and search for `h1`
> 4. Change the size of heading 1 and open a note with a heading
> 5. Reset the value and export your settings as a backup

---

## Related Features

- [[Features/Themes]] — Select, import, and find themes in the catalog
- [[Features/CSS Snippets]] — Your own CSS on top of the theme
- [[Advanced/Obsidian Plugins]] — Plugin basics
