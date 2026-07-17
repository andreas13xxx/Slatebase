---
tags: [praxis, meeting, projekt]
---

# Sprint-Planning — 2025-01-15

> [!info] Meeting-Daten
> **Datum:** 2025-01-15, 10:00–11:00
> **Ort:** Remote (Video-Call)
> **Moderator:** Anna
> **Protokoll:** Clara

---

## Teilnehmer

| Name | Rolle | Anwesend |
|------|-------|----------|
| Anna | Projektleitung | :white_check_mark: |
| Ben | Content-Migration | :white_check_mark: |
| Clara | Schulung & Doku | :white_check_mark: |
| Daniel | DevOps | :white_check_mark: |
| Eva | Stakeholder | :x: (entschuldigt) |

---

## Agenda

1. Rückblick: Infrastruktur-Setup (Daniel)
2. Status Pilot-Migration (Anna, Ben)
3. Planung: Massen-Migration Vorgehen (Ben)
4. Template-Entwürfe besprechen (Anna)
5. Schulung planen (Clara)
6. Nächste Schritte & Termine

---

## Besprechungspunkte

### 1. Rückblick Infrastruktur

Daniel berichtet:
- Server läuft stabil seit 5 Tagen
- Docker-Deployment mit automatischen Backups (täglich, 4:00 Uhr)
- HTTPS funktioniert, Zertifikat auto-renew via Let's Encrypt
- Performance: Antwortzeiten < 200ms

> [!success] Ergebnis
> Infrastruktur ist produktionsreif. Keine offenen Punkte.

### 2. Status Pilot-Migration

Anna zeigt den Pilot-Vault:
- 10 Seiten erfolgreich migriert
- Ordnerstruktur: `Projekte/`, `Wissen/`, `Prozesse/`
- Feedback von Test-Usern: "Übersichtlicher als Confluence"

Probleme identifiziert:
- Confluence-Tabellen mit Merge-Cells → manueller Fix nötig
- Eingebettete Draw.io-Diagramme → als PNG exportieren

### 3. Massen-Migration Vorgehen

Ben schlägt vor:
1. Confluence Space-Export (HTML)
2. `pandoc` für Basis-Konvertierung HTML → Markdown
3. Custom-Script für Wikilink-Umstellung
4. Bilder per Script in `Assets/`-Ordner verschieben

> [!warning] Diskussion
> Anna merkt an: Nicht alle 500 Seiten sind noch relevant. Vorschlag: Nur Seiten migrieren, die in den letzten 12 Monaten bearbeitet wurden. Ben prüft die Confluence-Analytics.

### 4. Template-Entwürfe

Anna zeigt drei Template-Entwürfe:
- **Daily Note:** Datum, Aufgaben, Notizen
- **Meeting-Protokoll:** (dieses Format hier)
- **Projekt-Übersicht:** Ziele, Status, Meilensteine

> [!tip] Feedback
> Clara schlägt vor, ein **Entscheidungs-Template** hinzuzufügen (Kontext, Optionen, Entscheidung, Begründung). Team stimmt zu.

### 5. Schulung

Clara plant:
- 2-stündiger Workshop in KW 9
- Inhalt: Markdown-Basics, Navigation, Suche, Templates
- Material: Welcome-Vault als Lern-Ressource
- Aufzeichnung für Nachzügler

### 6. Nächste Schritte

Siehe Action Items unten.

---

## Entscheidungen

| # | Entscheidung | Begründung |
|---|-------------|------------|
| E1 | Nur aktive Seiten migrieren (12-Monate-Regel) | Reduziert Aufwand von ~500 auf ~200 Seiten |
| E2 | Draw.io-Diagramme als PNG exportieren | Mermaid für neue Diagramme, alte als Bild |
| E3 | Entscheidungs-Template ergänzen | Oft benötigtes Format im Team |
| E4 | Workshop KW 9 (2h, remote) | Frühester möglicher Termin nach Template-Fertigstellung |

---

## Action Items

- [ ] **Ben:** Confluence-Analytics auswerten → aktive Seiten identifizieren (bis 2025-01-20)
- [ ] **Ben:** pandoc-Konvertierung testen (10 Seiten Stichprobe) (bis 2025-01-22)
- [ ] **Anna:** Entscheidungs-Template erstellen (bis 2025-01-17)
- [ ] **Anna:** Template-Konventionen dokumentieren (bis 2025-01-24)
- [ ] **Clara:** Workshop-Einladung versenden (bis 2025-01-17)
- [ ] **Clara:** Schulungsunterlagen beginnen (bis 2025-02-07)
- [ ] **Daniel:** Monitoring-Dashboard einrichten (bis 2025-01-24)

---

## Nächstes Meeting

**Datum:** 2025-01-22, 10:00
**Fokus:** Fortschritt pandoc-Konvertierung, Template-Review

---

## Verknüpfte Notizen

- [[Beispielprojekt/Projektplan]] — Gesamtübersicht und Meilensteine
- [[Beispielprojekt/Recherche]] — Recherche zu pandoc und Konvertierung
- [[Praxis/Übersicht]] — Zurück zur Übungen-Übersicht
