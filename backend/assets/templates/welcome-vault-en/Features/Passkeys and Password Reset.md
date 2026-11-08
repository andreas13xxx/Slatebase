---
tags: [features]
---

# Passkeys and Password Reset

Besides your password you can sign in with a **passkey**, and a forgotten password can be reset **by mail**. Both live under *Settings → Account → Security*.

> [!info] Two feature toggles, both on by default
> `passkeys` and `mail-recovery` (*Settings → Administration → Feature toggles*). The interface only appears once its prerequisites are met: an allowed HTTPS address for passkeys, a configured mail server for the reset.

## Passkeys

A passkey signs you in without a password, using a fingerprint, face unlock, device PIN or security key. The secret key stays on your device or in your password manager. Slatebase stores only the public part.

- **Your password stays** and is always a valid alternative.
- **Adding one:** *Security → Add passkey*. You confirm with your password.
- **Signing in:** On the sign-in page choose *"Sign in with a passkey"*, or click the username field and pick the passkey from the browser's suggestions. No username needed.
- **Managing:** Rename and delete in the same view. Up to 10 passkeys per account.

### One domain, one passkey

A passkey belongs to exactly one domain. If you reach Slatebase through a public **and** an internal address, create a separate passkey on each. The list shows the domain of every passkey.

If both addresses share a parent domain (for example `notes.example.org` and `intern.example.org`), an administrator can enter it as the **shared domain for passkeys** (`example.org`). One passkey then works on both. Changing this setting or the domain later makes existing passkeys unusable; your password keeps working.

## Forgot your password

Requirement: you have a **confirmed email address** on file.

1. *Security → Email address*: enter the address and your password. You receive a mail with a confirmation link (valid for 24 hours).
2. On the sign-in page choose *"Forgot your password?"* and enter your username or address.
3. The link in the mail is **valid for 30 minutes and works once**. It takes you to a page where you choose a new password.

The answer is always the same, whether or not the account exists. Mail only goes to confirmed addresses. After a reset **all sessions are ended** and you receive a notification mail. Your passkeys stay.

> [!warning] Without a confirmed address
> Only an administrator can then reset your password (*User management → Reset password*). If a passkey is lost or stolen, the administrator can delete it there with *"Remove all passkeys"*.

## For administrators

*Settings → Administration → Server configuration → Sign-in and recovery*:

| Setting | Meaning |
|---|---|
| SMTP server, port, encryption, user, password, sender | Mail delivery. The password is stored encrypted and never shown |
| Address for links in mails | One of the **allowed origins** (HTTPS). Empty = the first HTTPS origin. With two domains pick the public one |
| Shared domain for passkeys | Optional, see above |
| Test mail | Checks the *saved* settings |

Manage allowed origins as before under *Allowed origins* (`SLATEBASE_ALLOWED_ORIGINS`). Passkeys and links in mails only work for addresses on that list, and only over HTTPS (or `localhost` for development).

**Reverse proxy:** The proxy must pass the browser's `Origin` header through unchanged. It may terminate TLS. Slatebase never derives origin or domain from `Host` or `X-Forwarded-Host`.

User management shows whether each account's address is confirmed, and lets you remove all passkeys of an account if you suspect a compromise.
