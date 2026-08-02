---
tags: [admin]
---

# Administration — Übersicht

Dieser Bereich richtet sich an Administratoren von Slatebase. Als Admin verwaltest du Nutzer, konfigurierst den Server, steuerst Feature-Toggles und hast Einblick in das Audit-Log.

---

## Guides im Überblick

| Guide | Beschreibung |
|-------|--------------|
| [[Admin/Benutzerverwaltung\|Benutzerverwaltung]] | Nutzer anlegen, sperren, löschen, Rollen zuweisen |
| [[Admin/Feature-Toggles\|Feature-Toggles]] | Features für alle Nutzer aktivieren oder deaktivieren |
| [[Admin/Audit-Log\|Audit-Log]] | Sicherheitsrelevante Ereignisse einsehen |
| [[Admin/Server-Konfiguration\|Server-Konfiguration]] | Globale Server-Einstellungen verwalten |
| [[Admin/Vault-Übersicht\|Vault-Übersicht]] | Alle Vaults auf dem Server einsehen und verwalten |

---

## Wer ist Admin?

- Der erste Nutzer, der bei der Installation angelegt wird, erhält automatisch die Admin-Rolle
- Weitere Admins können über die Benutzerverwaltung ernannt werden
- Admins sehen im Settings-Panel den zusätzlichen Bereich "Administration"
- Der letzte verbleibende Admin kann nicht gesperrt oder gelöscht werden

---

## Zugang zur Administration

| Methode | Beschreibung |
|---------|--------------|
| Einstellungen (`Ctrl+,`) | Navigiere zum Bereich "Administration" |
| Command Palette (`Ctrl+P`) | Suche nach "Benutzerverwaltung", "Feature-Toggles" etc. |
| Nutzermenü | Klick auf Avatar → "Admin" Einträge |

---

## Empfohlene Reihenfolge

### Erste Einrichtung

1. [[Admin/Benutzerverwaltung]] — Nutzer für dein Team anlegen
2. [[Admin/Feature-Toggles]] — Gewünschte Features aktivieren
3. [[Admin/Server-Konfiguration]] — Grundeinstellungen prüfen

### Laufender Betrieb

1. [[Admin/Audit-Log]] — Regelmäßig Sicherheitsereignisse prüfen
2. [[Admin/Vault-Übersicht]] — Speicherverbrauch und Vault-Status im Blick behalten
3. [[Admin/Benutzerverwaltung]] — Neue Nutzer anlegen, inaktive sperren

---

## Admin-Verantwortlichkeiten

| Aufgabe | Häufigkeit |
|---------|-----------|
| Nutzer anlegen/sperren | Bei Bedarf |
| Feature-Toggles anpassen | Selten (bei neuen Releases) |
| Audit-Log prüfen | Regelmäßig (wöchentlich empfohlen) |
| Server-Konfiguration | Einmalig bei Setup, selten danach |
| Vault-Übersicht prüfen | Bei Speicherproblemen oder Nutzerfragen |

---

> [!tip] Admin-Rolle mit Bedacht vergeben
> Admins haben vollen Zugriff auf Nutzerdaten, können Accounts sperren und den Server konfigurieren. Vergib die Admin-Rolle nur an vertrauenswürdige Personen. Für den Alltag reicht die normale Nutzerrolle.

> [!warning] Letzter Admin
> Slatebase schützt den letzten verbleibenden Admin — er kann weder gesperrt noch gelöscht werden. Stelle sicher, dass mindestens ein Admin-Account immer erreichbar ist.

---

## Verwandte Bereiche

- [[Features/Einstellungen]] — Allgemeine Einstellungsübersicht
- [[Features/Vault-Verwaltung]] — Vault-Operationen aus Nutzersicht
- [[Fortgeschritten/Übersicht]] — Technische Guides (MCP, Sync, Plugins)
