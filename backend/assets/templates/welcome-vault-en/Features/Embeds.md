---
tags: [features]
---

# Embeds

With embeds you inline content from other files directly into your note — images, PDFs, or even entire notes. The syntax is a wikilink preceded by `!`.

---

## Basic Syntax

```
![[Filename]]
```

The exclamation mark `!` before the square brackets distinguishes an embed from a regular link.

---

## Embedding Images

Supported formats: PNG, JPG, JPEG, GIF, WEBP, SVG.

```
![[image.png]]
![[Screenshots/overview.png]]
```

### Adjusting Size

With the pipe character you specify a width in pixels:

```
![[image.png|400]]
![[Screenshots/editor-toolbar.png|600]]
```

| Syntax | Result |
|--------|--------|
| `![[photo.png]]` | Full width (max container) |
| `![[photo.png\|300]]` | 300px width |
| `![[photo.png\|150]]` | 150px width (thumbnail) |

---

## Embedding PDFs

PDF files are displayed as an inline viewer:

```
![[document.pdf]]
```

The PDF viewer allows:
- Page navigation
- Zooming
- Text selection and copying

> [!tip] PDF Size
> For large PDFs a size specification is recommended to limit the viewer height: `![[manual.pdf|600]]`

---

## Embedding Notes

You can embed the entire content of another Markdown file:

```
![[Other Note]]
```

The embedded note is fully rendered (with headings, lists, callouts, etc.).

### Heading Embeds

Embed only a specific section:

```
![[Other Note#Section]]
```

This shows only the content under the specified heading (until the next heading of equal or higher level).

---

## Practical Example

Create a file `Summary.md`:

```markdown
# Summary

## Key Concepts

The following basics are essential:

![[Basics/Markdown Syntax#Code Blocks]]

## Reference Image

![[Screenshots/overview.png|500]]

*The Slatebase interface at a glance*
```

In View mode you'll see the embedded section and the image directly in your note.

---

## Importing Images into the Vault

There are several ways to get images into your vault:

1. **Drag & Drop** — Drag an image file from the desktop into the file explorer
2. **Paste** — Copy an image and paste it in the editor with `Ctrl+V`
3. **Upload button** — Via the context menu in the file explorer

Pasted images are automatically saved in the vault and can be embedded immediately.

---

> [!tip] Image Captions
> Slatebase has no native caption syntax. Use italic text directly below the embed:
> ```
> ![[diagram.png|500]]
> *Figure 1: Architecture overview*
> ```

> [!todo] Exercise
> 1. Create a new file and embed this file: `![[Features/Embeds#Basic Syntax]]`
> 2. Switch to View mode and verify only the "Basic Syntax" section is displayed
> 3. If you have an image in the vault, embed it with a size specification

---

## Related Features

- [[Features/Wikilinks]] — Links instead of embeddings
- [[Features/Callouts]] — Highlighted content blocks
- [[Features/Mermaid Diagrams]] — Diagrams directly in Markdown
- [[Basics/Editor and Viewer]] — Edit and View mode
