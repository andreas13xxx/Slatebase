---
tags: [features]
---

# Vault Management

Vaults are your organizational units in Slatebase. Each vault is an independent collection of notes with its own folder structure, trash, and settings.

![[Screenshots/gesamtansicht.png]]

*Vault overview in the file explorer*

---

## Creating a Vault

1. Open the vault selector (top of the file explorer)
2. Click **Create Vault**
3. Enter a name (max. 128 characters)
4. The vault is created and opened immediately

---

## Deleting a Vault

1. Go to **Settings → My Vaults** (or the vault overview page)
2. Click **Delete** next to the vault
3. Confirm the deletion

> [!danger] Warning
> Deleting a vault permanently removes all files, versions, and trash. This cannot be undone. Make sure you have a backup if needed.

---

## Sharing Vaults

You can share a vault with other users on the same Slatebase instance.

### Share Permissions

| Permission | Can do |
|------------|--------|
| Read | View files, search, browse graph |
| Write | All of read + create, edit, delete files |

### Creating a Share

1. Go to **Settings → My Vaults**
2. Click **Share** next to the vault
3. Select the user and permission level
4. The user immediately gets access

### Revoking a Share

In the same menu, click **Revoke** to remove a user's access.

---

## Transferring Ownership

You can transfer a vault to another user:

1. **All shares are revoked first** (automatically)
2. Go to **Settings → My Vaults**
3. Click **Transfer** next to the vault
4. Select the new owner
5. Confirm — you lose access (unless the new owner shares it back)

---

## Vault Statistics

Hover over a vault name to see:
- Total number of files
- Total number of folders
- Combined file size

---

## Multiple Vaults

You can create as many vaults as you need. Common patterns:
- **Work** — Professional notes, projects, meetings
- **Personal** — Journal, ideas, reading notes
- **Shared** — Team knowledge base

The file explorer shows all your vaults as expandable root entries.

---

## Import and Export

### Export

Export a vault as a ZIP file containing all Markdown files and assets:
- Via **Settings → My Vaults → Export**
- Or via Command Palette

### Import

Import files into a vault:
- Drag files/folders into the explorer
- Via the upload button in the context menu

---

> [!tip] Vault Organization
> Keep vaults focused on a purpose. It's better to have 3 smaller vaults (work, personal, projects) than one huge vault with everything mixed together. Use [[Features/Wikilinks|Wikilinks]] within a vault for connections.

> [!todo] Exercise
> 1. Go to Settings → My Vaults and review your current vaults
> 2. Check the statistics for this Welcome vault
> 3. (Optional) Create a new vault for experimentation

---

## Related Features

- [[Basics/File Explorer]] — Navigating within a vault
- [[Features/Settings]] — Vault-specific configuration
- [[Features/Sync]] — Synchronizing vaults across devices
