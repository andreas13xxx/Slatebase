---
tags: [admin]
---

# Administration — Overview

This section is for Slatebase administrators. As an admin, you manage users, configure the server, control feature toggles, and have access to the audit log.

---

## Guides at a Glance

| Guide | Description |
|-------|-------------|
| [[Admin/User Management\|User Management]] | Create, lock, delete users, assign roles |
| [[Admin/Feature Toggles\|Feature Toggles]] | Enable or disable features for all users |
| [[Admin/Audit Log\|Audit Log]] | View security-relevant events |
| [[Admin/Server Configuration\|Server Configuration]] | Manage global server settings |
| [[Admin/Vault Overview\|Vault Overview]] | View and manage all vaults on the server |

---

## Who Is an Admin?

- The first user created during installation automatically receives the admin role
- Additional admins can be appointed via User Management
- Admins see an additional "Administration" section in the Settings panel
- The last remaining admin cannot be locked or deleted

---

## Accessing Administration

| Method | Description |
|--------|-------------|
| Settings (`Ctrl+,`) | Navigate to the "Administration" section |
| Command Palette (`Ctrl+P`) | Search for "User Management", "Feature Toggles", etc. |
| User menu | Click avatar → "Admin" entries |

---

## Recommended Order

### Initial Setup

1. [[Admin/User Management]] — Create users for your team
2. [[Admin/Feature Toggles]] — Enable desired features
3. [[Admin/Server Configuration]] — Review basic settings

### Ongoing Operations

1. [[Admin/Audit Log]] — Regularly review security events
2. [[Admin/Vault Overview]] — Monitor storage usage and vault status
3. [[Admin/User Management]] — Create new users, lock inactive ones

---

## Admin Responsibilities

| Task | Frequency |
|------|-----------|
| Create/lock users | As needed |
| Adjust feature toggles | Rarely (on new releases) |
| Review audit log | Regularly (weekly recommended) |
| Server configuration | Once during setup, rarely after |
| Check vault overview | On storage issues or user requests |

---

> [!tip] Assign Admin Role Carefully
> Admins have full access to user data, can lock accounts, and configure the server. Only assign the admin role to trusted individuals. For everyday use, the regular user role is sufficient.

> [!warning] Last Admin
> Slatebase protects the last remaining admin — they cannot be locked or deleted. Make sure at least one admin account is always accessible.

---

## Related Areas

- [[Features/Settings]] — General settings overview
- [[Features/Vault Management]] — Vault operations from the user perspective
- [[Advanced/Overview]] — Technical guides (MCP, Sync, Plugins)
