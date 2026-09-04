# r/ObsidianMD Post

**Flair:** Resources & Workflows
**Titel:** I built a self-hosted web app for my Obsidian vaults — and it runs community plugins in the browser

---

Hey r/ObsidianMD,

I wanted to read and edit my Obsidian vaults from anywhere — without Obsidian Sync, without third-party cloud services, without changing my vault format. So I built **Slatebase**.

![Demo](demo.gif)

**What is it?**

A self-hosted web server that reads your vault folders directly and serves them through a browser UI. Your Markdown files stay exactly as they are — no conversion, no proprietary format, no index that can drift out of sync.

**Obsidian features that work:**

- **Live Preview editor** (CodeMirror 6) with a source mode, cursor-aware inline rendering, and auto-save
- **Wikilinks and embeds** — `[[note]]`, `[[note#heading]]`, `![[note]]`, plus inline PDF, audio and video embeds
- **Callouts, tags** (inline and frontmatter), **block references**, Mermaid diagrams, LaTeX math via KaTeX
- **Canvas** — open and edit `.canvas` whiteboards with nodes, edges, groups, minimap
- **Knowledge graph** with zoom/pan/drag, tag and property nodes, plus a per-note local graph
- **Context panel** — outline, backlinks and forward links, unlinked mentions, tags, typed frontmatter properties
- **Quick Switcher** (Ctrl+O), **Command Palette** (Ctrl+P), configurable keybindings, bookmarks, daily notes, templates
- **Automatic link migration** — renaming or moving a note rewrites every wikilink pointing at it
- **CSS snippets** per vault, and a built-in spellchecker with real correction suggestions
- **Community plugins actually run** — Dataview, Templater, Calendar, Excalidraw, Kanban, Tasks, Editing Toolbar, LiveSync and others, installed from a built-in store that pulls GitHub releases

**Sync:** either server-side git remotes, or CouchDB through the real **LiveSync** plugin running inside the compatibility layer.

**What it isn't:**

- The plugin compatibility layer is experimental — roughly half of the top 100 community plugins are fully compatible, the rest partially, and desktop-only plugins can't work in a browser at all
- No split panes or saved workspaces yet, and the mobile layout is still on the roadmap
- No collaborative real-time editing (yet) — files are locked at save time, not co-edited

**How does it work?**

The server reads your vault folders straight from the filesystem. No database. If you edit a file in Obsidian and the folder is mounted, Slatebase sees the change immediately.

Multi-user with authentication (argon2, session-based), CSRF protection, rate limiting, granular per-vault read/write sharing. Deploys via Docker. AGPL-3.0.

**My use cases:**

- Vault on my NAS → read from anywhere in the browser
- Share my recipe collection with family (read-only)
- Make a project wiki accessible to teammates (write access)
- Quick lookup when I don't have Obsidian open

If you have feedback or miss specific Obsidian features — let me know.

**GitHub:** https://github.com/andreas13xxx/slatebase
