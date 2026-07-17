---
tags:
  - basics
---

# Markdown Syntax

Markdown is the formatting language you use to write in Slatebase. In Edit mode you see the Markdown code, in View mode you see the formatted result.

![[Screenshots/viewer-formatiert.png]]

*Formatted view in view mode*

---

## Headings

Use `#` characters for headings (1–6 levels):

```markdown
# Heading 1
## Heading 2
### Heading 3
#### Heading 4
##### Heading 5
###### Heading 6
```

> [!tip] Tip
> Use a maximum of 3 levels in a note. Too many levels make the structure confusing.

---

## Text Formatting

| Syntax | Result | Description |
|--------|--------|-------------|
| `**bold**` | **bold** | Emphasis |
| `*italic*` | *italic* | Stress |
| `~~strikethrough~~` | ~~strikethrough~~ | Deprecated |
| `**_bold and italic_**` | **_bold and italic_** | Combination |
| `` `code` `` | `code` | Inline code |

---

## Lists

### Unordered List

```markdown
- First item
- Second item
  - Sub-item
- Third item
```

### Ordered List

```markdown
1. Step one
2. Step two
   1. Sub-step
3. Step three
```

### Checklist

```markdown
- [x] Done
- [ ] Still open
```

---

## Tables

```markdown
| Column A | Column B | Column C |
|----------|----------|----------|
| Value 1  | Value 2  | Value 3  |
| Value 4  | Value 5  | Value 6  |
```

---

## Code Blocks

### Inline Code

Use backticks for code in running text: `variableName` or `npm install`.

### Fenced Code Block

Wrap multi-line code with three backticks and specify the language:

````markdown
```javascript
function greet(name) {
  return `Hello, ${name}!`;
}
```
````

Supported languages: `javascript`, `typescript`, `python`, `css`, `html`, `json`, `bash`, and many more.

---

## Horizontal Rule

Three hyphens create a divider:

```markdown
---
```

---

## Block Quotes

```markdown
> This is a quote.
```

> This is a quote.

---

## Links

```markdown
[External link](https://example.com)
```

For internal links use wikilinks: `[[Filename]]` — more on this in the guide [[Features/Wikilinks|Wikilinks]].

---

> [!todo] Exercise
> Create a new file in this vault and try the following elements:
> 1. A heading with `##`
> 2. A bold sentence
> 3. A list with 3 items
> 4. A code block with any language
>
> Then switch to View mode to see the result.

---

## Related Pages

- [[Basics/Editor and Viewer|Editor and Viewer]] — Next guide
- [[Features/Callouts|Callouts]] — Special callout boxes
- [[Features/Mermaid Diagrams|Mermaid Diagrams]] — Diagrams in Markdown
