---
tags: [practice]
---

# Exercise 4 — Master Search

**Difficulty:** :star::star::star: Advanced
**Duration:** ~15 minutes

---

## Goal

You'll use full-text search, regex patterns, and batch replace to find and modify content across your vault.

## Prerequisites

- Exercises 1–3 completed (you have files with various content)
- Basic understanding of regular expressions (see [[Advanced/Regex Search]] for reference)

---

## Steps

> [!todo] Step 1: Basic search
> 1. Open search with `Ctrl+Shift+F`
> 2. Type `exercise` — observe the results
> 3. Click a result to jump to that file and line
> 4. Note the context lines above and below each match

> [!todo] Step 2: Case-sensitive search
> 1. Toggle "Case sensitive" in the search panel
> 2. Search for `Markdown` (capital M)
> 3. Compare the number of results with lowercase `markdown`
> 4. Turn case-sensitive off again

> [!todo] Step 3: Regex search — find patterns
> 1. Toggle "Regex" mode
> 2. Search for dates: `\d{4}-\d{2}-\d{2}`
> 3. Search for all headings: `^#{1,3} .+`
> 4. Search for unchecked tasks: `- \[ \]`
> 5. Search for wikilinks: `\[\[.+?\]\]`

> [!todo] Step 4: Replace in a single file
> 1. Open one of your Sandbox files in Edit mode
> 2. Use `Ctrl+H` (or the replace field in the search panel)
> 3. Replace a word (e.g., change "Note" to "Document")
> 4. Click "Replace" for a single occurrence

> [!todo] Step 5: Batch replace
> 1. In the vault-wide search panel, enter a term that appears in multiple files
> 2. Enter a replacement
> 3. Review the preview — see which files will be affected
> 4. Click "Replace All" to apply across files
> 5. Check the affected files to verify the changes

---

## Success Criteria

- [ ] You can find content with basic text search
- [ ] You understand the difference between case-sensitive and insensitive
- [ ] You can write basic regex patterns (dates, headings, tasks)
- [ ] You can replace text in a single file
- [ ] You can perform batch replace across multiple files

---

## What You Learned

- Opening and using the search panel
- Toggling search options (case, regex)
- Writing regex patterns for common tasks
- Single-file and multi-file replace
- Reviewing changes before applying batch replace

---

## Bonus Challenges

> [!tip] Try These
> - Find all files that have no tags: search for files NOT containing `tags:`
> - Find all broken links: look for wikilinks to non-existent files (they appear dashed in View mode)
> - Count how many exercises exist: search for `## Goal`

---

## Continue

:arrow_right: [[Exercise 5 - Create Canvas]] — Create a visual brainstorming board
