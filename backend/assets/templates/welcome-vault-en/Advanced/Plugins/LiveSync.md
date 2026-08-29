---
tags: [advanced, plugins]
---

# LiveSync Plugin

Self-hosted LiveSync enables bidirectional real-time synchronization of your vault via a CouchDB database. Changes are synced instantly between devices — without cloud services.

> [!warning] Experimental
> LiveSync is a complex plugin with deep system integration. Create a backup of your vault (export as ZIP) before setup.

---

## Prerequisites

- Feature toggle `obsidian-plugin-compat` enabled
- Access to a CouchDB instance (self-hosted or external)
- CouchDB with CORS enabled or Slatebase proxy configured
- Plugin ZIP from GitHub: `obsidian-livesync`

---

## Installation

1. Go to **Plugin Management** → **"Available Plugins"** tab and search for "LiveSync"
2. Click **Install**, then switch on the **activation toggle**
3. Plugin shows initial setup dialog

Not listed, or need a specific fork/version? Download the ZIP from GitHub's releases page instead and use **"Installed Plugins" → Upload Plugin**.

---

## Setup

### Option A: Setup URI (recommended)

If you already have a LiveSync configuration (e.g. from another device):

1. Open plugin settings
2. Paste the Setup URI
3. LiveSync configures itself automatically

### Option B: Manual Configuration

1. Open plugin settings after activation
2. Configure the connection:

| Field | Example |
|-------|---------|
| Server URL | `https://couchdb.example.com` |
| Database | `slatebase-vault` |
| Username | `sync_user` |
| Password | `secure_password` |

3. Click "Test Connection"
4. On success: "Complete Setup"

---

## Sync Modes

| Mode | Description | Recommendation |
|------|-------------|---------------|
| LiveSync | Real-time, every change instantly | For active work on one device |
| Periodic | Every X seconds | For background sync |
| OneShot | Only on manual trigger | For controlled synchronization |

> [!tip] OneShot for Starters
> Begin with OneShot sync to validate the setup. Switch to Periodic or LiveSync only once everything runs stable.

---

## Conflict Handling

Simultaneous editing on multiple devices can cause conflicts:

### Automatic Resolution

LiveSync resolves simple conflicts automatically (newest version wins).

### Manual Resolution

For complex conflicts:
1. LiveSync shows a notification
2. Open the conflict view (Plugin settings → Conflicts)
3. Choose for each conflict: Remote, Local, or Merge

---

## Example Setup: Two-Device Sync

### Scenario

You use Slatebase on your work machine and want to continue on your laptop in the evening.

### Step 1: Set Up CouchDB

```
# Docker Compose (example)
services:
  couchdb:
    image: couchdb:3
    environment:
      COUCHDB_USER: admin
      COUCHDB_PASSWORD: secure_password
    ports:
      - "5984:5984"
    volumes:
      - couchdb_data:/opt/couchdb/data
```

### Step 2: Create Database

Create a new database via CouchDB Admin UI (`http://localhost:5984/_utils`):
- Name: `slatebase-my-vault`
- Partitioned: No

### Step 3: Configure LiveSync on Device 1

1. Install + activate plugin
2. Server URL: `http://your-server:5984`
3. Database: `slatebase-my-vault`
4. Enter credentials
5. First sync: All files are uploaded

### Step 4: Configure LiveSync on Device 2

1. Same configuration as Device 1
2. First sync: All files are downloaded
3. From now: Bidirectional synchronization

---

## Slatebase-Specific Notes

### CORS Proxy

Slatebase automatically routes cross-origin requests through the backend proxy (`/api/v1/proxy`). This means:

- You don't need to configure CORS on CouchDB
- The proxy allowlist must contain the CouchDB domain (`SLATEBASE_PROXY_ALLOWED_ORIGINS`)
- Timeout: 30 seconds (sufficient for OneShot)

### Known Limitations

| Topic | Status |
|-------|--------|
| Text file sync | Works |
| Binary files (images, PDFs) | Works |
| End-to-end encryption | Supported |
| LiveSync mode (long-poll) | Timeout-limited (30s) |
| Periodic/OneShot | Recommended |
| Plugin settings | Works |

### Recommended Settings

- **Sync mode:** Periodic (every 60 seconds) or OneShot
- **"Use timeouts instead of heartbeats":** Enable
- **Batch size:** Keep default

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "Connection refused" | Check CouchDB URL and port |
| "Unauthorized" | Verify credentials |
| "Plugin initialisation was cancelled" | Normal for first setup — enter Setup URI |
| Sync stops after 30s | Switch to Periodic/OneShot |
| Binary files missing | Trigger "Rebuild" in plugin settings |

---

> [!tip] Backup First
> Export your vault as ZIP before setting up LiveSync. If anything goes wrong, you can always return to the backup.

> [!todo] Exercise
> 1. Install the LiveSync plugin
> 2. Open plugin settings
> 3. Review available configuration options
> 4. (Optional, if CouchDB available) Configure a connection
> 5. Test with OneShot sync: Change a file → trigger sync → verify on second device

---

## Related Features

- [[Features/Git Sync]] — Slatebase's own Git-based sync feature
- [[Advanced/Obsidian Plugins]] — Plugin basics
- [[Admin/Feature Toggles]] — Enable plugin feature
