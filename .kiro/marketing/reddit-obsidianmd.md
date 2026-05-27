# r/ObsidianMD Post

**Flair:** Resources & Workflows  
**Titel:** I built a self-hosted web server to access my Obsidian vaults from anywhere — no sync service needed

---

Hey r/ObsidianMD,

I wanted to read and edit my Obsidian vaults from anywhere — without Obsidian Sync, without third-party cloud services, without changing my vault format. So I built **Slatebase**.

![Demo](demo.gif)

**What is it?**

A self-hosted web server that reads your vault folders directly and serves them through a browser UI. Your Markdown files stay exactly as they are — no conversion, no proprietary format.

**Features relevant to Obsidian users:**

- **Markdown rendering** with GFM (tables, task lists, strikethrough)
- **Frontmatter** displayed as a key-value table (YAML parsed)
- **Syntax highlighting** in code blocks (highlight.js)
- **Collapsible headings** — expand/collapse sections like in Obsidian
- **Inline editor** with Markdown toolbar (headings, bold, links, lists, tables, etc.)
- **Auto-save** with debounce (1.5s) + Ctrl+S
- **Multi-vault** — manage multiple vaults at once
- **Vault sharing** — share individual vaults with other users (read-only or write)
- **Import** — upload files and folders directly in the browser
- **Export** — download vault as folder (Chrome) or ZIP (Firefox)
- **Dark mode** that follows system preference

**What it can't do (yet):**

- Wikilinks (`[[...]]`) are not resolved yet
- Embeds (`![[...]]`) not rendered yet
- No graph view (planned)
- No plugin support (long-term goal as a compatibility layer)
- No real-time sync — it's a server that reads your files, not a sync tool

**How does it work?**

The server reads your vault folders directly from the filesystem. No database, no index that can get out of sync. If you edit a file in Obsidian and the vault folder is mounted, Slatebase sees the change immediately.

Multi-user with authentication (argon2, session-based), CSRF protection, rate limiting. Deploys via Docker.

**My use cases:**

- Vault on my NAS → read from anywhere in the browser
- Share my recipe collection with family (read-only)
- Make a project wiki accessible to teammates (write access)
- Quick lookup when I don't have Obsidian open

Still work in progress. Wikilinks and graph view are at the top of the list. If you have feedback or miss specific Obsidian features — let me know.

**GitHub:** https://github.com/andreas13xxx/slatebase
