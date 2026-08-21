---
tags: [features]
---

# Mathe (LaTeX)

Slatebase rendert mathematische Formeln mit KaTeX — sowohl im Fließtext (inline) als auch als freistehende Blöcke. Die Syntax ist mit Obsidian kompatibel.

---

## Inline-Mathe

Umschließe eine Formel mit einfachen Dollar-Zeichen:

```
Die Energie berechnet sich als $E = mc^2$.
```

**Ergebnis:** Die Energie berechnet sich als $E = mc^2$.

### Weitere Beispiele

```
Der Satz des Pythagoras: $a^2 + b^2 = c^2$

Ein Bruch: $\frac{1}{2}$

Eine Wurzel: $\sqrt{x^2 + y^2}$

Griechische Buchstaben: $\alpha, \beta, \gamma, \Omega$
```

**Ergebnis:**

Der Satz des Pythagoras: $a^2 + b^2 = c^2$

Ein Bruch: $\frac{1}{2}$

Eine Wurzel: $\sqrt{x^2 + y^2}$

Griechische Buchstaben: $\alpha, \beta, \gamma, \Omega$

---

## Block-Mathe

Für größere, zentrierte Formeln verwende doppelte Dollar-Zeichen auf eigenen Zeilen:

```
$$
\int_0^\infty e^{-x^2} dx = \frac{\sqrt{\pi}}{2}
$$
```

**Ergebnis:**

$$
\int_0^\infty e^{-x^2} dx = \frac{\sqrt{\pi}}{2}
$$

### Weitere Block-Beispiele

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

## Begrenzungsregeln

Die Inline-Mathe-Erkennung folgt Obsidians Konventionen:

| Regel | Beispiel | Ergebnis |
|-------|----------|----------|
| Kein Leerzeichen nach öffnendem `$` | `$ x$` | Kein Mathe (Rohtext) |
| Kein Leerzeichen vor schließendem `$` | `$x $` | Kein Mathe (Rohtext) |
| Keine Ziffer nach schließendem `$` | `$5 ... $10` | Kein Mathe (Geldbeträge) |
| Escaped Dollar | `\$nicht mathe\$` | Kein Mathe (escaped) |
| In Code-Blöcken | `` `$x$` `` | Kein Mathe (Code) |

---

## Unterstützte LaTeX-Befehle

KaTeX unterstützt einen großen Teil der LaTeX-Mathematik-Syntax:

- **Grundrechenarten**: `+`, `-`, `\cdot`, `\times`, `\div`, `\pm`
- **Brüche**: `\frac{a}{b}`
- **Wurzeln**: `\sqrt{x}`, `\sqrt[3]{x}`
- **Potenzen/Indizes**: `x^2`, `x_i`, `x_i^2`
- **Summen/Integrale**: `\sum`, `\prod`, `\int`, `\iint`, `\oint`
- **Griechisch**: `\alpha` bis `\omega`, `\Gamma` bis `\Omega`
- **Klammern**: `\left(`, `\right)`, `\langle`, `\rangle`
- **Matrizen**: `\begin{pmatrix}...\end{pmatrix}`, `bmatrix`, `vmatrix`
- **Mengen**: `\in`, `\notin`, `\subset`, `\cup`, `\cap`, `\emptyset`
- **Pfeile**: `\to`, `\leftarrow`, `\Rightarrow`, `\iff`
- **Abstände**: `\quad`, `\,`, `\;`, `\!`
- **Text in Formeln**: `\text{...}`

Die vollständige Liste: [KaTeX Supported Functions](https://katex.org/docs/supported)

---

## Fehlerbehandlung

Bei ungültiger LaTeX-Syntax zeigt Slatebase den Rohtext mit einer gestrichelten Unterstreichung an. Hover über die Formel zeigt die Fehlermeldung.

```
$\frac{1}{$ — ungültig, schließende Klammer fehlt
```

---

## Live Preview

Im Live Preview wird Mathe cursor-abhängig dargestellt:
- **Cursor außerhalb**: Gerenderte Formel sichtbar
- **Cursor innerhalb**: LaTeX-Quelltext editierbar

---

## Editor-Befehle

Die Command Palette (Ctrl+P) bietet zwei Mathe-Befehle:

- **Insert math block** — Fügt `$$\n\n$$` ein und positioniert den Cursor dazwischen
- **Toggle inline maths** — Umschließt die Auswahl mit `$...$`

---

> [!todo] Übung
> 1. Schreibe `$E = mc^2$` in einer neuen Datei und wechsle in den Viewer-Modus
> 2. Erstelle einen Block mit `$$\n\sum_{k=1}^n k = \frac{n(n+1)}{2}\n$$`
> 3. Teste den Live Preview: Klicke auf eine gerenderte Formel — der Quelltext wird sichtbar
> 4. Probiere einen Fehler aus: `$\frac{1}{$` — die Fehlermeldung erscheint als Tooltip

---

## Verwandte Features

- [[Features/Mermaid Diagramme]] — Diagramme und Grafiken
- [[Features/Embeds]] — Dateien einbetten (Bilder, PDFs, Audio, Video)
- [[Features/Live Preview Editor]] — Cursor-abhängige Vorschau
- [[Features/Command Palette]] — Schnellzugriff auf Befehle
