---
tags: [features]
---

# Themes

Themes give Slatebase a new look — colors, fonts and headings. Slatebase reads Obsidian themes straight from your vault: a theme you use in Obsidian works here without converting it.

---

## Where themes live

Themes are part of the vault. Each theme is a folder with a `theme.css` and usually a `manifest.json`:

```
My Vault/
└── .obsidian/
    ├── appearance.json        ← remembers the active theme
    └── themes/
        └── Things/
            ├── theme.css
            └── manifest.json
```

Because themes live in the vault, they travel with backups and with [[Features/Git Sync|Git Sync]] — and a vault you bring over from Obsidian shows its themes right away.

> [!info] Applies to everyone using the vault
> The active theme is stored in the vault, not in your account. Whoever opens the vault sees the same theme. Whether the interface is light or dark is still each person's own choice.

---

## Choosing a theme

1. Open Settings (`Ctrl+,`)
2. Under **Vault**, choose **Themes**
3. Pick a theme from the list — the change applies immediately
4. **Slatebase (Default)** takes you back to the normal look

If someone else changes the theme while you have the vault open, your window picks the change up automatically.

---

## Importing a theme

1. In the **Themes** section, click the area at the bottom of the page (or drag the files onto it)
2. Choose the `theme.css`, optionally together with the `manifest.json` (3 MB at most)
3. The name comes from the `manifest.json`; without a manifest the file name is used
4. If a theme with that name already exists, Slatebase asks before overwriting it

You can get themes from Obsidian's community directory or from the theme author's GitHub repository.

> [!warning] Themes that load external content
> Some themes load fonts or images from other servers (for example Google Fonts). Slatebase then shows below the theme which hosts content is loaded from. Check this if privacy matters to you.

---

## Themes from the catalog

Next to **Installed**, the **Themes** section has a **Discover** tab. It shows Obsidian's community catalog (about 900 themes) with preview images.

- **Search and filter:** by name or author, by **Light** or **Dark** (preset to your current mode), only **Installed** or only **Update available**. Themes in the old format stay hidden until you turn on **Show outdated**.
- **Install:** one click downloads `theme.css` and `manifest.json` into the vault (`.obsidian/themes/`). With **Activate after installing** the theme is selected right away. If it already exists, Slatebase asks before replacing it.
- **Updates:** **Check for updates** compares the installed themes with the catalog. Updating happens on click only, never automatically. Themes you imported yourself that have no catalog entry are left alone.
- **Not every theme can be installed:** about one theme in ten has no `theme.css` or `manifest.json` in its root folder or is larger than 3 MB. Slatebase then tells you why.

> [!info] Who connects to the internet?
> The Slatebase server fetches the catalog, theme files and preview images from `raw.githubusercontent.com`. Your browser only talks to Slatebase, never to GitHub. An administrator can switch the catalog off in the feature toggles (**obsidian-theme-store**); the **Discover** tab then disappears and installed themes keep working. Without internet access Slatebase shows the last list it loaded.

> [!warning] Third-party CSS
> A theme is third-party CSS. Slatebase runs no script from it, but some themes load fonts or images from other servers. The **Installed** tab shows that under the theme.

---

## What is supported — and what is not

Slatebase supports **themes that work through Obsidian CSS variables**:

- Colors for backgrounds, text, borders and the accent across the whole interface
- Fonts for the interface, text and code
- Size, weight and color of headings, bold and italic text
- Line height and editor width

The editor also carries the classes many themes hang their rules on (`mod-cm6`, `is-live-preview`, `is-readable-line-width`, `HyperMD-header`, `HyperMD-codeblock`, `HyperMD-quote`, `HyperMD-task-line`, `cm-inline-code`, `cm-highlight`, `cm-hashtag`). This is why, for example, *Minimal*'s table styling and editor width take effect. The same applies to plugin CSS that targets these classes. The line and element classes (`HyperMD-*`, `cm-*`) exist only in Live Preview, not in source mode, and `cm-formatting` only on headings and code marks.

Not supported are **layout changes** that target Obsidian's internal structure (for example custom arrangements of tabs, sidebars or title bars). Themes that rely heavily on this — such as *Minimal* or *AnuPpuccin* — are therefore only partly applied: colors and fonts take effect, the layout stays Slatebase's own (tab bar, sidebars, title bar). Obsidian's reading view does not exist in Slatebase as a separate mode. Settings from the *Style Settings* plugin are not evaluated.

---

## Themes and CSS snippets

You can combine both. The theme is applied first and your [[Features/CSS Snippets|CSS snippets]] after it — so a snippet can override individual values of the theme.

---

> [!todo] Exercise
> Import a theme, switch to it in Settings and back to **Slatebase (Default)**. Then enable a CSS snippet and notice that it builds on top of the theme.

---

## Related Features

- [[Features/Settings|Settings]] — Where you find themes
- [[Features/CSS Snippets|CSS Snippets]] — Your own CSS on top of the theme
- [[Features/Git Sync|Git Sync]] — Sync themes with the vault
