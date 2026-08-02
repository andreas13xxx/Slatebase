---
tags: [features]
---

# Trash and Versions

Slatebase protects your work with two safety nets: a trash for deleted files and automatic version history for edits.

![[Screenshots/papierkorb.png]]

*The trash view*

---

## Trash (Soft Delete)

### How it Works

When you delete a file, it's not permanently removed. Instead it moves to the vault's internal trash where it can be restored.

### Deleting a File

1. Right-click on a file in the explorer
2. Select **Delete**
3. The file disappears from the explorer but is preserved in the trash

### Restoring a File

1. Open the trash view (via Command Palette or sidebar)
2. Find the file you want to restore
3. Click **Restore** — the file returns to its original location

### Permanent Deletion

In the trash view you can also permanently delete files. This action is irreversible.

### Retention Period

Deleted files are kept for a configurable number of days (default: 30 days). After that, the cleanup job removes them permanently.

---

## File Versions

### How it Works

Every time you save a file, the previous version is stored automatically. This creates a history you can browse and restore from.

### Viewing Versions

1. Open the file you want to check
2. Open the version browser (toolbar or Command Palette)
3. You'll see a list of previous versions with timestamps

### Comparing Versions

![[Screenshots/version-diff.png]]

*Version comparison with inline diff*

The version browser shows an inline diff:
- **Green lines** — Added content
- **Red lines** — Removed content

This helps you understand what changed between versions.

### Restoring a Version

1. Select the version you want to restore
2. Click **Restore**
3. The file content is replaced with the selected version
4. (A new version entry is created for the current content before restoring)

### Version Limit

Each file keeps a maximum number of versions (default: 20). Older versions are pruned by the cleanup job.

---

## Cleanup Job

Slatebase runs a periodic cleanup (default: every 24 hours):
- **Trash:** Removes files older than the retention period
- **Versions:** Prunes versions beyond the configured limit

---

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| Trash retention | 30 days | How long deleted files are kept |
| Max versions per file | 20 | How many versions to keep |

These can be adjusted by the admin in the server configuration.

---

> [!tip] Best Practice
> - Don't worry about deleting files — they stay in the trash
> - Use versions to experiment freely — you can always roll back
> - For important changes, check the version diff to confirm what changed

> [!todo] Exercise
> 1. Create a new file with some content
> 2. Edit it 2–3 times (change the content each time)
> 3. Open the version browser and browse through the versions
> 4. Delete the file, then open the trash and restore it

---

## Related Features

- [[Basics/File Explorer]] — Deleting files
- [[Features/Settings]] — Configuring retention
- [[Features/Vault Management]] — Vault administration
