---
tags: [features]
---

# Tags und Properties

Tags und Properties helfen dir, deine Notizen zu kategorisieren und wiederzufinden. Tags sind leichtgewichtige Labels, Properties sind strukturierte Metadaten im YAML-Frontmatter.

![[Screenshots/context-panel.png]]

*Das Context Panel zeigt Tags und Properties*

---

## Tags

### Grundsyntax

Ein Tag beginnt mit `#` gefolgt von einem Wort (ohne Leerzeichen):

```markdown
Dies ist eine Notiz über #projektmanagement und #meetings.
```

Tags können überall im Text stehen — in Überschriften, Listen oder Fließtext.

### Verschachtelte Tags

Mit `/` erstellst du hierarchische Tags:

```markdown
#status/offen
#status/erledigt
#projekt/webapp/frontend
#projekt/webapp/backend
```

Verschachtelte Tags erlauben es, Kategorien feiner zu unterteilen. Wenn du nach `#projekt/webapp` filterst, findest du sowohl Frontend- als auch Backend-Einträge.

### Tag-Regeln

- Beginnen mit `#` und mindestens einem Buchstaben
- Erlaubt: Buchstaben, Zahlen, `-`, `_`, `/`
- Kein Leerzeichen, kein Sonderzeichen am Anfang
- Groß-/Kleinschreibung wird unterschieden (`#Todo` ≠ `#todo`)

### Beispiele

| Tag | Verwendung |
|-----|-----------|
| `#todo` | Offene Aufgaben |
| `#erledigt` | Abgeschlossene Aufgaben |
| `#projekt/slatebase` | Projekt-spezifische Notizen |
| `#typ/meeting` | Notiz-Typ |
| `#priorität/hoch` | Priorisierung |

---

## Properties (Frontmatter)

### Was ist Frontmatter?

YAML-Frontmatter steht ganz am Anfang einer Datei, eingerahmt von `---`:

```markdown
---
tags: [features, dokumentation]
erstellt: 2024-06-15
autor: Max Mustermann
status: entwurf
---

# Meine Notiz

Hier beginnt der eigentliche Inhalt...
```

### Unterstützte Datentypen

| Typ | Beispiel |
|-----|----------|
| Text | `autor: Max Mustermann` |
| Zahl | `version: 2` |
| Datum | `erstellt: 2024-06-15` |
| Boolean | `veröffentlicht: true` |
| Liste | `tags: [feature, neu]` |
| Mehrzeilige Liste | siehe unten |

Mehrzeilige Listen:

```yaml
---
tags:
  - feature
  - dokumentation
  - neu
teilnehmer:
  - Anna
  - Ben
  - Clara
---
```

### Tags im Frontmatter

Tags im Frontmatter und Inline-Tags (`#tag`) werden beide erkannt. Die Frontmatter-Variante ist übersichtlicher bei vielen Tags:

```yaml
---
tags: [meeting, projektA, wichtig]
---
```

---

## Properties im Context Panel

Das [[Features/Context Panel]] zeigt die Properties der aktuellen Datei in einer Schlüssel-Wert-Tabelle an:

- Öffne das Context Panel (rechte Seitenleiste)
- Wechsle zum Tab "Properties"
- Dort siehst du alle Frontmatter-Felder der aktiven Datei

Dies ist besonders nützlich, um Metadaten im Blick zu behalten, ohne in den Quelltext wechseln zu müssen.

---

## Tags im Context Panel

Der Tags-Tab im Context Panel zeigt alle Tags im Vault:

- Hierarchische Darstellung (verschachtelte Tags als Baumstruktur)
- Klick auf einen Tag zeigt alle Dateien, die ihn verwenden
- Aufklappen von Parent-Tags zeigt Child-Tags

---

## Praktisches Beispiel

Erstelle eine Datei `Meeting 2024-06-20.md`:

```markdown
---
tags: [meeting, projekt/slatebase]
datum: 2024-06-20
teilnehmer: [Anna, Ben, Clara]
status: erledigt
---

# Meeting — Slatebase v2 Planung

#todo Dokumentation aktualisieren
#todo Tests schreiben

## Ergebnisse

Die nächsten Schritte wurden festgelegt:
- Frontend: #priorität/hoch
- Backend: #priorität/mittel
```

Diese Datei nutzt sowohl Frontmatter-Tags als auch Inline-Tags. Beide erscheinen im Context Panel.

---

> [!tip] Tags vs. Ordner
> Tags sind flexibler als Ordner, weil eine Notiz mehrere Tags haben kann (aber nur in einem Ordner liegen). Nutze **Ordner** für die grobe Struktur und **Tags** für Querschnitts-Kategorien.

> [!tip] Konsistente Benennung
> Definiere ein Tag-Schema und halte dich daran. Zum Beispiel:
> - `#typ/...` für Notiz-Typen (meeting, daily, projekt)
> - `#status/...` für Bearbeitungsstatus (offen, erledigt, archiviert)
> - `#priorität/...` für Wichtigkeit

> [!todo] Übung
> 1. Öffne diese Datei im Editor und füge im Frontmatter ein neues Feld hinzu: `gelesen: true`
> 2. Füge einen Inline-Tag `#übung` irgendwo im Text ein
> 3. Öffne das Context Panel und prüfe, ob beides angezeigt wird

---

## Verwandte Features

- [[Features/Context Panel]] — Properties und Tags anzeigen
- [[Features/Suche und Ersetzen]] — Nach Tags suchen
- [[Features/Knowledge Graph]] — Tag-Nodes im Graph
- [[Features/Wikilinks]] — Alternative Verknüpfungsmethode
