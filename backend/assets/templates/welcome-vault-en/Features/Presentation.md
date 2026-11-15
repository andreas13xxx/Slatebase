---
tags: [features]
---

# Presentation (Slides)

A note can be shown as a full-screen presentation. Each slide is one section of the note.

## Start

1. Open a Markdown note
2. Open the Command Palette (`Ctrl+P`) and choose **Start presentation** (`slides:start`)

## Separating slides

A line that contains only `---` starts a new slide. A blank line must come before it — otherwise it is the underline of a heading.

```markdown
# Title

---

## First slide

- Point A
- Point B

---

## Second slide
```

Frontmatter at the top of the note is not a slide. A `---` inside a code block separates nothing.

## Controls

| Key | Effect |
|-----|--------|
| `→`, `↓`, `Space`, `Page Down` | Next slide |
| `←`, `↑`, `Page Up` | Previous slide |
| `Home` / `End` | First / last slide |
| `Esc` | Close the presentation |

The slides show the current text of the note, including unsaved changes.

> [!todo] Exercise
> 1. Create a new note with three sections separated by `---`
> 2. Start the presentation and flip through with the arrow keys

---

## Related Features

- [[Features/Command Palette]] — Run commands
- [[Features/Live Preview Editor]] — Write the slide content
