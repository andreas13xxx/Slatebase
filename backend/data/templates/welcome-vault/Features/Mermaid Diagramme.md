---
tags: [features]
---

# Mermaid Diagramme

Mit Mermaid erstellst du Diagramme direkt im Markdown — ohne externe Tools oder Bild-Dateien. Slatebase rendert Mermaid-Code automatisch als interaktive SVG-Grafiken.

![[Screenshots/mermaid-diagramm.png]]

*Ein gerendertes Mermaid-Flowchart*

---

## Grundsyntax

Mermaid-Code wird in einem Fenced-Code-Block mit dem Sprach-Marker `mermaid` geschrieben:

````markdown
```mermaid
graph TD
    A[Start] --> B[Ende]
```
````

Im Viewer-Modus wird der Code als Diagramm gerendert.

---

## Flowchart (Flussdiagramm)

Flowcharts zeigen Abläufe und Entscheidungen:

```mermaid
graph TD
    A[Datei öffnen] --> B{Existiert?}
    B -->|Ja| C[Inhalt laden]
    B -->|Nein| D[Neue Datei erstellen]
    C --> E[Im Editor anzeigen]
    D --> E
    E --> F[Bearbeiten]
    F --> G[Speichern]
```

**Syntax-Elemente:**
- `graph TD` — Top-Down Richtung (auch: `LR` für links-nach-rechts)
- `[Text]` — Rechteck-Knoten
- `{Text}` — Rauten-Knoten (Entscheidung)
- `-->` — Pfeil
- `-->|Label|` — Pfeil mit Beschriftung

---

## Sequenzdiagramm

Sequenzdiagramme zeigen die Kommunikation zwischen Komponenten:

```mermaid
sequenceDiagram
    participant Browser
    participant API
    participant Dateisystem

    Browser->>API: GET /api/v1/vaults/123/files
    API->>Dateisystem: readDirectory()
    Dateisystem-->>API: Dateiliste
    API-->>Browser: JSON Response
    Browser->>Browser: Tree rendern
```

**Syntax-Elemente:**
- `participant` — Beteiligte definieren
- `->>` — Nachricht (durchgezogene Linie)
- `-->>` — Antwort (gestrichelte Linie)
- `Note over A,B: Text` — Notiz über Beteiligten

---

## Gantt-Diagramm

Gantt-Charts visualisieren Zeitpläne und Projektphasen:

```mermaid
gantt
    title Projekt-Zeitplan
    dateFormat  YYYY-MM-DD
    section Design
        Anforderungen     :done, des1, 2024-01-01, 2024-01-15
        Prototyp          :active, des2, 2024-01-10, 2024-02-01
    section Entwicklung
        Backend           :dev1, after des2, 30d
        Frontend          :dev2, after des2, 45d
    section Test
        Integration       :test1, after dev1, 14d
        Release           :milestone, after test1, 0d
```

**Syntax-Elemente:**
- `dateFormat` — Datumsformat festlegen
- `section` — Phasen gruppieren
- `:done` / `:active` — Status-Markierung
- `after` — Abhängigkeit definieren

---

## Pie-Chart (Kreisdiagramm)

Kreisdiagramme für Anteile und Verteilungen:

```mermaid
pie title Vault-Inhalte nach Typ
    "Grundlagen" : 5
    "Features" : 17
    "Fortgeschritten" : 7
    "Praxis" : 9
    "Vorlagen" : 4
```

**Syntax-Elemente:**
- `pie title Titel` — Überschrift
- `"Label" : Wert` — Segment mit Anteil

---

## Klassendiagramm

Klassendiagramme für Datenmodelle und Beziehungen:

```mermaid
classDiagram
    class Vault {
        +String id
        +String name
        +String ownerId
        +listFiles() FileList
        +createFile(path) File
    }
    class File {
        +String path
        +String content
        +Date modified
        +save() void
    }
    class User {
        +String id
        +String username
        +String role
    }
    User "1" --> "*" Vault : besitzt
    Vault "1" --> "*" File : enthält
```

**Syntax-Elemente:**
- `class Name { }` — Klasse mit Attributen
- `+` / `-` / `#` — public/private/protected
- `-->` — Beziehung mit Kardinalität

---

## State-Diagramm (Zustandsautomat)

Zustandsdiagramme für Lebenszyklen und Status-Übergänge:

```mermaid
stateDiagram-v2
    [*] --> Entwurf
    Entwurf --> InReview : Einreichen
    InReview --> Entwurf : Zurückweisen
    InReview --> Genehmigt : Genehmigen
    Genehmigt --> Veröffentlicht : Publizieren
    Veröffentlicht --> Archiviert : Archivieren
    Archiviert --> [*]
```

**Syntax-Elemente:**
- `[*]` — Start-/Endpunkt
- `-->` — Übergang
- `: Label` — Auslöser des Übergangs

---

## Rendering-Hinweise

- **Theme:** Mermaid passt sich automatisch an Dark/Light Mode an
- **Timeout:** Komplexe Diagramme haben ein 5-Sekunden-Timeout
- **Fehler:** Bei Syntaxfehlern wird eine Fehlermeldung statt des Diagramms angezeigt
- **Lazy Loading:** Mermaid wird erst geladen, wenn ein Diagramm im Viewport sichtbar ist

> [!warning] Komplexität
> Sehr große Diagramme (50+ Knoten) können langsam rendern. Teile sie in mehrere kleinere Diagramme auf.

---

## Praktisches Beispiel

Erstelle eine Datei `Mein Workflow.md` mit einem Flowchart deines täglichen Arbeitsablaufs:

````markdown
# Mein täglicher Workflow

```mermaid
graph LR
    A[Morgens: Inbox prüfen] --> B[Daily Note erstellen]
    B --> C[Aufgaben priorisieren]
    C --> D{Dringend?}
    D -->|Ja| E[Sofort bearbeiten]
    D -->|Nein| F[In Backlog]
    E --> G[Notizen aktualisieren]
    F --> G
    G --> H[Abends: Review]
```
````

Wechsle in den Viewer-Modus — das Diagramm wird als SVG gerendert.

---

> [!tip] Mermaid Live Editor
> Für komplexe Diagramme lohnt sich der [Mermaid Live Editor](https://mermaid.live/) zum Entwickeln. Den fertigen Code kopierst du dann in deine Notiz.

> [!todo] Übung
> 1. Erstelle eine neue Datei und füge einen Mermaid-Flowchart ein
> 2. Wechsle in den Viewer-Modus — wird das Diagramm gerendert?
> 3. Probiere einen anderen Diagramm-Typ (Sequenz oder Pie)
> 4. Erzeuge absichtlich einen Syntaxfehler und beobachte die Fehlermeldung

---

## Verwandte Features

- [[Features/Callouts]] — Weitere visuelle Markdown-Elemente
- [[Features/Embeds]] — Bilder und Dateien einbetten
- [[Grundlagen/Markdown Syntax]] — Fenced Code Blocks allgemein
- [[Features/Canvas]] — Freiform-Diagramme mit Nodes und Edges
