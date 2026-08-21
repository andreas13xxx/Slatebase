---
tags: [features]
---

# Math (LaTeX)

Slatebase renders mathematical formulas using KaTeX — both inline within text and as standalone display blocks. The syntax is Obsidian-compatible.

---

## Inline Math

Wrap a formula with single dollar signs:

```
Energy is calculated as $E = mc^2$.
```

**Result:** Energy is calculated as $E = mc^2$.

### More Examples

```
The Pythagorean theorem: $a^2 + b^2 = c^2$

A fraction: $\frac{1}{2}$

A square root: $\sqrt{x^2 + y^2}$

Greek letters: $\alpha, \beta, \gamma, \Omega$
```

**Result:**

The Pythagorean theorem: $a^2 + b^2 = c^2$

A fraction: $\frac{1}{2}$

A square root: $\sqrt{x^2 + y^2}$

Greek letters: $\alpha, \beta, \gamma, \Omega$

---

## Display Math (Block)

For larger, centered formulas, use double dollar signs on their own lines:

```
$$
\int_0^\infty e^{-x^2} dx = \frac{\sqrt{\pi}}{2}
$$
```

**Result:**

$$
\int_0^\infty e^{-x^2} dx = \frac{\sqrt{\pi}}{2}
$$

### More Block Examples

```
$$
\sum_{n=1}^{\infty} \frac{1}{n^2} = \frac{\pi^2}{6}
$$
```

$$
\sum_{n=1}^{\infty} \frac{1}{n^2} = \frac{\pi^2}{6}
$$

```
$$
\begin{pmatrix}
a & b \\
c & d
\end{pmatrix}
\cdot
\begin{pmatrix}
x \\
y
\end{pmatrix}
=
\begin{pmatrix}
ax + by \\
cx + dy
\end{pmatrix}
$$
```

$$
\begin{pmatrix}
a & b \\
c & d
\end{pmatrix}
\cdot
\begin{pmatrix}
x \\
y
\end{pmatrix}
=
\begin{pmatrix}
ax + by \\
cx + dy
\end{pmatrix}
$$

---

## Boundary Rules

Inline math detection follows Obsidian's conventions:

| Rule | Example | Result |
|------|---------|--------|
| No space after opening `$` | `$ x$` | Not math (raw text) |
| No space before closing `$` | `$x $` | Not math (raw text) |
| No digit after closing `$` | `$5 ... $10` | Not math (currency) |
| Escaped dollar | `\$not math\$` | Not math (escaped) |
| Inside code blocks | `` `$x$` `` | Not math (code) |

---

## Supported LaTeX Commands

KaTeX supports a large subset of LaTeX math syntax:

- **Arithmetic**: `+`, `-`, `\cdot`, `\times`, `\div`, `\pm`
- **Fractions**: `\frac{a}{b}`
- **Roots**: `\sqrt{x}`, `\sqrt[3]{x}`
- **Exponents/Subscripts**: `x^2`, `x_i`, `x_i^2`
- **Sums/Integrals**: `\sum`, `\prod`, `\int`, `\iint`, `\oint`
- **Greek letters**: `\alpha` through `\omega`, `\Gamma` through `\Omega`
- **Brackets**: `\left(`, `\right)`, `\langle`, `\rangle`
- **Matrices**: `\begin{pmatrix}...\end{pmatrix}`, `bmatrix`, `vmatrix`
- **Sets**: `\in`, `\notin`, `\subset`, `\cup`, `\cap`, `\emptyset`
- **Arrows**: `\to`, `\leftarrow`, `\Rightarrow`, `\iff`
- **Spacing**: `\quad`, `\,`, `\;`, `\!`
- **Text in formulas**: `\text{...}`

Full reference: [KaTeX Supported Functions](https://katex.org/docs/supported)

---

## Error Handling

Invalid LaTeX syntax displays the raw text with a dashed underline. Hovering shows the error message.

```
$\frac{1}{$ — invalid, missing closing brace
```

---

## Live Preview

In Live Preview, math is rendered cursor-dependently:
- **Cursor outside**: Rendered formula visible
- **Cursor inside**: LaTeX source editable

---

## Editor Commands

The Command Palette (Ctrl+P) offers two math commands:

- **Insert math block** — Inserts `$$\n\n$$` and positions the cursor between them
- **Toggle inline maths** — Wraps the selection with `$...$`

---

> [!todo] Exercise
> 1. Write `$E = mc^2$` in a new file and switch to View mode
> 2. Create a block with `$$\n\sum_{k=1}^n k = \frac{n(n+1)}{2}\n$$`
> 3. Test Live Preview: click on a rendered formula — the source becomes visible
> 4. Try an error: `$\frac{1}{$` — the error message appears as a tooltip

---

## Related Features

- [[Features/Mermaid Diagrams]] — Diagrams and charts
- [[Features/Embeds]] — Embed files (images, PDFs, audio, video)
- [[Features/Live Preview Editor]] — Cursor-dependent preview
- [[Features/Command Palette]] — Quick access to commands
