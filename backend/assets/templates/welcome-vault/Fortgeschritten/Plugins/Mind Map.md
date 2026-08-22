---
tags: [fortgeschritten, plugins]
---

# Mind Map Plugin

Das Mind-Map-Plugin verwandelt die Überschriften- und Listen-Struktur einer Notiz in eine interaktive, zoombare Mindmap — ohne dass du die Notiz selbst umschreiben musst. Jede Überschriftenebene und jede Einrückungsstufe wird automatisch zu einem Knoten.

> [!warning] Plugin vermutlich kaputt
> Das Mind-Map-Plugin (`lynchjames/obsidian-mind-map`) wird seit 2024-02-25 nicht mehr aktualisiert und gilt als bestätigt kaputt — betroffene Nutzer berichten auf GitHub, dass es in aktuellen Obsidian-Versionen nicht mehr funktioniert (Issue #117 „Doesn't work in latest version", 04/2025; Issue #119 „Obsidian update", 09/2025). Das ist ein Problem des Plugins selbst, unabhängig von Slatebases Kompatibilitätsschicht. Installiere es nur zum Ausprobieren und erwarte, dass die Mindmap-Ansicht nicht (mehr) öffnet.

---

## Voraussetzungen

- Feature-Toggle `obsidian-plugin-compat` aktiviert
- Mind-Map-Plugin installiert und aktiviert
- Plugin-ZIP von GitHub: `obsidian-mind-map`

---

## Installation

1. **Plugin-Verwaltung** → Tab **"Verfügbare Plugins"** öffnen und nach "Mind Map" suchen
2. **Installieren** klicken, dann den **Aktivierungs-Schalter** einschalten

Nicht gelistet, oder ein bestimmter Fork/eine bestimmte Version nötig? Stattdessen die Plugin-ZIP von GitHub herunterladen und unter **"Installierte Plugins" → Plugin hochladen** verwenden.

---

## Mindmap öffnen

### Über die Command Palette

1. Öffne die Notiz, die als Mindmap dargestellt werden soll
2. `Ctrl+P` → "Mind Map: Open as Mind Map"
3. Die Mindmap öffnet sich in einem neuen Tab

### Über das Ribbon-Icon

Nach Aktivierung erscheint ein Mindmap-Icon in der Werkzeugleiste — Klick öffnet die Mindmap der aktiven Notiz.

---

## Wie die Struktur übersetzt wird

Das Plugin liest die Notiz als Gliederung: Überschriften (`#`, `##`, `###`, …) und eingerückte Listenpunkte werden zu Eltern-Kind-Beziehungen im Baum.

```markdown
# Projekt Redesign

## Frontend
- Neue Komponenten-Bibliothek
- Dark Mode
	- Farbpalette definieren
	- Kontrast-Tests

## Backend
- API-Versionierung
- Migrations-Skript

## Rollout
- Staging-Test
- Go-Live-Termin
```

Ergibt eine Mindmap mit "Projekt Redesign" als Wurzelknoten, "Frontend"/"Backend"/"Rollout" als Hauptästen und den Listenpunkten (inkl. verschachtelter Unterpunkte wie "Dark Mode") als weiteren Ebenen.

---

## Bedienung der Mindmap-Ansicht

| Aktion | Ergebnis |
|--------|----------|
| Scrollen / Pinch | Zoomen |
| Ziehen | Ansicht verschieben (Pan) |
| Klick auf Knoten | Ein-/Ausklappen von Unterknoten |
| Klick auf Knotentext | Springt zur entsprechenden Zeile in der Quellnotiz |

Die Mindmap aktualisiert sich, wenn du die Quellnotiz bearbeitest und die Ansicht neu lädst bzw. die Notiz erneut öffnest.

---

## Beispiel: Brainstorming-Struktur

```markdown
# Content-Strategie Q3

## Blog
- SEO-Optimierung bestehender Artikel
- Neue Serie: "Deep Dives"

## Video
- Tutorial-Reihe
	- Folge 1: Einstieg
	- Folge 2: Fortgeschritten
- Kurzformate für Social Media

## Newsletter
- Frequenz erhöhen auf wöchentlich
- Segmentierung nach Interesse
```

Diese Struktur eignet sich besonders gut für Mindmaps, weil sie klar hierarchisch ist — im Gegensatz zu Fließtext, der keine sinnvollen Knoten ergibt.

---

## Einschränkungen in Slatebase

> [!warning] Plugin bestätigt kaputt — nichts davon öffnet sich tatsächlich
> Slatebases Kompatibilitätsschicht emuliert jeden API-Zugriff dieses Plugins (statische Analyse zeigt volle Abdeckung) — daran liegt es also nicht. Aber das Plugin selbst gilt gegenüber aktuellen Obsidian-Versionen als bestätigt kaputt und zeigt in der Praxis gar keine Mindmap an — die Tabelle unten beschreibt, was funktionieren *würde*, wenn der plugin-eigene Bug behoben wäre, nicht worauf du dich heute verlassen kannst.

| Feature | Status |
|---------|--------|
| Plugin lädt / Mindmap-Ansicht öffnet sich | ⚠️ Bestätigt kaputt (Upstream) |
| Überschriften/Listen als Mindmap-Knoten | Nicht nutzbar — Ansicht öffnet sich nicht |
| Zoom, Pan, Ein-/Ausklappen | Nicht nutzbar — Ansicht öffnet sich nicht |
| Klick auf Knoten springt zur Quellzeile | Nicht nutzbar — Ansicht öffnet sich nicht |
| Export als PNG/SVG | Nicht nutzbar — Ansicht öffnet sich nicht |
| Farbthemen aus den Plugin-Einstellungen | Nicht nutzbar — Ansicht öffnet sich nicht |

---

> [!tip] Struktur zuerst, Mindmap danach
> Das Plugin visualisiert nur, was bereits als Gliederung vorhanden ist. Notizen mit klaren Überschriftenebenen und kurzen Stichpunkten ergeben deutlich brauchbarere Mindmaps als lange Fließtext-Absätze.

> [!todo] Übung
> 1. Installiere und aktiviere das Mind-Map-Plugin
> 2. Öffne [[Fortgeschritten/Plugins/Beispiel-Mindmap]]
> 3. Öffne sie über die Command Palette als Mindmap
> 4. Klappe einen Ast ein und wieder aus
> 5. Klicke auf einen Knoten und prüfe den Sprung zur Quellzeile
> 6. Füge der Quellnotiz eine weitere Überschrift mit zwei Listenpunkten hinzu und öffne die Mindmap erneut

---

## Live-Beispiel

Die folgende Notiz ist bereits als Gliederung aufgebaut und lässt sich direkt als Mindmap öffnen, sobald das Plugin aktiviert ist:

→ [[Fortgeschritten/Plugins/Beispiel-Mindmap]]

---

## Verwandte Features

- [[Features/Knowledge Graph]] — Verlinkungen zwischen Notizen visualisieren (andere Perspektive als die Gliederung einer einzelnen Notiz)
- [[Features/Canvas]] — Freie, nicht hierarchische Visualisierung
- [[Fortgeschritten/Obsidian Plugins]] — Plugin-Grundlagen
