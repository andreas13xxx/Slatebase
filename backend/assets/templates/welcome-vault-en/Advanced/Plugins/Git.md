---
tags: [advanced, plugins]
---

# Git Plugin

The Git plugin (obsidian-git) versions your vault with a real Git repository — commits, push/pull to a remote (e.g. GitHub), and a source control panel right inside Slatebase. Unlike the built-in [[Features/Trash and Versions|trash]], it works with full Git history and external remotes.

> [!warning] No live demo possible
> Git needs a real remote repository with credentials. This chapter covers setup and usage, but there's no embedded live demo like with other plugins — try it out with your own test repository.

> [!tip] Native alternative: Git Sync
> Slatebase now also offers [[Features/Git Sync]] — a native, server-side Git synchronization feature. It runs headless without a browser tab, supports SSH remotes, and needs no CORS proxy. For most use cases it's the simpler choice; this plugin remains useful if you want the familiar source-control panel with a diff view right in the editor.

---

## Prerequisites

- Feature toggle `obsidian-plugin-compat` enabled
- Git plugin installed and activated
- Plugin ZIP from GitHub: `obsidian-git`
- A remote repository (e.g. on GitHub) with HTTPS access
- A Personal Access Token (PAT) from your remote provider

---

## Installation

1. Go to **Plugin Management** → **"Available Plugins"** tab and search for "Git"
2. Click **Install**, then switch on the **activation toggle**

Not listed, or need a specific fork/version? Download the ZIP from GitHub instead and use **"Installed Plugins" → Upload Plugin**.

---

## Setup

There's no SSH keypair or local Git client in the browser — the plugin uses a pure JavaScript Git implementation (isomorphic-git) and talks to remotes exclusively over **HTTPS**.

1. Open plugin settings
2. Enter the remote URL (HTTPS form, e.g. `https://github.com/username/repo.git`)
3. Enter username and Personal Access Token (not a password — most providers require a PAT with `repo` scope for HTTPS access)
4. Test the connection, or trigger an initial pull/push

> [!tip] Token, not password
> GitHub, GitLab, and most other providers no longer accept account passwords for HTTPS access, only a Personal Access Token. Create one in your Git provider's security settings, scoped as narrowly as possible.

---

## Source Control Panel

Once activated, a new view appears ("Git: Open Source Control View"):

| Area | Description |
|------|--------------|
| Changed files | List of all files with status (new, modified, deleted) |
| Commit message | Input field, supports placeholders like `{{date}}` |
| Stage/Unstage | Include or exclude individual files before committing |
| Diff view | Line-by-line changes per file |

---

## Key Commands

Via the Command Palette (`Ctrl+P` → "Git:"):

| Command | Description |
|---------|-------------|
| Commit all changes | Commit all changes |
| Push | Upload commits to the remote |
| Pull | Fetch changes from the remote |
| Create backup | Commit + push in one step |
| Discard all changes | Discard local changes (careful!) |
| Edit .gitignore | Edit the ignore list |

---

## Automatic Backup

Plugin settings let you configure an interval after which changes are automatically committed (and optionally pushed) — a running background backup without manually triggering "Commit".

```
Auto-backup interval: 15 minutes
Auto-pull interval: 10 minutes
```

> [!warning] Conflicts with concurrent editing
> If you work on the same vault from multiple devices, auto-push can lead to merge conflicts. Git conflicts have only limited visual resolution support in the browser — when in doubt, clean up the file content manually.

---

## Example: Commit Message Template

```
Vault backup: {{date}} ({{numFiles}} files)
```

Produces e.g.: `Vault backup: 2026-08-14 (3 files)`

---

## Limitations in Slatebase

| Feature | Status |
|---------|--------|
| Commit, push, pull over HTTPS + PAT | Works |
| Source control panel (diff, stage/unstage) | Works |
| Automatic backup interval | Works |
| Binary files (images, PDFs) in commits | Works |
| SSH remotes | Not supported (no SSH in the browser) |
| GPG-signed commits | Not supported |
| Git submodules | Not supported |
| Merge conflict UI | Limited |

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "Authentication failed" | Use a PAT instead of a password, check its scope |
| Push fails (non-fast-forward) | Run "Pull" first |
| Large binary files very slow | isomorphic-git runs entirely in the browser — very large vaults make push/pull slower accordingly |
| CORS/network errors | The Git host's domain must be on the proxy allowlist (admin) |

---

> [!tip] Git complements, doesn't replace
> The built-in [[Features/Trash and Versions|trash]] covers accidental deletion. Git is additionally useful for external backups, collaboration via pull requests, or syncing with an existing Obsidian vault repository.

> [!todo] Exercise
> 1. Create an empty HTTPS repository with a Git provider of your choice
> 2. Create a Personal Access Token with write access
> 3. Install and activate the Git plugin, enter remote URL, username, and token
> 4. Change a note and run "Commit all changes"
> 5. Run "Push" and verify the commit at your provider
> 6. Configure an auto-backup interval of 15 minutes

---

## Related Features

- [[Features/Git Sync]] — Native, server-side alternative with SSH support and no CORS proxy
- [[Features/Trash and Versions]] — Built-in versioning without an external repository
- [[Advanced/Plugins/LiveSync]] — Alternative: real-time sync over CouchDB
- [[Advanced/Obsidian Plugins]] — Plugin basics
- [[Admin/Feature Toggles]] — Enable the plugin feature
