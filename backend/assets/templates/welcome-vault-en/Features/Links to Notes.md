---
tags: [features]
---

# Links to Notes

A **link** points to a note in Slatebase from the outside — in an email, a chat, a browser bookmark or another application. One click opens the note directly, optionally at a specific heading.

> [!info] A link is an address, not access
> Whoever opens the link must be signed in and have access to the vault. For readers without an account, use [[Features/Public Links]].

---

## Copy a link

- **Command:** open the Command Palette (`Ctrl+P`) and run **Copy link to current file**.
- **Tab menu:** right-click the tab → **Link kopieren**.
- **File explorer:** right-click a file → **Copy link** (also with read-only access).

If no file is open (for example the graph), the link points to the vault. If the browser cannot write to the clipboard, Slatebase shows the link so you can copy it by hand.

---

## What a link looks like

```
https://your-server/open?vault=<vault-id>&file=Folder%2FNote.md
```

With an anchor, Slatebase also jumps to a heading or a block:

| Target | Value of `file` (URL-encoded) |
|--------|-------------------------------|
| Heading | `Note.md#My heading` |
| Block | `Note.md#^block-id` |

Instead of the vault ID, Slatebase also accepts the **vault name** as long as it is unique.

---

## What happens when you open one

1. If you are not signed in, you sign in first — the link is kept meanwhile (for ten minutes).
2. Slatebase selects the vault, opens the note as a tab and jumps to the anchor.
3. If anything does not fit, you always get the same message: *target not found or no access*. The link deliberately does not reveal whether a vault or file exists.

---

## Exercise

> [!example] Try it
> 1. Open any note and copy its link.
> 2. Open a new browser tab and paste the link.
> 3. The note opens — sign out first to try the sign-in path.
