---
tags: [admin]
---

# Audit Log

The audit log records security-relevant events on your Slatebase instance. It helps you detect unauthorized access, trace issues, and meet compliance requirements.

---

## Opening the Audit Log

| Method | Description |
|--------|-------------|
| Settings (`Ctrl+,`) | Administration → Audit Log |
| Command Palette (`Ctrl+P`) | Search for "Audit Log" |

---

## What Gets Logged?

The audit log automatically captures all security-relevant actions:

### Authentication

| Event | Description |
|-------|-------------|
| Login successful | User signed in |
| Login failed | Wrong username or password |
| Logout | User signed out |
| Session expired | Automatic session invalidation |

### User Management

| Event | Description |
|-------|-------------|
| User created | New account created |
| User deleted | Account permanently removed |
| User locked | Account locked |
| User unlocked | Lock removed |
| Role changed | Admin ↔ User |
| Password changed | User or admin changed password |

### Vault Operations

| Event | Description |
|-------|-------------|
| Vault created | New vault created |
| Vault deleted | Vault permanently removed |
| Share created | Vault shared with user |
| Share removed | Access revoked |
| Ownership transferred | Vault owner changed |

---

## Structure of a Log Entry

Each entry contains the following information:

| Field | Description |
|-------|-------------|
| Timestamp | Exact time (ISO 8601) |
| User | Who performed the action |
| Action | What happened (e.g. `user.login`, `vault.delete`) |
| Target | Affected object (e.g. username, vault name) |
| IP address | From which IP the action originated |
| Result | Success or failure |

---

## Log View

The Audit Log page shows entries in a filterable table:

### Filter Options

- **Time period** — Filter by date
- **User** — Entries from a specific user
- **Action** — Specific action types (Login, Vault ops, etc.)
- **Result** — Only successes or only failures

### Sorting

- Default: newest entries first
- Click column headers to re-sort

---

## Storage

The audit log is stored as an append-only file:

- **Format:** JSONL (one line per entry)
- **Rotation:** Daily new file (`YYYY-MM-DD.jsonl`)
- **Location:** `data/audit/` in the backend directory
- **Immutable:** Entries are never overwritten or deleted

> [!tip] Audit Log Backup
> Since the audit log is append-only and never pruned, it grows steadily. For long-running instances, consider regularly backing up older files to external storage.

---

## Typical Scenarios

### Detecting Suspicious Logins

1. Open the Audit Log
2. Filter for "Login failed"
3. Check if there are many failed attempts for one user
4. Check the IP addresses — unknown IPs may indicate attacks
5. If suspicious: Lock the user and reset their password

### Tracing Vault Deletion

1. Filter for "Vault deleted"
2. The entry shows who, when, and which vault
3. Verify whether the deletion was authorized

### Reviewing Permission Changes

1. Filter for "Role changed" or "Share created"
2. Ensure only authorized admins are changing roles
3. Check for unexpected share creations

---

## Security Notes

- The audit log contains **no passwords or tokens** — only metadata
- Login failures intentionally don't reveal whether the username or password was wrong (protection against enumeration)
- IP addresses are captured — ensure correct trusted proxy configuration when behind a reverse proxy

---

> [!tip] Regular Reviews
> Plan a weekly routine:
> 1. Open the Audit Log
> 2. Review failed logins from the past week
> 3. Identify unusual admin actions
> 4. If anomalies found: Notify affected users and rotate passwords

> [!todo] Exercise
> 1. Open the Audit Log
> 2. Find your own most recent login entry
> 3. Filter for failed logins
> 4. Check if any unknown IP addresses appear

---

## Related Features

- [[Admin/User Management]] — Lock users for suspicious activity
- [[Admin/Server Configuration]] — Trusted proxy settings
- [[Features/Settings]] — Manage sessions (user perspective)
