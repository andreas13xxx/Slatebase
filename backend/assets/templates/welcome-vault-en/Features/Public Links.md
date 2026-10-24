---
tags: [features]
---

# Public Links

A public link lets you share a note with people who have **no Slatebase account**. They open the link in a browser and can read the note — nothing more.

> [!info] Only with the feature enabled
> Public links are **off by default** because content leaves the server. An administrator turns them on under *Settings → Administration → Feature toggles* (`public-shares`).

## Creating a link

1. Right-click a note in the explorer → **"Öffentlichen Link verwalten"** (or in the command palette: *Öffentlichen Link der Notiz verwalten*).
2. Optionally set a **password** (at least 8 characters) and an **expiry date**.
3. Choose **"Link erzeugen"** and copy the link.

The link is shown **only once**. If you lose it, "Neuen Link erzeugen" gives it a new address — the old one stops working, password and expiry are kept.

## What recipients see

- The note, exactly as in the reading view — **always its current state**. Later changes show up immediately.
- **Embedded content** (`![[Note]]`, images, PDFs, audio, video) is included inline. The dialog shows what a link would include before you share.
- **Not** included: Bases, Canvas and plugin blocks (they would pull data from the rest of the vault). Embeds that cannot be resolved show a notice, "Eingebetteter Inhalt nicht verfügbar".
- Wikilinks (`[[Note]]`) and links to other notes appear as **plain text**. Other notes are not shared by this.
- Properties (frontmatter) are not shown.

## Managing links

- **Dialog:** change or remove the password and expiry, revoke the link.
- **Settings → Public links:** all your links across all vaults, with expiry, password protection and last access.
- If the note is **renamed or moved**, the link keeps working. If it is **deleted** (including to the trash), the link ends for good.

## Good to know

- Anyone with the link can pass it on. Use a password and an expiry date for sensitive content.
- Accesses and changes to links appear in the administration audit log.
- Guests cannot edit anything.
