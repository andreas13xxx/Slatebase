---
tags: [features, fortgeschritten]
---

# Mermaid — Erweiterte Diagrammtypen

Neben den Kern-Diagrammtypen (Flowchart, Sequenz, Gantt, Pie, Klasse, State, ER, Git, Journey, Mindmap) bietet Mermaid weitere spezialisierte Visualisierungen.

> [!info] Version
> Diese Diagrammtypen sind ab Mermaid 11.x verfügbar. Einige sind experimentell (Beta).

---

## Timeline

Zeitachsen-Diagramme stellen chronologische Ereignisse dar:

```mermaid
timeline
    title Slatebase Release-Historie
    2024-01 : Projekt gestartet
            : Erste Prototypen
    2024-03 : Multi-Vault Support
            : Auth-System
    2024-06 : Plugin-Compat
            : Realtime SSE
    2024-09 : Knowledge Graph
            : Canvas Editor
    2025-01 : Live Preview
            : MCP Server
    2025-06 : Mermaid 11.16
            : Erweiterte Diagramme
```

**Syntax:**
- `title` — Überschrift
- `Datum : Ereignis` — Zeitpunkt mit Beschreibung
- Mehrere Ereignisse pro Zeitpunkt mit weiteren `: Text`-Zeilen

---

## Quadrant Chart

Quadrant-Charts positionieren Elemente in einem 2x2-Raster:

```mermaid
quadrantChart
    title Feature-Priorisierung
    x-axis "Geringer Aufwand" --> "Hoher Aufwand"
    y-axis "Geringer Nutzen" --> "Hoher Nutzen"
    quadrant-1 "Quick Wins"
    quadrant-2 "Strategisch"
    quadrant-3 "Vermeiden"
    quadrant-4 "Hinterfragen"
    "Dark Mode": [0.2, 0.8]
    "Plugin-System": [0.8, 0.9]
    "Mobile App": [0.9, 0.6]
    "Syntax Highlight": [0.3, 0.7]
    "PDF-Export": [0.5, 0.5]
    "Emoji-Picker": [0.2, 0.2]
    "Offline-Sync": [0.7, 0.4]
```

**Syntax:**
- `x-axis` / `y-axis` — Achsenbeschriftung mit Richtung
- `quadrant-1` bis `quadrant-4` — Quadranten-Labels (gegen Uhrzeigersinn ab oben-rechts)
- `"Label": [x, y]` — Element positionieren (Werte 0–1)

---

## XY Chart

XY-Charts für Linien- und Balkendiagramme mit numerischen Achsen:

```mermaid
xychart-beta
    title "Vault-Wachstum (Dateien pro Monat)"
    x-axis ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun"]
    y-axis "Dateien" 0 --> 200
    bar [20, 45, 67, 89, 134, 178]
    line [20, 45, 67, 89, 134, 178]
```

**Syntax:**
- `x-axis [...]` — Kategorien oder Zahlenwerte
- `y-axis "Label" min --> max` — Wertebereich
- `bar [...]` — Balkendaten
- `line [...]` — Liniendaten

---

## Sankey-Diagramm

Sankey-Diagramme zeigen Flüsse und deren Mengen:

```mermaid
sankey-beta

"Eingehende Notizen","Verarbeitet",60
"Eingehende Notizen","Archiviert",25
"Eingehende Notizen","Geloescht",15
"Verarbeitet","Veroeffentlicht",35
"Verarbeitet","In Arbeit",25
"Archiviert","Referenz",20
"Archiviert","Vergessen",5
```

**Syntax:**
- Reines CSV-Format: `"Quelle","Ziel",Menge`
- Jede Zeile definiert einen Fluss
- Leerzeilen zur optischen Trennung erlaubt
- Die Breite der Bänder entspricht der Menge

---

## Architecture Diagram

Architektur-Diagramme für System- und Infrastruktur-Visualisierung:

```mermaid
architecture-beta
    group cloud(cloud)[Cloud]
    group backend(server)[Backend] in cloud
    group frontend(server)[Frontend] in cloud

    service api(server)[API Server] in backend
    service db(database)[Database] in backend
    service web(internet)[Web App] in frontend
    service cdn(internet)[CDN] in frontend

    web:R --> L:api
    api:R --> L:db
    cdn:B --> T:web
```

**Syntax:**
- `group name(icon)[Label]` — Gruppierung
- `service name(icon)[Label] in group` — Dienst in einer Gruppe
- `service:Side --> Side:service` — Verbindungen (L/R/T/B)

---

## Kanban Board

Kanban-Boards für Aufgabenverwaltung:

```mermaid
kanban
    column1["Zu tun"]
        task1["Mermaid-Doku aktualisieren"]
        task2["Tests schreiben"]
        task3["Code Review"]
    column2["In Arbeit"]
        task4["Plugin-System erweitern"]
        task5["Performance optimieren"]
    column3["Fertig"]
        task6["Dark Mode"]
        task7["SSE Events"]
```

**Syntax:**
- `column["Label"]` — Spalte definieren
- Eingerückte `task["Label"]` — Aufgaben in der Spalte

---

## Packet Diagram

Paket-Diagramme für Netzwerk-Protokoll-Strukturen:

```mermaid
packet-beta
    0-15: "Source Port"
    16-31: "Destination Port"
    32-63: "Sequence Number"
    64-95: "Acknowledgment Number"
    96-99: "Data Offset"
    100-105: "Reserved"
    106-111: "Flags"
    112-127: "Window Size"
    128-143: "Checksum"
    144-159: "Urgent Pointer"
```

**Syntax:**
- `Start-Ende: "Label"` — Bit-Bereich mit Beschriftung
- Zeigt die Struktur von Netzwerkpaketen oder Binärformaten

---

## Block Diagram

Block-Diagramme für hierarchische Systemstrukturen:

```mermaid
block-beta
    columns 3
    space:2 Frontend
    Backend["Backend API"]:2 Database[("DB")]
    space:3
    Auth Vault Search
```

**Syntax:**
- `columns N` — Spaltenanzahl festlegen
- `Name["Label"]` — Block mit benutzerdefiniertem Label
- `space` — Leere Zelle
- `:N` — Block über N Spalten

---

## Weitere experimentelle Typen

Folgende Diagrammtypen sind in neueren Mermaid-Versionen verfügbar, aber möglicherweise noch nicht in allen Umgebungen stabil:

- **Radar Chart** (`radar-beta`) — Netzdiagramme für mehrdimensionale Vergleiche
- **Treemap** (`treemap`) — Hierarchische Flächenvisualisierung
- **Venn** (`venn`) — Mengendiagramme
- **Cynefin** (`cynefin-beta`) — Entscheidungs-Framework
- **Wardley Map** (`wardley`) — Strategische Visualisierung

> [!info] Syntax prüfen
> Teste neue Diagrammtypen im [Mermaid Live Editor](https://mermaid.live/) — dort wird immer die aktuellste Mermaid-Version genutzt.

---

## Hinweise zu erweiterten Typen

> [!warning] Beta-Status
> Diagramme mit dem Suffix `-beta` (z.B. `xychart-beta`, `sankey-beta`) sind experimentell und können sich in zukünftigen Versionen ändern.

> [!tip] Kompatibilität
> - Nicht alle erweiterten Typen werden in jeder Mermaid-Umgebung gleich gerendert
> - Teste deine Diagramme im Slatebase Viewer-Modus
> - Bei Problemen: Syntax im [Mermaid Live Editor](https://mermaid.live/) prüfen

---

> [!todo] Übung
> 1. Erstelle ein Timeline-Diagramm deiner Projektmeilensteine
> 2. Baue ein Quadrant-Chart für deine Feature-Priorisierung
> 3. Probiere ein Sankey-Diagramm für deinen Arbeits-Workflow

---

## Verwandte Features

- [[Features/Mermaid Diagramme]] — Kern-Diagrammtypen (Flowchart, Sequenz, Gantt, etc.)
- [[Features/Canvas]] — Freiform-Diagramme mit Drag & Drop
- [[Grundlagen/Markdown Syntax]] — Code-Blöcke allgemein
