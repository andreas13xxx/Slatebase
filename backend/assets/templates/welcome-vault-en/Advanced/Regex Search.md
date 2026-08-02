---
tags: [advanced]
---

# Regex Search

Regular expressions (regex) let you search for complex patterns — much more powerful than plain text search. Slatebase uses Rust regex syntax.

---

## Enabling Regex

1. Open search with `Ctrl+Shift+F`
2. Toggle the **Regex** option
3. Your query is now interpreted as a regular expression

---

## Basic Patterns

| Pattern | Matches | Example |
|---------|---------|---------|
| `.` | Any single character | `t.p` → "tip", "top", "tap" |
| `*` | Zero or more of previous | `go*d` → "gd", "god", "good" |
| `+` | One or more of previous | `go+d` → "god", "good" (not "gd") |
| `?` | Zero or one of previous | `colou?r` → "color", "colour" |
| `^` | Start of line | `^# ` → Lines starting with H1 |
| `$` | End of line | `\.$` → Lines ending with period |

---

## Character Classes

| Class | Matches |
|-------|---------|
| `\d` | Any digit (0–9) |
| `\w` | Word character (letter, digit, underscore) |
| `\s` | Whitespace (space, tab, newline) |
| `[abc]` | One of a, b, or c |
| `[a-z]` | Any lowercase letter |
| `[^abc]` | NOT a, b, or c |

---

## Quantifiers

| Quantifier | Meaning |
|------------|---------|
| `{3}` | Exactly 3 times |
| `{2,5}` | Between 2 and 5 times |
| `{3,}` | 3 or more times |

---

## Groups and Alternation

| Pattern | Meaning |
|---------|---------|
| `(abc)` | Group "abc" together |
| `a\|b` | Match "a" OR "b" |
| `(foo\|bar)` | Match "foo" or "bar" |

---

## Lookahead and Lookbehind

| Pattern | Meaning |
|---------|---------|
| `(?=...)` | Positive lookahead (followed by) |
| `(?!...)` | Negative lookahead (not followed by) |

---

## Practical Examples

### Find Dates

```
\d{4}-\d{2}-\d{2}
```

Matches dates like `2025-01-15`, `2024-12-31`.

### Find Unchecked Tasks

```
- \[ \]
```

Matches all unchecked checkboxes.

### Find Tags

```
#[a-z][a-z0-9-/]*
```

Matches tags like `#project`, `#status/done`.

### Find Empty Headings

```
^#{1,6}\s*$
```

Matches heading lines with no text after the `#`.

### Find URLs

```
https?://[^\s]+
```

Matches HTTP and HTTPS URLs.

### Find Files with Specific Extensions

```
\[\[.*\.pdf\]\]
```

Matches wikilinks to PDF files.

---

## Replace with Regex

Regex also works with replace. Use capture groups (`(...)`) and reference them in the replacement with `$1`, `$2`, etc.

### Example: Reformat Dates

- Search: `(\d{2})\.(\d{2})\.(\d{4})`
- Replace: `$3-$2-$1`
- Result: `15.01.2025` → `2025-01-15`

---

> [!tip] Regex Tips
> - Start simple and build up complexity
> - Test your pattern on a few known matches first
> - Use `\b` for word boundaries (e.g., `\btodo\b` avoids matching "todos")
> - Remember that `.` matches everything — escape it with `\.` for a literal dot

> [!warning] Performance
> Very complex regex patterns (especially with nested quantifiers like `.*.*`) can be slow on large vaults. Keep patterns as specific as possible.

> [!todo] Exercise
> 1. Open search with `Ctrl+Shift+F` and enable regex
> 2. Find all dates in this vault: `\d{4}-\d{2}-\d{2}`
> 3. Find all headings: `^#{1,3} .+`
> 4. Find all wikilinks: `\[\[.+?\]\]`

---

## Related Features

- [[Features/Search and Replace]] — Basic search features
- [[Features/Tags and Properties]] — Alternative to regex for finding tagged content
