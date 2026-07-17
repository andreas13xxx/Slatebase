---
tags: [praxis, projekt, planung]
---

# Projektplan: Slatebase-Migration

> [!info] Projektstatus
> **Phase:** Umsetzung
> **Start:** 2025-01-06
> **Deadline:** 2025-03-31
> **Verantwortlich:** Team Dokumentation

---

## Projektziel

Migration der bestehenden Wiki-Inhalte (Confluence) nach Slatebase. Ziel ist ein selbst gehostetes, Markdown-basiertes Wissensmanagementsystem für das gesamte Team.

---

## Meilensteine

| # | Meilenstein | Zieldatum | Status | Verantwortlich |
|---|-------------|-----------|--------|----------------|
| M1 | Infrastruktur bereit | 2025-01-13 | :white_check_mark: Erledigt | Ops-Team |
| M2 | Pilot-Vault angelegt | 2025-01-20 | :white_check_mark: Erledigt | Anna |
| M3 | Erste 50 Seiten migriert | 2025-02-07 | :hourglass_flowing_sand: In Arbeit | Ben, Clara |
| M4 | Templates definiert | 2025-02-14 | :x: Offen | Anna |
| M5 | Team-Schulung | 2025-02-28 | :x: Offen | Clara |
| M6 | Vollständige Migration | 2025-03-21 | :x: Offen | Alle |
| M7 | Confluence abschalten | 2025-03-31 | :x: Offen | Ops-Team |

---

## Risiken

> [!warning] Risiko: Inhalte mit komplexem Formatting
> Einige Confluence-Seiten nutzen Makros und Layouts, die in Markdown nicht 1:1 abbildbar sind.
> **Mitigation:** Solche Seiten identifizieren und manuell umbauen. Liste führen.

> [!warning] Risiko: Akzeptanz im Team
> Manche Teammitglieder kennen Markdown nicht und bevorzugen WYSIWYG.
> **Mitigation:** Schulung anbieten (M5), Vorlagen bereitstellen, View-Modus hervorheben.

> [!danger] Risiko: Datenverlust
> Falls Confluence vor Abschluss der Migration abgeschaltet wird.
> **Mitigation:** Export als HTML-Backup erstellen, bevor Confluence deaktiviert wird.

---

## Aufgabenpakete

### AP 1: Infrastruktur (abgeschlossen)

- [x] Server provisionieren (Docker)
- [x] HTTPS-Zertifikat einrichten
- [x] Backup-Cron einrichten
- [x] Admin-Account anlegen

### AP 2: Pilot-Migration (abgeschlossen)

- [x] Vault-Struktur definieren (Ordner-Hierarchie)
- [x] 10 repräsentative Seiten migrieren
- [x] Team-Feedback einholen
- [x] Anpassungen an Struktur vornehmen

### AP 3: Massen-Migration (laufend)

- [x] Confluence-Export als HTML herunterladen
- [ ] HTML → Markdown konvertieren (pandoc)
- [ ] Bilder extrahieren und zuordnen
- [ ] Interne Links auf Wikilinks umstellen
- [ ] Qualitätskontrolle (Stichproben)

### AP 4: Templates & Conventions

- [ ] Daily-Note-Template erstellen
- [ ] Meeting-Protokoll-Template erstellen
- [ ] Projekt-Template erstellen
- [ ] Tagging-Konventionen dokumentieren
- [ ] Ordnerstruktur-Guide schreiben

### AP 5: Schulung & Rollout

- [ ] Schulungsunterlagen erstellen
- [ ] Workshop-Termin (2h) planen
- [ ] FAQ-Dokument anlegen
- [ ] Feedback-Kanal einrichten

---

## Teamzuordnung

| Person | Rolle | Schwerpunkt |
|--------|-------|-------------|
| Anna | Projektleitung | Koordination, Templates |
| Ben | Content-Migration | Konvertierung, QA |
| Clara | Schulung | Dokumentation, Support |
| DevOps | Infrastruktur | Server, Backups |

---

## Verknüpfte Notizen

- [[Beispielprojekt/Meeting-Notizen]] — Sprint-Planning vom 2025-01-15
- [[Beispielprojekt/Recherche]] — Recherche zu Migrations-Tools
- [[Praxis/Übersicht]] — Zurück zur Übungen-Übersicht

---

## Nächste Schritte

1. AP 3 abschließen (Massen-Konvertierung)
2. Template-Entwürfe mit Team reviewen
3. Workshop-Termin in KW 9 fixieren
