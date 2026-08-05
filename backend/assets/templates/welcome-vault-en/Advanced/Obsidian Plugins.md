---
tags: [advanced]
---

# Obsidian Plugins

> [!warning] Experimental Feature
> Obsidian plugin compatibility is experimental. Not all plugins are supported. This feature must be enabled by an admin via Feature Toggles.

Slatebase provides a compatibility layer that can run many Obsidian community plugins — extending functionality without leaving Slatebase.

---

## How it Works

Slatebase emulates Obsidian's plugin API:
- Plugins run in the browser (no server-side execution)
- A sandbox isolates each plugin per vault
- Common APIs (vault access, commands, settings) are shimmed
- Desktop-only plugins won't work (no Node.js access)

---

## Installing a Plugin

### From the Community Plugin Directory (recommended)

Slatebase integrates the official Obsidian Community Plugin directory directly — around 6000 plugins, searchable without a manual download.

1. Go to **Plugin Management** (via Settings or Command Palette)
2. Switch to the **"Available Plugins"** tab
3. Search by text or filter by category; the "Compatible" and "Not installed" filters narrow the list further
4. Desktop-only plugins are grayed out ("Desktop only") and can't be installed
5. Click **Install** on a plugin — Slatebase downloads the latest release from GitHub automatically and installs it
6. After installation: switch on the **activation toggle**

### From a ZIP File

For plugins not (yet) listed in the official directory, or local/private forks.

1. Download the plugin as a ZIP (from GitHub releases)
2. Go to **Plugin Management** → **"Installed Plugins"** tab
3. Click **Upload Plugin**
4. Select the ZIP file
5. The plugin is extracted and activated

### ZIP Format

The ZIP should contain:
- `manifest.json` — Plugin metadata
- `main.js` — Plugin code bundle
- `styles.css` — Optional plugin styles

Both root-level and subdirectory layouts are supported (auto-detected).

---

## Updates

The **"Installed Plugins"** tab has a **"Check for Updates"** button that shows whether newer versions are available (installed version → latest version). Update plugins individually, or update everything at once with **"Update All"** (run sequentially to respect GitHub rate limits). Existing plugin settings (`data.json`) are preserved across updates.

Slatebase also checks for updates automatically in the background every 24 hours and shows a notice when updates are available.

---

## Managing Plugins

### Activation Toggle

Each installed plugin has an on/off toggle:
- **Active** — Plugin is loaded and running
- **Inactive** — Plugin is installed but not running

### Plugin Settings

If a plugin provides settings, they appear in the plugin management area. Settings are persisted per-vault, per-plugin.

### Deleting a Plugin

Click **Delete** in the plugin management to remove it completely. Plugin settings are also removed.

---

## Compatibility

### What Works

- Commands (appear in Command Palette)
- Settings tabs
- CSS styling
- Vault read/write operations
- Event listeners (file changes, layout changes)
- Sidebar views
- Workspace leaves (plugin views as tabs)

### What Doesn't Work

- Desktop-only features (system tray, native menus)
- Node.js modules (`fs`, `path`, `child_process`)
- Electron APIs
- Complex workspace manipulation
- Some advanced DOM operations

### Compatibility Indicator

Each plugin shows a compatibility level:
- **Compatible** — Should work without issues
- **Partial** — Some features may not work
- **Incompatible** — Won't function correctly

---

## Known Working Plugins

These plugins have been tested and work with Slatebase:

| Plugin | Compatibility | Notes |
|--------|--------------|-------|
| Calendar | Good | Sidebar calendar, daily note creation |
| Dataview | Good | DQL queries work, DataviewJS limited |
| Templater | Good | Date/file functions, no system commands |
| Kanban | Good | Board view, drag & drop |
| Excalidraw | Partial | Drawing tools work, libraries limited |
| LiveSync | Partial | Periodic/OneShot recommended, LiveSync mode timeout-limited |

See the individual [[Advanced/Plugins/Calendar|plugin guides]] for detailed compatibility information.

---

## Troubleshooting

### Plugin Shows Error

- Check the browser console for error messages
- The plugin may use unsupported APIs
- Try disabling and re-enabling the plugin

### Plugin Doesn't Load

- Verify the ZIP contains `manifest.json` and `main.js`
- Check if the plugin is marked as desktop-only
- Ensure the feature toggle is enabled

### Style Conflicts

Plugin CSS is scoped with `[data-plugin-id]` to prevent conflicts. If styles look wrong, it may be a scoping issue with the plugin's CSS selectors.

---

> [!tip] Plugin Recommendations
> - Start with simple plugins (single feature, no complex UI)
> - Check the plugin's GitHub for "mobile compatible" or "web compatible" flags
> - Back up your vault before installing untested plugins
> - Disable plugins you're not actively using to save resources

> [!todo] Exercise
> 1. Check if the Obsidian Plugin feature is enabled (Settings → Admin → Feature Toggles)
> 2. Open Plugin Management
> 3. (Optional) Download a small plugin ZIP and try installing it
> 4. Check the compatibility indicator

---

## Plugin Guides

Detailed guides with examples and exercises for tested plugins:

| Plugin | Description | Guide |
|--------|-------------|-------|
| Calendar | Monthly calendar + daily notes | [[Advanced/Plugins/Calendar]] |
| Dataview | Vault as queryable database | [[Advanced/Plugins/Dataview]] |
| Kanban | Visual task boards | [[Advanced/Plugins/Kanban]] |
| Templater | Dynamic templates with JavaScript | [[Advanced/Plugins/Templater]] |
| Excalidraw | Freehand drawings and diagrams | [[Advanced/Plugins/Excalidraw]] |
| LiveSync | Bidirectional vault synchronization | [[Advanced/Plugins/LiveSync]] |

### Hands-on Exercises

- [[Practice/Plugins/Overview]] — Exercise overview
- [[Practice/Plugins/Create Kanban Board]] — Build a Kanban board
- [[Practice/Plugins/Dataview Queries]] — Write dynamic queries

---

## Related Features

- [[Features/Command Palette]] — Plugin commands appear here
- [[Features/Settings]] — Plugin feature toggle
- [[Features/Context Panel]] — Plugin sidebar views appear here
