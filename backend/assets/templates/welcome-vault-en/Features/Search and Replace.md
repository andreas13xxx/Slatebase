---
tags: [features]
---

# Search and Replace

Slatebase offers powerful search capabilities — from simple full-text search to regex patterns and batch replace across multiple files.

![[Screenshots/suche-ergebnisse.png]]

*Search results with context lines*

---

## Opening the Search

| Method | Description |
|--------|-------------|
| `Ctrl+Shift+F` | Opens the search panel |
| Command Palette | Search for "Search" |

The search panel replaces the file explorer on the left when open.

---

## Full-Text Search

Type your query and results appear in real-time:

- Results show the file name, line number, and matching text
- Context lines above and below the match are displayed
- Click a result to jump directly to that location

---

## Search Options

| Option | Description |
|--------|-------------|
| Case sensitive | Match exact capitalization |
| Regex | Enable regular expression patterns |
| Multi-vault | Search across all your vaults simultaneously |

---

## Regular Expressions

Enable regex mode to use patterns:

| Pattern | Matches |
|---------|---------|
| `todo\|fixme` | "todo" or "fixme" |
| `\d{4}-\d{2}-\d{2}` | Dates like 2025-01-15 |
| `^# ` | Lines starting with H1 heading |
| `\[[ ]\]` | Unchecked checkboxes |

For more regex details, see [[Advanced/Regex Search|Regex Search]].

---

## Search Operators

Beyond plain text, you can use structured **operators** to narrow your search. Operators are written directly into the search field and act as pre-filters before full-text matching.

### Available Operators

| Operator | Example | Description |
|----------|---------|-------------|
| `path:<pattern>` | `path:Projects/**` | Only files in the path |
| `file:<name>` | `file:meeting` | Only files with matching name |
| `tag:<tag>` | `tag:todo` | Only files with the tag |
| `property:<key>` | `property:status` | Only files with the property |
| `property:<key>=<value>` | `property:status=active` | Property with specific value |
| `-path:<pattern>` | `-path:Archive/**` | Exclude path |
| `-tag:<tag>` | `-tag:done` | Exclude tag |
| `-property:<key>` | `-property:draft` | Exclude property |

### Combining Operators

Operators can be freely combined — they are AND-combined:

```
tag:project path:Work/** meeting
```

Finds files that have tag `#project` AND are in the `Work/` folder AND contain "meeting".

### Values with Spaces

Use quotes for values containing spaces:

```
property:status="in progress" path:"My Folder/**"
```

### Operator-Only Mode

When you type only operators without free text, Slatebase shows a file list of all matching files (without text snippets):

```
tag:meeting -tag:archived
```

> [!tip] Autocomplete
> Type `tag:` or `property:` and wait — a dropdown shows matching suggestions from your vault. Navigate with arrow keys, select with Enter.

> [!tip] Operator Help
> Click the `?` icon next to the search field for a quick reference of all supported operators.

---

## Replace

### Single Replace

1. Enter your search term
2. Enter the replacement text
3. Click **Replace** next to individual results

### Batch Replace

1. Enter search and replacement
2. Click **Replace All** to replace in all matching files
3. A confirmation shows how many replacements were made

> [!warning] Batch Replace
> Replace All modifies multiple files at once. Changes are saved immediately. Use with care — check the preview before confirming.

---

## Multi-Vault Search

When enabled, the search spans all vaults you have access to. Results are grouped by vault name.

---

## Context Lines

Search results show surrounding context (lines before and after the match) to help you identify the right result without opening the file.

---

## Practical Example

Find all unchecked tasks across your vault:

1. Open search with `Ctrl+Shift+F`
2. Enable regex mode
3. Enter: `- \[ \]`
4. Browse results — each is a pending task

---

> [!tip] Search Tips
> - Use quotes for exact phrases: `"project plan"`
> - Combine with tags: search for `#todo` to find all tagged items
> - Use the context to verify results before making changes

> [!todo] Exercise
> 1. Open the search panel with `Ctrl+Shift+F`
> 2. Search for the word "exercise" — how many results appear?
> 3. Try a regex search: `\[\[Features/.*\]\]` (finds all feature links)
> 4. Try replacing "example" with "sample" in a test file

---

## Related Features

- [[Advanced/Regex Search]] — Advanced regex patterns
- [[Features/Tags and Properties]] — Search by tags
- [[Features/Command Palette]] — Quick file search
