---
tags: [features]
---

# Knowledge Graph

Der Knowledge Graph visualisiert dein Wissensnetz als interaktives Netzwerk-Diagramm. Jede Datei ist ein Knoten, jeder Wikilink eine Verbindung — so erkennst du Zusammenhänge und Cluster auf einen Blick.

![[Screenshots/knowledge-graph.png]]

*Der Knowledge Graph visualisiert Verbindungen zwischen Notizen*

---

## Was der Graph zeigt

### Knoten (Nodes)

| Knoten-Typ | Darstellung | Bedeutung |
|------------|-------------|-----------|
| **Datei** | Kreis (Standard) | Eine Markdown-Datei im Vault |
| **Tag** | Raute/Diamond | Ein Tag, der in mindestens einer Datei vorkommt |
| **Property** | Quadrat | Ein Frontmatter-Property-Wert |

Die Größe eines Knotens hängt von der Anzahl seiner Verbindungen ab — stark verknüpfte Dateien sind größer.

### Verbindungen (Edges)

Eine Linie zwischen zwei Knoten bedeutet:
- **Datei → Datei:** Ein Wikilink verbindet die beiden Dateien
- **Datei → Tag:** Die Datei enthält diesen Tag
- **Datei → Property:** Die Datei hat diesen Property-Wert

---

## Graph öffnen

- **Tastenkürzel:** über Command Palette (`Ctrl+P` → "Knowledge Graph")
- **Tab-Leiste:** Der Graph öffnet sich als eigener Tab

---

## Navigation

### Zoom & Pan

| Aktion | Eingabe |
|--------|---------|
| Zoomen | Mausrad scrollen |
| Verschieben | Klicken + Ziehen auf leere Fläche |
| Knoten verschieben | Klicken + Ziehen auf einen Knoten |
| Datei öffnen | Doppelklick auf einen Datei-Knoten |

### Suche im Graph

Über das Suchfeld im Graph kannst du nach Dateinamen suchen. Der Graph zentriert sich auf den gefundenen Knoten und hebt ihn hervor.

### Hover-Informationen

Fahre mit der Maus über einen Knoten, um dessen Namen und die Anzahl der Verbindungen zu sehen.

---

## Konfiguration

Über das Zahnrad-Symbol (oben rechts im Graph) öffnest du die Graph-Einstellungen:

### Farben

- **Datei-Knoten:** Standardfarbe wählbar (Farbpicker)
- **Tag-Knoten:** Eigene Farbe für Tag-Nodes
- **Property-Knoten:** Eigene Farbe für Property-Nodes
- **Verbindungen:** Linienfarbe anpassbar

### Layout

| Einstellung | Wirkung |
|-------------|---------|
| Abstoßungskraft | Wie stark sich Knoten voneinander entfernen |
| Link-Distanz | Gewünschter Abstand zwischen verbundenen Knoten |
| Zentrierungskraft | Wie stark Knoten zur Mitte gezogen werden |

### Knoten-Typen ein-/ausblenden

Du kannst festlegen, welche Knoten-Typen angezeigt werden:
- [x] Dateien
- [x] Tags
- [ ] Properties (optional zuschaltbar)

---

## Interaktion mit dem Graph

### Physik-Simulation

Der Graph verwendet eine Kraft-basierte Simulation (d3-force). Knoten bewegen sich, bis sie ein Gleichgewicht finden:
- Verbundene Knoten ziehen sich an
- Alle Knoten stoßen sich ab (keine Überlappung)
- Die Zentrierungskraft hält alles zusammen

Du kannst Knoten manuell an eine andere Position ziehen — sie bleiben dort fixiert, bis du sie loslässt.

### Cluster erkennen

Eng verknüpfte Dateien bilden natürliche Cluster. Das zeigt dir:
- Themengebiete (z.B. "alle Grundlagen-Dateien" bilden einen Cluster)
- Brücken-Notizen (Dateien, die verschiedene Cluster verbinden)
- Isolierte Notizen (keine oder wenige Verbindungen)

---

## Praktisches Beispiel

Öffne den Knowledge Graph in diesem Welcome-Vault:

1. `Ctrl+P` → "Knowledge Graph" → Enter
2. Du siehst alle Dateien des Vaults als Netzwerk
3. Beobachte: Die `Features/Übersicht.md` hat viele Verbindungen (Hub-Node)
4. Zoome herein auf einen Cluster (z.B. die Grundlagen-Dateien)
5. Doppelklicke auf einen Knoten, um die Datei zu öffnen
6. Öffne die Einstellungen und aktiviere "Tag-Nodes"

---

> [!tip] Graph effektiv nutzen
> Der Graph ist besonders nützlich, um:
> - **Verwaiste Notizen** zu finden (einzelne Knoten ohne Verbindungen)
> - **Zentrale Notizen** zu identifizieren (große Knoten mit vielen Links)
> - **Themen-Cluster** zu erkennen und die Vault-Struktur zu reflektieren
> - **Fehlende Verbindungen** zu entdecken (Notizen, die zusammengehören, aber nicht verlinkt sind)

> [!todo] Übung
> 1. Öffne den Knowledge Graph
> 2. Finde die Datei mit den meisten Verbindungen (größter Knoten)
> 3. Aktiviere Tag-Nodes in den Einstellungen — wie verändert sich das Bild?
> 4. Suche nach "Start hier" über die Graph-Suche

---

## Verwandte Features

- [[Features/Wikilinks]] — Links erstellen, die im Graph sichtbar werden
- [[Features/Tags und Properties]] — Tags und Properties als Graph-Nodes
- [[Features/Context Panel]] — Backlinks und Forward-Links als Liste
- [[Fortgeschritten/Übersicht]] — Graph-Workflows für Fortgeschrittene
