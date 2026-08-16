---
tags: [fortgeschritten, plugins, beispiel]
---

# Beispiel-Tabelle

Diese Tabelle ist absichtlich unordentlich getippt. Klicke mit dem Cursor hinein und verlasse sie wieder (z.B. mit einem Klick daneben) — mit aktiviertem Advanced-Tables-Plugin richtet sich die Tabelle automatisch aus.

| Aufgabe | Verantwortlich | Status | Deadline |
|---|---|---|---|
| API-Design | Max | In Arbeit | 2026-08-20 |
| Frontend-Integration | Lisa | Offen | 2026-08-25 |
| Tests schreiben | Max | Offen | 2026-08-27 |
| Deployment | Team | Blockiert | 2026-08-30 |

## Zum Ausprobieren

1. Setze den Cursor in die letzte Zelle der letzten Zeile und drücke `Tab` — es entsteht eine neue Zeile
2. Fülle die neue Zeile aus, z.B. `Review | Lisa | Offen | 2026-09-01`
3. Sortiere die Tabelle über die Command Palette (`Ctrl+P` → "Advanced Tables: Sort rows ascending") nach der Spalte "Status"
4. Verschiebe die Spalte "Deadline" mit "Move column left" an den Anfang

## Budget-Tabelle mit Formel

| Kategorie | Geplant | Ausgegeben |
| --------- | ------- | ---------- |
| Hosting   | 50      | 47         |
| Domains   | 20      | 18         |
| Tools     | 30      | 35         |
| **Summe** |         |            |

<!-- TBLFM: @4$2=sum(@2..@3);@4$3=sum(@2..@3) -->

Führe "Advanced Tables: Evaluate formulas" aus, um die Summen-Zeile zu berechnen.
