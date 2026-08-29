---
tags: [features]
---

# Mail Import

Mail Import polls one or more IMAP mailboxes periodically and saves unread emails as Markdown notes with attachments into a vault — server-side, no browser plugin required.

> [!tip] Why not a browser plugin?
> An IMAP client needs a direct network connection (TLS sockets) to the mail server — that's not possible in a browser sandbox. Mail Import therefore runs as a native backend feature.

---

## Prerequisites

- Feature toggle `mail-import` enabled (see [[Admin/Feature Toggles]]; on by default)
- A vault is selected
- Credentials for an IMAP mailbox (host, port, username, password)

---

## Opening Mail Import

1. Open Settings (`Ctrl+,`)
2. Go to **Vault → Mail Import**

If the feature is disabled server-wide, the entry appears greyed out with a hint to contact an administrator.

---

## Adding a mailbox

1. Click **Add mailbox**
2. Enter name, host, and port (e.g. `imap.example.com`, port `993` for TLS)
3. Enable **Use TLS** if your provider expects it (practically always the case)
4. Enter username and password
5. Set the **IMAP folder** to poll (default: `INBOX`)
6. Set the **target folder in the vault** notes are written into (empty = vault root)
7. Set the polling interval in minutes
8. Save

The password is stored encrypted and never returned to the browser in plain text — even when editing a mailbox, the field stays empty until you enter a new password.

---

## What imported mails look like

Each new email becomes its own note `<date> <subject>.md` in the target folder, with YAML frontmatter (from, to, subject, date, message ID) and the email body converted to Markdown. Attachments land in an `attachments` subfolder and are embedded directly in the note via a wikilink embed (`![[filename]]`) — images already inline in the email body appear embedded as usual and aren't duplicated as a separate attachment.

---

## Running the import

| Action | Description |
|--------|-------------|
| Automatic | Runs in the background per the configured interval for each mailbox |
| **Import now** | Immediately triggers a poll run for that mailbox |
| Toggle on the mailbox | Enables/disables automatic import for that mailbox |

**Only unread mail in the selected folder is imported** — the mailbox's own read status is the only bookkeeping; there's no separate internal counter. As soon as a mail is successfully written as a note, Mail Import marks it read on the server right away; if a single mail fails, only that one stays unread and is retried on the next run — the rest of the mailbox isn't blocked by it. The status badge shows the timestamp, result, and number of imported mails from the last run.

> [!warning] Marking mail as read manually
> Since read status is the bookkeeping, opening a mail in another client also marks it read — it would then **not** be imported on the next run. For mailboxes also used normally, a dedicated IMAP folder just for import is recommended.

The file-level collision protection (see above) still applies either way: if a mail were somehow processed twice, no file gets overwritten — a renamed second copy is written instead, and a corresponding warning appears in the server log.

---

## Practical example

1. Open Settings → Vault → Mail Import → **Add mailbox**
2. Enter the IMAP credentials of a test mailbox, target folder e.g. `Mail`, interval 15 minutes
3. Click **Import now**
4. Check the vault's `Mail` folder for new notes with frontmatter and any attachments

---

> [!todo] Exercise
> Set up a test mailbox with one or two unread emails (ideally with an attachment), trigger a manual import, and check the resulting note along with its `attachments` folder.

---

## Related Features

- [[Features/Git Sync]] — Another server-side feature with a similar structure
- [[Features/Vault Management]] — Create, share, and manage vaults
- [[Admin/Feature Toggles]] — Enable/disable the feature server-wide
