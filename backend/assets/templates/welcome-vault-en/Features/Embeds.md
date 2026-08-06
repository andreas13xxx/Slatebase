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

**Live example:** The vault has a test image at `Attachments/Demo-Image.png`. The following code

```
![[Attachments/Demo-Image.png|400]]
```

renders this embedded image right below:

![[Attachments/Demo-Image.png|400]]

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

The same demo image as a thumbnail, for comparison:

![[Attachments/Demo-Image.png|150]]

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

**Live example:** The vault has a two-page test PDF at `Attachments/Demo-Document.pdf`. The code

```
![[Attachments/Demo-Document.pdf|500]]
```

renders the inline viewer below — flip to page 2 to confirm navigation works:

![[Attachments/Demo-Document.pdf|500]]

---

## Embedding Notes

You can embed the entire content of another Markdown file:

```
![[Other Note]]
```

The embedded note is fully rendered (with headings, lists, callouts, etc.).

**Live example:** The vault has a demo note with two sections at `Attachments/Demo-Note.md`. The code

```
![[Attachments/Demo-Note]]
```

embeds the whole note — including both sections, the list, and the callout:

![[Attachments/Demo-Note]]

### Heading Embeds

Embed only a specific section:

```
![[Other Note#Section]]
```

This shows only the content under the specified heading (until the next heading of equal or higher level).

**Live example:** The same code with `#Section B` shows only that one section from the demo note — Section A and the intro text are left out:

```
![[Attachments/Demo-Note#Section B]]
```

![[Attachments/Demo-Note#Section B]]

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
> 3. Embed `Attachments/Demo-Image.png` with a different width, e.g. `![[Attachments/Demo-Image.png|250]]`
> 4. Embed `Attachments/Demo-Document.pdf` and flip to page 2 in the viewer
> 5. Embed `Attachments/Demo-Note` once in full and once with just `#Section A` — compare the two results

---

## Related Features

- [[Features/Wikilinks]] — Links instead of embeddings
- [[Features/Callouts]] — Highlighted content blocks
- [[Features/Mermaid Diagrams]] — Diagrams directly in Markdown
- [[Basics/Editor and Viewer]] — Edit and View mode
