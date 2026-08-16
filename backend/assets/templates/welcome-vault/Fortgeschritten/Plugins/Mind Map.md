---
tags: [fortgeschritten, plugins]
---

# Mind Map Plugin

Das Mind-Map-Plugin verwandelt die Überschriften- und Listen-Struktur einer Notiz in eine interaktive, zoombare Mindmap — ohne dass du die Notiz selbst umschreiben musst. Jede Überschriftenebene und jede Einrückungsstufe wird automatisch zu einem Knoten.

---

## Voraussetzungen

- Feature-Toggle `obsidian-plugin-compat` aktiviert
- Mind-Map-Plugin installiert und aktiviert
- Plugin-ZIP von GitHub: `obsidian-mind-map`

---

## Installation

1. Plugin-ZIP von GitHub herunterladen
2. Einstellungen → Vault → Plugins → "Plugin installieren"
3. ZIP hochladen → Aktivieren

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

| Feature | Status |
|---------|--------|
| Überschriften/Listen als Mindmap-Knoten | Funktioniert |
| Zoom, Pan, Ein-/Ausklappen | Funktioniert |
| Klick auf Knoten springt zur Quellzeile | Funktioniert |
| Export als PNG/SVG | Eingeschränkt |
| Farbthemen aus den Plugin-Einstellungen | Funktioniert |

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
