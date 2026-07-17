---
tags: [advanced]
---

# Vault Sync Setup

> [!warning] Experimental Feature
> Vault Sync is experimental. Back up your data before configuring sync. This feature must be enabled by an admin.

This guide walks you through setting up bidirectional vault synchronization with CouchDB.

---

## Prerequisites

- A running CouchDB instance (self-hosted or cloud)
- Admin access to create databases
- Slatebase with Vault Sync feature toggle enabled

---

## CouchDB Installation

### Docker (Recommended)

```bash
docker run -d \
  --name couchdb \
  -p 5984:5984 \
  -e COUCHDB_USER=admin \
  -e COUCHDB_PASSWORD=your-secure-password \
  couchdb:3
```

### Verify Installation

Open `http://localhost:5984` — you should see a welcome JSON response.

### Create a Database

```bash
curl -X PUT http://admin:your-password@localhost:5984/slatebase-vault
```

---

## Slatebase Configuration

### Via Setup-URI

If you have a Livesync-compatible Setup-URI:

1. Go to **Settings → Sync**
2. Paste the URI
3. Connection details are extracted automatically
4. Click **Save & Test Connection**

### Manual Configuration

1. Go to **Settings → Sync**
2. Fill in:
   - **CouchDB URL:** `http://localhost:5984`
   - **Database:** `slatebase-vault`
   - **Username:** `admin`
   - **Password:** `your-secure-password`
3. Choose sync mode:
   - **Push only** — Local → CouchDB (backup)
   - **Pull only** — CouchDB → Local (restore)
   - **Bidirectional** — Both directions
4. Set sync interval (e.g., 5 minutes)
5. Click **Save & Test Connection**

---

## End-to-End Encryption

For sensitive data, enable E2E encryption:

1. In sync settings, toggle **E2E Encryption**
2. Enter a passphrase
3. All content is encrypted before leaving Slatebase

> [!danger] Important
> Store your passphrase securely. Without it, synced data cannot be decrypted. There is no recovery option.

---

## Troubleshooting

### Connection Refused

- Check that CouchDB is running: `curl http://localhost:5984`
- Verify port and URL
- Check firewall rules

### Authentication Failed

- Verify username and password
- Ensure the user has access to the database

### Sync Conflicts

- Conflicts occur when the same file is edited in two places
- Use the Conflict Wizard to resolve them
- Consider enabling auto-resolution for common patterns

### CORS Issues

If CouchDB is on a different domain, configure CORS:

```ini
[httpd]
enable_cors = true

[cors]
origins = https://your-slatebase-domain.com
credentials = true
methods = GET, PUT, POST, DELETE
```

---

## What Gets Synced

| Synced | Not Synced |
|--------|------------|
| All user files | Trash |
| Vault config (.slatebase/config.json) | File versions |
| .obsidian/ folder | Link index |

---

> [!tip] Sync Strategy
> Start with **push-only** to back up your data. Once you've verified everything works, switch to **bidirectional** for full multi-device support.

> [!todo] Exercise
> 1. Review the sync settings in Slatebase (Settings → Sync)
> 2. If you have Docker, try spinning up a CouchDB container
> 3. Configure a test sync with push-only mode
> 4. Verify files appear in CouchDB

---

## Related Features

- [[Features/Sync]] — Sync feature overview
- [[Features/Settings]] — Feature toggle configuration
- [[Features/Vault Management]] — Vault administration
