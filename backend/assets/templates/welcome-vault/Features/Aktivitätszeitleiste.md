---
tags: [features]
---

# Aktivitätszeitleiste

Die Aktivitätszeitleiste zeigt dir chronologisch, was in deinem Vault passiert ist: welche Notizen angelegt, bearbeitet, gelöscht, verschoben oder aus dem Papierkorb wiederhergestellt wurden — gruppiert nach Zeit (Heute, Gestern, Diese Woche, Älter) und filterbar nach Ereignistyp. Du öffnest sie als vollwertigen Tab oder kompakt in einer der Seitenleisten.

Stell es dir als Journal deines Vaults vor: nicht der Inhalt der Notizen, sondern die Chronik dessen, was mit ihnen geschah.

> [!warning] Experimentell
> Die Aktivitätszeitleiste steht hinter dem Feature-Toggle `activity-timeline` (standardmäßig aus). Siehst du sie nicht, ist das Toggle serverseitig aus — frag eine:n Administrator:in (siehe [[Admin/Feature Toggles]]). Solange das Toggle aus ist, wird auch keine Aktivität aufgezeichnet.

---

## Was aufgezeichnet wird

| Ereignis | Wann |
|----------|------|
| **Notiz angelegt** | Eine neue Datei wird gespeichert |
| **Notiz bearbeitet** | Eine bestehende Datei wird gespeichert (schnelle Auto-Saves werden zu einem Eintrag zusammengefasst) |
| **Notiz gelöscht** | Eine Datei wird gelöscht |
| **Notiz verschoben** | Eine Datei wird verschoben oder umbenannt — als **ein** Eintrag mit altem und neuem Pfad |
| **Notiz wiederhergestellt** | Eine Datei wird aus dem [[Features/Papierkorb und Versionen|Papierkorb]] zurückgeholt |

Auch Änderungen über die MCP-Schnittstelle (durch einen KI-Assistenten) erscheinen in der Zeitleiste — egal, ob eine Änderung aus dem Browser oder von einem MCP-Client kam.

Interne Slatebase-Dateien (`.slatebase/`) tauchen nie auf.

---

## Öffnen

- **Als Tab:** Führe **„Aktivitätszeitleiste öffnen"** über die [[Features/Command Palette|Command Palette]] (`Ctrl+P`) aus. Die Vollansicht öffnet sich mit einer vertikalen Zeitachse.
- **In der Seitenleiste:** Füge die Ansicht **Aktivität** zu einer der beiden Seitenleisten hinzu — kompakt und einspaltig, ideal zum Mitlaufen neben dem Editor.

Beide zeigen dieselben Ereignisse; die Seitenleiste ist nur die platzsparende Variante.

---

## Filtern und navigieren

- **Filter-Chips** oben blenden Ereignistypen ein oder aus (Notizen, Canvas, Bases, Snippets). Es erscheinen nur Chips für Typen, die tatsächlich vorkommen — keine leeren Spuren.
- **Klick auf einen Eintrag** öffnet die zugehörige Datei im Tab. Ein gelöschter Eintrag ist nicht anklickbar (es gibt nichts zu öffnen).
- **Mehr laden** holt ältere Ereignisse seitenweise nach.
- Die Liste **aktualisiert sich live**: Speicherst du gerade eine Notiz, erscheint der Eintrag ohne Neuladen.

---

## Aufbewahrung

Die Zeitleiste wächst nicht unbegrenzt. Pro Vault gilt eine Aufbewahrungsdauer (standardmäßig **90 Tage**); ältere Einträge werden vom periodischen Aufräum-Job entfernt — derselbe, der auch den Papierkorb leert und alte Versionen beschneidet.

---

## Tipp

> [!tip] Zeitleiste pro Vault
> Die Aktivität gehört zum Vault, nicht zu dir allein: Jede:r mit Lesezugriff auf den Vault sieht dieselbe Chronik, inklusive, wer die Änderung ausgelöst hat. In einem geteilten Vault ist die Zeitleiste damit auch ein kleines Team-Protokoll.

---

## Übung

1. Lege eine neue Notiz an, bearbeite sie zweimal kurz hintereinander und verschiebe sie dann in einen anderen Ordner.
2. Öffne die Aktivitätszeitleiste.
3. Du solltest sehen: **ein** „angelegt", **ein** „bearbeitet" (die zwei schnellen Edits sind zusammengefasst) und **ein** „verschoben" mit dem alten und neuen Pfad.

---

## Verwandte Features

- [[Features/Papierkorb und Versionen|Papierkorb und Versionen]] — die Historie *innerhalb* einer einzelnen Datei
- [[Features/Knowledge Graph|Knowledge Graph]] — die Struktur deines Vaults, statt seiner Chronik
- [[Features/Context Panel|Context Panel]] — Outline, Links, Tags und Properties der aktiven Notiz
