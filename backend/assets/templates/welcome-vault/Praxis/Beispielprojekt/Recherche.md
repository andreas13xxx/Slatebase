---
tags: [praxis, recherche, migration]
---

# Recherche: Confluence → Markdown Migration

> [!abstract] Zusammenfassung
> Diese Notiz sammelt Tools, Methoden und Erkenntnisse für die Migration von Confluence-Inhalten nach Slatebase (Markdown). Fokus auf automatisierte Konvertierung und Qualitätssicherung.

---

## Ausgangslage

- **Quelle:** Confluence Cloud, ~500 Seiten, 3 Spaces
- **Ziel:** Slatebase-Vault mit Markdown-Dateien
- **Anforderungen:**
  - Interne Links → Wikilinks (`[[...]]`)
  - Bilder beibehalten (als Dateien im Vault)
  - Tabellen in Markdown konvertieren
  - Formatierung so gut wie möglich erhalten

---

## Recherchierte Tools

### pandoc

> [!quote] Quelle
> [pandoc.org](https://pandoc.org) — Universal document converter

- **Konvertierung:** HTML → Markdown (GFM-Variante)
- **Stärken:** Tabellen, Listen, Code-Blöcke werden gut konvertiert
- **Schwächen:** Confluence-spezifische Makros werden ignoriert oder als Raw HTML belassen
- **Kommando:**
  ```bash
  pandoc input.html -f html -t gfm -o output.md
  ```

### confluence-to-markdown (npm)

> [!quote] Quelle
> [GitHub: lostintangent/confluence-to-markdown](https://github.com/lostintangent/confluence-to-markdown)

- **Ansatz:** Nutzt Confluence REST-API direkt
- **Stärken:** Konvertiert Seitenbaum mit Hierarchie, behält Metadaten
- **Schwächen:** Letzte Aktualisierung > 2 Jahre, keine GFM-Tabellen
- **Bewertung:** Nicht empfohlen (veraltet, eingeschränkte Confluence Cloud Unterstützung)

### Eigenentwicklung: Post-Processing Script

Für Slatebase-spezifische Anforderungen ein eigenes Script:

```markdown
## Konvertierungsschritte (Custom Script)

1. Confluence-Export (HTML) herunterladen
2. pandoc: HTML → GFM-Markdown
3. Custom Script:
   - Interne Links identifizieren → `[[Dateiname]]` Wikilinks
   - Bilder in `Assets/`-Ordner kopieren → Pfade anpassen
   - Confluence-Makros ersetzen:
     - `{info}` → `> [!info]`
     - `{warning}` → `> [!warning]`
     - `{code}` → Fenced Code Blocks
   - Frontmatter ergänzen (tags aus Labels)
4. Qualitätskontrolle: Stichprobe 10%
```

---

## Erfahrungsberichte

### Team Alpha (interner Bericht)

- Migration von 200 Seiten in 3 Tagen
- Haupt-Aufwand: Manuelle Nacharbeit bei Tabellen mit Merge-Cells
- Empfehlung: Lieber weniger migrieren, dafür höhere Qualität

### Blog-Beitrag "From Confluence to Obsidian"

> [!quote] Kernaussage
> "The 80/20 rule applies: 80% of content converts automatically, 20% needs manual attention. Focus your effort on high-traffic pages."

Anwendbar auf unser Projekt: Nur die ~200 aktiv genutzten Seiten migrieren (siehe [[Beispielprojekt/Meeting-Notizen|Meeting-Entscheidung E1]]).

---

## Vergleich: Optionen

| Kriterium | pandoc + Script | confluence-to-markdown | Manuell |
|-----------|----------------|----------------------|---------|
| Aufwand initial | Mittel (Script schreiben) | Gering (npm install) | — |
| Aufwand pro Seite | Gering (automatisch) | Gering | Hoch (5–10 Min) |
| Qualität | Gut (80% automatisch) | Mäßig (veraltet) | Sehr gut |
| Wikilinks | Ja (Custom Script) | Nein | Ja |
| Bilder | Ja (Script) | Teilweise | Ja |
| Empfehlung | :white_check_mark: **Gewählt** | :x: | Nur für Spezialfälle |

---

## Offene Fragen

- [ ] Wie mit Confluence-Kommentaren umgehen? (Ignorieren oder als Callout?)
- [ ] Draw.io-Diagramme: PNG-Export oder Mermaid-Neuzeichnung?
- [ ] Berechtigungen: Welche Seiten waren restricted? (→ separate Vault-Zuordnung?)

---

## Nächste Schritte

1. pandoc-Test mit 10 Seiten Stichprobe (→ Ben, KW 4)
2. Custom Script Prototyp für Link-Konvertierung (→ Ben, KW 4–5)
3. Qualitäts-Review der konvertierten Stichprobe (→ Anna, KW 5)

---

## Quellen

- [pandoc.org — User Guide](https://pandoc.org/MANUAL.html)
- [Confluence REST API Documentation](https://developer.atlassian.com/cloud/confluence/rest/v1/)
- [Markdown Guide — Extended Syntax](https://www.markdownguide.org/extended-syntax/)
- Interner Bericht Team Alpha (Confluence → Obsidian, Q3 2024)

---

## Verknüpfte Notizen

- [[Beispielprojekt/Projektplan]] — Gesamtplan mit Meilensteinen
- [[Beispielprojekt/Meeting-Notizen]] — Entscheidungen aus Sprint-Planning
- [[Features/Wikilinks]] — Wikilink-Syntax in Slatebase
- [[Features/Callouts]] — Callout-Typen (für Makro-Konvertierung)
- [[Praxis/Übersicht]] — Zurück zur Übungen-Übersicht
