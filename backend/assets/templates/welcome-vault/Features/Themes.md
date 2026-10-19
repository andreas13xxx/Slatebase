---
tags: [features]
---

# Themes

Mit Themes gibst du Slatebase ein neues Aussehen — Farben, Schriften und Überschriften. Slatebase liest Obsidian-Themes direkt aus deinem Vault: Ein Theme, das du in Obsidian nutzt, funktioniert auch hier, ohne dass du es umwandeln musst.

---

## Wo Themes liegen

Themes sind Teil des Vaults. Jedes Theme ist ein Ordner mit einer `theme.css` und meist einer `manifest.json`:

```
Mein Vault/
└── .obsidian/
    ├── appearance.json        ← merkt sich das aktive Theme
    └── themes/
        └── Things/
            ├── theme.css
            └── manifest.json
```

Weil Themes im Vault liegen, reisen sie mit Backups und mit der [[Features/Git-Sync|Git-Synchronisation]] — und ein Vault, den du aus Obsidian übernimmst, zeigt seine Themes sofort.

> [!info] Gilt für alle Nutzer des Vaults
> Das aktive Theme wird im Vault gespeichert, nicht im Konto. Wer den Vault öffnet, sieht dasselbe Theme. Ob die Oberfläche hell oder dunkel ist, entscheidet weiterhin jeder selbst.

---

## Ein Theme auswählen

1. Öffne die Einstellungen (`Ctrl+,`)
2. Wähle unter **Vault** den Abschnitt **Themes**
3. Wähle ein Theme aus der Liste — die Änderung wirkt sofort
4. Mit **Slatebase (Standard)** kehrst du zum normalen Aussehen zurück

Wechselt jemand anderes das Theme, während du den Vault offen hast, übernimmt dein Fenster die Änderung automatisch.

---

## Ein Theme importieren

1. Klicke im Abschnitt **Themes** auf die Fläche am Ende der Seite (oder ziehe die Dateien darauf)
2. Wähle die `theme.css` aus, optional zusammen mit der `manifest.json` (maximal 2 MB)
3. Der Name kommt aus der `manifest.json`; ohne Manifest wird der Dateiname verwendet
4. Existiert schon ein Theme mit diesem Namen, fragt Slatebase vor dem Überschreiben nach

Themes bekommst du zum Beispiel aus dem Community-Verzeichnis von Obsidian oder aus dem GitHub-Repository des Theme-Autors.

> [!warning] Themes mit Fremdinhalten
> Manche Themes laden Schriften oder Bilder von anderen Servern (zum Beispiel Google Fonts). Slatebase zeigt dann unter dem Theme an, von welchen Hosts Inhalte geladen werden. Prüfe das, wenn du Wert auf Datenschutz legst.

---

## Was unterstützt wird — und was nicht

Slatebase unterstützt **Themes, die über Obsidian-CSS-Variablen arbeiten**:

- Farben für Hintergründe, Text, Rahmen und Akzent der gesamten Oberfläche
- Schriftarten für Oberfläche, Text und Code
- Größe, Gewicht und Farbe der Überschriften, fetter und kursiver Text
- Zeilenhöhe und Breite des Editors

Nicht unterstützt sind **Layout-Anpassungen**, die auf Obsidians interne Struktur zielen (zum Beispiel eigene Anordnungen von Tabs, Seitenleisten oder Titelzeilen). Themes, die stark darauf aufbauen — etwa *Minimal* oder *AnuPpuccin* — werden deshalb nur teilweise umgesetzt: Farben und Schriften greifen, das Layout bleibt das von Slatebase. Einstellungen des Plugins *Style Settings* werden nicht ausgewertet.

---

## Themes und CSS-Snippets

Beides lässt sich kombinieren. Das Theme wird zuerst angewendet, deine [[Features/CSS-Snippets|CSS-Snippets]] danach — ein Snippet kann also einzelne Werte des Themes überschreiben.

---

> [!todo] Übung
> Importiere ein Theme, wechsle in den Einstellungen dazu und wieder zurück zu **Slatebase (Standard)**. Aktiviere dann ein CSS-Snippet und beobachte, dass es das Theme ergänzt.

---

## Verwandte Features

- [[Features/Einstellungen|Einstellungen]] — Wo du Themes findest
- [[Features/CSS-Snippets|CSS-Snippets]] — Eigenes CSS zusätzlich zum Theme
- [[Features/Git-Sync|Git-Sync]] — Themes mit dem Vault synchronisieren
