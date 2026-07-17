---
tags: [features]
---

# Wikilinks

Wikilinks are the heart of Slatebase. With the `[[...]]` syntax you can link any notes together and build a knowledge network.

![[Screenshots/wikilink-autocomplete.png]]

*Wikilinks in the formatted view*

---

## Basic Syntax

The simplest form of a wikilink points to another file in the vault:

```
[[Filename]]
```

Slatebase resolves the link automatically — you don't need to specify the full path as long as the filename is unique.

### Examples

| Syntax | Result |
|--------|--------|
| `[[Start here]]` | Links to the file "Start here.md" |
| `[[Basics/Markdown Syntax]]` | Links with explicit path |
| `[[Features/Wikilinks]]` | Links to this file |

---

## Path Specifications

When multiple files have the same name, you can specify the path:

```
[[Folder/Subfolder/Filename]]
```

Slatebase automatically tries to resolve the shortest unique path. Only when ambiguous is the full path needed.

---

## Aliases (Display Names)

With the pipe character `|` you can assign an alternative display name:

```
[[Target|Displayed Text]]
```

### Examples

| Syntax | Display |
|--------|---------|
| `[[Start here\|Home]]` | Home |
| `[[Features/Knowledge Graph\|Graph]]` | Graph |
| `[[Basics/Markdown Syntax\|Learn Markdown]]` | Learn Markdown |

The link shows the text after `|` but points to the file before `|`.

---

## Heading Links

You can link directly to a heading within a file:

```
[[Filename#Heading]]
```

### Examples

```
[[Markdown Syntax#Code Blocks]]
[[Features/Callouts#Foldable Callouts]]
[[#Basic Syntax]]
```

The last case — `[[#Heading]]` without a filename — links to a heading *in the current file*.

---

## Block References

Besides headings you can also reference individual paragraphs (blocks):

```
[[Filename#^block-id]]
```

The target paragraph must have a block ID at the end:

```markdown
This is an important paragraph. ^my-block
```

Then you link with:

```
[[Filename#^my-block]]
```

---

## Auto-Resolve

Slatebase resolves wikilinks intelligently:

1. **Exact match** — Filename matches exactly
2. **Without extension** — `[[Note]]` finds `Note.md`
3. **Shortest path** — When unique, the filename alone suffices
4. **Case-insensitive** — `[[note]]` finds `Note.md`

When a link cannot be resolved, it's displayed as a "broken link" (dashed underline). You can click on it to create a new file with that name.

---

## Practical Example

Create a new file `My Ideas.md` with the following content:

```markdown
# My Ideas

Here I collect thoughts related to [[Features/Wikilinks|linking]].

## Next Steps

- Explore the [[Features/Knowledge Graph]]
- Learn more about [[Features/Tags and Properties|Tags]]
- Back to the [[Features/Overview]]
```

Then switch to View mode — all links should be clickable.

---

> [!tip] Tip: Use Backlinks
> Every link you create automatically generates a **backlink** at the target. In the [[Features/Context Panel]] you can see all files that reference the current file. This way you discover connections without actively searching for them.

> [!todo] Exercise
> 1. Create a new file with 3 wikilinks to different files in this vault
> 2. Use at least one alias (`[[Target|Display]]`)
> 3. Link to a heading (`[[File#Heading]]`)
> 4. Open the Context Panel and check the backlinks

---

## Related Features

- [[Features/Embeds]] — Embed content instead of just linking
- [[Features/Knowledge Graph]] — Visualize connections
- [[Features/Context Panel]] — Display backlinks and forward links
- [[Features/Search and Replace]] — Find links via search
