---
tags: [admin]
---

# User Management

As an administrator, you manage all user accounts on your Slatebase instance. You can create new users, lock or delete existing ones, and assign roles.

---

## Opening User Management

| Method | Description |
|--------|-------------|
| Settings (`Ctrl+,`) | Administration → User Management |
| Command Palette (`Ctrl+P`) | Search for "User Management" |
| User menu | Avatar → Admin → User Management |

---

## Creating Users

1. Open User Management
2. Click "New User"
3. Fill in the required fields:

| Field | Requirement |
|-------|-------------|
| Username | Unique, cannot be changed later |
| Password | Minimum 8 characters |
| Display name | Freely chosen, changeable |
| Role | `user` or `admin` |
| Language | German or English (determines Welcome Vault language) |

4. Click "Create"

### What Happens on Creation?

- The account becomes active immediately
- If the "Welcome Vault" feature is enabled, the new user automatically receives a tutorial vault in their chosen language
- The user can sign in immediately with username and password

---

## Editing Users

1. Click on the desired user in the list
2. Editable fields:
   - **Display name** — Visible to other users
   - **Role** — `user` or `admin`
   - **Reset password** — Assign a new password
3. Click "Save"

> [!tip] Password Reset
> When resetting a password, the user will be prompted to set a new password on their next login. Share the temporary password through a secure channel.

---

## Locking Users

Locked users cannot sign in, but their data is preserved:

1. Select the user from the list
2. Click "Lock"
3. Confirm the action

### Effects of Locking

- All active sessions are immediately invalidated
- The user is logged out
- Login is no longer possible
- Vaults and data remain intact
- The user's shares remain active (others can still access)
- MCP tokens are invalidated

### Unlocking

1. Select the locked user
2. Click "Unlock"
3. The user can sign in again immediately

---

## Deleting Users

Deleting a user is permanent and removes all associated data:

1. Select the user from the list
2. Click "Delete"
3. Confirm by typing the username

### What Gets Deleted?

- User profile and login data
- All sessions
- All MCP tokens
- User preferences (keybindings, favorites, recent files)

### What Happens to Vaults?

- **Owned vaults** are deleted (including all files)
- **Shares granted to the user** are removed
- **Shares created by the user** are revoked

> [!warning] Check Before Deleting
> Before deleting, check whether the user owns important vaults. Transfer ownership to another user first if needed (via "My Vaults" → "Transfer Ownership").

---

## Roles

Slatebase has two roles:

| Role | Permissions |
|------|-------------|
| `user` | Manage own vaults, use shared vaults, chat, personal settings |
| `admin` | Everything from `user` + user management, server config, feature toggles, audit log, vault overview |

### Changing Roles

1. Select user → "Edit"
2. Change the role in the dropdown
3. Save

The change takes effect immediately — the user sees the admin sections on their next page load.

---

## User List

The User Management page shows a table of all users:

| Column | Content |
|--------|---------|
| Username | Login name |
| Display name | Publicly visible name |
| Role | `user` or `admin` |
| Status | Active, locked |
| Created | Creation date |

---

## Safety Measures

Slatebase prevents certain destructive actions:

- **Last admin** — The last remaining admin cannot be locked, deleted, or demoted to user
- **Self-locking** — You cannot lock yourself
- **Confirmation** — Delete actions require typing the username

---

## Practical Example

Set up a new team member:

1. Open User Management
2. Create a new user with role "user"
3. Share the credentials with the team member
4. Create a shared vault (via "My Vaults")
5. Share the vault with the new user (write access)

---

> [!tip] Onboarding Workflow
> For a smooth onboarding:
> 1. Create user with the team member's language
> 2. Welcome vault is created automatically
> 3. Share relevant vaults
> 4. Use chat for a welcome message and introduction

> [!todo] Exercise
> 1. Open User Management
> 2. Create a test user with role "user"
> 3. Sign in with the test user in another browser
> 4. Lock the test user and verify they're logged out
> 5. Unlock and then delete the test user

---

## Related Features

- [[Admin/Audit Log]] — Track login attempts and changes
- [[Admin/Feature Toggles]] — Control features for all users
- [[Features/Vault Management]] — Vaults and sharing from the user perspective
- [[Features/Chat]] — Communication between users
