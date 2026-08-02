---
tags: [features]
---

# Sync

> [!warning] Experimental Feature
> Vault Sync is experimental and may change in future versions. Back up your data before using it. It must be enabled by an admin via Feature Toggles.

Vault Sync enables bidirectional synchronization between Slatebase and a CouchDB server — allowing access from multiple devices.

![[Screenshots/sync-status.png]]

*The sync status panel*

---

## How it Works

1. **Setup** — Configure a CouchDB connection for your vault
2. **Push** — Your local changes are sent to CouchDB
3. **Pull** — Remote changes are downloaded to your vault
4. **Conflicts** — When both sides change the same file, a conflict resolution wizard helps

---

## Configuration

### Via Setup-URI

If you have a Livesync-compatible setup URI:

1. Go to **Settings → Sync**
2. Paste the Setup-URI
3. Connection details are extracted automatically

### Manual Configuration

1. Go to **Settings → Sync**
2. Enter CouchDB URL, database name, username, password
3. Choose sync mode (push, pull, or bidirectional)
4. Set sync interval

---

## End-to-End Encryption

Sync supports E2E encryption:
- All content is encrypted before being sent to CouchDB
- Decryption happens locally
- CouchDB server never sees plaintext

> [!danger] Important
> If you lose your encryption passphrase, your synced data cannot be recovered. Store it securely.

---

## Conflict Resolution

When the same file is changed both locally and remotely:

1. A conflict is detected during sync
2. The **Conflict Wizard** opens (3-step flow)
3. You can choose:
   - Keep local version
   - Keep remote version
   - Manually merge both versions
4. Resolved conflicts are synced back

### Auto-Resolution

For common patterns, you can configure automatic resolution strategies:
- **Newer wins** — The more recent change takes priority
- **Remote wins** — Always prefer the server version
- **Local wins** — Always prefer the local version

---

## Sync Status

The sync panel shows:
- Last sync timestamp
- Number of pending changes
- Error messages (if any)
- Manual trigger button

---

> [!tip] Sync Recommendations
> - Start with push-only to back up data safely
> - Test with a non-critical vault first
> - Enable E2E encryption if the CouchDB server is shared
> - Check the sync log regularly for errors

> [!todo] Exercise
> 1. Go to Settings → Sync (if the feature is enabled)
> 2. Review the configuration options
> 3. (Only if you have a CouchDB instance) Try configuring a sync

---

## Related Features

- [[Advanced/Vault Sync Setup]] — Detailed setup guide
- [[Features/Vault Management]] — Vault overview
- [[Features/Settings]] — Feature toggle configuration
