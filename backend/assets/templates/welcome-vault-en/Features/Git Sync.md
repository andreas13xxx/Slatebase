---
tags: [features]
---

# Git Sync

Git Sync keeps a vault synchronized server-side with one or more Git remotes — using the real `git` binary, not a browser reimplementation. It runs headless in the background, even without an open browser tab, and supports both HTTPS tokens and SSH keys.

> [!tip] Difference from the Git plugin
> Slatebase can also run the community plugin [[Advanced/Plugins/Git|obsidian-git]] in the browser. Git Sync is the native alternative: it runs on the server instead of in the browser, needs no CORS proxy for the remote host, and also supports SSH remotes — at the cost of its own source-control panel with a diff view.

---

## Prerequisites

- Feature toggle `git-sync` enabled (see [[Admin/Feature Toggles]]; on by default)
- A vault is selected
- A Git remote repository (e.g. on GitHub, GitLab, or self-hosted)
- Credentials: a Personal Access Token (HTTPS) or a private SSH key

---

## Opening Git Sync

1. Open Settings (`Ctrl+,`)
2. Go to **Vault → Git Sync**

If the feature is disabled server-wide, the entry appears greyed out with a hint to contact an administrator.

---

## Setting the branch

All remotes of a vault share the same local branch, since a working directory can only be checked out on one branch at a time. Enter the desired branch name in the **Branch** section (default: `main`) and save.

---

## Adding a remote

1. Click **Add remote**
2. Give it a name (free-form, e.g. "GitHub")
3. Enter the remote URL (e.g. `https://github.com/username/repo.git`)
4. Choose the auth method:
   - **HTTPS token** — Personal Access Token from your Git provider
   - **SSH key** — private key in PEM format
5. Set the sync interval in minutes
6. Save

> [!tip] Token, not password
> GitHub, GitLab, and most other providers no longer accept an account password over HTTPS, only a Personal Access Token with `repo` scope. Create one in your Git provider's security settings.

The token or SSH key is stored encrypted and never returned to the browser in plain text — even when editing a remote, the field stays empty until you enter a new credential.

---

## Syncing

| Action | Description |
|--------|-------------|
| Automatic | Runs in the background per the configured interval for each remote |
| **Sync now** | Immediately triggers a sync run for that remote |
| Toggle on the remote | Enables/disables automatic sync for that remote |

Each run first commits local changes, then fetches the remote's state, merges, and pushes the result. The status badge shows the outcome of the last run: **Success**, **Error**, or **Conflict**.

---

## Resolving conflicts

Unlike a classic merge tool, Git Sync doesn't abort on a conflict: the affected file is left with normal Git conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`) that you can edit directly in the Markdown editor.

1. Open the file named in the conflict hint
2. Remove the conflict markers and decide on the content you want
3. Save the file
4. The next sync run (automatic or via "Sync now") commits the resolution and continues syncing normally

---

## Practical example

1. Create an empty repository with a Git provider of your choice
2. Create a Personal Access Token with write access
3. Open Settings → Vault → Git Sync → **Add remote**
4. Enter name, remote URL, auth method "HTTPS token" and the token, interval e.g. 15 minutes
5. Click **Sync now**
6. Check with your Git provider that the vault content arrived as a commit

---

> [!todo] Exercise
> Set up a remote with your own test repository, trigger a manual sync, and then change the same note both locally and directly at the Git provider to provoke a conflict. Resolve it afterward in the editor.

---

## Related Features

- [[Advanced/Plugins/Git]] — Browser-based alternative via the community plugin
- [[Features/Trash and Versions]] — Built-in versioning without an external repository
- [[Features/Mail Import]] — Another server-side feature with a similar structure
- [[Admin/Feature Toggles]] — Enable/disable the feature server-wide
