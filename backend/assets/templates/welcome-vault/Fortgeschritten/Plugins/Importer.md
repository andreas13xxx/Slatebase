---
tags: [fortgeschritten, plugins]
---

# Importer Plugin

Importer (`obsidian-importer`) ist Obsidians eigenes Migrationswerkzeug — es wandelt Notizen aus anderen Apps und Export-Formaten in Obsidian-typisches Markdown um, inklusive eingebetteter Anhänge und interner Links, statt alles von Hand konvertieren zu müssen.

> [!warning] Node-abhängige Formate eingeschränkt
> Importer referenziert mehrere Node.js-Built-ins ohne Browser-Äquivalent (`child_process`, `crypto`, `fs`, `original-fs`, `os`, `stream`, `zlib`). Slatebases Sandbox stubbt diese sicher — eine Warnung statt eines Absturzes —, sodass das Plugin weiterhin installiert und aktiviert werden kann. Import-Quellen, die für ihre eigentliche Arbeit auf diese Module angewiesen sind (insbesondere **Apple Notes**, das lebenden Zugriff auf die lokale Notes-App-Datenbank unter macOS braucht), funktionieren im Browser jedoch nicht. Formate, die über eine ausgewählte Datei oder einen Ordner laufen, sind davon in der Regel nicht betroffen.

---

## Voraussetzungen

- Feature-Toggle `obsidian-plugin-compat` aktiviert
- Importer-Plugin installiert und aktiviert
- Plugin-ZIP von GitHub: `obsidian-importer`

---

## Installation

1. **Plugin-Verwaltung** → Tab **"Verfügbare Plugins"** öffnen und nach "Importer" suchen
2. **Installieren** klicken, dann den **Aktivierungs-Schalter** einschalten

Nicht gelistet, oder ein bestimmter Fork/eine bestimmte Version nötig? Stattdessen die Plugin-ZIP von GitHub herunterladen und unter **"Installierte Plugins" → Plugin hochladen** verwenden.

---

## Unterstützte Quellen

Ein Import läuft über die Command Palette (`Ctrl+P` → "Importer: Open importer"): Quellformat wählen, dann die Export-Datei oder den Ordner zum Konvertieren auswählen:

| Quelle | Typischer Export | Hinweise |
|--------|-------------------|----------|
| Markdown (andere Dialekte) | Ordner mit `.md`-Dateien | Roam, Notion-Markdown-Export und Ähnliches |
| Notion | Exportiertes ZIP | Seiten werden zu verlinkten Notizen, Datenbanken zu Tabellen |
| Evernote | `.enex`-Datei | Eine Export-Datei pro Notizbuch |
| Google Keep | Google-Takeout-ZIP | Notizen und Labels |
| Bear | `.bear2bk`-Datei | Bears natives Exportformat |
| HTML | Ordner mit `.html`-Dateien | Generische HTML-zu-Markdown-Konvertierung |
| Apple Notes | — | Liest direkt die lokale Notes-App-Datenbank; **nur macOS-Desktop, in Slatebase nicht verfügbar** |

---

## Was ein Import macht

- Wandelt die Formatierung des Quellformats in Markdown um
- Schreibt interne Links zwischen importierten Notizen als Wikilinks um
- Kopiert eingebettete Bilder und Dateien als Anhänge ins Vault
- Legt importierte Notizen in einem vorab gewählten Ordner ab

---

## Einschränkungen in Slatebase

| Feature | Status |
|---------|--------|
| Plugin lädt und aktiviert | Funktioniert |
| Import-Dialog und Quellauswahl | Funktioniert |
| Datei-/ordnerbasierte Quellen (Markdown, Notion, Evernote, Keep, Bear, HTML) | Funktioniert |
| Apple Notes | Nicht unterstützt — braucht eine laufende macOS-Notes-App, nicht nur eine Datei |

---

> [!tip] Einmalwerkzeug
> Anders als bei den meisten anderen Plugin-Guides gibt es hier keine laufende Funktion zum Üben — Importer wird installiert, einmal pro Migration ausgeführt und danach wieder deaktiviert. Installiert lassen, wenn später weitere Notizen migriert werden sollen.

> [!todo] Übung
> 1. Installiere und aktiviere das Importer-Plugin
> 2. Exportiere einen kleinen Satz Notizen aus einer genutzten App (oder verwende eine vorhandene Evernote-`.enex`- bzw. Markdown-Ordner-Quelle)
> 3. Führe "Importer: Open importer" aus und wähle das passende Quellformat
> 4. Wähle einen Zielordner und starte den Import
> 5. Prüfe, ob interne Links und Anhänge korrekt übernommen wurden

---

## Verwandte Features

- [[Features/Vault-Verwaltung]] — Slatebases eingebauter Drag-and-Drop-Dateiimport/-export
- [[Features/Wikilinks]] — Wie importierte interne Links aufgelöst werden
- [[Fortgeschritten/Obsidian Plugins]] — Plugin-Grundlagen
