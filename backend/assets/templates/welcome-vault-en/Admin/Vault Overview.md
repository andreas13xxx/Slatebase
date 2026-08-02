---
tags: [admin]
---

# Vault Overview (Admin)

The admin vault overview shows you all vaults on the entire Slatebase instance — regardless of who owns them. You can see storage usage, owners, and delete vaults if necessary.

---

## Opening Vault Overview

| Method | Description |
|--------|-------------|
| Settings (`Ctrl+,`) | Administration → Vault Overview |
| Command Palette (`Ctrl+P`) | Search for "Vault Overview" or "Admin Vaults" |

---

## Displayed Information

The vault overview shows a table of all vaults:

| Column | Content |
|--------|---------|
| Vault name | Name of the vault |
| Owner | Username of the owner |
| Files | Number of files in the vault |
| Folders | Number of directories |
| Size | Total size of all files |
| Created | Creation date |

---

## Deleting a Vault as Admin

In exceptional cases, you can delete a vault owned by another user:

1. Find the vault in the overview
2. Click "Delete"
3. Confirm by typing the vault name

### When Is This Appropriate?

- User account was deleted but vault remained (error case)
- Vault consumes excessive storage
- User is unreachable and vault needs to be removed

> [!warning] Admin Deletion Is Permanent
> Unlike the normal deletion workflow, the admin has no export step. Make sure the vault doesn't contain important data, or export it yourself first (if you have read access).

---

## Monitoring Storage Usage

The vault overview is useful for monitoring storage consumption:

### Sorting by Size

- Click the "Size" column header to sort
- The largest vaults appear at the top
- This quickly identifies storage-heavy vaults

### Typical Size Ranges

| Vault Type | Typical Size |
|-----------|--------------|
| Pure text (Markdown) | 1–50 MB |
| With embedded images | 50–500 MB |
| With PDF attachments | 100 MB – 2 GB |
| Project documentation | 10–100 MB |

---

## Difference from User View

| Aspect | User view ("My Vaults") | Admin overview |
|--------|--------------------------|----------------|
| Visible vaults | Only own | All on the server |
| Share/Transfer | Yes | No (delete only) |
| Statistics | Own vaults | All vaults |
| Content access | Yes | Only via share |

> [!tip] No Content Access
> As an admin you can see vault metadata (name, size, owner), but **not the content**. To view files in another user's vault, the owner must grant you a share. This protects user privacy.

---

## Practical Example

Perform a storage inventory:

1. Open the Vault Overview
2. Sort by size (descending)
3. Identify the 3 largest vaults
4. Check whether the owners are active users
5. For inactive users: Contact them about cleanup

---

> [!todo] Exercise
> 1. Open the Admin Vault Overview
> 2. Count the total number of vaults on your instance
> 3. Find the largest vault
> 4. Check which user owns the most vaults

---

## Related Features

- [[Features/Vault Management]] — Vault operations from the user perspective
- [[Admin/User Management]] — Manage and potentially delete users
- [[Admin/Server Configuration]] — Storage settings
- [[Admin/Audit Log]] — Trace vault deletions
