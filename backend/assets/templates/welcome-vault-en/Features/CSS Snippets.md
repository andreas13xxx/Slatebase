---
tags: [features]
---

# CSS Snippets

CSS snippets let you customize Slatebase's appearance with your own CSS — stored per vault, without needing a full theme or a plugin.

---

## Managing CSS Snippets

1. Open Settings (`Ctrl+,`)
2. Navigate to **Appearance**
3. The **CSS Snippets** section lists all snippets for the current vault

![[Screenshots/settings-panel.png]]

*The settings panel — CSS Snippets live under "Appearance"*

---

## Uploading a Snippet

1. Click **Upload**
2. Choose an existing `.css` file (max 512 KB)
3. The snippet appears in the list — disabled by default

## Creating a New Snippet

1. Click **Create New**
2. Give it a name (the `.css` extension is added automatically)
3. An embedded editor opens — write your CSS directly in it
4. Click **Save**

---

## Enabling and Editing

- **Enable/disable:** toggle next to each snippet — takes effect immediately, no page reload
- **Edit:** pencil icon reopens the embedded editor
- **Delete:** trash icon, with a confirmation prompt

Enabled snippets are applied automatically whenever you open or switch to the vault.

---

## How CSS Snippets Differ from Plugin CSS

If you use the [[Advanced/Obsidian Plugins|Obsidian plugin compatibility layer]]: a plugin's own CSS only affects that plugin's UI. CSS snippets work differently — they apply **globally** to the entire Slatebase interface, exactly like a CSS snippet in Obsidian itself. Rules like `body { }` or `:root { --variable: value; }` are explicitly meant to be used here.

---

## Practical Example

Change the interface's accent color:

1. Open Settings → Appearance → CSS Snippets → **Create New**
2. Name the snippet `accent-color`
3. Write in the editor:
   ```css
   :root {
     --accent: #ff6b6b;
   }
   ```
4. Save and enable the snippet with the toggle
5. The interface's accent color changes immediately

> [!tip] Finding variable names
> Slatebase uses CSS custom properties for design tokens. Open your browser's dev tools (`F12`), inspect an element, and look at the `:root` rules to find the variable you want to override.

---

> [!todo] Exercise
> Create a snippet that increases the sidebar's font size (`.file-explorer { font-size: 14px; }`). Enable it, check the result, then disable it again.

---

## Related Features

- [[Features/Settings|Settings]] — Where to find CSS snippets
- [[Advanced/Obsidian Plugins|Obsidian Plugin Compatibility]] — Plugin CSS by comparison
