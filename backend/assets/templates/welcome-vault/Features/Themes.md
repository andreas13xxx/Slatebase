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

> [!tip] Obsidian (Standard)
> Neben **Slatebase (Standard)** liefert Slatebase ein zweites Aussehen mit: **Obsidian (Standard)** bildet das Standard-Theme von Obsidian nach — Farben, violetter Akzent, Systemschrift, Überschriften, Tabs, Seitenleiste, Statusleiste unten rechts, Befehlspalette und Einstellungen. Es muss nicht importiert werden und lässt sich nicht löschen. Wie jedes Theme gilt es pro Vault; hell oder dunkel bestimmst du weiter selbst. Obsidian selbst kennt diese Auswahl nicht: In einem Vault, den du auch in Obsidian öffnest, zeigt es sein eigenes Standard-Theme und kann die Auswahl beim nächsten Speichern seiner Darstellungs-Einstellungen überschreiben. Slatebase zeigt dann wieder „Slatebase (Standard)"; wähle das Theme einfach erneut aus.

Wechselt jemand anderes das Theme, während du den Vault offen hast, übernimmt dein Fenster die Änderung automatisch.

---

## Ein Theme importieren

1. Klicke im Abschnitt **Themes** auf die Fläche am Ende der Seite (oder ziehe die Dateien darauf)
2. Wähle die `theme.css` aus, optional zusammen mit der `manifest.json` (maximal 6 MB)
3. Der Name kommt aus der `manifest.json`; ohne Manifest wird der Dateiname verwendet
4. Existiert schon ein Theme mit diesem Namen, fragt Slatebase vor dem Überschreiben nach

Themes bekommst du zum Beispiel aus dem Community-Verzeichnis von Obsidian oder aus dem GitHub-Repository des Theme-Autors.

> [!warning] Themes mit Fremdinhalten
> Manche Themes laden Schriften oder Bilder von anderen Servern (zum Beispiel Google Fonts). Slatebase zeigt dann unter dem Theme an, von welchen Hosts Inhalte geladen werden. Prüfe das, wenn du Wert auf Datenschutz legst.

---

## Themes aus dem Katalog

Im Abschnitt **Themes** gibt es neben **Installiert** den Tab **Entdecken**: Er zeigt den Community-Katalog von Obsidian (rund 900 Themes) mit Vorschaubild.

- **Suchen und filtern:** nach Name oder Autor, nach **Hell** oder **Dunkel** (vorbelegt mit deinem aktuellen Modus), nur **Installiert** oder nur **Update verfügbar**. Themes im alten Format sind ausgeblendet, bis du **Veraltete anzeigen** aktivierst.
- **Installieren:** ein Klick lädt `theme.css` und `manifest.json` in den Vault (`.obsidian/themes/`). Mit **Nach der Installation aktivieren** wird das Theme sofort ausgewählt. Existiert es schon, fragt Slatebase vor dem Ersetzen nach.
- **Updates:** **Nach Updates suchen** vergleicht die installierten Themes mit dem Katalog. Aktualisiert wird nur auf Klick, nie automatisch. Selbst importierte Themes ohne Katalogeintrag werden nicht angefasst.
- **Nicht jedes Theme ist installierbar:** Etwa jedes zehnte Theme des Katalogs hat keine `theme.css` (oder die ältere `obsidian.css`) oder keine `manifest.json` im Hauptverzeichnis oder ist größer als 6 MB. Slatebase nennt dann den Grund.

> [!info] Wer greift auf das Internet zu?
> Der Slatebase-Server holt Katalog, Theme-Dateien und Vorschaubilder von `raw.githubusercontent.com`. Dein Browser spricht dabei nur mit Slatebase, nie mit GitHub. Ein Administrator kann den Katalog in den Funktionsschaltern ausschalten (**obsidian-theme-store**); dann entfällt der Tab **Entdecken**, installierte Themes bleiben nutzbar. Ohne Internetzugang zeigt Slatebase die zuletzt geladene Liste.

> [!warning] Fremdes CSS
> Ein Theme ist fremdes CSS. Slatebase führt kein Skript daraus aus, manche Themes laden aber Schriften oder Bilder von anderen Servern. Das zeigt dir der Tab **Installiert** unter dem Theme an.

---

## Was unterstützt wird — und was nicht

Slatebase unterstützt **Themes, die über Obsidian-CSS-Variablen arbeiten**:

- Farben für Hintergründe, Text, Rahmen und Akzent der gesamten Oberfläche
- Schriftarten für Oberfläche, Text und Code
- Größe, Gewicht und Farbe der Überschriften, fetter und kursiver Text
- Zeilenhöhe und Breite des Editors

Außerdem trägt der Editor die Klassen, an denen viele Themes ihre Regeln festmachen (`mod-cm6`, `is-live-preview`, `is-readable-line-width`, `HyperMD-header`, `HyperMD-codeblock`, `HyperMD-quote`, `HyperMD-task-line`, `cm-inline-code`, `cm-highlight`, `cm-hashtag`). Dadurch greifen zum Beispiel Tabellenstil und Editorbreite von *Minimal*. Dasselbe gilt für CSS von Plugins, das diese Klassen anspricht. Die Zeilen- und Elementklassen (`HyperMD-*`, `cm-*`) gibt es nur in der Live Preview, nicht im Quellmodus, und `cm-formatting` nur an Überschriften und Code-Zeichen.

Nicht unterstützt sind **Layout-Anpassungen**, die auf Obsidians interne Struktur zielen (zum Beispiel eigene Anordnungen von Tabs, Seitenleisten oder Titelzeilen). Themes, die stark darauf aufbauen — etwa *Minimal* oder *AnuPpuccin* — werden deshalb nur teilweise umgesetzt: Farben und Schriften greifen, das Layout bleibt das von Slatebase (Tab-Leiste, Seitenleisten, Titelzeile). Die Leseansicht von Obsidian gibt es in Slatebase nicht als eigenen Modus. Einstellungen, die ein Theme über das Plugin *Style Settings* anbietet, funktionieren zum Teil: Das Plugin läuft in Slatebase (installiere es unter Einstellungen → Plugins), und Optionen, die Farben, Schriften und Größen über Variablen setzen, greifen vollständig. Optionen, die nur eine Klasse umschalten, wirken nur dort, wo Slatebase das passende Element hat (bei *Minimal* etwa 11 von 64, vor allem Tabellen und Überschriften). Themes mit solchen Optionen zeigen in der Themenliste einen Hinweis.

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
