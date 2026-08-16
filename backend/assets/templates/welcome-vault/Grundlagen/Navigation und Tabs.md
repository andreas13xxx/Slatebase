---
tags:
  - grundlagen
---

# Navigation und Tabs

Slatebase verwendet ein Tab-System ähnlich wie ein Browser oder Code-Editor. Du kannst mehrere Dateien gleichzeitig offen halten und schnell zwischen ihnen wechseln.

![[Screenshots/tabs-mehrere.png]]

*Mehrere offene Tabs in der Tab-Leiste*

---

## Dateien öffnen

Es gibt mehrere Wege, eine Datei zu öffnen:

1. **Klick im Explorer** — Ein Klick auf eine Datei öffnet sie in einem neuen Tab
2. **Wikilink anklicken** — Im View-Modus öffnet ein Klick auf `[[Dateiname]]` die verlinkte Datei
3. **Command Palette** — `Strg+P` öffnet die Befehlspalette, dort kannst du Dateien suchen
4. **Schnellwechsler** — `Strg+O` öffnet einen Fuzzy-Datei-Finder: tippe ein paar Buchstaben aus dem Dateinamen, die Treffer werden nach Übereinstimmungsgüte sortiert. Findet der Suchtext keine Datei, bietet der Schnellwechsler an, direkt eine neue Datei mit diesem Namen anzulegen

---

## Zurück und Vor navigieren

Slatebase merkt sich, welche Dateien du zuletzt besucht hast — ähnlich wie der Verlauf in einem Browser.

- **Zurück** (`Alt+←` oder der ◀-Button links neben der Tab-Leiste): springt zur zuvor besuchten Datei
- **Vor** (`Alt+→` oder der ▶-Button): springt wieder vorwärts, sofern du zuvor "Zurück" verwendet hast

Jede Navigation zählt als Besuch — ob du eine Datei im Explorer anklickst, einem Wikilink folgst, ein Suchergebnis öffnest oder den Schnellwechsler nutzt. Navigierst du nach einem "Zurück" zu einer neuen Datei (statt erneut "Vor" zu drücken), wird der bisherige Vor-Verlauf verworfen — genau wie im Browser.

> [!tip] Tipp
> Der Zurück-Button ist ausgegraut, solange keine vorherige Datei existiert. Genauso der Vor-Button, solange du nicht zuvor "Zurück" genutzt hast.

---

## Tabs verwalten

### Tab schließen

- Klicke auf das **×** im Tab
- Oder verwende **Mittlere Maustaste** (Mausrad-Klick) auf den Tab

### Tab-Reihenfolge ändern

Ziehe einen Tab per **Drag & Drop** an die gewünschte Position in der Tab-Leiste.

### Aktiver Tab

Der aktive Tab ist farblich hervorgehoben. Der Inhalt dieses Tabs wird im Hauptbereich angezeigt.

### Zwischen Tabs wechseln (Tastatur)

- `Strg+Shift+]` — nächster Tab (springt am Ende wieder zum ersten)
- `Strg+Shift+[` — vorheriger Tab (springt am Anfang wieder zum letzten)

---

## Breadcrumb-Leiste

Oberhalb des Editors zeigt die Breadcrumb-Leiste den Ordnerpfad der geöffneten Datei als Kette klickbarer Segmente — z.B. `MeinVault / Projekte / Alpha / notizen.md`. Ein Klick auf ein Ordner-Segment öffnet den Datei-Explorer und markiert diesen Ordner; ein Klick auf den Vault-Namen springt zur Wurzelebene. Bei tief verschachtelten Pfaden werden die mittleren Ordner hinter einem „…"-Symbol zusammengefasst.

Für Dateien im Vault-Root zeigt die Leiste nur Vault-Name und Dateiname. Bei Nicht-Datei-Tabs (z.B. dem Knowledge Graph) bleibt sie ausgeblendet.

---

## Schritt-für-Schritt: Mehrere Tabs nutzen

1. Öffne eine Datei im Explorer (z.B. `Start hier.md`)
2. Öffne eine zweite Datei — sie erscheint als neuer Tab
3. Klicke zwischen den Tabs, um zu wechseln
4. Schließe nicht mehr benötigte Tabs mit dem ×-Symbol

---

## Tastenkürzel

| Aktion | Kürzel |
|--------|--------|
| Command Palette öffnen | `Strg+P` |
| Schnellwechsler öffnen | `Strg+O` |
| Einstellungen öffnen | `Strg+,` |
| Suche öffnen | `Strg+Shift+F` |
| Zurück navigieren | `Alt+←` |
| Vor navigieren | `Alt+→` |
| Nächster Tab | `Strg+Shift+]` |
| Vorheriger Tab | `Strg+Shift+[` |

> [!tip] Tipp
> Die Tastenkürzel lassen sich unter **Einstellungen → Tastenkürzel** anpassen. Mehr dazu im Guide [[Fortgeschritten/Tastenkürzel anpassen|Tastenkürzel anpassen]].

---

## Datei-Navigation

### Zuletzt geöffnete Dateien

Im linken Seitenbereich findest du die **Zuletzt geöffnet**-Liste. Sie zeigt die letzten 20 Dateien, die du bearbeitet hast — praktisch um schnell zu einer kürzlich besuchten Notiz zurückzukehren.

### Favoriten

Häufig benötigte Dateien kannst du als **Favorit** markieren (Stern-Symbol im Explorer). Sie erscheinen dann im Favoriten-Bereich der Seitenleiste.

### Aktive Datei im Explorer verfolgen

Unter **Einstellungen → Vault-Konfiguration** gibt es den Schalter „Aktive Datei im Explorer verfolgen". Ist er aktiviert, klappt der Datei-Explorer beim Wechsel des aktiven Tabs automatisch die passenden Ordner auf und scrollt zur Datei — du musst den Explorer nicht mehr manuell durchsuchen, um zu sehen, wo du gerade bist. Der Schalter ist standardmäßig deaktiviert und wirkt sofort, ohne Speichern-Button.

---

## Praxisbeispiel

Stell dir vor, du arbeitest an einem Projekt mit mehreren Notizen:

1. Öffne die **Projektübersicht** als Startpunkt
2. Öffne daneben die **Meeting-Notizen** in einem zweiten Tab
3. Halte die **TODO-Liste** in einem dritten Tab bereit
4. Wechsle je nach Bedarf zwischen den Tabs

So hast du alle relevanten Informationen griffbereit, ohne ständig hin- und hernavigieren zu müssen.

---

> [!todo] Übung
> Öffne 3 verschiedene Dateien aus diesem Vault in separaten Tabs:
> 1. Diese Datei (bereits offen)
> 2. [[Grundlagen/Markdown Syntax|Markdown Syntax]]
> 3. [[Start hier|Start hier]]
>
> Wechsle nun zwischen den Tabs und schließe einen davon wieder.

---

## Verwandte Seiten

- [[Grundlagen/Datei-Explorer|Datei-Explorer]] — Nächster Guide
- [[Features/Command Palette|Command Palette]] — Schnellzugriff auf alles
- [[Fortgeschritten/Tastenkürzel anpassen|Tastenkürzel anpassen]] — Eigene Shortcuts definieren
