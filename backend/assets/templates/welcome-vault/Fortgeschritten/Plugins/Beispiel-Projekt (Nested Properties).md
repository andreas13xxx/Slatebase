---
tags: [fortgeschritten, plugins, beispiel]
titel: Vault-Rollout
projekt:
  status: aktiv
  team:
    lead: Max
    mitglieder:
      - Lisa
      - Jonas
  termine:
    start: 2026-09-01
    ende: 2026-12-15
  budget:
    betrag: 12000
    waehrung: EUR
    freigegeben: true
---

# Beispiel-Projekt

Das Objekt `projekt` hat mehrere Ebenen: `team` (mit einer Liste `mitglieder`), `termine` und `budget` sind eigene Unterobjekte.

Mit aktiviertem [[Fortgeschritten/Plugins/Nested Properties|Nested-Properties-Plugin]] erscheinen sie als verschachtelte, aufklappbare Gruppen. Ändere `betrag` oder hake `freigegeben` ab. Die Werte werden in ihrem Typ gezeichnet (Zahl, Wahrheitswert, Liste).
